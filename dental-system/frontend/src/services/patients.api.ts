import { api } from './api';
import type { ActivePatient } from '@/stores/active-patient.store';
import type { PatientBalance } from '@/features/patients/FinancialBanner';

export type Patient = ActivePatient & {
  gender?: string;
  email?: string | null;
  address?: string | null;
  emergencyPhone?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  lastVisitAt?: string | null;
  balanceDue?: number;
  listStatus?: 'ACTIVE' | 'NEW' | 'INACTIVE';
};

export type UpsertPatient = {
  documentId: string;
  fullName: string;
  birthDate: string;
  gender?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  allergyAnesthesia?: boolean;
  allergyPenicillin?: boolean;
  hasHypertension?: boolean;
  hasDiabetes?: boolean;
  coagulationIssues?: boolean;
  isPregnant?: boolean;
  anamnesisNotes?: string | null;
  medicalConditions?: string | null;
};

export type PatientsSummary = {
  total: number;
  newThisMonth: number;
  withDebt: number;
  active: number;
  newThisMonthDeltaPct: number | null;
};

export async function listPatientsApi(q?: string, limit = 50) {
  const { data } = await api.get<{ data: Patient[] }>('/patients', {
    params: {
      ...(q ? { q } : {}),
      limit,
    },
  });
  return data.data;
}

export async function getPatientsSummaryApi(): Promise<PatientsSummary> {
  const { data } = await api.get<{ data: PatientsSummary }>('/patients/summary');
  return data.data;
}

export async function getPatientApi(id: string) {
  const { data } = await api.get<{ data: Patient }>(`/patients/${id}`);
  return data.data;
}

export async function getPatientByDocumentApi(documentId: string) {
  const { data } = await api.get<{ data: Patient }>(
    `/patients/document/${encodeURIComponent(documentId)}`,
  );
  return data.data;
}

export async function createPatientApi(payload: UpsertPatient) {
  const { data } = await api.post<{ data: Patient }>('/patients', payload);
  return data.data;
}

export async function updatePatientApi(id: string, payload: UpsertPatient) {
  const { data } = await api.put<{ data: Patient }>(`/patients/${id}`, payload);
  return data.data;
}

export async function getPatientBalanceApi(id: string): Promise<PatientBalance> {
  const { data } = await api.get<{
    data: {
      totalBudgeted: number;
      totalPaid: number;
      balanceDue: number;
    };
  }>(`/patients/${id}/balance`);
  return data.data;
}
