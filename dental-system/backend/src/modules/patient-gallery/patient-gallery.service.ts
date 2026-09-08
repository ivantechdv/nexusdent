import fs from 'fs';
import path from 'path';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { assertPatientInClinic } from '../../utils/clinic';
import { httpError } from '../../utils/http';
import { uploadDir } from '../uploads/uploads.routes';
import {
  CreateGalleryPhotoDto,
  GALLERY_CATEGORIES,
  GalleryCategory,
  GalleryKind,
  PatientGalleryPhoto,
  RADIOGRAPH_STUDY_TYPES,
  RadiographStudyType,
  VisitGalleryItemDto,
} from './patient-gallery.types';

type GalleryRow = RowDataPacket & {
  id: string;
  patient_id: string;
  kind: GalleryKind;
  clinical_record_id: string | null;
  visit_date: Date | string | null;
  category: GalleryCategory;
  study_type: RadiographStudyType | null;
  title: string;
  notes: string | null;
  file_url: string;
  original_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: Date | string;
};

const SELECT_FIELDS = `g.id, g.patient_id, g.kind, g.clinical_record_id,
              cr.signed_at AS visit_date, g.category, g.study_type, g.title, g.notes,
              g.file_url, g.original_name, g.mime_type, g.file_size, g.uploaded_by,
              u.full_name AS uploaded_by_name, g.created_at`;

function toPhoto(row: GalleryRow): PatientGalleryPhoto {
  const created =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString();
  const visitDate = row.visit_date
    ? row.visit_date instanceof Date
      ? row.visit_date.toISOString()
      : new Date(row.visit_date).toISOString()
    : null;
  return {
    id: row.id,
    patientId: row.patient_id,
    kind: row.kind ?? 'GALLERY',
    clinicalRecordId: row.clinical_record_id,
    visitDate,
    category: row.category,
    studyType: row.study_type ?? null,
    title: row.title,
    notes: row.notes,
    fileUrl: row.file_url,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    createdAt: created,
  };
}

function parseCategory(value: unknown): GalleryCategory {
  const cat = String(value ?? 'INTRAORAL').toUpperCase() as GalleryCategory;
  if (!GALLERY_CATEGORIES.includes(cat)) {
    throw httpError('Categoría inválida', 400);
  }
  return cat;
}

function parseStudyType(value: unknown): RadiographStudyType | null {
  if (value == null || value === '') return null;
  const type = String(value).toUpperCase() as RadiographStudyType;
  if (!RADIOGRAPH_STUDY_TYPES.includes(type)) {
    throw httpError('Tipo de estudio inválido', 400);
  }
  return type;
}

function parseKind(value: unknown): GalleryKind {
  const kind = String(value ?? 'GALLERY').toUpperCase();
  if (kind !== 'GALLERY' && kind !== 'RADIOGRAPH') {
    throw httpError('Tipo de imagen inválido', 400);
  }
  return kind;
}

function defaultTitle(
  originalName: string | null | undefined,
  kind: GalleryKind,
  studyType?: RadiographStudyType | null,
): string {
  const base = (originalName ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (kind === 'RADIOGRAPH') {
    if (studyType === 'PANORAMIC') return 'Panorámica Digital';
    if (studyType === 'PERIAPICAL') return 'Periapical';
    if (studyType === 'BITEWING') return 'Bitewing';
    if (studyType === 'CEPHALOMETRIC') return 'Cefalometría';
    if (studyType === 'CBCT') return 'CBCT';
    return base ? `Radiografía - ${base}` : 'Estudio radiográfico';
  }
  return base || 'Fotografía clínica';
}

function inferStudyType(originalName?: string | null): RadiographStudyType {
  const name = (originalName ?? '').toLowerCase();
  if (/pano|panor|ortop|ortho/.test(name)) return 'PANORAMIC';
  if (/periap|apex/.test(name)) return 'PERIAPICAL';
  if (/bite|bitewing|aleta/.test(name)) return 'BITEWING';
  if (/cefal|ceph/.test(name)) return 'CEPHALOMETRIC';
  if (/cbct|tac|tomograf/.test(name)) return 'CBCT';
  return 'OTHER';
}

function tryDeleteUploadFile(fileUrl: string) {
  const match = fileUrl.match(/\/api\/uploads\/file\/([^/?#]+)/);
  if (!match?.[1]) return;
  const name = path.basename(match[1]);
  const full = path.join(uploadDir, name);
  if (full.startsWith(uploadDir) && fs.existsSync(full)) {
    fs.unlinkSync(full);
  }
}

export class PatientGalleryService {
  async listByPatient(
    clinicId: string,
    patientId: string,
    kind?: GalleryKind,
  ): Promise<PatientGalleryPhoto[]> {
    await assertPatientInClinic(clinicId, patientId);
    const kindClause = kind ? 'AND g.kind = :kind' : '';
    const [rows] = await dbPool.query<GalleryRow[]>(
      `SELECT ${SELECT_FIELDS}
       FROM patient_gallery g
       LEFT JOIN users u ON u.id = g.uploaded_by
       LEFT JOIN clinical_records cr ON cr.id = g.clinical_record_id
       WHERE g.clinic_id = :clinicId AND g.patient_id = :patientId
         ${kindClause}
       ORDER BY g.created_at DESC`,
      { clinicId, patientId, ...(kind ? { kind } : {}) },
    );
    return rows.map(toPhoto);
  }

  async create(
    clinicId: string,
    patientId: string,
    dto: CreateGalleryPhotoDto,
    actorId: string,
  ): Promise<PatientGalleryPhoto> {
    await assertPatientInClinic(clinicId, patientId);

    const title = dto.title?.trim();
    if (!title) throw httpError('El título es obligatorio', 400);
    if (!dto.fileUrl?.trim()) throw httpError('fileUrl es obligatorio', 400);

    const kind = parseKind(dto.kind ?? 'GALLERY');
    const category = parseCategory(dto.category);
    const studyType =
      kind === 'RADIOGRAPH'
        ? parseStudyType(dto.studyType) ?? inferStudyType(dto.originalName)
        : null;
    const id = uuidv4();

    await dbPool.query<ResultSetHeader>(
      `INSERT INTO patient_gallery
         (id, clinic_id, patient_id, kind, clinical_record_id, category, study_type,
          title, notes, file_url, original_name, mime_type, file_size, uploaded_by)
       VALUES
         (:id, :clinicId, :patientId, :kind, :clinicalRecordId, :category, :studyType,
          :title, :notes, :fileUrl, :originalName, :mimeType, :fileSize, :uploadedBy)`,
      {
        id,
        clinicId,
        patientId,
        kind,
        clinicalRecordId: dto.clinicalRecordId ?? null,
        category,
        studyType,
        title,
        notes: dto.notes?.trim() || null,
        fileUrl: dto.fileUrl.trim(),
        originalName: dto.originalName ?? null,
        mimeType: dto.mimeType ?? null,
        fileSize: dto.fileSize ?? null,
        uploadedBy: actorId,
      },
    );

    const [rows] = await dbPool.query<GalleryRow[]>(
      `SELECT ${SELECT_FIELDS}
       FROM patient_gallery g
       LEFT JOIN users u ON u.id = g.uploaded_by
       LEFT JOIN clinical_records cr ON cr.id = g.clinical_record_id
       WHERE g.id = :id AND g.clinic_id = :clinicId
       LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('No se pudo guardar la fotografía', 500);
    return toPhoto(rows[0]);
  }

  async bulkCreateFromVisit(
    clinicId: string,
    patientId: string,
    clinicalRecordId: string,
    actorId: string,
    galleryItems: VisitGalleryItemDto[],
    radiographItems: VisitGalleryItemDto[],
    conn: PoolConnection,
  ) {
    const insert = async (
      items: VisitGalleryItemDto[],
      kind: GalleryKind,
    ) => {
      for (const item of items) {
        if (!item.fileUrl?.trim()) continue;
        const category = item.category
          ? parseCategory(item.category)
          : 'INTRAORAL';
        const studyType =
          kind === 'RADIOGRAPH'
            ? parseStudyType(item.studyType) ??
              inferStudyType(item.originalName)
            : null;
        await conn.query<ResultSetHeader>(
          `INSERT INTO patient_gallery
             (id, clinic_id, patient_id, kind, clinical_record_id, category, study_type,
              title, notes, file_url, original_name, mime_type, file_size, uploaded_by)
           VALUES
             (:id, :clinicId, :patientId, :kind, :clinicalRecordId, :category, :studyType,
              :title, :notes, :fileUrl, :originalName, :mimeType, :fileSize, :uploadedBy)`,
          {
            id: uuidv4(),
            clinicId,
            patientId,
            kind,
            clinicalRecordId: kind === 'RADIOGRAPH' ? clinicalRecordId : null,
            category,
            studyType,
            title:
              item.title?.trim() ||
              defaultTitle(item.originalName, kind, studyType),
            notes: item.notes?.trim() || null,
            fileUrl: item.fileUrl.trim(),
            originalName: item.originalName ?? null,
            mimeType: item.mimeType ?? null,
            fileSize: item.fileSize ?? null,
            uploadedBy: actorId,
          },
        );
      }
    };

    await insert(galleryItems, 'GALLERY');
    await insert(radiographItems, 'RADIOGRAPH');
  }

  async remove(clinicId: string, patientId: string, photoId: string) {
    await assertPatientInClinic(clinicId, patientId);

    const [rows] = await dbPool.query<GalleryRow[]>(
      `SELECT file_url FROM patient_gallery
       WHERE id = :photoId AND clinic_id = :clinicId AND patient_id = :patientId
       LIMIT 1`,
      { photoId, clinicId, patientId },
    );
    if (!rows[0]) throw httpError('Fotografía no encontrada', 404);

    await dbPool.query<ResultSetHeader>(
      `DELETE FROM patient_gallery
       WHERE id = :photoId AND clinic_id = :clinicId AND patient_id = :patientId`,
      { photoId, clinicId, patientId },
    );

    tryDeleteUploadFile(rows[0].file_url);
  }
}

export const patientGalleryService = new PatientGalleryService();
