import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { dbPool, jwtConfig } from '../config';
import {
  effectivePermissions,
  ensureCustomPermissionsColumn,
  parseCustomPermissions,
  type Permission,
} from './permissions';

export type UserRole = 'ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'SUPERADMIN';

export interface AuthPayload {
  sub: string;
  email: string;
  role: UserRole;
  fullName: string;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicSlug?: string | null;
  /** Token temporal solo para elegir clínica */
  preauth?: boolean;
  /** Debe cambiar contraseña antes de usar el sistema */
  mustChangePassword?: boolean;
  /** Permisos efectivos (rol + custom) en la clínica activa */
  permissions?: Permission[];
  /** true si la membresía tiene custom_permissions definidos */
  hasCustomPermissions?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      /** Ruta plantilla para métricas (sin IDs) */
      metricsRoute?: string;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const q = req.query.access_token;
  if (typeof q === 'string' && q.length > 10) return q;
  return null;
}

export async function AuthGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ message: 'Token de autenticación requerido' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtConfig.secret, {
      algorithms: ['HS256'],
      issuer: jwtConfig.issuer,
    }) as AuthPayload;

    if (payload.preauth) {
      const path = `${req.baseUrl || ''}${req.path || ''}`;
      const allowPreauth =
        path.includes('/select-clinic') ||
        String(req.originalUrl || '').includes('/select-clinic');
      if (!allowPreauth) {
        res.status(403).json({ message: 'Seleccione una clínica para continuar' });
        return;
      }
      req.user = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        fullName: payload.fullName,
        preauth: true,
      };
      next();
      return;
    }

    if (payload.mustChangePassword) {
      const allow =
        req.path === '/change-password' ||
        req.path.endsWith('/change-password');
      if (!allow) {
        res.status(403).json({
          message: 'Debe cambiar su contraseña antes de continuar',
        });
        return;
      }
      req.user = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        fullName: payload.fullName,
        mustChangePassword: true,
      };
      next();
      return;
    }

    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT u.id, u.is_active, r.name AS role_name, u.full_name, u.email
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = :id
       LIMIT 1`,
      { id: payload.sub },
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      res.status(401).json({ message: 'Sesión inválida o usuario inactivo' });
      return;
    }

    let role = user.role_name as UserRole;
    let clinicId = payload.clinicId ?? null;
    let clinicName = payload.clinicName ?? null;
    let clinicSlug = payload.clinicSlug ?? null;
    let permissions: Permission[] | undefined;
    let hasCustomPermissions = false;

    if (clinicId) {
      if (role === 'SUPERADMIN') {
        const [cRows] = await dbPool.query<RowDataPacket[]>(
          `SELECT name AS clinic_name, slug AS clinic_slug
           FROM clinics
           WHERE id = :clinicId AND is_active = 1
           LIMIT 1`,
          { clinicId },
        );
        if (!cRows[0]) {
          res.status(403).json({ message: 'Clínica no válida' });
          return;
        }
        clinicName = cRows[0].clinic_name;
        clinicSlug = cRows[0].clinic_slug;
        role = 'SUPERADMIN';
        permissions = effectivePermissions('SUPERADMIN', null);
      } else {
        await ensureCustomPermissionsColumn();
        const [memRows] = await dbPool.query<RowDataPacket[]>(
          `SELECT cm.clinic_id, r.name AS role_name, c.name AS clinic_name, c.slug AS clinic_slug,
                  cm.custom_permissions
           FROM clinic_memberships cm
           INNER JOIN roles r ON r.id = cm.role_id
           INNER JOIN clinics c ON c.id = cm.clinic_id
           WHERE cm.user_id = :userId
             AND cm.clinic_id = :clinicId
             AND cm.is_active = 1
             AND c.is_active = 1
           LIMIT 1`,
          { userId: user.id, clinicId },
        );
        const mem = memRows[0];
        if (!mem) {
          res.status(403).json({ message: 'Sin acceso a esta clínica' });
          return;
        }
        role = mem.role_name as UserRole;
        clinicName = mem.clinic_name;
        clinicSlug = mem.clinic_slug;
        const custom = parseCustomPermissions(mem.custom_permissions);
        hasCustomPermissions = custom != null;
        permissions = effectivePermissions(role, custom);
      }
    } else if (role !== 'SUPERADMIN') {
      res.status(403).json({ message: 'Debe seleccionar una clínica' });
      return;
    }

    if (role === 'SUPERADMIN') {
      permissions = effectivePermissions('SUPERADMIN', null);
    } else if (!clinicId) {
      permissions = effectivePermissions(role, null);
    }

    req.user = {
      sub: user.id,
      email: user.email,
      role,
      fullName: user.full_name,
      clinicId,
      clinicName,
      clinicSlug,
      permissions,
      hasCustomPermissions,
    };
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

/** Rutas clínicas: exige clinicId en sesión */
export function ClinicGuard(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: 'No autenticado' });
    return;
  }
  if (!req.user.clinicId) {
    res.status(403).json({ message: 'Debe seleccionar una clínica' });
    return;
  }
  next();
}

export function RoleGuard(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'No autenticado' });
      return;
    }
    if (req.user.role === 'SUPERADMIN') {
      next();
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ message: 'No tiene permisos para esta acción' });
      return;
    }
    next();
  };
}

/** Autoriza si el usuario tiene al menos uno de los permisos indicados */
export function PermissionGuard(...needed: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'No autenticado' });
      return;
    }
    if (req.user.role === 'SUPERADMIN') {
      next();
      return;
    }
    const perms =
      req.user.permissions ??
      effectivePermissions(req.user.role, null);
    if (needed.some((p) => perms.includes(p))) {
      next();
      return;
    }
    res.status(403).json({ message: 'No tiene permisos para esta acción' });
  };
}
