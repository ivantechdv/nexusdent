import { api } from './api';

export interface ClinicSettings {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  isActive: boolean;
  logoUrl?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  themePrimary?: string | null;
  address?: string | null;
}

export type UpdateClinicSettings = {
  name?: string;
  logoUrl?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  themePrimary?: string | null;
  address?: string | null;
};

export async function getClinicSettingsApi() {
  const { data } = await api.get<{ data: ClinicSettings }>('/clinic-settings');
  return data.data;
}

export async function updateClinicSettingsApi(body: UpdateClinicSettings) {
  const { data } = await api.patch<{ data: ClinicSettings }>(
    '/clinic-settings',
    body,
  );
  return data.data;
}

export async function uploadClinicLogoApi(file: File) {
  const form = new FormData();
  form.append('files', file);
  // Sin Content-Type manual: el browser agrega multipart + boundary.
  const { data } = await api.post<{
    data: Array<{ url: string; originalName: string }>;
  }>('/uploads', form);
  return data.data[0]?.url ?? null;
}
