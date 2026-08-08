export interface ClinicalAppointmentSnapshot {
  id: string;
  scheduledAt: string;
  status: string;
  reason: string | null;
  dentistName?: string | null;
}

export interface ClinicalRecord {
  id: string;
  patient_id: string;
  dentist_id: string;
  appointment_id: string | null;
  next_appointment_id?: string | null;
  treatment_plan_id?: string | null;
  tooth_number: number | null;
  treatment_id: number | null;
  clinical_notes: string;
  prescription: string | null;
  attachment_url: string | null;
  signed_at: Date;
  created_at: Date;
  updated_at: Date;
  // Joins
  dentist_name?: string;
  treatment_name?: string;
  treatment_code?: string;
  /** Snapshot de cobro del día (si hay plan vinculado) */
  billing?: ClinicalBillingSnapshot | null;
  /** Cita de agenda que originó esta atención (si hubo) */
  sessionAppointment?: ClinicalAppointmentSnapshot | null;
  /** Próxima cita agendada al cerrar esta atención */
  nextAppointment?: ClinicalAppointmentSnapshot | null;
}

export interface ClinicalBillingLine {
  treatmentId: number;
  code: string;
  name: string;
  toothNumber: number | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ClinicalBillingSnapshot {
  planId: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  items: ClinicalBillingLine[];
}

export interface CreateClinicalRecordDto {
  patientId: string;
  dentistId?: string;
  appointmentId?: string | null;
  toothNumber?: number | null;
  treatmentId?: number | null;
  clinicalNotes: string;
  prescription?: string | null;
  attachmentUrl?: string | null;
}

export interface UpdateClinicalRecordDto {
  toothNumber?: number | null;
  treatmentId?: number | null;
  clinicalNotes?: string;
  prescription?: string | null;
  attachmentUrl?: string | null;
}
