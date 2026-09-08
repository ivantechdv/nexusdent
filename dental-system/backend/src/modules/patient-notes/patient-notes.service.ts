import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { assertPatientInClinic } from '../../utils/clinic';
import { httpError } from '../../utils/http';
import {
  ClinicalNote,
  ClinicalNoteEvent,
  ClinicalNoteEventAction,
  UpsertClinicalNoteDto,
} from './patient-notes.types';

type NoteRow = RowDataPacket & {
  id: string;
  patient_id: string;
  title: string;
  body: string;
  tags: string | string[] | null;
  is_critical: number;
  created_by: string | null;
  updated_by: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type EventRow = RowDataPacket & {
  id: string;
  patient_id: string;
  note_id: string | null;
  action: ClinicalNoteEventAction;
  note_title: string;
  actor_id: string | null;
  actor_name: string | null;
  created_at: Date | string;
};

function toIso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function parseTags(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toNote(row: NoteRow): ClinicalNote {
  return {
    id: row.id,
    patientId: row.patient_id,
    title: row.title,
    body: row.body,
    tags: parseTags(row.tags),
    isCritical: Boolean(row.is_critical),
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toEvent(row: EventRow): ClinicalNoteEvent {
  return {
    id: row.id,
    patientId: row.patient_id,
    noteId: row.note_id,
    action: row.action,
    noteTitle: row.note_title,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: toIso(row.created_at),
  };
}

async function logEvent(
  clinicId: string,
  patientId: string,
  noteId: string | null,
  action: ClinicalNoteEventAction,
  noteTitle: string,
  actorId: string,
) {
  await dbPool.query<ResultSetHeader>(
    `INSERT INTO patient_clinical_note_events
       (id, clinic_id, patient_id, note_id, action, note_title, actor_id)
     VALUES
       (:id, :clinicId, :patientId, :noteId, :action, :noteTitle, :actorId)`,
    {
      id: uuidv4(),
      clinicId,
      patientId,
      noteId,
      action,
      noteTitle: noteTitle.slice(0, 200),
      actorId,
    },
  );
}

const NOTE_SELECT = `n.id, n.patient_id, n.title, n.body, n.tags, n.is_critical,
              n.created_by, n.updated_by, n.created_at, n.updated_at,
              cu.full_name AS created_by_name, uu.full_name AS updated_by_name`;

export class PatientNotesService {
  async list(clinicId: string, patientId: string): Promise<ClinicalNote[]> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<NoteRow[]>(
      `SELECT ${NOTE_SELECT}
       FROM patient_clinical_notes n
       LEFT JOIN users cu ON cu.id = n.created_by
       LEFT JOIN users uu ON uu.id = n.updated_by
       WHERE n.clinic_id = :clinicId AND n.patient_id = :patientId
       ORDER BY n.is_critical DESC, n.updated_at DESC`,
      { clinicId, patientId },
    );
    return rows.map(toNote);
  }

  async listEvents(
    clinicId: string,
    patientId: string,
  ): Promise<ClinicalNoteEvent[]> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<EventRow[]>(
      `SELECT e.id, e.patient_id, e.note_id, e.action, e.note_title,
              e.actor_id, u.full_name AS actor_name, e.created_at
       FROM patient_clinical_note_events e
       LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.clinic_id = :clinicId AND e.patient_id = :patientId
       ORDER BY e.created_at DESC
       LIMIT 50`,
      { clinicId, patientId },
    );
    return rows.map(toEvent);
  }

  async create(
    clinicId: string,
    patientId: string,
    dto: UpsertClinicalNoteDto,
    actorId: string,
  ): Promise<ClinicalNote> {
    await assertPatientInClinic(clinicId, patientId);
    const title = dto.title?.trim();
    const body = dto.body?.trim();
    if (!title) throw httpError('El título es obligatorio', 400);
    if (!body) throw httpError('El contenido es obligatorio', 400);

    const tags = (dto.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const isCritical =
      Boolean(dto.isCritical) ||
      tags.includes('Importante') ||
      /^alerta\b/i.test(title);

    const id = uuidv4();
    await dbPool.query<ResultSetHeader>(
      `INSERT INTO patient_clinical_notes
         (id, clinic_id, patient_id, title, body, tags, is_critical, created_by, updated_by)
       VALUES
         (:id, :clinicId, :patientId, :title, :body, CAST(:tags AS JSON), :isCritical, :actorId, :actorId)`,
      {
        id,
        clinicId,
        patientId,
        title,
        body,
        tags: JSON.stringify(tags),
        isCritical: isCritical ? 1 : 0,
        actorId,
      },
    );

    await logEvent(clinicId, patientId, id, 'CREATED', title, actorId);

    const [rows] = await dbPool.query<NoteRow[]>(
      `SELECT ${NOTE_SELECT}
       FROM patient_clinical_notes n
       LEFT JOIN users cu ON cu.id = n.created_by
       LEFT JOIN users uu ON uu.id = n.updated_by
       WHERE n.id = :id AND n.clinic_id = :clinicId
       LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('No se pudo crear la nota', 500);
    return toNote(rows[0]);
  }

  async update(
    clinicId: string,
    patientId: string,
    noteId: string,
    dto: UpsertClinicalNoteDto,
    actorId: string,
  ): Promise<ClinicalNote> {
    await assertPatientInClinic(clinicId, patientId);
    const title = dto.title?.trim();
    const body = dto.body?.trim();
    if (!title) throw httpError('El título es obligatorio', 400);
    if (!body) throw httpError('El contenido es obligatorio', 400);

    const tags = (dto.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const isCritical =
      Boolean(dto.isCritical) ||
      tags.includes('Importante') ||
      /^alerta\b/i.test(title);

    const [result] = await dbPool.query<ResultSetHeader>(
      `UPDATE patient_clinical_notes SET
         title = :title,
         body = :body,
         tags = CAST(:tags AS JSON),
         is_critical = :isCritical,
         updated_by = :actorId
       WHERE id = :noteId AND clinic_id = :clinicId AND patient_id = :patientId`,
      {
        noteId,
        clinicId,
        patientId,
        title,
        body,
        tags: JSON.stringify(tags),
        isCritical: isCritical ? 1 : 0,
        actorId,
      },
    );
    if (!result.affectedRows) throw httpError('Nota no encontrada', 404);

    await logEvent(clinicId, patientId, noteId, 'UPDATED', title, actorId);

    const [rows] = await dbPool.query<NoteRow[]>(
      `SELECT ${NOTE_SELECT}
       FROM patient_clinical_notes n
       LEFT JOIN users cu ON cu.id = n.created_by
       LEFT JOIN users uu ON uu.id = n.updated_by
       WHERE n.id = :noteId AND n.clinic_id = :clinicId
       LIMIT 1`,
      { noteId, clinicId },
    );
    if (!rows[0]) throw httpError('Nota no encontrada', 404);
    return toNote(rows[0]);
  }

  async remove(
    clinicId: string,
    patientId: string,
    noteId: string,
    actorId: string,
  ) {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<NoteRow[]>(
      `SELECT title FROM patient_clinical_notes
       WHERE id = :noteId AND clinic_id = :clinicId AND patient_id = :patientId
       LIMIT 1`,
      { noteId, clinicId, patientId },
    );
    if (!rows[0]) throw httpError('Nota no encontrada', 404);

    await dbPool.query<ResultSetHeader>(
      `DELETE FROM patient_clinical_notes
       WHERE id = :noteId AND clinic_id = :clinicId AND patient_id = :patientId`,
      { noteId, clinicId, patientId },
    );

    await logEvent(
      clinicId,
      patientId,
      noteId,
      'DELETED',
      rows[0].title,
      actorId,
    );
  }
}

export const patientNotesService = new PatientNotesService();
