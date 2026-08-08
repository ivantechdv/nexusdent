import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { assertPatientInClinic } from '../../utils/clinic';
import { httpError } from '../../utils/http';
import { maybeSendPaymentReceiptEmail } from '../../utils/patient-notify';
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
} from './billing.types';

type PlanRow = RowDataPacket & {
  id: string;
  patient_id: string;
  created_by: string | null;
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

export class BillingService {
  async listPlansByPatient(
    clinicId: string,
    patientId: string,
  ): Promise<TreatmentPlanDto[]> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<PlanRow[]>(
      `SELECT * FROM treatment_plans
       WHERE patient_id = :patientId AND clinic_id = :clinicId
       ORDER BY created_at DESC`,
      { patientId, clinicId },
    );
    const plans = await Promise.all(
      rows.map(async (row) =>
        mapPlan(row, await this.getItems(clinicId, row.id)),
      ),
    );
    return plans;
  }

  async getPlan(clinicId: string, id: string): Promise<TreatmentPlanDto> {
    const [rows] = await dbPool.query<PlanRow[]>(
      `SELECT * FROM treatment_plans
       WHERE id = :id AND clinic_id = :clinicId
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

      await conn.query(
        `INSERT INTO treatment_plans
           (id, clinic_id, patient_id, created_by, title, total_amount, paid_amount, status, notes, approved_at)
         VALUES
           (:id, :clinicId, :patientId, :createdBy, :title, :totalAmount, 0, :status, :notes, :approvedAt)`,
        {
          id: planId,
          clinicId,
          patientId: dto.patientId,
          createdBy: createdBy ?? null,
          title: dto.title ?? 'Plan de tratamiento',
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

      await conn.commit();
      return this.getPlan(clinicId, planId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updatePlanStatus(
    clinicId: string,
    id: string,
    status: PlanStatus,
  ): Promise<TreatmentPlanDto> {
    const valid: PlanStatus[] = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'CLOSED'];
    if (!valid.includes(status)) throw httpError('status inválido', 400);

    await this.getPlan(clinicId, id);
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

  async listPayments(
    clinicId: string,
    patientId: string,
  ): Promise<PaymentDto[]> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<PaymentRow[]>(
      `SELECT * FROM payments
       WHERE patient_id = :patientId AND clinic_id = :clinicId
       ORDER BY paid_at DESC`,
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
