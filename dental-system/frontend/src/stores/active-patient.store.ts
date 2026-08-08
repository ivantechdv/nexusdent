import { create } from 'zustand';

export interface ActivePatient {
  id: string;
  documentId: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string;
  emergencyContact?: string | null;
  anamnesisNotes?: string | null;
  medicalConditions?: string | null;
  allergyAnesthesia?: boolean;
  allergyPenicillin?: boolean;
  hasHypertension?: boolean;
  hasDiabetes?: boolean;
  coagulationIssues?: boolean;
  isPregnant?: boolean;
}

interface ActivePatientState {
  patient: ActivePatient | null;
  setPatient: (patient: ActivePatient | null) => void;
  clear: () => void;
}

export const useActivePatientStore = create<ActivePatientState>((set) => ({
  patient: null,
  setPatient: (patient) => set({ patient }),
  clear: () => set({ patient: null }),
}));
