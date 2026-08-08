import { api } from './api';

export interface UploadedFile {
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export async function uploadFilesApi(files: FileList | File[]) {
  const form = new FormData();
  const list = Array.from(files);
  for (const f of list) form.append('files', f);
  const { data } = await api.post<{ data: UploadedFile[] }>('/uploads', form);
  return data.data;
}
