import { UserRole } from '../../middlewares/auth.middleware';
import type { Permission } from '../../middlewares/permissions';

export interface UserRow {
  id: string;
  role_id: number;
  full_name: string;
  specialty: string | null;
  email: string;
  password_hash: string;
  phone: string | null;
  is_active: number;
  must_change_password?: number;
  role_name: UserRole;
}

export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  specialty?: string | null;
  phone?: string | null;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicSlug?: string | null;
  mustChangePassword?: boolean;
  /** Permisos efectivos en la clínica activa */
  permissions?: Permission[];
  hasCustomPermissions?: boolean;
  /** Flags de producto activos para la clínica (rollout progresivo) */
  features?: {
    uiRedesign: boolean;
  };
}

export interface ClinicOptionDto {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  role: UserRole;
  address?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface SelectClinicDto {
  clinicId: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileDto {
  fullName: string;
  email: string;
  phone?: string | null;
  specialty?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUserDto;
  clinics: ClinicOptionDto[];
  requiresClinicSelection: boolean;
  requiresPasswordChange: boolean;
  clinic: ClinicOptionDto | null;
}
