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

export interface OdontogramState {
  id: string;
  patient_id: string;
  tooth_number: number;
  surface: ToothSurface;
  condition: OdontogramCondition;
  status: OdontogramStatus;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: Date;
  updated_at: Date;
}

export interface UpsertOdontogramDto {
  patientId: string;
  toothNumber: number;
  surface: ToothSurface;
  condition: OdontogramCondition;
  status?: OdontogramStatus;
  notes?: string;
  recordedBy?: string;
}

export interface BulkUpsertOdontogramDto {
  patientId: string;
  states: Array<{
    toothNumber: number;
    surface: ToothSurface;
    condition: OdontogramCondition;
    status?: OdontogramStatus;
    notes?: string;
  }>;
  recordedBy?: string;
}

/** Piezas FDI adulto (32): cuadrantes 1-4 */
export const FDI_ADULT_TEETH = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
] as const;

export function isValidFdiTooth(n: number): boolean {
  return FDI_ADULT_TEETH.includes(n as (typeof FDI_ADULT_TEETH)[number]);
}
