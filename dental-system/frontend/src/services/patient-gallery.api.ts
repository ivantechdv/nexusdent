import { api } from './api';

export type GalleryCategory =
  | 'INTRAORAL'
  | 'EXTRAORAL'
  | 'TREATMENT'
  | 'FOLLOWUP';

export type GalleryKind = 'GALLERY' | 'RADIOGRAPH';

export type RadiographStudyType =
  | 'PANORAMIC'
  | 'PERIAPICAL'
  | 'BITEWING'
  | 'CEPHALOMETRIC'
  | 'CBCT'
  | 'OTHER';

export interface PatientGalleryPhoto {
  id: string;
  patientId: string;
  kind: GalleryKind;
  clinicalRecordId: string | null;
  visitDate: string | null;
  category: GalleryCategory;
  studyType: RadiographStudyType | null;
  title: string;
  notes: string | null;
  fileUrl: string;
  originalName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface CreateGalleryPhotoPayload {
  category?: GalleryCategory;
  title: string;
  fileUrl: string;
  originalName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  kind?: GalleryKind;
  studyType?: RadiographStudyType | null;
  notes?: string | null;
}

export const GALLERY_CATEGORY_LABELS: Record<GalleryCategory, string> = {
  INTRAORAL: 'Intraoral',
  EXTRAORAL: 'Extraoral',
  TREATMENT: 'Tratamiento',
  FOLLOWUP: 'Seguimiento',
};

export const RADIOGRAPH_STUDY_LABELS: Record<RadiographStudyType, string> = {
  PANORAMIC: 'Panorámica Digital',
  PERIAPICAL: 'Periapical',
  BITEWING: 'Bitewing',
  CEPHALOMETRIC: 'Cefalometría',
  CBCT: 'CBCT',
  OTHER: 'Otro estudio',
};

export const RADIOGRAPH_STUDY_STYLES: Record<
  RadiographStudyType,
  { badge: string; hex: string }
> = {
  PANORAMIC: { badge: 'bg-teal-50 text-teal-700 border-teal-100', hex: '#038BA1' },
  PERIAPICAL: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    hex: '#15803D',
  },
  BITEWING: {
    badge: 'bg-violet-50 text-violet-700 border-violet-100',
    hex: '#7C3AED',
  },
  CEPHALOMETRIC: {
    badge: 'bg-amber-50 text-amber-800 border-amber-100',
    hex: '#B45309',
  },
  CBCT: { badge: 'bg-sky-50 text-sky-800 border-sky-100', hex: '#0369A1' },
  OTHER: { badge: 'bg-slate-100 text-slate-600 border-slate-200', hex: '#64748B' },
};

export const GALLERY_CATEGORY_STYLES: Record<
  GalleryCategory,
  { badge: string; dot: string }
> = {
  INTRAORAL: {
    badge: 'bg-sky-50 text-sky-700 border-sky-100',
    dot: 'bg-sky-500',
  },
  EXTRAORAL: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    dot: 'bg-emerald-500',
  },
  TREATMENT: {
    badge: 'bg-violet-50 text-violet-700 border-violet-100',
    dot: 'bg-violet-500',
  },
  FOLLOWUP: {
    badge: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    dot: 'bg-cyan-500',
  },
};

export function radiographAccession(id: string) {
  const digits = id.replace(/\D/g, '').slice(-5).padStart(5, '0');
  return `#${digits}`;
}

export async function listPatientGalleryApi(patientId: string) {
  const { data } = await api.get<{ data: PatientGalleryPhoto[] }>(
    `/patients/${patientId}/gallery`,
    { params: { kind: 'GALLERY' } },
  );
  return data.data ?? [];
}

export async function listPatientRadiographsApi(patientId: string) {
  const { data } = await api.get<{ data: PatientGalleryPhoto[] }>(
    `/patients/${patientId}/gallery`,
    { params: { kind: 'RADIOGRAPH' } },
  );
  return data.data ?? [];
}

export async function createPatientGalleryPhotoApi(
  patientId: string,
  payload: CreateGalleryPhotoPayload,
) {
  const { data } = await api.post<{ data: PatientGalleryPhoto }>(
    `/patients/${patientId}/gallery`,
    payload,
  );
  return data.data;
}

export async function deletePatientGalleryPhotoApi(
  patientId: string,
  photoId: string,
) {
  await api.delete(`/patients/${patientId}/gallery/${photoId}`);
}
