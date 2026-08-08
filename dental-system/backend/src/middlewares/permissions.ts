import { dbPool } from '../config';

/** Evita import circular con auth.middleware */
type UserRole = 'ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'SUPERADMIN';

let customPermissionsColumnReady = false;

/** Asegura columna custom_permissions en clinic_memberships */
export async function ensureCustomPermissionsColumn(): Promise<void> {
  if (customPermissionsColumnReady) return;
  try {
    await dbPool.query(
      `ALTER TABLE clinic_memberships
       ADD COLUMN custom_permissions JSON NULL`,
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'ER_DUP_FIELDNAME') throw err;
  }
  customPermissionsColumnReady = true;
}

export type Permission =
  | 'patients.read'
  | 'patients.write'
  | 'appointments.read'
  | 'appointments.write'
  | 'treatments.read'
  | 'treatments.write'
  | 'categories.write'
  | 'visits.write'
  | 'clinical.write'
  | 'odontogram.write'
  | 'billing.read'
  | 'billing.plans.write'
  | 'billing.payments.write'
  | 'uploads.write'
  | 'catalog.manage'
  | 'attention.use'
  | 'monitor.view'
  | 'platform.manage'
  | 'staff.manage'
  | 'clinic.settings'
  | 'print.manage';

export const ALL_PERMISSIONS: Permission[] = [
  'patients.read',
  'patients.write',
  'appointments.read',
  'appointments.write',
  'treatments.read',
  'treatments.write',
  'categories.write',
  'visits.write',
  'clinical.write',
  'odontogram.write',
  'billing.read',
  'billing.plans.write',
  'billing.payments.write',
  'uploads.write',
  'catalog.manage',
  'attention.use',
  'monitor.view',
  'platform.manage',
  'staff.manage',
  'clinic.settings',
  'print.manage',
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPERADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter(
    (p) => p !== 'monitor.view' && p !== 'platform.manage',
  ),
  DENTIST: ALL_PERMISSIONS.filter(
    (p) =>
      p !== 'monitor.view' &&
      p !== 'platform.manage' &&
      p !== 'staff.manage' &&
      p !== 'clinic.settings' &&
      p !== 'print.manage',
  ),
  RECEPTIONIST: [
    'patients.read',
    'patients.write',
    'appointments.read',
    'appointments.write',
    'treatments.read',
    'billing.read',
    'billing.payments.write',
    'uploads.write',
  ],
};

/** Módulos para UI de permisos custom */
export const PERMISSION_MODULES: Array<{
  id: string;
  label: string;
  description: string;
  permissions: Permission[];
}> = [
  {
    id: 'patients',
    label: 'Pacientes',
    description: 'Listar y editar fichas',
    permissions: ['patients.read', 'patients.write'],
  },
  {
    id: 'appointments',
    label: 'Agenda',
    description: 'Ver y gestionar citas',
    permissions: ['appointments.read', 'appointments.write'],
  },
  {
    id: 'attention',
    label: 'Atención clínica',
    description: 'Atención del día, evoluciones y odontograma',
    permissions: [
      'attention.use',
      'visits.write',
      'clinical.write',
      'odontogram.write',
    ],
  },
  {
    id: 'billing',
    label: 'Cobros',
    description: 'Ver saldos, planes y registrar abonos',
    permissions: [
      'billing.read',
      'billing.payments.write',
      'billing.plans.write',
    ],
  },
  {
    id: 'catalog',
    label: 'Catálogo',
    description: 'Tratamientos y categorías',
    permissions: [
      'treatments.read',
      'treatments.write',
      'catalog.manage',
      'categories.write',
    ],
  },
  {
    id: 'uploads',
    label: 'Archivos',
    description: 'Subir adjuntos clínicos',
    permissions: ['uploads.write'],
  },
  {
    id: 'admin',
    label: 'Administración',
    description: 'Usuarios, clínica e impresión',
    permissions: ['staff.manage', 'clinic.settings', 'print.manage'],
  },
];

export function permissionsFor(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function parseCustomPermissions(raw: unknown): Permission[] | null {
  if (raw == null) return null;
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  const allowed = new Set<string>(ALL_PERMISSIONS);
  const out = arr.filter(
    (p): p is Permission => typeof p === 'string' && allowed.has(p),
  );
  return out;
}

/** Si hay custom, manda; si no, plantilla del rol. */
export function effectivePermissions(
  role: UserRole,
  custom: Permission[] | null | undefined,
): Permission[] {
  if (role === 'SUPERADMIN') return [...ALL_PERMISSIONS];
  if (custom) return [...new Set(custom)];
  return permissionsFor(role);
}

export function can(
  role: UserRole | undefined,
  permission: Permission,
  custom?: Permission[] | null,
): boolean {
  if (!role) return false;
  return effectivePermissions(role, custom).includes(permission);
}

export function sanitizePermissionsInput(
  input: unknown,
): Permission[] | null {
  if (input === undefined) return null;
  if (input === null) return null;
  return parseCustomPermissions(input) ?? [];
}
