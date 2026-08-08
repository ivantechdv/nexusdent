import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { assertPatientInClinic } from '../../utils/clinic';
import { httpError } from '../../utils/http';
import {
  ClinicalAppointmentSnapshot,
  ClinicalBillingSnapshot,
  ClinicalRecord,
  CreateClinicalRecordDto,
  UpdateClinicalRecordDto,
} from './clinical-records.types';

type ClinicalRow = ClinicalRecord & RowDataPacket;

type PlanItemRow = RowDataPacket & {
  treatment_plan_id: string;
  treatment_id: number;
  code: string;
  name: string;
  tooth_number: number | null;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
  total_amount: number | string;
  paid_amount: number | string;
};

export class ClinicalRecordsService {
  private async loadBillingByPlanIds(
    clinicId: string,
    planIds: string[],
  ): Promise<Map<string, ClinicalBillingSnapshot>> {
    const map = new Map<string, ClinicalBillingSnapshot>();
    if (!planIds.length) return map;

    const [rows] = await dbPool.query<PlanItemRow[]>(
      `SELECT tp.id AS treatment_plan_id, tp.total_amount, tp.paid_amount,
              i.treatment_id, i.tooth_number, i.quantity, i.unit_price, i.line_total,
              tc.code, tc.name
       FROM treatment_plans tp
       INNER JOIN treatment_plan_items i ON i.treatment_plan_id = tp.id
       INNER JOIN treatment_catalog tc
         ON tc.id = i.treatment_id AND tc.clinic_id = tp.clinic_id
       WHERE tp.clinic_id = :clinicId
         AND tp.id IN (${planIds.map((_, i) => `:p${i}`).join(',')})
       ORDER BY i.created_at ASC`,
      {
        clinicId,
        ...Object.fromEntries(planIds.map((id, i) => [`p${i}`, id])),
      },
    );

    for (const row of rows) {
      const planId = row.treatment_plan_id;
      let snap = map.get(planId);
      if (!snap) {
        const total = Number(row.total_amount);
        const paid = Number(row.paid_amount);
        snap = {
          planId,
          totalAmount: total,
          paidAmount: paid,
          balanceDue: Math.round((total - paid) * 100) / 100,
          items: [],
        };
        map.set(planId, snap);
      }
      snap.items.push({
        treatmentId: row.treatment_id,
        code: row.code,
        name: row.name,
        toothNumber: row.tooth_number,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        lineTotal: Number(row.line_total),
      });
    }
    return map;
  }

  private toApptIso(value: Date | string): string {
    if (value instanceof Date) return value.toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
  }

  private async loadAppointmentsByIds(
    clinicId: string,
    ids: string[],
  ): Promise<Map<string, ClinicalAppointmentSnapshot>> {
    const map = new Map<string, ClinicalAppointmentSnapshot>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return map;

    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT a.id, a.scheduled_at, a.status, a.reason, u.full_name AS dentist_name
       FROM appointments a
       LEFT JOIN users u ON u.id = a.dentist_id
       WHERE a.clinic_id = :clinicId
         AND a.id IN (${unique.map((_, i) => `:a${i}`).join(',')})`,
      {
        clinicId,
        ...Object.fromEntries(unique.map((id, i) => [`a${i}`, id])),
      },
    );

    for (const row of rows) {
      map.set(String(row.id), {
        id: String(row.id),
        scheduledAt: this.toApptIso(row.scheduled_at),
        status: String(row.status),
        reason: row.reason ?? null,
        dentistName: row.dentist_name ?? null,
      });
    }
    return map;
  }

  /**
   * Fallback solo para registros viejos sin treatment_plan_id.
   * Busca un hermano de la misma sesión (±2 min, mismo dentista),
   * NUNCA el plan más reciente del día (eso contaminaba otras atenciones).
   */
  private async findSiblingPlanId(
    clinicId: string,
    patientId: string,
    dentistId: string,
    signedAt: Date | string,
    excludeId?: string,
  ): Promise<string | null> {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT cr.treatment_plan_id
       FROM clinical_records cr
       WHERE cr.clinic_id = :clinicId
         AND cr.patient_id = :patientId
         AND cr.dentist_id = :dentistId
         AND cr.treatment_plan_id IS NOT NULL
         AND ABS(TIMESTAMPDIFF(SECOND, cr.signed_at, :signedAt)) <= 120
         ${excludeId ? 'AND cr.id <> :excludeId' : ''}
       ORDER BY ABS(TIMESTAMPDIFF(SECOND, cr.signed_at, :signedAt)) ASC
       LIMIT 1`,
      {
        clinicId,
        patientId,
        dentistId,
        signedAt,
        ...(excludeId ? { excludeId } : {}),
      },
    );
    return rows[0]?.treatment_plan_id
      ? String(rows[0].treatment_plan_id)
      : null;
  }

  async listByPatient(
    clinicId: string,
    patientId: string,
  ): Promise<ClinicalRecord[]> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<ClinicalRow[]>(
      `SELECT
         cr.id, cr.patient_id, cr.dentist_id, cr.appointment_id,
         cr.next_appointment_id, cr.treatment_plan_id, cr.tooth_number, cr.treatment_id, cr.clinical_notes,
         cr.prescription, cr.attachment_url, cr.signed_at,
         cr.created_at, cr.updated_at,
         u.full_name AS dentist_name,
         tc.name AS treatment_name,
         tc.code AS treatment_code
       FROM clinical_records cr
       INNER JOIN users u ON u.id = cr.dentist_id
       LEFT JOIN treatment_catalog tc
         ON tc.id = cr.treatment_id AND tc.clinic_id = cr.clinic_id
       WHERE cr.patient_id = :patientId AND cr.clinic_id = :clinicId
       ORDER BY cr.signed_at DESC`,
      { patientId, clinicId },
    );

    const planIds = new Set<string>();
    const apptIds = new Set<string>();
    for (const row of rows) {
      let planId = row.treatment_plan_id ?? null;
      if (!planId) {
        planId = await this.findSiblingPlanId(
          clinicId,
          patientId,
          String(row.dentist_id),
          row.signed_at,
          String(row.id),
        );
        if (planId) row.treatment_plan_id = planId;
      }
      if (planId) planIds.add(planId);
      if (row.appointment_id) apptIds.add(String(row.appointment_id));
      if (row.next_appointment_id) apptIds.add(String(row.next_appointment_id));
    }

    const billingMap = await this.loadBillingByPlanIds(
      clinicId,
      [...planIds],
    );
    const apptMap = await this.loadAppointmentsByIds(clinicId, [...apptIds]);

    return rows.map((row) => ({
      ...row,
      billing: row.treatment_plan_id
        ? billingMap.get(row.treatment_plan_id) ?? null
        : null,
      sessionAppointment: row.appointment_id
        ? apptMap.get(String(row.appointment_id)) ?? null
        : null,
      nextAppointment: row.next_appointment_id
        ? apptMap.get(String(row.next_appointment_id)) ?? null
        : null,
    }));
  }

  async getById(clinicId: string, id: string): Promise<ClinicalRecord | null> {
    const [rows] = await dbPool.query<ClinicalRow[]>(
      `SELECT
         cr.id, cr.patient_id, cr.dentist_id, cr.appointment_id,
         cr.next_appointment_id, cr.treatment_plan_id, cr.tooth_number, cr.treatment_id, cr.clinical_notes,
         cr.prescription, cr.attachment_url, cr.signed_at,
         cr.created_at, cr.updated_at,
         u.full_name AS dentist_name,
         tc.name AS treatment_name,
         tc.code AS treatment_code
       FROM clinical_records cr
       INNER JOIN users u ON u.id = cr.dentist_id
       LEFT JOIN treatment_catalog tc
         ON tc.id = cr.treatment_id AND tc.clinic_id = cr.clinic_id
       WHERE cr.id = :id AND cr.clinic_id = :clinicId
       LIMIT 1`,
      { id, clinicId },
    );
    const row = rows[0];
    if (!row) return null;
    if (!row.treatment_plan_id) {
      row.treatment_plan_id = await this.findSiblingPlanId(
        clinicId,
        row.patient_id,
        String(row.dentist_id),
        row.signed_at,
        String(row.id),
      );
    }
    if (row.treatment_plan_id) {
      const billing = await this.loadBillingByPlanIds(clinicId, [
        row.treatment_plan_id,
      ]);
      row.billing = billing.get(row.treatment_plan_id) ?? null;
    }
    const apptIds = [
      row.appointment_id,
      row.next_appointment_id,
    ].filter(Boolean) as string[];
    if (apptIds.length) {
      const apptMap = await this.loadAppointmentsByIds(clinicId, apptIds);
      row.sessionAppointment = row.appointment_id
        ? apptMap.get(String(row.appointment_id)) ?? null
        : null;
      row.nextAppointment = row.next_appointment_id
        ? apptMap.get(String(row.next_appointment_id)) ?? null
        : null;
    }
    return row;
  }

  async create(
    clinicId: string,
    dto: CreateClinicalRecordDto,
  ): Promise<ClinicalRecord> {
    if (!dto.clinicalNotes?.trim()) {
      throw httpError('Las notas clínicas son obligatorias', 400);
    }
    if (!dto.dentistId) {
      throw httpError('dentistId es obligatorio', 400);
    }
    await assertPatientInClinic(clinicId, dto.patientId);

    if (dto.treatmentId != null) {
      const [treatments] = await dbPool.query<RowDataPacket[]>(
        `SELECT id FROM treatment_catalog
         WHERE id = :id AND clinic_id = :clinicId AND is_active = 1
         LIMIT 1`,
        { id: dto.treatmentId, clinicId },
      );
      if (!treatments[0]) {
        throw httpError('Tratamiento no válido en esta clínica', 400);
      }
    }

    const id = uuidv4();

    await dbPool.query<ResultSetHeader>(
      `INSERT INTO clinical_records
         (id, clinic_id, patient_id, dentist_id, appointment_id, tooth_number,
          treatment_id, clinical_notes, prescription, attachment_url)
       VALUES
         (:id, :clinicId, :patientId, :dentistId, :appointmentId, :toothNumber,
          :treatmentId, :clinicalNotes, :prescription, :attachmentUrl)`,
      {
        id,
        clinicId,
        patientId: dto.patientId,
        dentistId: dto.dentistId,
        appointmentId: dto.appointmentId ?? null,
        toothNumber: dto.toothNumber ?? null,
        treatmentId: dto.treatmentId ?? null,
        clinicalNotes: dto.clinicalNotes.trim(),
        prescription: dto.prescription ?? null,
        attachmentUrl: dto.attachmentUrl ?? null,
      },
    );

    const record = await this.getById(clinicId, id);
    if (!record) {
      throw httpError('Error al crear evolución clínica', 500);
    }
    return record;
  }

  async update(
    clinicId: string,
    id: string,
    dto: UpdateClinicalRecordDto,
  ): Promise<ClinicalRecord> {
    const existing = await this.getById(clinicId, id);
    if (!existing) {
      throw httpError('Evolución clínica no encontrada', 404);
    }

    if (dto.treatmentId != null) {
      const [treatments] = await dbPool.query<RowDataPacket[]>(
        `SELECT id FROM treatment_catalog
         WHERE id = :id AND clinic_id = :clinicId AND is_active = 1
         LIMIT 1`,
        { id: dto.treatmentId, clinicId },
      );
      if (!treatments[0]) {
        throw httpError('Tratamiento no válido en esta clínica', 400);
      }
    }

    await dbPool.query<ResultSetHeader>(
      `UPDATE clinical_records SET
         tooth_number    = COALESCE(:toothNumber, tooth_number),
         treatment_id    = COALESCE(:treatmentId, treatment_id),
         clinical_notes  = COALESCE(:clinicalNotes, clinical_notes),
         prescription    = COALESCE(:prescription, prescription),
         attachment_url  = COALESCE(:attachmentUrl, attachment_url),
         updated_at      = CURRENT_TIMESTAMP
       WHERE id = :id AND clinic_id = :clinicId`,
      {
        id,
        clinicId,
        toothNumber: dto.toothNumber !== undefined ? dto.toothNumber : null,
        treatmentId: dto.treatmentId !== undefined ? dto.treatmentId : null,
        clinicalNotes: dto.clinicalNotes?.trim() ?? null,
        prescription: dto.prescription !== undefined ? dto.prescription : null,
        attachmentUrl:
          dto.attachmentUrl !== undefined ? dto.attachmentUrl : null,
      },
    );

    if (dto.toothNumber === null) {
      await dbPool.query(
        `UPDATE clinical_records SET tooth_number = NULL
         WHERE id = :id AND clinic_id = :clinicId`,
        { id, clinicId },
      );
    }
    if (dto.treatmentId === null) {
      await dbPool.query(
        `UPDATE clinical_records SET treatment_id = NULL
         WHERE id = :id AND clinic_id = :clinicId`,
        { id, clinicId },
      );
    }

    const updated = await this.getById(clinicId, id);
    return updated!;
  }

  async remove(clinicId: string, id: string): Promise<void> {
    // Leer plan real de BD (sin fallback de hermanos) para no borrar otro cobro
    const [rawRows] = await dbPool.query<ClinicalRow[]>(
      `SELECT id, appointment_id, treatment_plan_id
       FROM clinical_records
       WHERE id = :id AND clinic_id = :clinicId
       LIMIT 1`,
      { id, clinicId },
    );
    const raw = rawRows[0];
    if (!raw) {
      throw httpError('Evolución clínica no encontrada', 404);
    }

    const planId = raw.treatment_plan_id ?? null;
    if (planId) {
      const [plans] = await dbPool.query<RowDataPacket[]>(
        `SELECT id, paid_amount FROM treatment_plans
         WHERE id = :planId AND clinic_id = :clinicId
         LIMIT 1`,
        { planId, clinicId },
      );
      const paid = Number(plans[0]?.paid_amount ?? 0);
      if (paid > 0.009) {
        throw httpError(
          'No se puede eliminar: ya hay abonos en ese cobro. Anulá los pagos primero o ajustá el saldo.',
          409,
        );
      }
    }

    // Borrar toda la sesión (stubs viejos con la misma cita)
    if (raw.appointment_id) {
      await dbPool.query<ResultSetHeader>(
        `DELETE FROM clinical_records
         WHERE clinic_id = :clinicId
           AND appointment_id = :appointmentId`,
        { clinicId, appointmentId: raw.appointment_id },
      );
    } else {
      await dbPool.query<ResultSetHeader>(
        `DELETE FROM clinical_records WHERE id = :id AND clinic_id = :clinicId`,
        { id, clinicId },
      );
    }

    if (planId) {
      await dbPool.query(
        `DELETE FROM treatment_plans WHERE id = :planId AND clinic_id = :clinicId`,
        { planId, clinicId },
      );
    }
  }
}

export const clinicalRecordsService = new ClinicalRecordsService();
