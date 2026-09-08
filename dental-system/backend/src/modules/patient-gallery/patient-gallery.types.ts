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

export interface CreateGalleryPhotoDto {
  category?: GalleryCategory;
  title: string;
  fileUrl: string;
  originalName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  kind?: GalleryKind;
  clinicalRecordId?: string | null;
  studyType?: RadiographStudyType | null;
  notes?: string | null;
}

export interface VisitGalleryItemDto {
  fileUrl: string;
  title?: string;
  originalName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  category?: GalleryCategory;
  studyType?: RadiographStudyType | null;
  notes?: string | null;
}

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  'INTRAORAL',
  'EXTRAORAL',
  'TREATMENT',
  'FOLLOWUP',
];

export const RADIOGRAPH_STUDY_TYPES: RadiographStudyType[] = [
  'PANORAMIC',
  'PERIAPICAL',
  'BITEWING',
  'CEPHALOMETRIC',
  'CBCT',
  'OTHER',
];
