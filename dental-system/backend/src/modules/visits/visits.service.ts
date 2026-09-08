import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { assertPatientInClinic, assertDentistInClinic } from '../../utils/clinic';
import { httpError } from '../../utils/http';
import { maybeSendVisitSummaryEmail } from '../../utils/patient-notify';
import { patientGalleryService } from '../patient-gallery/patient-gallery.service';
import {
  CompleteVisitDto,
  CompleteVisitResult,
  UpdateVisitDto,
  VisitProcedureDto,
} from './visits.types';

type TreatmentRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  base_price: number | string;
};

function lineTotal(qty: number, unitPrice: number) {
  return Math.round(qty * unitPrice * 100) / 100;
}

async function insertVisitPlanItems(
  conn: { query: typeof dbPool.query },
  planId: string,
  resolved: Array<{
    treatmentId: number;
    quantity?: number;
    unitPrice: number;
    toothNumber?: number | null;
  }>,
  teeth: number[],
) {
  const teethQueue = [...teeth];
  for (const p of resolved) {
    const qty = Math.max(1, p.quantity ?? 1);
    const itemTooth = p.toothNumber ?? teethQueue.shift() ?? null;
    await conn.query(
      `INSERT INTO treatment_plan_items
         (id, treatment_plan_id, treatment_id, tooth_number, quantity,
          unit_price, discount_pct, line_total, status)
       VALUES
         (:id, :planId, :treatmentId, :toothNumber, :quantity,
          :unitPrice, 0, :lineTotal, 'COMPLETED')`,
      {
        id: uuidv4(),
        planId,
        treatmentId: p.treatmentId,
        toothNumber: itemTooth,
        quantity: qty,
        unitPrice: p.unitPrice,
        lineTotal: lineTotal(qty, p.unitPrice),
      },
    );
    for (let i = 1; i < qty; i++) teethQueue.shift();
  }
}

export class VisitsService {
  async completeVisit(
    clinicId: string,
    dto: CompleteVisitDto,
    actorId: string,
  ): Promise<CompleteVisitResult> {
    if (!dto.patientId) throw httpError('patientId es obligatorio', 400);
    if (!dto.clinicalNotes?.trim()) {
      throw httpError('Las notas clínicas son obligatorias', 400);
    }
    if (!dto.procedures?.length) {
      throw httpError('Seleccione al menos un procedimiento', 400);
    }

    const dentistId = dto.dentistId || actorId;
    const bill = dto.billProcedures !== false;

    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();

      await assertPatientInClinic(clinicId, dto.patientId, conn);
      await assertDentistInClinic(clinicId, dentistId, conn);

      const [recent] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM clinical_records
         WHERE clinic_id = :clinicId
           AND patient_id = :patientId
           AND dentist_id = :dentistId
           AND created_at >= (NOW() - INTERVAL 90 SECOND)
         LIMIT 1`,
        { clinicId, patientId: dto.patientId, dentistId },
      );
      if (recent[0]) {
        throw httpError(
          'Ya se registró una atención para este paciente hace instantes. Espere o use Idempotency-Key.',
          409,
        );
      }

      const resolved: Array<
        VisitProcedureDto & { name: string; code: string; unitPrice: number }
      > = [];

      for (const proc of dto.procedures) {
        const [rows] = await conn.query<TreatmentRow[]>(
          `SELECT id, code, name, base_price
           FROM treatment_catalog
           WHERE id = :id AND clinic_id = :clinicId AND is_active = 1
           LIMIT 1`,
          { id: proc.treatmentId, clinicId },
        );
        if (!rows[0]) {
          throw httpError(`Procedimiento ${proc.treatmentId} no encontrado`, 400);
        }
        resolved.push({
          ...proc,
          name: rows[0].name,
          code: rows[0].code,
          unitPrice: Number(rows[0].base_price),
          quantity: proc.quantity ?? 1,
        });
      }

      const teeth = (dto.toothNumbers ?? []).filter(
        (n) => Number.isFinite(n) && n >= 11 && n <= 48,
      );
      const attachments = (dto.attachmentUrls ?? []).filter(Boolean);

      const teethLine = teeth.length
        ? `\nPiezas: ${teeth.join(', ')}`
        : '';
      const attachLine = attachments.length
        ? `\nAdjuntos: ${attachments.join(' | ')}`
        : '';

      const procedureSummary = resolved
        .map((p) => {
          const qty = p.quantity ?? 1;
          const tooth = p.toothNumber ? ` · pieza ${p.toothNumber}` : '';
          return `• ${p.code} · ${p.name} ×${qty}${tooth}`;
        })
        .join('\n');

      // Una sola nota de sesión: texto del odontólogo + resumen de procs (sin duplicar)
      const fullNotes = [
        dto.clinicalNotes.trim(),
        procedureSummary ? `\n\nProcedimientos:\n${procedureSummary}` : '',
        teethLine,
        attachLine,
      ]
        .join('')
        .trim();

      let linkedAppointmentId: string | null = dto.appointmentId?.trim() || null;
      let walkInAppointmentId: string | null = null;

      if (linkedAppointmentId) {
        const [appts] = await conn.query<RowDataPacket[]>(
          `SELECT id, patient_id, status FROM appointments
           WHERE id = :id AND clinic_id = :clinicId
           LIMIT 1`,
          { id: linkedAppointmentId, clinicId },
        );
        if (!appts[0]) throw httpError('Cita no encontrada', 404);
        if (appts[0].patient_id !== dto.patientId) {
          throw httpError('La cita no pertenece a este paciente', 400);
        }
        await conn.query(
          `UPDATE appointments SET status = 'COMPLETED'
           WHERE id = :id AND clinic_id = :clinicId`,
          { id: linkedAppointmentId, clinicId },
        );
      } else if (dto.walkIn) {
        walkInAppointmentId = uuidv4();
        linkedAppointmentId = walkInAppointmentId;
        await conn.query(
          `INSERT INTO appointments
             (id, clinic_id, patient_id, dentist_id, scheduled_at, duration_min, status, reason, notes)
           VALUES
             (:id, :clinicId, :patientId, :dentistId, NOW(), 30, 'COMPLETED', :reason, :notes)`,
          {
            id: walkInAppointmentId,
            clinicId,
            patientId: dto.patientId,
            dentistId,
            reason: 'Atención sin cita (walk-in)',
            notes: 'Registrada al cerrar la atención del día',
          },
        );
      }

      // Una evolución por atención (los procs quedan en el plan + resumen en la nota)
      const primary = resolved[0];
      const primaryTooth =
        teeth[0] ?? primary?.toothNumber ?? null;
      const evoId = uuidv4();

      let planId: string | null = null;
      if (bill && dto.quoteId) {
        const [quotes] = await conn.query<RowDataPacket[]>(
          `SELECT id, status, kind, paid_amount
           FROM treatment_plans
           WHERE id = :id AND clinic_id = :clinicId AND patient_id = :patientId
           LIMIT 1`,
          { id: dto.quoteId, clinicId, patientId: dto.patientId },
        );
        const quote = quotes[0];
        if (
          quote &&
          quote.kind === 'QUOTE' &&
          ['APPROVED', 'IN_PROGRESS'].includes(String(quote.status))
        ) {
          await conn.query(
            `UPDATE treatment_plans
             SET status = 'IN_PROGRESS',
                 notes = CASE
                   WHEN notes LIKE '%Pasó a atención.%' THEN notes
                   ELSE CONCAT(IFNULL(notes, ''), '\nPasó a atención.')
                 END,
                 approved_at = COALESCE(approved_at, NOW())
             WHERE id = :id AND clinic_id = :clinicId`,
            { id: quote.id, clinicId },
          );

          const [existingVisits] = await conn.query<RowDataPacket[]>(
            `SELECT id, paid_amount
             FROM treatment_plans
             WHERE clinic_id = :clinicId
               AND patient_id = :patientId
               AND kind = 'VISIT'
               AND source_quote_id = :quoteId
             ORDER BY created_at DESC
             LIMIT 1`,
            { quoteId: quote.id, clinicId, patientId: dto.patientId },
          );
          const existing = existingVisits[0];
          if (existing && Number(existing.paid_amount) > 0.009) {
            planId = String(existing.id);
          } else {
            planId = existing ? String(existing.id) : uuidv4();
            const total =
              Math.round(
                resolved.reduce(
                  (sum, p) => sum + lineTotal(p.quantity ?? 1, p.unitPrice),
                  0,
                ) * 100,
              ) / 100;
            const title = `Atención ${new Date().toISOString().slice(0, 10)} · ${resolved
              .map((p) => p.name)
              .slice(0, 3)
              .join(', ')}`;
            if (existing) {
              await conn.query(
                `UPDATE treatment_plans
                 SET total_amount = :totalAmount, title = :title, status = 'IN_PROGRESS'
                 WHERE id = :id AND clinic_id = :clinicId`,
                { id: planId, clinicId, totalAmount: total, title },
              );
              await conn.query(
                `DELETE FROM treatment_plan_items WHERE treatment_plan_id = :planId`,
                { planId },
              );
            } else {
              await conn.query(
                `INSERT INTO treatment_plans
                   (id, clinic_id, patient_id, created_by, kind, source_quote_id, title,
                    total_amount, paid_amount, status, notes, approved_at)
                 VALUES
                   (:id, :clinicId, :patientId, :createdBy, 'VISIT', :quoteId, :title,
                    :totalAmount, 0, 'IN_PROGRESS', :notes, NOW())`,
                {
                  id: planId,
                  clinicId,
                  patientId: dto.patientId,
                  createdBy: actorId,
                  quoteId: quote.id,
                  title,
                  totalAmount: total,
                  notes: 'Generado desde presupuesto aceptado',
                },
              );
            }
            await insertVisitPlanItems(conn, planId, resolved, teeth);
          }
        }
      }

      if (bill && !planId) {
        planId = uuidv4();
        const total = resolved.reduce(
          (sum, p) => sum + lineTotal(p.quantity ?? 1, p.unitPrice),
          0,
        );

        await conn.query(
          `INSERT INTO treatment_plans
             (id, clinic_id, patient_id, created_by, kind, title, total_amount, paid_amount,
              status, notes, approved_at)
           VALUES
             (:id, :clinicId, :patientId, :createdBy, 'VISIT', :title, :totalAmount, 0,
              'IN_PROGRESS', :notes, NOW())`,
          {
            id: planId,
            clinicId,
            patientId: dto.patientId,
            createdBy: actorId,
            title: `Atención ${new Date().toISOString().slice(0, 10)} · ${resolved
              .map((p) => p.name)
              .slice(0, 3)
              .join(', ')}`,
            totalAmount: Math.round(total * 100) / 100,
            notes: 'Generado desde atención del día',
          },
        );

        const teethQueue = [...teeth];
        for (const p of resolved) {
          const qty = Math.max(1, p.quantity ?? 1);
          const itemTooth =
            p.toothNumber ?? teethQueue.shift() ?? null;
          await conn.query(
            `INSERT INTO treatment_plan_items
               (id, treatment_plan_id, treatment_id, tooth_number, quantity,
                unit_price, discount_pct, line_total, status)
             VALUES
               (:id, :planId, :treatmentId, :toothNumber, :quantity,
                :unitPrice, 0, :lineTotal, 'COMPLETED')`,
            {
              id: uuidv4(),
              planId,
              treatmentId: p.treatmentId,
              toothNumber: itemTooth,
              quantity: qty,
              unitPrice: p.unitPrice,
              lineTotal: lineTotal(qty, p.unitPrice),
            },
          );
          // Consumir piezas extras si qty > 1
          for (let i = 1; i < qty; i++) teethQueue.shift();
        }
      }

      await conn.query(
        `INSERT INTO clinical_records
           (id, clinic_id, patient_id, dentist_id, appointment_id, treatment_plan_id,
            tooth_number, treatment_id, clinical_notes, prescription, attachment_url)
         VALUES
           (:id, :clinicId, :patientId, :dentistId, :appointmentId, :planId,
            :toothNumber, :treatmentId, :clinicalNotes, :prescription, :attachmentUrl)`,
        {
          id: evoId,
          clinicId,
          patientId: dto.patientId,
          dentistId,
          appointmentId: linkedAppointmentId,
          planId,
          toothNumber: primaryTooth,
          treatmentId: primary?.treatmentId ?? null,
          clinicalNotes: fullNotes,
          prescription: dto.prescription?.trim() || null,
          attachmentUrl: attachments[0] ?? null,
        },
      );
      const evolutions: CompleteVisitResult['evolutions'] = [
        {
          id: evoId,
          treatmentId: primary?.treatmentId ?? null,
          toothNumber: primaryTooth,
        },
      ];

      const galleryItems = dto.galleryAttachments ?? [];
      const radiographItems = dto.radiographAttachments ?? [];
      if (galleryItems.length || radiographItems.length) {
        await patientGalleryService.bulkCreateFromVisit(
          clinicId,
          dto.patientId,
          evoId,
          actorId,
          galleryItems,
          radiographItems,
          conn,
        );
      }

      for (const tooth of teeth) {
        await conn.query(
          `INSERT INTO odontogram_states
             (id, clinic_id, patient_id, tooth_number, surface, \`condition\`, status, notes, recorded_by)
           VALUES
             (:id, :clinicId, :patientId, :toothNumber, 'WHOLE', 'RESTORATION', 'TREATED', :notes, :recordedBy)
           ON DUPLICATE KEY UPDATE
             \`condition\` = VALUES(\`condition\`),
             status = VALUES(status),
             notes = VALUES(notes),
             recorded_by = VALUES(recorded_by),
             updated_at = CURRENT_TIMESTAMP`,
          {
            id: uuidv4(),
            clinicId,
            patientId: dto.patientId,
            toothNumber: tooth,
            notes: 'Actualizado desde atención',
            recordedBy: dentistId,
          },
        );
      }

      let nextAppointmentId: string | null = null;
      if (dto.nextAppointment?.scheduledAt) {
        nextAppointmentId = uuidv4();
        const procNames = resolved.map((p) => p.name).join(', ');
        const nextDentistId = dto.nextAppointment.dentistId || dentistId;
        await assertDentistInClinic(clinicId, nextDentistId, conn);
        await conn.query(
          `INSERT INTO appointments
             (id, clinic_id, patient_id, dentist_id, scheduled_at, duration_min, status, reason, notes, confirm_token)
           VALUES
             (:id, :clinicId, :patientId, :dentistId, :scheduledAt, :durationMin, 'CONFIRMED', :reason, :notes, :confirmToken)`,
          {
            id: nextAppointmentId,
            clinicId,
            patientId: dto.patientId,
            dentistId: nextDentistId,
            scheduledAt: dto.nextAppointment.scheduledAt,
            durationMin: dto.nextAppointment.durationMin ?? 30,
            reason:
              dto.nextAppointment.reason?.trim() ||
              'Continuación de tratamiento',
            notes:
              dto.nextAppointment.notes?.trim() ||
              `Continuación de: ${procNames}`,
            confirmToken: uuidv4(),
          },
        );
        await conn.query(
          `UPDATE clinical_records
           SET next_appointment_id = :nextId
           WHERE id = :id AND clinic_id = :clinicId`,
          { nextId: nextAppointmentId, id: evoId, clinicId },
        );
      }

      await conn.commit();

      if (dto.notifyPatient !== false) {
        const totalAmount = bill
          ? resolved.reduce(
              (s, p) => s + lineTotal(p.quantity ?? 1, p.unitPrice),
              0,
            )
          : null;
        void maybeSendVisitSummaryEmail({
          clinicId,
          patientId: dto.patientId,
          dentistId,
          procedures: resolved.map((p) => ({
            name: p.name,
            code: p.code,
            quantity: p.quantity ?? 1,
            toothNumber: p.toothNumber ?? null,
          })),
          prescription: dto.prescription ?? null,
          totalAmount,
          nextAppointmentId,
        });
      }

      return {
        evolutions,
        planId,
        walkInAppointmentId,
        nextAppointmentId,
      };
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2') {
        throw httpError('Paciente u odontólogo no válido', 400);
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateVisit(
    clinicId: string,
    evolutionId: string,
    dto: UpdateVisitDto,
    actorId: string,
  ): Promise<CompleteVisitResult> {
    if (!dto.clinicalNotes?.trim()) {
      throw httpError('Las notas clínicas son obligatorias', 400);
    }
    if (!dto.procedures?.length) {
      throw httpError('Seleccione al menos un procedimiento', 400);
    }

    const dentistId = dto.dentistId || actorId;
    const bill = dto.billProcedures !== false;

    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();
      await assertDentistInClinic(clinicId, dentistId, conn);

      const [existingRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, patient_id, appointment_id, treatment_plan_id
         FROM clinical_records
         WHERE id = :id AND clinic_id = :clinicId
         LIMIT 1`,
        { id: evolutionId, clinicId },
      );
      const existing = existingRows[0];
      if (!existing) throw httpError('Atención no encontrada', 404);

      const patientId = String(existing.patient_id);
      await assertPatientInClinic(clinicId, patientId, conn);

      const resolved: Array<
        VisitProcedureDto & { name: string; code: string; unitPrice: number }
      > = [];

      for (const proc of dto.procedures) {
        const [rows] = await conn.query<TreatmentRow[]>(
          `SELECT id, code, name, base_price
           FROM treatment_catalog
           WHERE id = :id AND clinic_id = :clinicId AND is_active = 1
           LIMIT 1`,
          { id: proc.treatmentId, clinicId },
        );
        if (!rows[0]) {
          throw httpError(`Procedimiento ${proc.treatmentId} no encontrado`, 400);
        }
        resolved.push({
          ...proc,
          name: rows[0].name,
          code: rows[0].code,
          unitPrice: Number(rows[0].base_price),
          quantity: proc.quantity ?? 1,
        });
      }

      const teeth = (dto.toothNumbers ?? []).filter(
        (n) => Number.isFinite(n) && n >= 11 && n <= 48,
      );
      const attachments = (dto.attachmentUrls ?? []).filter(Boolean);

      const teethLine = teeth.length
        ? `\nPiezas: ${teeth.join(', ')}`
        : '';
      const attachLine = attachments.length
        ? `\nAdjuntos: ${attachments.join(' | ')}`
        : '';

      const procedureSummary = resolved
        .map((p) => {
          const qty = p.quantity ?? 1;
          const tooth = p.toothNumber ? ` · pieza ${p.toothNumber}` : '';
          return `• ${p.code} · ${p.name} ×${qty}${tooth}`;
        })
        .join('\n');

      const fullNotes = [
        dto.clinicalNotes.trim(),
        procedureSummary ? `\n\nProcedimientos:\n${procedureSummary}` : '',
        teethLine,
        attachLine,
      ]
        .join('')
        .trim();

      const primary = resolved[0];
      const primaryTooth = teeth[0] ?? primary?.toothNumber ?? null;
      let planId: string | null = existing.treatment_plan_id
        ? String(existing.treatment_plan_id)
        : null;
      let planPaid = 0;

      if (planId) {
        const [plans] = await conn.query<RowDataPacket[]>(
          `SELECT id, paid_amount FROM treatment_plans
           WHERE id = :planId AND clinic_id = :clinicId
           LIMIT 1`,
          { planId, clinicId },
        );
        if (!plans[0]) {
          planId = null;
        } else {
          planPaid = Number(plans[0].paid_amount);
        }
      }

      // Con abonos no se toca el cobro; sin abonos se puede rearmar el plan
      if (bill && planPaid <= 0.009) {
        const total =
          Math.round(
            resolved.reduce(
              (sum, p) => sum + lineTotal(p.quantity ?? 1, p.unitPrice),
              0,
            ) * 100,
          ) / 100;

        if (planId) {
          await conn.query(
            `DELETE FROM treatment_plan_items WHERE treatment_plan_id = :planId`,
            { planId },
          );
          await conn.query(
            `UPDATE treatment_plans SET
               total_amount = :totalAmount,
               title = :title,
               notes = :notes,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = :planId AND clinic_id = :clinicId`,
            {
              planId,
              clinicId,
              totalAmount: total,
              title: `Atención ${new Date().toISOString().slice(0, 10)} · ${resolved
                .map((p) => p.name)
                .slice(0, 3)
                .join(', ')}`,
              notes: 'Actualizado desde atención',
            },
          );
        } else {
          planId = uuidv4();
          await conn.query(
            `INSERT INTO treatment_plans
               (id, clinic_id, patient_id, created_by, kind, title, total_amount, paid_amount,
                status, notes, approved_at)
             VALUES
               (:id, :clinicId, :patientId, :createdBy, 'VISIT', :title, :totalAmount, 0,
                'IN_PROGRESS', :notes, NOW())`,
            {
              id: planId,
              clinicId,
              patientId,
              createdBy: actorId,
              title: `Atención ${new Date().toISOString().slice(0, 10)} · ${resolved
                .map((p) => p.name)
                .slice(0, 3)
                .join(', ')}`,
              totalAmount: total,
              notes: 'Generado desde atención del día',
            },
          );
        }

        const teethQueue = [...teeth];
        for (const p of resolved) {
          const qty = Math.max(1, p.quantity ?? 1);
          const itemTooth = p.toothNumber ?? teethQueue.shift() ?? null;
          await conn.query(
            `INSERT INTO treatment_plan_items
               (id, treatment_plan_id, treatment_id, tooth_number, quantity,
                unit_price, discount_pct, line_total, status)
             VALUES
               (:id, :planId, :treatmentId, :toothNumber, :quantity,
                :unitPrice, 0, :lineTotal, 'COMPLETED')`,
            {
              id: uuidv4(),
              planId,
              treatmentId: p.treatmentId,
              toothNumber: itemTooth,
              quantity: qty,
              unitPrice: p.unitPrice,
              lineTotal: lineTotal(qty, p.unitPrice),
            },
          );
          for (let i = 1; i < qty; i++) teethQueue.shift();
        }
      } else if (bill && planPaid > 0.009) {
        // Avisar si intentan cambiar montos con abonos ya hechos
        const [currentItems] = await conn.query<RowDataPacket[]>(
          `SELECT treatment_id, quantity FROM treatment_plan_items
           WHERE treatment_plan_id = :planId
           ORDER BY created_at ASC`,
          { planId },
        );
        const same =
          currentItems.length === resolved.length &&
          currentItems.every((row, i) => {
            const p = resolved[i];
            return (
              Number(row.treatment_id) === p.treatmentId &&
              Number(row.quantity) === (p.quantity ?? 1)
            );
          });
        if (!same) {
          throw httpError(
            'Ya hay abonos en este cobro. Podés editar notas, receta y archivos, pero no los procedimientos.',
            409,
          );
        }
      }

      await conn.query(
        `UPDATE clinical_records SET
           dentist_id = :dentistId,
           treatment_plan_id = :planId,
           tooth_number = :toothNumber,
           treatment_id = :treatmentId,
           clinical_notes = :clinicalNotes,
           prescription = :prescription,
           attachment_url = :attachmentUrl,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = :id AND clinic_id = :clinicId`,
        {
          id: evolutionId,
          clinicId,
          dentistId,
          planId,
          toothNumber: primaryTooth,
          treatmentId: primary?.treatmentId ?? null,
          clinicalNotes: fullNotes,
          prescription: dto.prescription?.trim() || null,
          attachmentUrl: attachments[0] ?? null,
        },
      );

      const galleryItems = dto.galleryAttachments ?? [];
      const radiographItems = dto.radiographAttachments ?? [];
      if (galleryItems.length || radiographItems.length) {
        await patientGalleryService.bulkCreateFromVisit(
          clinicId,
          patientId,
          evolutionId,
          actorId,
          galleryItems,
          radiographItems,
          conn,
        );
      }

      for (const tooth of teeth) {
        await conn.query(
          `INSERT INTO odontogram_states
             (id, clinic_id, patient_id, tooth_number, surface, \`condition\`, status, notes, recorded_by)
           VALUES
             (:id, :clinicId, :patientId, :toothNumber, 'WHOLE', 'RESTORATION', 'TREATED', :notes, :recordedBy)
           ON DUPLICATE KEY UPDATE
             \`condition\` = VALUES(\`condition\`),
             status = VALUES(status),
             notes = VALUES(notes),
             recorded_by = VALUES(recorded_by),
             updated_at = CURRENT_TIMESTAMP`,
          {
            id: uuidv4(),
            clinicId,
            patientId,
            toothNumber: tooth,
            notes: 'Actualizado desde atención',
            recordedBy: dentistId,
          },
        );
      }

      let nextAppointmentId: string | null = null;
      if (dto.nextAppointment?.scheduledAt) {
        const procNames = resolved.map((p) => p.name).join(', ');
        const reason =
          dto.nextAppointment.reason?.trim() ||
          'Continuación de tratamiento';
        const notes =
          dto.nextAppointment.notes?.trim() ||
          `Continuación de: ${procNames}`;
        const dentistForNext =
          dto.nextAppointment.dentistId || dentistId;
        await assertDentistInClinic(clinicId, dentistForNext, conn);
        const scheduledAt = dto.nextAppointment.scheduledAt;
        const durationMin = dto.nextAppointment.durationMin ?? 30;

        // Reutilizar continuación futura del paciente si ya existe
        const [existingNext] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM appointments
           WHERE clinic_id = :clinicId
             AND patient_id = :patientId
             AND scheduled_at >= NOW()
             AND status IN ('PENDING', 'CONFIRMED')
             AND (reason LIKE '%ontinuaci%' OR notes LIKE '%ontinuaci%')
           ORDER BY scheduled_at ASC
           LIMIT 1`,
          { clinicId, patientId },
        );

        if (existingNext[0]) {
          nextAppointmentId = String(existingNext[0].id);
          await conn.query(
            `UPDATE appointments SET
               dentist_id = :dentistId,
               scheduled_at = :scheduledAt,
               duration_min = :durationMin,
               status = 'CONFIRMED',
               reason = :reason,
               notes = :notes
             WHERE id = :id AND clinic_id = :clinicId`,
            {
              id: nextAppointmentId,
              clinicId,
              dentistId: dentistForNext,
              scheduledAt,
              durationMin,
              reason,
              notes,
            },
          );
        } else {
          nextAppointmentId = uuidv4();
          await conn.query(
            `INSERT INTO appointments
               (id, clinic_id, patient_id, dentist_id, scheduled_at, duration_min, status, reason, notes, confirm_token)
             VALUES
               (:id, :clinicId, :patientId, :dentistId, :scheduledAt, :durationMin, 'CONFIRMED', :reason, :notes, :confirmToken)`,
            {
              id: nextAppointmentId,
              clinicId,
              patientId,
              dentistId: dentistForNext,
              scheduledAt,
              durationMin,
              reason,
              notes,
              confirmToken: uuidv4(),
            },
          );
        }

        await conn.query(
          `UPDATE clinical_records
           SET next_appointment_id = :nextId
           WHERE id = :id AND clinic_id = :clinicId`,
          { nextId: nextAppointmentId, id: evolutionId, clinicId },
        );
      }

      await conn.commit();

      if (dto.notifyPatient !== false) {
        const totalAmount = bill
          ? resolved.reduce(
              (s, p) => s + lineTotal(p.quantity ?? 1, p.unitPrice),
              0,
            )
          : null;
        void maybeSendVisitSummaryEmail({
          clinicId,
          patientId,
          dentistId,
          procedures: resolved.map((p) => ({
            name: p.name,
            code: p.code,
            quantity: p.quantity ?? 1,
            toothNumber: p.toothNumber ?? null,
          })),
          prescription: dto.prescription ?? null,
          totalAmount,
          nextAppointmentId,
        });
      }

      return {
        evolutions: [
          {
            id: evolutionId,
            treatmentId: primary?.treatmentId ?? null,
            toothNumber: primaryTooth,
          },
        ],
        planId,
        walkInAppointmentId: null,
        nextAppointmentId,
      };
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2') {
        throw httpError('Paciente u odontólogo no válido', 400);
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

export const visitsService = new VisitsService();
