import { api } from './api';

export interface ClinicAdmin {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  isActive: boolean;
  deletedAt?: string | null;
  patientCount?: number;
  userCount?: number;
}

export interface ClinicUserAdmin {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  membershipActive: boolean;
}

export async function listClinicsAdminApi() {
  const { data } = await api.get<{ data: ClinicAdmin[] }>('/clinics');
  return data.data;
}

export async function createClinicApi(body: {
  name: string;
  slug: string;
  isDemo?: boolean;
  adminFullName: string;
  adminEmail: string;
  adminPassword?: string;
  adminIsDentist?: boolean;
  adminSpecialty?: string;
  copyInviteToSuperAdmin?: boolean;
}) {
  const { data } = await api.post<{
    data: ClinicAdmin & {
      admin: ClinicUserAdmin;
      inviteEmailSent?: boolean;
      inviteEmailLogged?: boolean;
      temporaryPassword?: string;
    };
  }>('/clinics', body);
  return data.data;
}

export async function updateClinicApi(
  id: string,
  body: { name?: string; isActive?: boolean; isDemo?: boolean },
) {
  const { data } = await api.patch<{ data: ClinicAdmin }>(`/clinics/${id}`, body);
  return data.data;
}

export async function deleteClinicApi(id: string) {
  const { data } = await api.delete<{ data: ClinicAdmin }>(`/clinics/${id}`);
  return data.data;
}

export async function restoreClinicApi(id: string) {
  const { data } = await api.post<{ data: ClinicAdmin }>(
    `/clinics/${id}/restore`,
  );
  return data.data;
}

export async function purgeClinicApi(id: string) {
  const { data } = await api.delete<{ data: { id: string; purged: true } }>(
    `/clinics/${id}/purge`,
  );
  return data.data;
}

export async function listClinicUsersApi(clinicId: string) {
  const { data } = await api.get<{ data: ClinicUserAdmin[] }>(
    `/clinics/${clinicId}/users`,
  );
  return data.data;
}

export async function createClinicUserApi(
  clinicId: string,
  body: {
    email: string;
    password?: string;
    fullName: string;
    role: 'ADMIN' | 'DENTIST' | 'RECEPTIONIST';
    phone?: string;
    copyInviteToSuperAdmin?: boolean;
  },
) {
  const { data } = await api.post<{
    data: ClinicUserAdmin & {
      inviteEmailSent?: boolean;
      inviteEmailLogged?: boolean;
      temporaryPassword?: string;
    };
  }>(`/clinics/${clinicId}/users`, body);
  return data.data;
}

export async function ensureClinicCatalogApi(
  clinicId: string,
  copyCatalogFromClinicId?: string,
) {
  const { data } = await api.post<{
    data: {
      source: 'existing' | 'copy' | 'default';
      categories: number;
      treatments: number;
    };
  }>(`/clinics/${clinicId}/ensure-catalog`, {
    copyCatalogFromClinicId,
  });
  return data.data;
}
