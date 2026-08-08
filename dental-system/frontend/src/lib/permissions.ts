import type { UserRole } from '@/stores/auth.store';

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

const ALL: Permission[] = [
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
  SUPERADMIN: ALL,
  ADMIN: ALL.filter((p) => p !== 'monitor.view' && p !== 'platform.manage'),
  DENTIST: ALL.filter(
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

export function effectivePermissions(
  role: UserRole | null | undefined,
  overrides?: Permission[] | null,
): Permission[] {
  if (!role) return [];
  if (role === 'SUPERADMIN') return [...ALL];
  if (overrides) return [...new Set(overrides)];
  return permissionsFor(role);
}

export function can(
  role: UserRole | null | undefined,
  permission: Permission,
  overrides?: Permission[] | null,
): boolean {
  if (!role) return false;
  return effectivePermissions(role, overrides).includes(permission);
}

/** Destino post-login según rol / permisos */
export function homePathForRole(
  role: UserRole | null | undefined,
  clinicId?: string | null,
  overrides?: Permission[] | null,
): string {
  if (!role) return '/login';
  if (role === 'SUPERADMIN' && !clinicId) return '/platform';
  if (can(role, 'attention.use', overrides)) return '/atencion';
  if (can(role, 'appointments.read', overrides)) return '/appointments';
  if (can(role, 'patients.read', overrides)) return '/patients';
  return '/';
}

export const NAV_PERMISSIONS: Record<string, Permission | null> = {
  '/': null,
  '/atencion': 'attention.use',
  '/patients': 'patients.read',
  '/appointments': 'appointments.read',
  '/categories': 'catalog.manage',
  '/treatments': 'treatments.read',
  '/monitor': 'monitor.view',
  '/platform': 'platform.manage',
  '/staff': 'staff.manage',
  '/clinic': 'clinic.settings',
  '/print-settings': 'print.manage',
  '/more': null,
  '/profile': null,
};

/** ¿El módulo está completo (todos sus permisos activos)? */
export function moduleEnabled(
  modulePerms: Permission[],
  active: Set<Permission>,
): boolean {
  return modulePerms.every((p) => active.has(p));
}

export function toggleModule(
  modulePerms: Permission[],
  current: Permission[],
): Permission[] {
  const set = new Set(current);
  const on = modulePerms.every((p) => set.has(p));
  if (on) {
    modulePerms.forEach((p) => set.delete(p));
  } else {
    modulePerms.forEach((p) => set.add(p));
  }
  return [...set];
}
