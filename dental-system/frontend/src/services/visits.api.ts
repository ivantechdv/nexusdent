import { api } from './api';
import { newIdempotencyKey } from '@/lib/idempotency';

export interface VisitProcedureInput {
  treatmentId: number;
  toothNumber?: number | null;
  quantity?: number;
}

export interface CompleteVisitPayload {
  patientId: string;
  appointmentId?: string | null;
  walkIn?: boolean;
  dentistId?: string;
  clinicalNotes: string;
  prescription?: string | null;
  procedures: VisitProcedureInput[];
  toothNumbers?: number[];
  attachmentUrls?: string[];
  billProcedures?: boolean;
  /** Enviar resumen por email al paciente (default true). Requiere email en ficha. */
  notifyPatient?: boolean;
  nextAppointment?: {
    scheduledAt: string;
    dentistId?: string;
    durationMin?: number;
    reason?: string | null;
  } | null;
}

export interface CompleteVisitResult {
  evolutions: Array<{
    id: string;
    treatmentId: number | null;
    toothNumber: number | null;
  }>;
  planId: string | null;
  walkInAppointmentId: string | null;
  nextAppointmentId: string | null;
}

export async function completeVisitApi(payload: CompleteVisitPayload) {
  const { data } = await api.post<{ data: CompleteVisitResult }>(
    '/visits',
    payload,
    {
      headers: { 'Idempotency-Key': newIdempotencyKey() },
    },
  );
  return data.data;
}

export type UpdateVisitPayload = Omit<
  CompleteVisitPayload,
  'patientId' | 'appointmentId' | 'walkIn'
>;

export async function updateVisitApi(
  evolutionId: string,
  payload: UpdateVisitPayload,
) {
  const { data } = await api.put<{ data: CompleteVisitResult }>(
    `/visits/${evolutionId}`,
    payload,
    {
      headers: { 'Idempotency-Key': newIdempotencyKey() },
    },
  );
  return data.data;
}
