import { api } from './api';
import { newIdempotencyKey } from '@/lib/idempotency';
import type { PaymentMethod } from '@/lib/payment-methods';

export type { PaymentMethod };

export interface TreatmentPlanItem {
  id: string;
  treatmentPlanId: string;
  treatmentId: number;
  toothNumber: number | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  lineTotal: number;
  status: string;
  treatmentName?: string;
  treatmentCode?: string;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  title: string | null;
  totalAmount: number;
  paidAmount: number;
  status: 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'CLOSED';
  notes: string | null;
  items?: TreatmentPlanItem[];
}

export interface Payment {
  id: string;
  patientId: string;
  treatmentPlanId: string;
  amountPaid: number;
  currencyPaid?: 'USD' | 'VES';
  amountPaidVes?: number | null;
  exchangeRate?: number | null;
  rateSource?: 'BCV' | 'MANUAL' | null;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  receiptNumber: string;
  notes: string | null;
  paidAt: string;
}

export async function listPlansApi(patientId: string) {
  const { data } = await api.get<{ data: TreatmentPlan[] }>('/billing/plans', {
    params: { patientId },
  });
  return data.data;
}

export async function getOpenPlanApi(patientId: string) {
  const { data } = await api.get<{ data: TreatmentPlan | null }>(
    `/billing/plans/open/${patientId}`,
  );
  return data.data;
}

export async function createPlanApi(payload: {
  patientId: string;
  title?: string;
  notes?: string | null;
  status?: TreatmentPlan['status'];
  items: Array<{
    treatmentId: number;
    toothNumber?: number | null;
    quantity?: number;
    unitPrice?: number;
    discountPct?: number;
  }>;
}) {
  const { data } = await api.post<{ data: TreatmentPlan }>('/billing/plans', payload);
  return data.data;
}

export async function updatePlanStatusApi(
  id: string,
  status: TreatmentPlan['status'],
) {
  const { data } = await api.patch<{ data: TreatmentPlan }>(
    `/billing/plans/${id}/status`,
    { status },
  );
  return data.data;
}

export async function registerPaymentApi(payload: {
  patientId: string;
  treatmentPlanId: string;
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
  currencyPaid?: 'USD' | 'VES';
  exchangeRate?: number | null;
  rateSource?: 'BCV' | 'MANUAL' | null;
  reference?: string | null;
  notes?: string;
  splits?: Array<{
    paymentMethod: PaymentMethod;
    amountPaid: number;
    reference?: string | null;
  }>;
}) {
  const { data } = await api.post<{ data: Payment | Payment[] }>(
    '/billing/payments',
    payload,
    {
      headers: { 'Idempotency-Key': newIdempotencyKey() },
    },
  );
  return data.data;
}
