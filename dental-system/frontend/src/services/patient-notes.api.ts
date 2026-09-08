import { api } from './api';

export type ClinicalNote = {
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
};

export type ClinicalNoteEvent = {
  id: string;
  patientId: string;
  noteId: string | null;
  action: 'CREATED' | 'UPDATED' | 'DELETED';
  noteTitle: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
};

export type UpsertClinicalNotePayload = {
  title: string;
  body: string;
  tags?: string[];
  isCritical?: boolean;
};

export const CLINICAL_NOTE_TAGS = [
  'Importante',
  'Anestesia',
  'Embarazo',
  'Comportamiento',
  'Comunicación',
  'Ortodoncia',
  'Agenda',
  'Alergia',
  'Otro',
] as const;

export const CLINICAL_NOTE_TAG_STYLES: Record<string, string> = {
  Importante: 'border-red-200 bg-red-50 text-red-700',
  Anestesia: 'border-sky-200 bg-sky-50 text-sky-700',
  Embarazo: 'border-rose-200 bg-rose-50 text-rose-700',
  Comportamiento: 'border-violet-200 bg-violet-50 text-violet-700',
  Comunicación: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Ortodoncia: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  Agenda: 'border-teal-200 bg-teal-50 text-teal-700',
  Alergia: 'border-orange-200 bg-orange-50 text-orange-700',
  Otro: 'border-slate-200 bg-slate-50 text-slate-600',
};

export async function listClinicalNotesApi(patientId: string) {
  const { data } = await api.get<{ data: ClinicalNote[] }>(
    `/patients/${patientId}/notes`,
  );
  return data.data ?? [];
}

export async function listClinicalNoteEventsApi(patientId: string) {
  const { data } = await api.get<{ data: ClinicalNoteEvent[] }>(
    `/patients/${patientId}/notes/events`,
  );
  return data.data ?? [];
}

export async function createClinicalNoteApi(
  patientId: string,
  payload: UpsertClinicalNotePayload,
) {
  const { data } = await api.post<{ data: ClinicalNote }>(
    `/patients/${patientId}/notes`,
    payload,
  );
  return data.data;
}

export async function updateClinicalNoteApi(
  patientId: string,
  noteId: string,
  payload: UpsertClinicalNotePayload,
) {
  const { data } = await api.put<{ data: ClinicalNote }>(
    `/patients/${patientId}/notes/${noteId}`,
    payload,
  );
  return data.data;
}

export async function deleteClinicalNoteApi(
  patientId: string,
  noteId: string,
) {
  await api.delete(`/patients/${patientId}/notes/${noteId}`);
}
