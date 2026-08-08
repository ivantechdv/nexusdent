export type PatientGender = 'M' | 'F' | 'OTHER' | 'UNSPECIFIED';

export interface Patient {
  id: string;
  document_id: string;
  full_name: string;
  birth_date: string;
  gender: PatientGender;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  allergy_anesthesia: number;
  allergy_penicillin: number;
  has_hypertension: number;
  has_diabetes: number;
  coagulation_issues: number;
  is_pregnant: number;
  anamnesis_notes: string | null;
  medical_conditions: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PatientDto {
  id: string;
  documentId: string;
  fullName: string;
  birthDate: string;
  gender: PatientGender;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  allergyAnesthesia: boolean;
  allergyPenicillin: boolean;
  hasHypertension: boolean;
  hasDiabetes: boolean;
  coagulationIssues: boolean;
  isPregnant: boolean;
  anamnesisNotes: string | null;
  medicalConditions: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UpsertPatientDto {
  documentId: string;
  fullName: string;
  birthDate: string;
  gender?: PatientGender;
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
}

export interface PatientBalanceDto {
  patientId: string;
  documentId: string;
  fullName: string;
  totalBudgeted: number;
  totalPaid: number;
  balanceDue: number;
}
