import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { assertPatientInClinic, assertDentistInClinic } from '../../utils/clinic';
import { httpError } from '../../utils/http';
import { maybeSendPaymentReceiptEmail } from '../../utils/patient-notify';
import { sendQuoteEmail } from '../../utils/mail';
import { appointmentsService } from '../appointments/appointments.service';
import {
  CreatePaymentBatchDto,
  CreatePaymentDto,
  CreatePlanDto,
  PAYMENT_CURRENCIES,
  PAYMENT_METHODS,
  PaymentCurrency,
  PaymentDto,
  PaymentSplitInput,
  PlanItemInput,
  PlanStatus,
  RateSource,
  TreatmentPlanDto,
  TreatmentPlanItemDto,
  UpdatePlanDto,
} from './billing.types';

type PlanRow = RowDataPacket & {
  id: string;
  patient_id: string;
  created_by: string | null;
  created_by_name?: string | null;
  quote_code?: string | null;
  kind?: string | null;
  title: string | null;
  total_amount: number | string;
  paid_amount: number | string;
  status: PlanStatus;
  notes: string | null;
  approved_at: Date | string | null;
  created_at: Date;
  updated_at: Date;
};

type ItemRow = RowDataPacket & {
  id: string;
  treatment_plan_id: string;
  treatment_id: number;
  tooth_number: number | null;
  quantity: number;
  unit_price: number | string;
  discount_pct: number | string;
  line_total: number | string;
  status: TreatmentPlanItemDto['status'];
  treatment_name?: string;
  treatment_code?: string;
};

type PaymentRow = RowDataPacket & {
  id: string;
  patient_id: string;
  treatment_plan_id: string;
  plan_title?: string | null;
  plan_total?: number | string | null;
  amount_paid: number | string;
  currency_paid?: PaymentCurrency | null;
  amount_paid_ves?: number | string | null;
  exchange_rate?: number | string | null;
  rate_source?: RateSource | null;
  payment_method: PaymentDto['paymentMethod'];
  reference?: string | null;
  receipt_number: string;
  notes: string | null;
  received_by: string | null;
  paid_at: Date | string;
};

function mapPlan(row: PlanRow, items?: TreatmentPlanItemDto[]): TreatmentPlanDto {
  return {
    id: row.id,
    patientId: row.patient_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    quoteCode: row.quote_code ?? null,
    kind: row.kind === 'QUOTE' ? 'QUOTE' : 'VISIT',
    title: row.title,
    totalAmount: Number(row.total_amount),
    paidAmount: Number(row.paid_amount),
    status: row.status,
    notes: row.notes,
    approvedAt: row.approved_at
      ? row.approved_at instanceof Date
        ? row.approved_at.toISOString()
        : String(row.approved_at)
      : null,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row: ItemRow): TreatmentPlanItemDto {
  return {
    id: row.id,
    treatmentPlanId: row.treatment_plan_id,
    treatmentId: row.treatment_id,
    toothNumber: row.tooth_number,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    discountPct: Number(row.discount_pct),
    lineTotal: Number(row.line_total),
    status: row.status,
    treatmentName: row.treatment_name,
    treatmentCode: row.treatment_code,
  };
}

function mapPayment(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    patientId: row.patient_id,
    treatmentPlanId: row.treatment_plan_id,
    planTitle: row.plan_title ?? null,
    planTotal:
      row.plan_total != null ? Number(row.plan_total) : null,
    amountPaid: Number(row.amount_paid),
    currencyPaid: row.currency_paid === 'VES' ? 'VES' : 'USD',
    amountPaidVes:
      row.amount_paid_ves != null ? Number(row.amount_paid_ves) : null,
    exchangeRate:
      row.exchange_rate != null ? Number(row.exchange_rate) : null,
    rateSource: row.rate_source ?? null,
    paymentMethod: row.payment_method,
    reference: row.reference ?? null,
    receiptNumber: row.receipt_number,
    notes: row.notes,
    receivedBy: row.received_by,
    paidAt:
      row.paid_at instanceof Date
        ? row.paid_at.toISOString()
        : String(row.paid_at),
  };
}

function lineTotal(qty: number, unitPrice: number, discountPct: number) {
  return Math.round(qty * unitPrice * (1 - discountPct / 100) * 100) / 100;
}

const PLAN_STATUSES: PlanStatus[] = [
  'DRAFT',
  'APPROVED',
  'IN_PROGRESS',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
];

async function nextQuoteCode(
  conn: { query: typeof dbPool.query },
  clinicId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PRES-${year}-`;
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT quote_code
     FROM treatment_plans
     WHERE clinic_id = :clinicId AND quote_code LIKE :prefix
     ORDER BY quote_code DESC
     LIMIT 1
     FOR UPDATE`,
    { clinicId, prefix: `${prefix}%` },
  );
  const last = String(rows[0]?.quote_code ?? '');
  const n = Number(last.slice(prefix.length));
  const next = Number.isFinite(n) && n > 0 ? n + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

async function resolvePlanItems(
  conn: { query: typeof dbPool.query },
  clinicId: string,
  items: PlanItemInput[],
) {
  const resolved: Array<
    PlanItemInput & { unitPrice: number; lineTotal: number }
  > = [];

  for (const item of items) {
    const [treatments] = await conn.query<RowDataPacket[]>(
      `SELECT id, base_price FROM treatment_catalog
       WHERE id = :id AND clinic_id = :clinicId AND is_active = 1
       LIMIT 1`,
      { id: item.treatmentId, clinicId },
    );
    if (!treatments[0]) {
      throw httpError(`Tratamiento ${item.treatmentId} no encontrado`, 400);
    }
    const qty = item.quantity ?? 1;
    const unitPrice =
      item.unitPrice != null
        ? Number(item.unitPrice)
        : Number(treatments[0].base_price);
    const discountPct = item.discountPct ?? 0;
    resolved.push({
      ...item,
      quantity: qty,
      unitPrice,
      discountPct,
      lineTotal: lineTotal(qty, unitPrice, discountPct),
    });
  }

  return resolved;
}

export class BillingService {
  async listPlansByPatient(
    clinicId: string,
    patientId: string,
    kind?: 'QUOTE' | 'VISIT',
  ): Promise<TreatmentPlanDto[]> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<PlanRow[]>(
      `SELECT tp.*, u.full_name AS created_by_name
       FROM treatment_plans tp
       LEFT JOIN users u ON u.id = tp.created_by
       WHERE tp.patient_id = :patientId AND tp.clinic_id = :clinicId
         AND (:kind IS NULL OR tp.kind = :kind)
       ORDER BY tp.created_at DESC`,
      { patientId, clinicId, kind: kind ?? null },
    );
    const plans = await this.attachItems(clinicId, rows);
    return plans;
  }

  private async attachItems(
    clinicId: string,
    rows: PlanRow[],
  ): Promise<TreatmentPlanDto[]> {
    if (!rows.length) return [];
    const params: Record<string, string> = { clinicId };
    const placeholders = rows
      .map((row, index) => {
        params[`id${index}`] = row.id;
        return `:id${index}`;
      })
      .join(', ');
    const [itemRows] = await dbPool.query<ItemRow[]>(
      `SELECT i.*, tc.name AS treatment_name, tc.code AS treatment_code
       FROM treatment_plan_items i
       INNER JOIN treatment_plans tp ON tp.id = i.treatment_plan_id
       INNER JOIN treatment_catalog tc
         ON tc.id = i.treatment_id AND tc.clinic_id = tp.clinic_id
       WHERE tp.clinic_id = :clinicId
         AND i.treatment_plan_id IN (${placeholders})
       ORDER BY i.created_at ASC`,
      params,
    );
    const byPlan = new Map<string, TreatmentPlanItemDto[]>();
    for (const row of itemRows) {
      const item = mapItem(row);
      const list = byPlan.get(item.treatmentPlanId) ?? [];
      list.push(item);
      byPlan.set(item.treatmentPlanId, list);
    }
    return rows.map((row) => mapPlan(row, byPlan.get(row.id) ?? []));
  }

  async getPlan(clinicId: string, id: string): Promise<TreatmentPlanDto> {
    const [rows] = await dbPool.query<PlanRow[]>(
      `SELECT tp.*, u.full_name AS created_by_name
       FROM treatment_plans tp
       LEFT JOIN users u ON u.id = tp.created_by
       WHERE tp.id = :id AND tp.clinic_id = :clinicId
       LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('Plan de tratamiento no encontrado', 404);
    return mapPlan(rows[0], await this.getItems(clinicId, id));
  }

  async getItems(
    clinicId: string,
    planId: string,
  ): Promise<TreatmentPlanItemDto[]> {
    const [rows] = await dbPool.query<ItemRow[]>(
      `SELECT i.*, tc.name AS treatment_name, tc.code AS treatment_code
       FROM treatment_plan_items i
       INNER JOIN treatment_plans tp ON tp.id = i.treatment_plan_id
       INNER JOIN treatment_catalog tc
         ON tc.id = i.treatment_id AND tc.clinic_id = tp.clinic_id
       WHERE i.treatment_plan_id = :planId AND tp.clinic_id = :clinicId
       ORDER BY i.created_at ASC`,
      { planId, clinicId },
    );
    return rows.map(mapItem);
  }

  async createPlan(
    clinicId: string,
    dto: CreatePlanDto,
    createdBy?: string,
  ): Promise<TreatmentPlanDto> {
    if (!dto.patientId) throw httpError('patientId es obligatorio', 400);
    if (!dto.items?.length) {
      throw httpError('El plan debe incluir al menos un ítem', 400);
    }
    await assertPatientInClinic(clinicId, dto.patientId);

    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();
      const planId = uuidv4();
      const status: PlanStatus = dto.status ?? 'DRAFT';

      const resolvedItems: Array<
        PlanItemInput & { unitPrice: number; lineTotal: number }
      > = [];

      for (const item of dto.items) {
        const [treatments] = await conn.query<RowDataPacket[]>(
          `SELECT id, base_price FROM treatment_catalog
           WHERE id = :id AND clinic_id = :clinicId AND is_active = 1
           LIMIT 1`,
          { id: item.treatmentId, clinicId },
        );
        if (!treatments[0]) {
          throw httpError(`Tratamiento ${item.treatmentId} no encontrado`, 400);
        }
        const qty = item.quantity ?? 1;
        const unitPrice =
          item.unitPrice != null
            ? Number(item.unitPrice)
            : Number(treatments[0].base_price);
        const discountPct = item.discountPct ?? 0;
        resolvedItems.push({
          ...item,
          quantity: qty,
          unitPrice,
          discountPct,
          lineTotal: lineTotal(qty, unitPrice, discountPct),
        });
      }

      const totalAmount =
        Math.round(
          resolvedItems.reduce((sum, i) => sum + (i.lineTotal ?? 0), 0) * 100,
        ) / 100;

      const quoteCode = await nextQuoteCode(conn, clinicId);

      await conn.query(
        `INSERT INTO treatment_plans
           (id, clinic_id, patient_id, created_by, quote_code, kind, title, total_amount, paid_amount, status, notes, approved_at)
         VALUES
           (:id, :clinicId, :patientId, :createdBy, :quoteCode, 'QUOTE', :title, :totalAmount, 0, :status, :notes, :approvedAt)`,
        {
          id: planId,
          clinicId,
          patientId: dto.patientId,
          createdBy: createdBy ?? null,
          quoteCode,
          title: dto.title ?? 'Presupuesto',
          totalAmount,
          status,
          notes: dto.notes ?? null,
          approvedAt:
            status === 'APPROVED' || status === 'IN_PROGRESS'
              ? new Date()
              : null,
        },
      );

      for (const item of resolvedItems) {
        await conn.query(
          `INSERT INTO treatment_plan_items
             (id, treatment_plan_id, treatment_id, tooth_number, quantity,
              unit_price, discount_pct, line_total, status)
           VALUES
             (:id, :planId, :treatmentId, :toothNumber, :quantity,
              :unitPrice, :discountPct, :lineTotal, :status)`,
          {
            id: uuidv4(),
            planId,
            treatmentId: item.treatmentId,
            toothNumber: item.toothNumber ?? null,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice,
            discountPct: item.discountPct ?? 0,
            lineTotal: item.lineTotal,
            status: item.status ?? 'PENDING',
          },
        );
      }

      let appointmentLabel: string | null = null;
      if (dto.nextAppointment?.scheduledAt) {
        const dentistId = dto.nextAppointment.dentistId || createdBy;
        if (!dentistId) {
          throw httpError('Elegí un odontólogo para la cita del presupuesto', 400);
        }
        await assertDentistInClinic(clinicId, dentistId, conn);
        const durationMin = dto.nextAppointment.durationMin ?? 30;
        await appointmentsService.assertSlotAvailable(
          clinicId,
          dentistId,
          dto.nextAppointment.scheduledAt,
          durationMin,
        );
        await conn.query(
          `INSERT INTO appointments
             (id, clinic_id, patient_id, dentist_id, scheduled_at, duration_min, status, reason, notes, confirm_token)
           VALUES
             (:id, :clinicId, :patientId, :dentistId, :scheduledAt, :durationMin, 'PENDING', :reason, :notes, :confirmToken)`,
          {
            id: uuidv4(),
            clinicId,
            patientId: dto.patientId,
            dentistId,
            scheduledAt: dto.nextAppointment.scheduledAt,
            durationMin,
            reason:
              dto.nextAppointment.reason?.trim() ||
              `Presupuesto ${quoteCode}`,
            notes: `Cita asociada al presupuesto ${quoteCode}`,
            confirmToken: uuidv4(),
          },
        );
        appointmentLabel = dto.nextAppointment.scheduledAt.replace('T', ' ');
      }

      await conn.commit();
      const plan = await this.getPlan(clinicId, planId);

      if (dto.notifyPatient !== false) {
        void this.sendQuoteMail(clinicId, plan, appointmentLabel);
      }

      return plan;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private async sendQuoteMail(
    clinicId: string,
    plan: TreatmentPlanDto,
    appointmentLabel?: string | null,
  ) {
    try {
      const [[patient], [clinic]] = await Promise.all([
        dbPool
          .query<RowDataPacket[]>(
            `SELECT full_name, email FROM patients
             WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
            { id: plan.patientId, clinicId },
          )
          .then(([r]) => r),
        dbPool
          .query<RowDataPacket[]>(
            `SELECT name FROM clinics WHERE id = :id LIMIT 1`,
            { id: clinicId },
          )
          .then(([r]) => r),
      ]);
      const email = String(patient?.email ?? '').trim();
      if (!email) return;
      await sendQuoteEmail({
        to: email,
        patientName: String(patient?.full_name ?? 'Paciente'),
        clinicName: String(clinic?.name ?? 'la clínica'),
        quoteCode: plan.quoteCode || 'Presupuesto',
        title: plan.title || 'Presupuesto',
        procedures: (plan.items ?? []).map((item) => ({
          name: item.treatmentName || 'Procedimiento',
          toothNumber: item.toothNumber,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
        totalAmount: plan.totalAmount,
        appointmentLabel,
      });
    } catch (err) {
      console.error('[quote-mail]', err);
    }
  }

  async updatePlanStatus(
    clinicId: string,
    id: string,
    status: PlanStatus,
  ): Promise<TreatmentPlanDto> {
    const valid: PlanStatus[] = PLAN_STATUSES;
    if (!valid.includes(status)) throw httpError('status inválido', 400);

    const current = await this.getPlan(clinicId, id);
    if (
      (status === 'REJECTED' || status === 'CANCELLED') &&
      current.paidAmount > 0.009
    ) {
      throw httpError(
        'No se puede rechazar o cancelar un presupuesto con pagos',
        400,
      );
    }
    await dbPool.query(
      `UPDATE treatment_plans SET
         status = :status,
         approved_at = CASE
           WHEN :status IN ('APPROVED', 'IN_PROGRESS') AND approved_at IS NULL
           THEN CURRENT_TIMESTAMP
           ELSE approved_at
         END
       WHERE id = :id AND clinic_id = :clinicId`,
      { id, clinicId, status },
    );
    return this.getPlan(clinicId, id);
  }

  async updatePlan(
    clinicId: string,
    id: string,
    dto: UpdatePlanDto,
  ): Promise<TreatmentPlanDto> {
    if (!dto.items?.length) {
      throw httpError('El presupuesto debe incluir al menos un ítem', 400);
    }
    const current = await this.getPlan(clinicId, id);
    if (current.paidAmount > 0.009) {
      throw httpError('No se puede editar un presupuesto con pagos', 400);
    }

    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();
      const resolved = await resolvePlanItems(conn, clinicId, dto.items);
      const totalAmount =
        Math.round(resolved.reduce((sum, i) => sum + i.lineTotal, 0) * 100) /
        100;

      await conn.query(
        `UPDATE treatment_plans
         SET title = :title, notes = :notes, total_amount = :totalAmount
         WHERE id = :id AND clinic_id = :clinicId`,
        {
          id,
          clinicId,
          title: dto.title?.trim() || current.title || 'Presupuesto',
          notes: dto.notes ?? null,
          totalAmount,
        },
      );

      await conn.query(
        `DELETE FROM treatment_plan_items WHERE treatment_plan_id = :id`,
        { id },
      );

      for (const item of resolved) {
        await conn.query(
          `INSERT INTO treatment_plan_items
             (id, treatment_plan_id, treatment_id, tooth_number, quantity,
              unit_price, discount_pct, line_total, status)
           VALUES
             (:id, :planId, :treatmentId, :toothNumber, :quantity,
              :unitPrice, :discountPct, :lineTotal, :status)`,
          {
            id: uuidv4(),
            planId: id,
            treatmentId: item.treatmentId,
            toothNumber: item.toothNumber ?? null,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice,
            discountPct: item.discountPct ?? 0,
            lineTotal: item.lineTotal,
            status: item.status ?? 'PENDING',
          },
        );
      }

      await conn.commit();
      const plan = await this.getPlan(clinicId, id);
      if (dto.notifyPatient) {
        void this.sendQuoteMail(clinicId, plan, null);
      }
      return plan;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async duplicatePlan(
    clinicId: string,
    id: string,
    createdBy?: string,
  ): Promise<TreatmentPlanDto> {
    const source = await this.getPlan(clinicId, id);
    const items = source.items ?? (await this.getItems(clinicId, id));
    if (!items.length) {
      throw httpError('El presupuesto no tiene ítems para duplicar', 400);
    }
    return this.createPlan(
      clinicId,
      {
        patientId: source.patientId,
        title: source.title
          ? `Copia de ${source.title}`
          : 'Presupuesto',
        notes: source.notes,
        status: 'DRAFT',
        items: items.map((item) => ({
          treatmentId: item.treatmentId,
          toothNumber: item.toothNumber,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPct: item.discountPct,
        })),
      },
      createdBy,
    );
  }

  async listPayments(
    clinicId: string,
    patientId: string,
  ): Promise<PaymentDto[]> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<PaymentRow[]>(
      `SELECT p.*, tp.title AS plan_title, tp.total_amount AS plan_total
       FROM payments p
       LEFT JOIN treatment_plans tp
         ON tp.id = p.treatment_plan_id AND tp.clinic_id = p.clinic_id
       WHERE p.patient_id = :patientId AND p.clinic_id = :clinicId
       ORDER BY p.paid_at DESC`,
      { patientId, clinicId },
    );
    return rows.map(mapPayment);
  }

  async registerPayment(
    clinicId: string,
    dto: CreatePaymentDto,
    receivedBy?: string,
  ): Promise<PaymentDto> {
    const [payment] = await this.registerPaymentBatch(
      clinicId,
      {
        patientId: dto.patientId,
        treatmentPlanId: dto.treatmentPlanId,
        currencyPaid: dto.currencyPaid,
        exchangeRate: dto.exchangeRate,
        rateSource: dto.rateSource,
        notes: dto.notes,
        splits: [
          {
            paymentMethod: dto.paymentMethod,
            amountPaid: dto.amountPaid,
            reference: dto.reference,
          },
        ],
      },
      receivedBy,
    );
    return payment;
  }

  async registerPaymentBatch(
    clinicId: string,
    dto: CreatePaymentBatchDto,
    receivedBy?: string,
  ): Promise<PaymentDto[]> {
    if (!dto.patientId) throw httpError('patientId es obligatorio', 400);
    if (!dto.treatmentPlanId) {
      throw httpError('treatmentPlanId es obligatorio', 400);
    }
    if (!dto.splits?.length) {
      throw httpError('Indicá al menos un método de pago', 400);
    }

    const currencyPaid: PaymentCurrency =
      dto.currencyPaid === 'VES' ? 'VES' : 'USD';
    if (dto.currencyPaid && !PAYMENT_CURRENCIES.includes(dto.currencyPaid)) {
      throw httpError('currencyPaid inválida', 400);
    }

    const rate = Number(dto.exchangeRate ?? 0);
    if (!(rate > 0)) {
      throw httpError('Indicá la tasa de cambio del día (Bs/USD)', 400);
    }
    const rateSource: RateSource =
      dto.rateSource === 'MANUAL' ? 'MANUAL' : 'BCV';

    const normalized: Array<{
      paymentMethod: PaymentSplitInput['paymentMethod'];
      amountInput: number;
      amountPaidUsd: number;
      amountPaidVes: number;
      reference: string | null;
    }> = [];

    for (const split of dto.splits) {
      if (!PAYMENT_METHODS.includes(split.paymentMethod)) {
        throw httpError('paymentMethod inválido', 400);
      }
      if (split.paymentMethod !== 'CASH' && !split.reference?.trim()) {
        throw httpError(
          'La referencia es obligatoria para este método de pago',
          400,
        );
      }
      const amountInput = Math.round(Number(split.amountPaid) * 100) / 100;
      if (!(amountInput > 0)) {
        throw httpError('Cada línea de pago debe ser mayor a 0', 400);
      }
      let amountPaidUsd: number;
      let amountPaidVes: number;
      if (currencyPaid === 'VES') {
        amountPaidVes = amountInput;
        amountPaidUsd = Math.round((amountInput / rate) * 100) / 100;
      } else {
        amountPaidUsd = amountInput;
        amountPaidVes = Math.round(amountInput * rate * 100) / 100;
      }
      if (!(amountPaidUsd > 0)) {
        throw httpError('El abono en USD debe ser mayor a 0', 400);
      }
      normalized.push({
        paymentMethod: split.paymentMethod,
        amountInput,
        amountPaidUsd,
        amountPaidVes,
        reference:
          split.paymentMethod === 'CASH'
            ? null
            : split.reference?.trim() || null,
      });
    }

    const totalUsd =
      Math.round(
        normalized.reduce((s, n) => s + n.amountPaidUsd, 0) * 100,
      ) / 100;

    await assertPatientInClinic(clinicId, dto.patientId);

    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();

      const [planRows] = await conn.query<PlanRow[]>(
        `SELECT * FROM treatment_plans
         WHERE id = :id AND clinic_id = :clinicId
         LIMIT 1 FOR UPDATE`,
        { id: dto.treatmentPlanId, clinicId },
      );
      const planRow = planRows[0];
      if (!planRow) throw httpError('Plan no encontrado', 404);

      const plan = mapPlan(planRow, []);
      if (plan.patientId !== dto.patientId) {
        throw httpError('El plan no pertenece a este paciente', 400);
      }
      if (plan.status === 'DRAFT') {
        throw httpError('Apruebe el plan antes de registrar abonos', 400);
      }

      const remaining =
        Math.round((plan.totalAmount - plan.paidAmount) * 100) / 100;
      if (totalUsd > remaining + 0.009) {
        throw httpError(
          `El abono supera el saldo pendiente (${remaining.toFixed(2)} USD)`,
          400,
        );
      }

      const stamp = Date.now().toString(36).toUpperCase();
      const createdIds: string[] = [];

      for (let i = 0; i < normalized.length; i++) {
        const split = normalized[i];
        const paymentId = uuidv4();
        const receiptNumber = `REC-${stamp}-${String(i + 1).padStart(2, '0')}`;
        const splitNote =
          normalized.length > 1
            ? `Parte ${i + 1}/${normalized.length}`
            : null;
        const notes = [dto.notes?.trim(), splitNote].filter(Boolean).join(' · ') || null;

        await conn.query(
          `INSERT INTO payments
             (id, clinic_id, patient_id, treatment_plan_id, amount_paid,
              currency_paid, amount_paid_ves, exchange_rate, rate_source,
              payment_method, reference, receipt_number, notes, received_by)
           VALUES
             (:id, :clinicId, :patientId, :treatmentPlanId, :amountPaid,
              :currencyPaid, :amountPaidVes, :exchangeRate, :rateSource,
              :paymentMethod, :reference, :receiptNumber, :notes, :receivedBy)`,
          {
            id: paymentId,
            clinicId,
            patientId: dto.patientId,
            treatmentPlanId: dto.treatmentPlanId,
            amountPaid: split.amountPaidUsd,
            currencyPaid,
            amountPaidVes: split.amountPaidVes,
            exchangeRate: rate,
            rateSource,
            paymentMethod: split.paymentMethod,
            reference: split.reference,
            receiptNumber,
            notes,
            receivedBy: receivedBy ?? null,
          },
        );
        createdIds.push(paymentId);
      }

      await conn.query(
        `UPDATE treatment_plans
         SET paid_amount = paid_amount + :amount,
             status = CASE
               WHEN paid_amount + :amount >= total_amount - 0.009 THEN 'CLOSED'
               WHEN status = 'APPROVED' THEN 'IN_PROGRESS'
               ELSE status
             END
         WHERE id = :id AND clinic_id = :clinicId`,
        { id: dto.treatmentPlanId, clinicId, amount: totalUsd },
      );

      await conn.commit();

      const [rows] = await dbPool.query<PaymentRow[]>(
        `SELECT * FROM payments
         WHERE clinic_id = :clinicId AND id IN (${createdIds.map((_, i) => `:id${i}`).join(',')})
         ORDER BY created_at ASC`,
        {
          clinicId,
          ...Object.fromEntries(createdIds.map((id, i) => [`id${i}`, id])),
        },
      );
      const payments = rows.map(mapPayment);

      const totalVes =
        Math.round(
          normalized.reduce((s, n) => s + n.amountPaidVes, 0) * 100,
        ) / 100;
      const [planAfter] = await dbPool.query<PlanRow[]>(
        `SELECT * FROM treatment_plans
         WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
        { id: dto.treatmentPlanId, clinicId },
      );
      const planAfterRow = planAfter[0];
      const balanceDue = planAfterRow
        ? Math.round(
            (Number(planAfterRow.total_amount) -
              Number(planAfterRow.paid_amount)) *
              100,
          ) / 100
        : 0;

      void maybeSendPaymentReceiptEmail({
        clinicId,
        patientId: dto.patientId,
        amountUsd: totalUsd,
        amountVes: totalVes,
        exchangeRate: rate,
        methods: normalized.map((n) => n.paymentMethod),
        receiptNumbers: payments.map((p) => p.receiptNumber),
        balanceDue,
      });

      return payments;
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Número de recibo duplicado', 409);
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  async getOpenPlanForPatient(
    clinicId: string,
    patientId: string,
  ): Promise<TreatmentPlanDto | null> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<PlanRow[]>(
      `SELECT * FROM treatment_plans
       WHERE patient_id = :patientId
         AND clinic_id = :clinicId
         AND status IN ('APPROVED', 'IN_PROGRESS')
         AND total_amount > paid_amount
       ORDER BY created_at DESC
       LIMIT 1`,
      { patientId, clinicId },
    );
    if (!rows[0]) return null;
    return mapPlan(rows[0], await this.getItems(clinicId, rows[0].id));
  }
}

export const billingService = new BillingService();
