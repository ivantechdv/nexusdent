import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { assertDentistInClinic } from '../../utils/clinic';
import { httpError } from '../../utils/http';
import {
  AppointmentDto,
  AppointmentRow,
  AppointmentStatus,
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './appointments.types';

type AppointmentPacket = AppointmentRow & RowDataPacket;

const VALID_STATUS: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'WAITING_ROOM',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

/** Devuelve la hora de pared guardada en DATETIME (pool timezone Z). */
function toIso(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    const hh = String(value.getUTCHours()).padStart(2, '0');
    const mm = String(value.getUTCMinutes()).padStart(2, '0');
    const ss = String(value.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  }
  const raw = String(value).trim();
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return toIso(d);
}

function mapAppointment(row: AppointmentRow): AppointmentDto {
  return {
    id: row.id,
    patientId: row.patient_id,
    dentistId: row.dentist_id,
    scheduledAt: toIso(row.scheduled_at),
    durationMin: row.duration_min,
    status: row.status,
    reason: row.reason,
    notes: row.notes,
    patientName: row.patient_name,
    patientDocument: row.patient_document,
    patientPhone: row.patient_phone ?? null,
    dentistName: row.dentist_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_BASE = `
  SELECT a.id, a.patient_id, a.dentist_id, a.scheduled_at, a.duration_min,
         a.status, a.reason, a.notes, a.created_at, a.updated_at,
         p.full_name AS patient_name, p.document_id AS patient_document,
         p.phone AS patient_phone,
         u.full_name AS dentist_name
  FROM appointments a
  INNER JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
  INNER JOIN users u ON u.id = a.dentist_id
`;

export class AppointmentsService {
  async list(
    clinicId: string,
    filters: {
      from?: string;
      to?: string;
      dentistId?: string;
      patientId?: string;
      status?: string;
    },
  ): Promise<AppointmentDto[]> {
    const clauses: string[] = ['a.clinic_id = :clinicId'];
    const params: Record<string, string> = { clinicId };

    if (filters.from) {
      clauses.push('a.scheduled_at >= :from');
      params.from = filters.from;
    }
    if (filters.to) {
      clauses.push('a.scheduled_at <= :to');
      params.to = filters.to;
    }
    if (filters.dentistId) {
      clauses.push('a.dentist_id = :dentistId');
      params.dentistId = filters.dentistId;
    }
    if (filters.patientId) {
      clauses.push('a.patient_id = :patientId');
      params.patientId = filters.patientId;
    }
    if (filters.status) {
      clauses.push('a.status = :status');
      params.status = filters.status;
    }

    const where = `WHERE ${clauses.join(' AND ')}`;
    const [rows] = await dbPool.query<AppointmentPacket[]>(
      `${SELECT_BASE} ${where} ORDER BY a.scheduled_at ASC LIMIT 500`,
      params,
    );
    return rows.map(mapAppointment);
  }

  async getById(clinicId: string, id: string): Promise<AppointmentDto> {
    const [rows] = await dbPool.query<AppointmentPacket[]>(
      `${SELECT_BASE} WHERE a.id = :id AND a.clinic_id = :clinicId LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('Cita no encontrada', 404);
    return mapAppointment(rows[0]);
  }

  async create(
    clinicId: string,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentDto> {
    if (!dto.patientId) throw httpError('patientId es obligatorio', 400);
    if (!dto.dentistId) throw httpError('dentistId es obligatorio', 400);
    if (!dto.scheduledAt) throw httpError('scheduledAt es obligatorio', 400);

    const status = dto.status ?? 'PENDING';
    if (!VALID_STATUS.includes(status)) {
      throw httpError('status inválido', 400);
    }

    // Paciente debe pertenecer a la clínica
    const [pRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id FROM patients WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
      { id: dto.patientId, clinicId },
    );
    if (!pRows[0]) throw httpError('Paciente no válido en esta clínica', 400);
    await assertDentistInClinic(clinicId, dto.dentistId);

    const durationMin = dto.durationMin ?? 30;
    await this.assertNoOverlap(clinicId, dto.dentistId, dto.scheduledAt, durationMin);

    const id = uuidv4();
    const confirmToken = uuidv4();
    try {
      await dbPool.query<ResultSetHeader>(
        `INSERT INTO appointments
           (id, clinic_id, patient_id, dentist_id, scheduled_at, duration_min, status, reason, notes, confirm_token)
         VALUES
           (:id, :clinicId, :patientId, :dentistId, :scheduledAt, :durationMin, :status, :reason, :notes, :confirmToken)`,
        {
          id,
          clinicId,
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          scheduledAt: dto.scheduledAt,
          durationMin,
          status,
          reason: dto.reason ?? null,
          notes: dto.notes ?? null,
          confirmToken,
        },
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2') {
        throw httpError('Paciente u odontólogo no válido', 400);
      }
      throw err;
    }

    return this.getById(clinicId, id);
  }

  async update(
    clinicId: string,
    id: string,
    dto: UpdateAppointmentDto,
  ): Promise<AppointmentDto> {
    const current = await this.getById(clinicId, id);

    if (dto.status && !VALID_STATUS.includes(dto.status)) {
      throw httpError('status inválido', 400);
    }

    const patientId = dto.patientId ?? current.patientId;
    if (dto.patientId) {
      const [pRows] = await dbPool.query<RowDataPacket[]>(
        `SELECT id FROM patients WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
        { id: patientId, clinicId },
      );
      if (!pRows[0]) throw httpError('Paciente no válido en esta clínica', 400);
    }

    const dentistId = dto.dentistId ?? current.dentistId;
    if (dto.dentistId) {
      await assertDentistInClinic(clinicId, dentistId);
    }
    const scheduledAt = dto.scheduledAt ?? current.scheduledAt;
    const durationMin = dto.durationMin ?? current.durationMin;
    const nextStatus = dto.status ?? current.status;

    if (!['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(nextStatus)) {
      await this.assertNoOverlap(clinicId, dentistId, scheduledAt, durationMin, id);
    }

    const scheduleChanged =
      Boolean(dto.scheduledAt) && dto.scheduledAt !== current.scheduledAt;

    try {
      await dbPool.query<ResultSetHeader>(
        `UPDATE appointments SET
           patient_id = :patientId,
           dentist_id = :dentistId,
           scheduled_at = :scheduledAt,
           duration_min = :durationMin,
           status = :status,
           reason = :reason,
           notes = :notes,
           reminder_sent_at = IF(:resetReminder = 1, NULL, reminder_sent_at)
         WHERE id = :id AND clinic_id = :clinicId`,
        {
          id,
          clinicId,
          patientId,
          dentistId,
          scheduledAt,
          durationMin,
          status: nextStatus,
          reason: dto.reason !== undefined ? dto.reason : current.reason,
          notes: dto.notes !== undefined ? dto.notes : current.notes,
          resetReminder: scheduleChanged ? 1 : 0,
        },
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2') {
        throw httpError('Paciente u odontólogo no válido', 400);
      }
      throw err;
    }

    return this.getById(clinicId, id);
  }

  async respondByToken(
    token: string,
    action: 'confirm' | 'cancel',
  ): Promise<{
    status: AppointmentStatus;
    patientName: string;
    clinicName: string;
    scheduledAt: string;
    dentistName: string;
  }> {
    if (!token?.trim()) throw httpError('Token inválido', 400);

    const [rows] = await dbPool.query<
      (RowDataPacket & {
        id: string;
        status: AppointmentStatus;
        scheduled_at: Date | string;
        patient_name: string;
        dentist_name: string;
        clinic_name: string;
      })[]
    >(
      `SELECT a.id, a.status, a.scheduled_at,
              p.full_name AS patient_name,
              u.full_name AS dentist_name,
              c.name AS clinic_name
       FROM appointments a
       INNER JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
       INNER JOIN users u ON u.id = a.dentist_id
       INNER JOIN clinics c ON c.id = a.clinic_id
       WHERE a.confirm_token = :token
       LIMIT 1`,
      { token: token.trim() },
    );

    const row = rows[0];
    if (!row) throw httpError('Enlace inválido o expirado', 404);

    if (['COMPLETED', 'NO_SHOW'].includes(row.status)) {
      throw httpError('Esta cita ya no admite cambios', 409);
    }

    if (action === 'confirm') {
      if (row.status === 'CANCELLED') {
        throw httpError('La cita ya fue cancelada', 409);
      }
      if (row.status === 'PENDING') {
        await dbPool.query<ResultSetHeader>(
          `UPDATE appointments SET status = 'CONFIRMED' WHERE id = :id`,
          { id: row.id },
        );
        row.status = 'CONFIRMED';
      }
    } else {
      if (row.status !== 'CANCELLED') {
        await dbPool.query<ResultSetHeader>(
          `UPDATE appointments SET status = 'CANCELLED' WHERE id = :id`,
          { id: row.id },
        );
        row.status = 'CANCELLED';
      }
    }

    return {
      status: row.status,
      patientName: row.patient_name,
      clinicName: row.clinic_name,
      scheduledAt: toIso(row.scheduled_at),
      dentistName: row.dentist_name,
    };
  }

  async assertSlotAvailable(
    clinicId: string,
    dentistId: string,
    scheduledAt: string,
    durationMin: number,
    excludeId?: string,
  ) {
    await this.assertNoOverlap(
      clinicId,
      dentistId,
      scheduledAt,
      durationMin,
      excludeId,
    );
  }

  private async assertNoOverlap(
    clinicId: string,
    dentistId: string,
    scheduledAt: string,
    durationMin: number,
    excludeId?: string,
  ) {
    const start = new Date(scheduledAt);
    if (Number.isNaN(start.getTime())) {
      throw httpError('scheduledAt inválido', 400);
    }
    const end = new Date(start.getTime() + durationMin * 60_000);

    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id FROM appointments
       WHERE clinic_id = :clinicId
         AND dentist_id = :dentistId
         AND status NOT IN ('CANCELLED', 'NO_SHOW')
         AND (:excludeId IS NULL OR id <> :excludeId)
         AND scheduled_at < :end
         AND DATE_ADD(scheduled_at, INTERVAL duration_min MINUTE) > :start
       LIMIT 1`,
      {
        clinicId,
        dentistId,
        excludeId: excludeId ?? null,
        start: start.toISOString().slice(0, 19).replace('T', ' '),
        end: end.toISOString().slice(0, 19).replace('T', ' '),
      },
    );

    if (rows[0]) {
      throw httpError(
        'El odontólogo ya tiene una cita en ese horario',
        409,
      );
    }
  }
}

export const appointmentsService = new AppointmentsService();
