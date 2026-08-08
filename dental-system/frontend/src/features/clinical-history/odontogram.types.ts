/** Tipos compartidos del odontograma (Notación FDI / Internacional) */

export type ToothSurface = 'V' | 'L' | 'P' | 'M' | 'D' | 'O' | 'WHOLE';

export type OdontogramCondition =
  | 'HEALTHY'
  | 'CARIES'
  | 'RESTORATION'
  | 'MISSING'
  | 'ENDO_NEEDED'
  | 'CROWN'
  | 'EXTRACTION_NEEDED'
  | 'IMPLANT'
  | 'FRACTURE';

export type OdontogramStatus = 'PRESENT' | 'TREATED' | 'IN_PROGRESS' | 'ABSENT';

export type ColorCode = 'RED' | 'BLUE' | 'BLACK' | 'GREEN' | 'CLEAR';

export interface OdontogramStateItem {
  id?: string;
  toothNumber: number;
  surface: ToothSurface;
  condition: OdontogramCondition;
  status: OdontogramStatus;
  notes?: string | null;
}

/** Superior: cuadrante 1 (derecha) → 2 (izquierda). Inferior: 4 → 3. */
export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as const;
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] as const;

export const SURFACE_LABELS: Record<Exclude<ToothSurface, 'WHOLE'>, string> = {
  V: 'Vestibular',
  L: 'Lingual',
  P: 'Palatina',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal / Incisal',
};

/** Colores código industria dental */
export const CONDITION_COLORS: Record<OdontogramCondition, string> = {
  HEALTHY: '#f1f5f9',
  CARIES: '#dc2626',
  RESTORATION: '#2563eb',
  MISSING: '#374151',
  ENDO_NEEDED: '#dc2626',
  CROWN: '#2563eb',
  EXTRACTION_NEEDED: '#dc2626',
  IMPLANT: '#2563eb',
  FRACTURE: '#dc2626',
};

export const STATUS_OVERRIDE: Partial<Record<OdontogramStatus, string>> = {
  IN_PROGRESS: '#16a34a',
  ABSENT: '#374151',
  TREATED: '#2563eb',
};

export function resolveSurfaceColor(
  condition: OdontogramCondition,
  status: OdontogramStatus,
): string {
  if (status === 'ABSENT' || condition === 'MISSING') return '#374151';
  if (status === 'IN_PROGRESS') return '#16a34a';
  if (status === 'TREATED') return CONDITION_COLORS[condition] === '#f1f5f9'
    ? '#2563eb'
    : CONDITION_COLORS[condition];
  return CONDITION_COLORS[condition];
}

export function colorCodeToState(code: ColorCode): {
  condition: OdontogramCondition;
  status: OdontogramStatus;
} | null {
  switch (code) {
    case 'RED':
      return { condition: 'CARIES', status: 'PRESENT' };
    case 'BLUE':
      return { condition: 'RESTORATION', status: 'TREATED' };
    case 'BLACK':
      return { condition: 'MISSING', status: 'ABSENT' };
    case 'GREEN':
      return { condition: 'CARIES', status: 'IN_PROGRESS' };
    case 'CLEAR':
      return { condition: 'HEALTHY', status: 'PRESENT' };
    default:
      return null;
  }
}

export function isPosterior(tooth: number): boolean {
  const n = tooth % 10;
  return n >= 4 && n <= 8;
}

/** Cara lingual vs palatina según arcada */
export function lingualOrPalatal(tooth: number): 'L' | 'P' {
  const quadrant = Math.floor(tooth / 10);
  return quadrant <= 2 ? 'P' : 'L';
}
