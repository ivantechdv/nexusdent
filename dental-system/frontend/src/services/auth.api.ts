import { api } from './api';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'SUPERADMIN';
  specialty?: string | null;
  phone?: string | null;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicSlug?: string | null;
  mustChangePassword?: boolean;
  permissions?: string[];
  hasCustomPermissions?: boolean;
  features?: {
    uiRedesign: boolean;
  };
}

export interface ClinicOption {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  role: AuthUser['role'];
  address?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  clinics: ClinicOption[];
  requiresClinicSelection: boolean;
  requiresPasswordChange: boolean;
  clinic: ClinicOption | null;
}

export async function loginApi(email: string, password: string) {
  const { data } = await api.post<{ data: LoginResult }>('/auth/login', {
    email,
    password,
  });
  return data.data;
}

export async function selectClinicApi(clinicId: string, token?: string) {
  const { data } = await api.post<{ data: LoginResult }>(
    '/auth/select-clinic',
    { clinicId },
    {
      skipAuth: Boolean(token),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );
  return data.data;
}

export async function leaveClinicApi() {
  const { data } = await api.post<{ data: LoginResult }>('/auth/leave-clinic');
  return data.data;
}

export async function changePasswordApi(
  currentPassword: string,
  newPassword: string,
  token?: string,
) {
  const { data } = await api.post<{ data: LoginResult }>(
    '/auth/change-password',
    { currentPassword, newPassword },
    {
      skipAuth: Boolean(token),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );
  return data.data;
}

export async function meApi() {
  const { data } = await api.get<{ data: AuthUser }>('/auth/me');
  return data.data;
}

export async function updateProfileApi(body: {
  fullName: string;
  email: string;
  phone?: string | null;
  specialty?: string | null;
  currentPassword?: string;
  newPassword?: string;
}) {
  const { data } = await api.patch<{
    data: { token: string; user: AuthUser };
  }>('/auth/profile', body);
  return data.data;
}

export async function listDentistsApi() {
  const { data } = await api.get<{ data: AuthUser[] }>('/auth/dentists');
  return data.data;
}

export async function forgotPasswordApi(email: string) {
  const { data } = await api.post<{ data: { ok: true }; message?: string }>(
    '/auth/forgot-password',
    { email },
  );
  return data;
}

export async function resetPasswordApi(token: string, newPassword: string) {
  const { data } = await api.post<{ data: { ok: true }; message?: string }>(
    '/auth/reset-password',
    { token, newPassword },
  );
  return data;
}
