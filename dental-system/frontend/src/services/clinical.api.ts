import { api } from './api';
import type { OdontogramStateItem } from '@/features/clinical-history/odontogram.types';
import type { ClinicalEvolution } from '@/features/patients/ClinicalTimeline';

interface OdontogramApiRow {
  tooth_number: number;
  surface: OdontogramStateItem['surface'];
  condition: OdontogramStateItem['condition'];
  status: OdontogramStateItem['status'];
  notes?: string | null;
}

interface ClinicalApiRow {
  id: string;
  patient_id?: string;
  signed_at: string;
  dentist_name?: string;
  appointment_id?: string | null;
  next_appointment_id?: string | null;
  tooth_number?: number | null;
  treatment_name?: string | null;
  treatment_code?: string | null;
  clinical_notes: string;
  prescription?: string | null;
  attachment_url?: string | null;
  billing?: ClinicalEvolution['billing'];
  sessionAppointment?: ClinicalEvolution['sessionAppointment'];
  nextAppointment?: ClinicalEvolution['nextAppointment'];
}

export async function getOdontogramApi(patientId: string): Promise<OdontogramStateItem[]> {
  const { data } = await api.get<{ data: OdontogramApiRow[] }>(
    `/odontogram/${patientId}`,
  );
  return data.data.map((r) => ({
    toothNumber: r.tooth_number,
    surface: r.surface,
    condition: r.condition,
    status: r.status,
    notes: r.notes ?? undefined,
  }));
}

export async function upsertOdontogramApi(payload: {
  patientId: string;
  toothNumber: number;
  surface: OdontogramStateItem['surface'];
  condition: OdontogramStateItem['condition'];
  status?: OdontogramStateItem['status'];
  notes?: string;
}) {
  const { data } = await api.put('/odontogram', payload);
  return data;
}

export async function listEvolutionsApi(
  patientId: string,
): Promise<ClinicalEvolution[]> {
  const { data } = await api.get<{ data: ClinicalApiRow[] }>(
    `/clinical-records/patient/${patientId}`,
  );
  return data.data.map(mapClinicalRow);
}

export async function getEvolutionApi(id: string): Promise<ClinicalEvolution> {
  const { data } = await api.get<{ data: ClinicalApiRow }>(
    `/clinical-records/${id}`,
  );
  return mapClinicalRow(data.data);
}

function mapClinicalRow(r: ClinicalApiRow): ClinicalEvolution {
  return {
    id: r.id,
    patientId: r.patient_id,
    signedAt: r.signed_at,
    dentistName: r.dentist_name ?? 'Odontólogo',
    appointmentId: r.appointment_id ?? null,
    toothNumber: r.tooth_number,
    treatmentName: r.treatment_name,
    treatmentCode: r.treatment_code,
    clinicalNotes: r.clinical_notes,
    prescription: r.prescription,
    attachmentUrl: r.attachment_url,
    billing: r.billing ?? null,
    sessionAppointment: r.sessionAppointment ?? null,
    nextAppointment: r.nextAppointment ?? null,
  };
}

export async function updateEvolutionApi(
  id: string,
  payload: {
    clinicalNotes?: string;
    prescription?: string | null;
    toothNumber?: number | null;
  },
) {
  const { data } = await api.patch(`/clinical-records/${id}`, payload);
  return data;
}

export async function deleteEvolutionApi(id: string) {
  await api.delete(`/clinical-records/${id}`);
}
