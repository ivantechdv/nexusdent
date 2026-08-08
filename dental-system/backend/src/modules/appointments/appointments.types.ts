export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'WAITING_ROOM'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface AppointmentRow {
  id: string;
  patient_id: string;
  dentist_id: string;
  scheduled_at: Date | string;
  duration_min: number;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  patient_name?: string;
  patient_document?: string;
  patient_phone?: string | null;
  dentist_name?: string;
}

export interface AppointmentDto {
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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateAppointmentDto {
  patientId: string;
  dentistId: string;
  scheduledAt: string;
  durationMin?: number;
  status?: AppointmentStatus;
  reason?: string | null;
  notes?: string | null;
}

export interface UpdateAppointmentDto {
  patientId?: string;
  dentistId?: string;
  scheduledAt?: string;
  durationMin?: number;
  status?: AppointmentStatus;
  reason?: string | null;
  notes?: string | null;
}
