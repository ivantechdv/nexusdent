import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'SUPERADMIN';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
  specialty?: string | null;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicSlug?: string | null;
  permissions?: string[];
  hasCustomPermissions?: boolean;
  features?: {
    uiRedesign: boolean;
  };
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'nexusdent-auth' },
  ),
);
