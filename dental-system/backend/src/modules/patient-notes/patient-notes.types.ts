export type ClinicalNoteTag =
  | 'Importante'
  | 'Anestesia'
  | 'Embarazo'
  | 'Comportamiento'
  | 'Comunicación'
  | 'Ortodoncia'
  | 'Agenda'
  | 'Alergia'
  | 'Otro';

export type ClinicalNoteEventAction = 'CREATED' | 'UPDATED' | 'DELETED';

export interface ClinicalNote {
  id: string;
  patientId: string;
  title: string;
  body: string;
  tags: string[];
  isCritical: boolean;
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalNoteEvent {
  id: string;
  patientId: string;
  noteId: string | null;
  action: ClinicalNoteEventAction;
  noteTitle: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface UpsertClinicalNoteDto {
  title: string;
  body: string;
  tags?: string[];
  isCritical?: boolean;
}

export const CLINICAL_NOTE_TAGS: ClinicalNoteTag[] = [
  'Importante',
  'Anestesia',
  'Embarazo',
  'Comportamiento',
  'Comunicación',
  'Ortodoncia',
  'Agenda',
  'Alergia',
  'Otro',
];
