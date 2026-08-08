import { api } from './api';

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'WAITING_ROOM'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Appointment {
  id: string;
  patientId: string;
  dentistId: string;
  scheduledAt: string;
  durationMin: number;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  patientName?: string;
  patientDocument?: string;
  patientPhone?: string | null;
  dentistName?: string;
}

export async function listAppointmentsApi(params?: {
  from?: string;
  to?: string;
  dentistId?: string;
  patientId?: string;
  status?: string;
}) {
  const { data } = await api.get<{ data: Appointment[] }>('/appointments', {
    params,
  });
  return data.data;
}

export async function createAppointmentApi(payload: {
  patientId: string;
  dentistId: string;
  scheduledAt: string;
  durationMin?: number;
  status?: AppointmentStatus;
  reason?: string | null;
  notes?: string | null;
}) {
  const { data } = await api.post<{ data: Appointment }>('/appointments', payload);
  return data.data;
}

export async function updateAppointmentApi(
  id: string,
  payload: Partial<{
    patientId: string;
    dentistId: string;
    scheduledAt: string;
    durationMin: number;
    status: AppointmentStatus;
    reason: string | null;
    notes: string | null;
  }>,
) {
  const { data } = await api.patch<{ data: Appointment }>(
    `/appointments/${id}`,
    payload,
  );
  return data.data;
}
