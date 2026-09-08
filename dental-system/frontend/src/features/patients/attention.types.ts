import type { UploadedFile } from '@/services/uploads.api';

export type AttentionFileKind = 'GALLERY' | 'RADIOGRAPH' | 'ATTACHMENT';

export type AttentionFile = UploadedFile & {
  kind: AttentionFileKind;
};

export function attentionFileKindLabel(kind: AttentionFileKind) {
  if (kind === 'RADIOGRAPH') return 'Radiografía';
  if (kind === 'GALLERY') return 'Galería';
  return 'Adjunto';
}
