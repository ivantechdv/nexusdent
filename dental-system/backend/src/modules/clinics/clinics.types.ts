export interface ClinicDto {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  isActive: boolean;
  deletedAt?: string | Date | null;
  logoUrl?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  themePrimary?: string | null;
  address?: string | null;
  patientCount?: number;
  userCount?: number;
  createdAt?: Date | string;
}

export interface UpdateClinicSettingsDto {
  name?: string;
  logoUrl?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  themePrimary?: string | null;
  address?: string | null;
}

export interface CreateClinicDto {
  name: string;
  slug: string;
  isDemo?: boolean;
  copyCatalogFromClinicId?: string;
  /** Administrador principal de la clínica (obligatorio al crear) */
  adminFullName: string;
  adminEmail: string;
  /** Si se omite, se genera temporal y se envía por correo */
  adminPassword?: string;
  adminPhone?: string | null;
  /** Si true, el ADMIN también aparece como odontólogo en agenda/atención */
  adminIsDentist?: boolean;
  adminSpecialty?: string | null;
}

export interface CreateClinicResultDto extends ClinicDto {
  admin: ClinicUserDto;
  inviteEmailSent?: boolean;
  inviteEmailLogged?: boolean;
  temporaryPassword?: string;
}

export interface UpdateClinicDto {
  name?: string;
  isActive?: boolean;
  isDemo?: boolean;
}

export interface ClinicUserDto {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  membershipActive: boolean;
  isDentist?: boolean;
  /** null = plantilla del rol; array = override */
  customPermissions?: string[] | null;
  /** Permisos efectivos (para UI) */
  permissions?: string[];
}

export interface CreateClinicUserDto {
  email: string;
  /** Si se omite, se genera una temporal y se envía por correo */
  password?: string;
  fullName: string;
  role: 'ADMIN' | 'DENTIST' | 'RECEPTIONIST';
  phone?: string | null;
  /** Solo aplica si role=ADMIN: también atiende como odontólogo */
  isDentist?: boolean;
  specialty?: string | null;
  /** Si se envía, guarda override de permisos */
  customPermissions?: string[] | null;
}

export interface UpdateClinicUserDto {
  fullName?: string;
  role?: 'ADMIN' | 'DENTIST' | 'RECEPTIONIST';
  phone?: string | null;
  isDentist?: boolean;
  membershipActive?: boolean;
  specialty?: string | null;
  /** null = volver a plantilla del rol; array = override */
  customPermissions?: string[] | null;
  /** true = borrar custom y usar solo el rol */
  useRoleDefaults?: boolean;
}
