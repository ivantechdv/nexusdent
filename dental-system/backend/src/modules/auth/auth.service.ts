import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool, jwtConfig } from '../../config';
import { getAppUrl } from '../../config/env';
import { AuthPayload, UserRole } from '../../middlewares/auth.middleware';
import {
  effectivePermissions,
  ensureCustomPermissionsColumn,
  parseCustomPermissions,
  type Permission,
} from '../../middlewares/permissions';
import { httpError } from '../../utils/http';
import { sendPasswordResetEmail } from '../../utils/mail';
import {
  AuthUserDto,
  ClinicOptionDto,
  LoginDto,
  LoginResponse,
  UserRow,
} from './auth.types';

type UserPacket = UserRow & RowDataPacket;

type MembershipPacket = RowDataPacket & {
  clinic_id: string;
  clinic_name: string;
  clinic_slug: string;
  is_demo: number;
  role_name: UserRole;
  custom_permissions?: unknown;
};

function toUserDto(
  row: UserRow,
  clinic?: { id: string; name: string; slug: string } | null,
  perms?: { permissions?: Permission[]; hasCustomPermissions?: boolean },
): AuthUserDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role_name,
    specialty: row.specialty,
    phone: row.phone,
    clinicId: clinic?.id ?? null,
    clinicName: clinic?.name ?? null,
    clinicSlug: clinic?.slug ?? null,
    permissions: perms?.permissions,
    hasCustomPermissions: perms?.hasCustomPermissions,
  };
}

function mapClinic(row: MembershipPacket): ClinicOptionDto {
  return {
    id: row.clinic_id,
    name: row.clinic_name,
    slug: row.clinic_slug,
    isDemo: Boolean(row.is_demo),
    role: row.role_name,
  };
}

function signToken(payload: AuthPayload, expiresIn?: string | number): string {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: expiresIn ?? jwtConfig.expiresIn,
    algorithm: 'HS256',
    issuer: jwtConfig.issuer,
  } as jwt.SignOptions);
}

export class AuthService {
  private async getMemberships(userId: string): Promise<MembershipPacket[]> {
    await ensureCustomPermissionsColumn();
    const [rows] = await dbPool.query<MembershipPacket[]>(
      `SELECT cm.clinic_id, c.name AS clinic_name, c.slug AS clinic_slug,
              c.is_demo, r.name AS role_name, cm.custom_permissions
       FROM clinic_memberships cm
       INNER JOIN clinics c ON c.id = cm.clinic_id
       INNER JOIN roles r ON r.id = cm.role_id
       WHERE cm.user_id = :userId
         AND cm.is_active = 1
         AND c.is_active = 1
       ORDER BY c.is_demo ASC, c.name ASC`,
      { userId },
    );
    return rows;
  }

  private membershipPerms(membership: MembershipPacket): {
    permissions: Permission[];
    hasCustomPermissions: boolean;
  } {
    const custom = parseCustomPermissions(membership.custom_permissions);
    return {
      permissions: effectivePermissions(membership.role_name, custom),
      hasCustomPermissions: custom != null,
    };
  }

  private issueClinicSession(
    user: UserRow,
    membership: MembershipPacket,
  ): LoginResponse {
    const clinic = mapClinic(membership);
    const role = membership.role_name;
    const perms = this.membershipPerms(membership);
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      role,
      fullName: user.full_name,
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicSlug: clinic.slug,
      permissions: perms.permissions,
      hasCustomPermissions: perms.hasCustomPermissions,
    };
    const token = signToken(payload);
    return {
      token,
      user: toUserDto({ ...user, role_name: role }, clinic, perms),
      clinics: [clinic],
      requiresClinicSelection: false,
      requiresPasswordChange: false,
      clinic,
    };
  }

  private issuePasswordChangeChallenge(user: UserRow): LoginResponse {
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      role: user.role_name,
      fullName: user.full_name,
      mustChangePassword: true,
    };
    return {
      token: signToken(payload, '30m'),
      user: {
        ...toUserDto(user, null),
        mustChangePassword: true,
      },
      clinics: [],
      requiresClinicSelection: false,
      requiresPasswordChange: true,
      clinic: null,
    };
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password ?? '';

    if (!email || !password) {
      throw httpError('Email y contraseña son obligatorios', 400);
    }

    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.role_id, u.full_name, u.specialty, u.email,
              u.password_hash, u.phone, u.is_active, u.must_change_password,
              r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.email = :email
       LIMIT 1`,
      { email },
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      throw httpError('Credenciales inválidas', 401);
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      throw httpError('Credenciales inválidas', 401);
    }

    if (user.must_change_password) {
      return this.issuePasswordChangeChallenge(user);
    }

    return this.continueAfterAuth(user);
  }

  private async continueAfterAuth(user: UserRow): Promise<LoginResponse> {
    // SUPERADMIN → plataforma (sin elegir clínica)
    if (user.role_name === 'SUPERADMIN') {
      const allClinics = await this.listAllClinicsAsOptions();
      const payload: AuthPayload = {
        sub: user.id,
        email: user.email,
        role: 'SUPERADMIN',
        fullName: user.full_name,
        clinicId: null,
      };
      return {
        token: signToken(payload),
        user: toUserDto(user, null),
        clinics: allClinics,
        requiresClinicSelection: false,
        requiresPasswordChange: false,
        clinic: null,
      };
    }

    const memberships = await this.getMemberships(user.id);
    const clinics = memberships.map(mapClinic);

    if (memberships.length === 0) {
      throw httpError('Usuario sin clínicas asignadas', 403);
    }

    if (memberships.length === 1) {
      const session = this.issueClinicSession(user, memberships[0]);
      session.clinics = clinics;
      return session;
    }

    const preauth: AuthPayload = {
      sub: user.id,
      email: user.email,
      role: user.role_name,
      fullName: user.full_name,
      preauth: true,
    };

    return {
      token: signToken(preauth, '15m'),
      user: toUserDto(user, null),
      clinics,
      requiresClinicSelection: true,
      requiresPasswordChange: false,
      clinic: null,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResponse> {
    if (!currentPassword || !newPassword) {
      throw httpError('Contraseña actual y nueva son obligatorias', 400);
    }
    if (newPassword.length < 8) {
      throw httpError('La nueva contraseña debe tener al menos 8 caracteres', 400);
    }
    if (currentPassword === newPassword) {
      throw httpError('La nueva contraseña debe ser distinta a la temporal', 400);
    }

    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.role_id, u.full_name, u.specialty, u.email,
              u.password_hash, u.phone, u.is_active, u.must_change_password,
              r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = :userId
       LIMIT 1`,
      { userId },
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      throw httpError('Usuario no encontrado', 404);
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
      throw httpError('Contraseña actual incorrecta', 401);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await dbPool.query(
      `UPDATE users SET
         password_hash = :passwordHash,
         must_change_password = 0
       WHERE id = :userId`,
      { passwordHash, userId },
    );

    user.password_hash = passwordHash;
    user.must_change_password = 0;
    return this.continueAfterAuth(user);
  }

  private async listAllClinicsAsOptions(): Promise<ClinicOptionDto[]> {
    const [rows] = await dbPool.query<MembershipPacket[]>(
      `SELECT c.id AS clinic_id, c.name AS clinic_name, c.slug AS clinic_slug,
              c.is_demo, 'SUPERADMIN' AS role_name
       FROM clinics c
       WHERE c.is_active = 1
       ORDER BY c.is_demo ASC, c.name ASC`,
    );
    return rows.map(mapClinic);
  }

  async selectClinic(userId: string, clinicId: string): Promise<LoginResponse> {
    if (!clinicId?.trim()) {
      throw httpError('clinicId es obligatorio', 400);
    }

    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.role_id, u.full_name, u.specialty, u.email,
              u.password_hash, u.phone, u.is_active, r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = :userId
       LIMIT 1`,
      { userId },
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      throw httpError('Usuario no encontrado', 404);
    }

    // SUPERADMIN puede entrar a cualquier clínica activa
    if (user.role_name === 'SUPERADMIN') {
      const [cRows] = await dbPool.query<MembershipPacket[]>(
        `SELECT c.id AS clinic_id, c.name AS clinic_name, c.slug AS clinic_slug,
                c.is_demo, 'SUPERADMIN' AS role_name
         FROM clinics c
         WHERE c.id = :clinicId AND c.is_active = 1
         LIMIT 1`,
        { clinicId },
      );
      if (!cRows[0]) throw httpError('Clínica no encontrada', 404);
      const session = this.issueClinicSession(user, cRows[0]);
      session.clinics = await this.listAllClinicsAsOptions();
      session.user.role = 'SUPERADMIN';
      return session;
    }

    const memberships = await this.getMemberships(userId);
    const selected = memberships.find((m) => m.clinic_id === clinicId);
    if (!selected) {
      throw httpError('Sin acceso a esta clínica', 403);
    }

    const session = this.issueClinicSession(user, selected);
    session.clinics = memberships.map(mapClinic);
    return session;
  }

  /** Vuelve a modo plataforma (sin clínica) — solo SUPERADMIN */
  async leaveClinic(userId: string): Promise<LoginResponse> {
    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.role_id, u.full_name, u.specialty, u.email,
              u.password_hash, u.phone, u.is_active, r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = :userId
       LIMIT 1`,
      { userId },
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      throw httpError('Usuario no encontrado', 404);
    }
    if (user.role_name !== 'SUPERADMIN') {
      throw httpError('Solo SUPERADMIN puede salir al modo plataforma', 403);
    }
    const clinics = await this.listAllClinicsAsOptions();
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      role: 'SUPERADMIN',
      fullName: user.full_name,
      clinicId: null,
    };
    return {
      token: signToken(payload),
      user: toUserDto(user, null),
      clinics,
      requiresClinicSelection: false,
      requiresPasswordChange: false,
      clinic: null,
    };
  }

  async updateProfile(
    userId: string,
    clinicId: string | null | undefined,
    dto: {
      fullName: string;
      email: string;
      phone?: string | null;
      specialty?: string | null;
      currentPassword?: string;
      newPassword?: string;
    },
  ): Promise<{ token: string; user: AuthUserDto }> {
    const fullName = dto.fullName?.trim();
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone?.trim() || null;
    const specialty = dto.specialty?.trim() || null;
    if (!fullName) throw httpError('El nombre es obligatorio', 400);
    if (!email) throw httpError('El correo es obligatorio', 400);

    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.role_id, u.full_name, u.specialty, u.email,
              u.password_hash, u.phone, u.is_active, u.must_change_password,
              r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = :userId
       LIMIT 1`,
      { userId },
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      throw httpError('Usuario no encontrado', 404);
    }

    if (email !== user.email) {
      const [dup] = await dbPool.query<RowDataPacket[]>(
        `SELECT id FROM users WHERE email = :email AND id <> :userId LIMIT 1`,
        { email, userId },
      );
      if (dup[0]) throw httpError('Ese correo ya está en uso', 409);
    }

    const newPassword = dto.newPassword?.trim();
    const currentPassword = dto.currentPassword ?? '';
    let passwordHash = user.password_hash;

    if (newPassword) {
      if (newPassword.length < 8) {
        throw httpError(
          'La nueva contraseña debe tener al menos 8 caracteres',
          400,
        );
      }
      if (!currentPassword) {
        throw httpError(
          'Indicá la contraseña actual para cambiarla',
          400,
        );
      }
      const ok = await bcrypt.compare(currentPassword, user.password_hash);
      if (!ok) throw httpError('Contraseña actual incorrecta', 401);
      if (currentPassword === newPassword) {
        throw httpError('La nueva contraseña debe ser distinta', 400);
      }
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await dbPool.query(
      `UPDATE users SET
         full_name = :fullName,
         email = :email,
         phone = :phone,
         specialty = :specialty,
         password_hash = :passwordHash,
         must_change_password = CASE
           WHEN :changedPassword = 1 THEN 0
           ELSE must_change_password
         END
       WHERE id = :userId`,
      {
        fullName,
        email,
        phone,
        specialty,
        passwordHash,
        changedPassword: newPassword ? 1 : 0,
        userId,
      },
    );

    user.full_name = fullName;
    user.email = email;
    user.phone = phone;
    user.specialty = specialty;
    user.password_hash = passwordHash;
    if (newPassword) user.must_change_password = 0;

    return this.refreshSession(user, clinicId);
  }

  /** Reemite token manteniendo la clínica actual del JWT. */
  private async refreshSession(
    user: UserRow,
    clinicId?: string | null,
  ): Promise<{ token: string; user: AuthUserDto }> {
    if (user.role_name === 'SUPERADMIN') {
      if (clinicId) {
        const [cRows] = await dbPool.query<MembershipPacket[]>(
          `SELECT c.id AS clinic_id, c.name AS clinic_name, c.slug AS clinic_slug,
                  c.is_demo, 'SUPERADMIN' AS role_name
           FROM clinics c
           WHERE c.id = :clinicId AND c.is_active = 1
           LIMIT 1`,
          { clinicId },
        );
        if (cRows[0]) {
          const session = this.issueClinicSession(user, cRows[0]);
          session.user.role = 'SUPERADMIN';
          return { token: session.token, user: session.user };
        }
      }
      const payload: AuthPayload = {
        sub: user.id,
        email: user.email,
        role: 'SUPERADMIN',
        fullName: user.full_name,
        clinicId: null,
      };
      return {
        token: signToken(payload),
        user: toUserDto(user, null),
      };
    }

    if (clinicId) {
      const memberships = await this.getMemberships(user.id);
      const selected = memberships.find((m) => m.clinic_id === clinicId);
      if (selected) {
        const session = this.issueClinicSession(user, selected);
        return { token: session.token, user: session.user };
      }
    }

    const dto = await this.me(user.id, clinicId);
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      role: dto.role,
      fullName: user.full_name,
      clinicId: dto.clinicId ?? null,
      clinicName: dto.clinicName ?? undefined,
      clinicSlug: dto.clinicSlug ?? undefined,
    };
    return { token: signToken(payload), user: dto };
  }

  async me(userId: string, clinicId?: string | null): Promise<AuthUserDto> {
    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.role_id, u.full_name, u.specialty, u.email,
              u.password_hash, u.phone, u.is_active, r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = :userId
       LIMIT 1`,
      { userId },
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      throw httpError('Usuario no encontrado', 404);
    }

    if (!clinicId) {
      return toUserDto(user, null, {
        permissions: effectivePermissions(user.role_name, null),
        hasCustomPermissions: false,
      });
    }

    // SUPERADMIN puede operar en cualquier clínica activa sin membership
    if (user.role_name === 'SUPERADMIN') {
      const [cRows] = await dbPool.query<RowDataPacket[]>(
        `SELECT id, name, slug FROM clinics
         WHERE id = :clinicId AND is_active = 1
         LIMIT 1`,
        { clinicId },
      );
      if (!cRows[0]) {
        throw httpError('Clínica no encontrada', 404);
      }
      return toUserDto(
        user,
        {
          id: String(cRows[0].id),
          name: String(cRows[0].name),
          slug: String(cRows[0].slug),
        },
        {
          permissions: effectivePermissions('SUPERADMIN', null),
          hasCustomPermissions: false,
        },
      );
    }

    const memberships = await this.getMemberships(userId);
    const mem = memberships.find((m) => m.clinic_id === clinicId);
    if (!mem) {
      throw httpError('Sin acceso a esta clínica', 403);
    }

    const perms = this.membershipPerms(mem);
    return toUserDto(
      { ...user, role_name: mem.role_name },
      { id: mem.clinic_id, name: mem.clinic_name, slug: mem.clinic_slug },
      perms,
    );
  }

  async listMyClinics(userId: string): Promise<ClinicOptionDto[]> {
    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.role_id, u.full_name, u.specialty, u.email,
              u.password_hash, u.phone, u.is_active, r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = :userId
       LIMIT 1`,
      { userId },
    );
    if (rows[0]?.role_name === 'SUPERADMIN') {
      return this.listAllClinicsAsOptions();
    }
    const memberships = await this.getMemberships(userId);
    return memberships.map(mapClinic);
  }

  async listDentists(clinicId: string): Promise<AuthUserDto[]> {
    try {
      await dbPool.query(
        `ALTER TABLE clinic_memberships
         ADD COLUMN is_dentist TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active`,
      );
    } catch (err) {
      if ((err as { code?: string }).code !== 'ER_DUP_FIELDNAME') {
        /* ignore other migration races */
      }
    }

    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.role_id, u.full_name, u.specialty, u.email,
              u.password_hash, u.phone, u.is_active, r.name AS role_name
       FROM users u
       INNER JOIN clinic_memberships cm ON cm.user_id = u.id
       INNER JOIN roles r ON r.id = cm.role_id
       WHERE cm.clinic_id = :clinicId
         AND cm.is_active = 1
         AND u.is_active = 1
         AND (r.name = 'DENTIST' OR cm.is_dentist = 1)
       ORDER BY u.full_name ASC`,
      { clinicId },
    );
    return rows.map((row) => toUserDto(row));
  }

  private async ensurePasswordResetTable(): Promise<void> {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_prt_hash (token_hash),
        KEY idx_prt_user (user_id),
        CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  /**
   * Siempre responde OK (no revela si el email existe).
   */
  async forgotPassword(emailRaw: string): Promise<{ ok: true }> {
    const email = emailRaw?.trim().toLowerCase();
    if (!email) throw httpError('Indicá tu email', 400);

    await this.ensurePasswordResetTable();

    const [rows] = await dbPool.query<UserPacket[]>(
      `SELECT u.id, u.full_name, u.email, u.is_active, u.password_hash,
              u.role_id, u.specialty, u.phone, r.name AS role_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE LOWER(u.email) = :email
       LIMIT 1`,
      { email },
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return { ok: true };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const id = uuidv4();

    await dbPool.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = :userId AND used_at IS NULL`,
      { userId: user.id },
    );

    await dbPool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (:id, :userId, :tokenHash, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      { id, userId: user.id, tokenHash },
    );

    const resetUrl = `${getAppUrl()}/reset-password?token=${token}`;
    try {
      await sendPasswordResetEmail({
        to: user.email,
        fullName: user.full_name,
        resetUrl,
      });
    } catch (err) {
      console.error('[mail] password reset failed', err);
    }

    return { ok: true };
  }

  async resetPassword(
    tokenRaw: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const token = tokenRaw?.trim();
    if (!token) throw httpError('Token inválido', 400);
    if (!newPassword || newPassword.length < 8) {
      throw httpError('La contraseña debe tener al menos 8 caracteres', 400);
    }

    await this.ensurePasswordResetTable();
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = :tokenHash
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      { tokenHash },
    );
    const row = rows[0];
    if (!row) {
      throw httpError('El enlace expiró o no es válido', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await dbPool.query(
      `UPDATE users SET
         password_hash = :passwordHash,
         must_change_password = 0
       WHERE id = :userId`,
      { passwordHash, userId: row.user_id },
    );
    await dbPool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id`,
      { id: row.id },
    );

    return { ok: true };
  }
}

export const authService = new AuthService();
