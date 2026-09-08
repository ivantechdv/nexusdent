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
  if (!list.length) {
    throw new Error('No hay archivos para subir');
  }
  for (const f of list) form.append('files', f);
  const { data } = await api.post<{ data: UploadedFile[] }>('/uploads', form);
  if (!data.data?.length) {
    throw new Error('El servidor no devolvió archivos');
  }
  return data.data;
}
