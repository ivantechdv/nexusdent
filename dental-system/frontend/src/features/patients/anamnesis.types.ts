/** Anamnesis estructurada (Figma Historial Clínico) */

export const SYSTEMIC_DISEASES = [
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'cardiopathy', label: 'Cardiopatía' },
  { key: 'epilepsy', label: 'Epilepsia' },
  { key: 'asthma', label: 'Asma' },
  { key: 'hiv', label: 'VIH/SIDA' },
  { key: 'arthritis', label: 'Artritis' },
  { key: 'hypertension', label: 'Hipertensión' },
  { key: 'tuberculosis', label: 'Tuberculosis' },
  { key: 'thyroid', label: 'Tiroides' },
  { key: 'cancer', label: 'Cáncer' },
  { key: 'hepatitis', label: 'Hepatitis' },
  { key: 'renalFailure', label: 'Insuficiencia Renal' },
] as const;

export const DENTAL_HISTORY = [
  { key: 'orthodontics', label: 'Ortodoncia previa' },
  { key: 'wisdomTeeth', label: 'Cirugía de cordales' },
  { key: 'whitening', label: 'Blanqueamiento previo' },
  { key: 'endodontics', label: 'Endodoncias previas' },
] as const;

export const FAMILY_HISTORY = [
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'hypertension', label: 'Hipertensión' },
  { key: 'cardiopathy', label: 'Cardiopatía' },
  { key: 'cancer', label: 'Cáncer' },
] as const;

export const HABITS = [
  { key: 'tobacco', label: 'Tabaco' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'bruxism', label: 'Bruxismo' },
  { key: 'onychophagia', label: 'Onicofagia' },
  { key: 'mouthBreathing', label: 'Respirador Bucal' },
] as const;

export type AllergySeverity = 'SEVERA' | 'MODERADA' | 'LEVE';

export type AnamnesisMedication = {
  name: string;
  dose: string;
  frequency: string;
  reason: string;
};

export type AnamnesisSurgery = {
  procedure: string;
  date: string;
  hospital: string;
  complications: string;
};

export type AnamnesisAllergy = {
  name: string;
  severity: AllergySeverity;
};

export type AnamnesisData = {
  v: 1;
  diseases: Record<string, boolean>;
  diseaseNotes: string;
  medications: AnamnesisMedication[];
  surgeries: AnamnesisSurgery[];
  dental: Record<string, boolean>;
  dentalNotes: string;
  allergies: AnamnesisAllergy[];
  pregnancy: {
    active: boolean;
    weeks: number | null;
    dueDate: string;
    obstetrician: string;
  };
  family: Record<string, string>;
  habits: Record<string, string>;
  specialAttention: string;
  generalNotes: string;
};

export function emptyAnamnesis(): AnamnesisData {
  return {
    v: 1,
    diseases: Object.fromEntries(SYSTEMIC_DISEASES.map((d) => [d.key, false])),
    diseaseNotes: '',
    medications: [],
    surgeries: [],
    dental: Object.fromEntries(DENTAL_HISTORY.map((d) => [d.key, false])),
    dentalNotes: '',
    allergies: [],
    pregnancy: {
      active: false,
      weeks: null,
      dueDate: '',
      obstetrician: '',
    },
    family: Object.fromEntries(FAMILY_HISTORY.map((f) => [f.key, ''])),
    habits: Object.fromEntries(HABITS.map((h) => [h.key, 'No'])),
    specialAttention: '',
    generalNotes: '',
  };
}

export function parseAnamnesisData(
  notes?: string | null,
  flags?: {
    hasDiabetes?: boolean;
    hasHypertension?: boolean;
    isPregnant?: boolean;
    allergyPenicillin?: boolean;
    allergyAnesthesia?: boolean;
    medicalConditions?: string | null;
  },
): AnamnesisData {
  const base = emptyAnamnesis();

  if (notes?.trim().startsWith('{')) {
    try {
      const raw = JSON.parse(notes) as Partial<AnamnesisData>;
      if (raw && raw.v === 1) {
        return {
          ...base,
          ...raw,
          diseases: { ...base.diseases, ...raw.diseases },
          dental: { ...base.dental, ...raw.dental },
          family: { ...base.family, ...raw.family },
          habits: { ...base.habits, ...raw.habits },
          pregnancy: { ...base.pregnancy, ...raw.pregnancy },
          medications: raw.medications ?? [],
          surgeries: raw.surgeries ?? [],
          allergies: raw.allergies ?? [],
        };
      }
    } catch {
      /* fall through */
    }
  }

  // Migración suave desde flags / notas libres
  if (flags?.hasDiabetes) base.diseases.diabetes = true;
  if (flags?.hasHypertension) base.diseases.hypertension = true;
  if (flags?.isPregnant) base.pregnancy.active = true;
  if (flags?.allergyPenicillin) {
    base.allergies.push({ name: 'Penicilina', severity: 'SEVERA' });
  }
  if (flags?.allergyAnesthesia) {
    base.allergies.push({ name: 'Anestesia', severity: 'MODERADA' });
  }

  const cond = (flags?.medicalConditions ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const c of cond) {
    const key = SYSTEMIC_DISEASES.find(
      (d) => d.label.toLowerCase() === c.toLowerCase(),
    )?.key;
    if (key) base.diseases[key] = true;
  }

  if (notes?.trim() && !notes.trim().startsWith('{')) {
    base.generalNotes = notes.trim();
  }

  return base;
}

export function serializeAnamnesisData(data: AnamnesisData): string {
  return JSON.stringify(data);
}

/** Flags y medical_conditions derivados para alertas / listados */
export function derivePatientFlags(data: AnamnesisData) {
  const allergyNames = data.allergies.map((a) => a.name.toLowerCase());
  const conditions = SYSTEMIC_DISEASES.filter((d) => data.diseases[d.key]).map(
    (d) => d.label,
  );

  return {
    hasDiabetes: Boolean(data.diseases.diabetes),
    hasHypertension: Boolean(data.diseases.hypertension),
    isPregnant: Boolean(data.pregnancy.active),
    allergyPenicillin: allergyNames.some((n) => n.includes('penicil')),
    allergyAnesthesia: allergyNames.some((n) => n.includes('anest')),
    medicalConditions: conditions.length ? conditions.join(', ') : null,
  };
}
