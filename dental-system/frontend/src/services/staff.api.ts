import { api } from './api';
import type { Permission } from '@/lib/permissions';

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  membershipActive: boolean;
  isDentist?: boolean;
  customPermissions?: Permission[] | null;
  permissions?: Permission[];
}

export async function listStaffApi() {
  const { data } = await api.get<{ data: StaffUser[] }>('/staff');
  return data.data;
}

export async function createStaffApi(body: {
  email: string;
  password?: string;
  fullName: string;
  role: 'ADMIN' | 'DENTIST' | 'RECEPTIONIST';
  phone?: string;
  isDentist?: boolean;
  customPermissions?: Permission[] | null;
}) {
  const { data } = await api.post<{
    data: StaffUser & {
      inviteEmailSent?: boolean;
      inviteEmailLogged?: boolean;
      temporaryPassword?: string;
    };
  }>('/staff', body);
  return data.data;
}

export async function updateStaffApi(
  userId: string,
  body: {
    fullName?: string;
    role?: 'ADMIN' | 'DENTIST' | 'RECEPTIONIST';
    phone?: string | null;
    isDentist?: boolean;
    membershipActive?: boolean;
    customPermissions?: Permission[] | null;
    useRoleDefaults?: boolean;
  },
) {
  const { data } = await api.patch<{ data: StaffUser }>(
    `/staff/${userId}`,
    body,
  );
  return data.data;
}
