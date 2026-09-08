import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { httpError } from '../../utils/http';
import {
  sendClinicAddedEmail,
  sendUserInviteEmail,
} from '../../utils/mail';
import {
  DEFAULT_TREATMENT_CATALOG,
  DEFAULT_TREATMENT_CATEGORIES,
} from './default-catalog';
import {
  ClinicDto,
  ClinicUserDto,
  CreateClinicDto,
  CreateClinicResultDto,
  CreateClinicUserDto,
  UpdateClinicDto,
  UpdateClinicSettingsDto,
  UpdateClinicUserDto,
} from './clinics.types';
import {
  effectivePermissions,
  ensureCustomPermissionsColumn,
  parseCustomPermissions,
  sanitizePermissionsInput,
  type Permission,
} from '../../middlewares/permissions';

type ClinicRow = RowDataPacket & {
  id: string;
  name: string;
  slug: string;
  is_demo: number;
  is_active: number;
  deleted_at?: Date | string | null;
  created_at: Date;
  logo_url?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  theme_primary?: string | null;
  address?: string | null;
  patient_count?: number;
  user_count?: number;
};

type UserRow = RowDataPacket & {
  id: string;
  email: string;
  full_name: string;
  role_name: string;
  phone: string | null;
  is_active: number;
  membership_active: number;
};

function mapClinic(row: ClinicRow): ClinicDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isDemo: Boolean(row.is_demo),
    isActive: Boolean(row.is_active),
    deletedAt: row.deleted_at ?? null,
    logoUrl: row.logo_url ?? null,
    email: row.email ?? null,
    whatsapp: row.whatsapp ?? null,
    facebookUrl: row.facebook_url ?? null,
    instagramUrl: row.instagram_url ?? null,
    themePrimary: row.theme_primary ?? '#1e3a8a',
    address: row.address ?? null,
    patientCount: row.patient_count != null ? Number(row.patient_count) : undefined,
    userCount: row.user_count != null ? Number(row.user_count) : undefined,
    createdAt: row.created_at,
  };
}

/** Días en papelera antes del borrado definitivo */
const CLINIC_SOFT_DELETE_DAYS = 20;

function normalizeSlug(slug: string) {
  return slug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function generateTempPassword() {
  const raw = randomBytes(9).toString('base64url');
  return `Nx-${raw.slice(0, 10)}!`;
}

export class ClinicsService {
  async ensureSoftDeleteColumn(): Promise<void> {
    try {
      await dbPool.query(
        `ALTER TABLE clinics
         ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_active`,
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  async ensureMembershipDentistColumn(): Promise<void> {
    try {
      await dbPool.query(
        `ALTER TABLE clinic_memberships
         ADD COLUMN is_dentist TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active`,
      );
      await dbPool.query(
        `UPDATE clinic_memberships cm
         INNER JOIN roles r ON r.id = cm.role_id
         SET cm.is_dentist = 1
         WHERE r.name = 'DENTIST' AND cm.is_dentist = 0`,
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  async list(): Promise<ClinicDto[]> {
    await this.ensureSoftDeleteColumn();
    await this.ensureMembershipDentistColumn();
    await this.purgeExpiredSoftDeletes();

    const [rows] = await dbPool.query<ClinicRow[]>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM patients p WHERE p.clinic_id = c.id) AS patient_count,
              (SELECT COUNT(*) FROM clinic_memberships m
               WHERE m.clinic_id = c.id AND m.is_active = 1) AS user_count
       FROM clinics c
       ORDER BY
         (c.deleted_at IS NULL) DESC,
         c.is_demo ASC,
         c.name ASC`,
    );
    return rows.map(mapClinic);
  }

  async getById(id: string): Promise<ClinicDto> {
    await this.ensureSoftDeleteColumn();
    const [rows] = await dbPool.query<ClinicRow[]>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM patients p WHERE p.clinic_id = c.id) AS patient_count,
              (SELECT COUNT(*) FROM clinic_memberships m
               WHERE m.clinic_id = c.id AND m.is_active = 1) AS user_count
       FROM clinics c
       WHERE c.id = :id
       LIMIT 1`,
      { id },
    );
    if (!rows[0]) throw httpError('Clínica no encontrada', 404);
    return mapClinic(rows[0]);
  }

  /**
   * Elige clínica fuente de catálogo:
   * 1) copyCatalogFromClinicId si tiene datos
   * 2) clínica activa con más prestaciones
   * 3) null → se usará seed por defecto
   */
  private async resolveCatalogSourceId(
    preferredId?: string | null,
    excludeClinicId?: string,
  ): Promise<string | null> {
    if (preferredId) {
      const [rows] = await dbPool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM treatment_catalog
         WHERE clinic_id = :id AND is_active = 1`,
        { id: preferredId },
      );
      if (Number(rows[0]?.n) > 0) return preferredId;
    }

    const [best] = await dbPool.query<RowDataPacket[]>(
      `SELECT t.clinic_id, COUNT(*) AS n
       FROM treatment_catalog t
       INNER JOIN clinics c ON c.id = t.clinic_id
       WHERE c.is_active = 1
         AND (:excludeId IS NULL OR t.clinic_id <> :excludeId)
       GROUP BY t.clinic_id
       ORDER BY n DESC
       LIMIT 1`,
      { excludeId: excludeClinicId ?? null },
    );
    if (best[0] && Number(best[0].n) > 0) {
      return String(best[0].clinic_id);
    }
    return null;
  }

  /** Copia categorías + catálogo desde otra clínica */
  private async copyCatalogFromClinic(
    sourceId: string,
    newClinicId: string,
  ): Promise<{ categories: number; treatments: number }> {
    const [catResult] = await dbPool.query<ResultSetHeader>(
      `INSERT INTO treatment_categories (code, name, sort_order, is_active, clinic_id)
       SELECT c.code, c.name, c.sort_order, c.is_active, :newId
       FROM treatment_categories c
       WHERE c.clinic_id = :sourceId
         AND NOT EXISTS (
           SELECT 1 FROM treatment_categories d
           WHERE d.clinic_id = :newId AND d.code = c.code
         )`,
      { newId: newClinicId, sourceId },
    );

    const [txResult] = await dbPool.query<ResultSetHeader>(
      `INSERT INTO treatment_catalog
         (code, name, category, description, base_price, is_active, clinic_id)
       SELECT t.code, t.name, t.category, t.description, t.base_price, t.is_active, :newId
       FROM treatment_catalog t
       WHERE t.clinic_id = :sourceId
         AND NOT EXISTS (
           SELECT 1 FROM treatment_catalog d
           WHERE d.clinic_id = :newId AND d.code = t.code
         )`,
      { newId: newClinicId, sourceId },
    );

    return {
      categories: catResult.affectedRows ?? 0,
      treatments: txResult.affectedRows ?? 0,
    };
  }

  /** Inserta catálogo base NexusDent (si la clínica no tiene datos) */
  async seedDefaultCatalog(
    clinicId: string,
  ): Promise<{ categories: number; treatments: number }> {
    await this.getById(clinicId);
    let categories = 0;
    let treatments = 0;

    for (const cat of DEFAULT_TREATMENT_CATEGORIES) {
      const [r] = await dbPool.query<ResultSetHeader>(
        `INSERT IGNORE INTO treatment_categories
           (code, name, sort_order, is_active, clinic_id)
         VALUES (:code, :name, :sortOrder, 1, :clinicId)`,
        {
          code: cat.code,
          name: cat.name,
          sortOrder: cat.sortOrder,
          clinicId,
        },
      );
      categories += r.affectedRows ?? 0;
    }

    for (const t of DEFAULT_TREATMENT_CATALOG) {
      const [r] = await dbPool.query<ResultSetHeader>(
        `INSERT IGNORE INTO treatment_catalog
           (code, name, category, description, base_price, is_active, clinic_id)
         VALUES (:code, :name, :category, :description, :basePrice, 1, :clinicId)`,
        {
          code: t.code,
          name: t.name,
          category: t.category,
          description: t.description ?? null,
          basePrice: t.basePrice,
          clinicId,
        },
      );
      treatments += r.affectedRows ?? 0;
    }

    return { categories, treatments };
  }

  /**
   * Asegura catálogo: copia desde otra clínica o seed por defecto.
   * Idempotente si ya hay datos.
   */
  async ensureClinicCatalog(
    clinicId: string,
    preferredSourceId?: string | null,
  ): Promise<{
    source: 'existing' | 'copy' | 'default';
    categories: number;
    treatments: number;
  }> {
    const [existing] = await dbPool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM treatment_categories WHERE clinic_id = :id) AS cats,
         (SELECT COUNT(*) FROM treatment_catalog WHERE clinic_id = :id) AS txs`,
      { id: clinicId },
    );
    const cats = Number(existing[0]?.cats ?? 0);
    const txs = Number(existing[0]?.txs ?? 0);
    if (cats > 0 && txs > 0) {
      return { source: 'existing', categories: cats, treatments: txs };
    }

    const sourceId = await this.resolveCatalogSourceId(
      preferredSourceId,
      clinicId,
    );
    if (sourceId) {
      const copied = await this.copyCatalogFromClinic(sourceId, clinicId);
      if (copied.treatments > 0 || copied.categories > 0) {
        return { source: 'copy', ...copied };
      }
    }

    const seeded = await this.seedDefaultCatalog(clinicId);
    return { source: 'default', ...seeded };
  }

  async create(
    dto: CreateClinicDto,
    opts?: { actorEmail?: string | null },
  ): Promise<CreateClinicResultDto> {
    if (!dto.name?.trim()) throw httpError('name es obligatorio', 400);
    const slug = normalizeSlug(dto.slug || dto.name);
    if (!slug) throw httpError('slug inválido', 400);

    const adminFullName = dto.adminFullName?.trim();
    const adminEmail = dto.adminEmail?.trim().toLowerCase();
    if (!adminFullName) {
      throw httpError('adminFullName es obligatorio (usuario principal)', 400);
    }
    if (!adminEmail) {
      throw httpError('adminEmail es obligatorio (usuario principal)', 400);
    }

    const id = uuidv4();
    try {
      await dbPool.query(
        `INSERT INTO clinics (id, name, slug, is_demo, is_active)
         VALUES (:id, :name, :slug, :isDemo, 1)`,
        {
          id,
          name: dto.name.trim(),
          slug,
          isDemo: dto.isDemo ? 1 : 0,
        },
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Ya existe una clínica con ese slug', 409);
      }
      throw err;
    }

    await this.ensureClinicCatalog(id, dto.copyCatalogFromClinicId ?? null);

    const inviteCopyTo =
      dto.copyInviteToSuperAdmin && opts?.actorEmail
        ? opts.actorEmail.trim().toLowerCase()
        : null;

    let adminResult: ClinicUserDto & {
      inviteEmailSent?: boolean;
      inviteEmailLogged?: boolean;
      temporaryPassword?: string;
    };
    try {
      adminResult = await this.createUser(id, {
        fullName: adminFullName,
        email: adminEmail,
        password: dto.adminPassword,
        phone: dto.adminPhone ?? null,
        role: 'ADMIN',
        isDentist: dto.adminIsDentist !== false,
        specialty:
          dto.adminSpecialty?.trim() ||
          (dto.adminIsDentist !== false ? 'Odontología' : null),
        inviteCopyTo,
      });
    } catch (err) {
      // Rollback parcial: sin admin la clínica no queda usable
      await dbPool.query(
        `DELETE FROM treatment_catalog WHERE clinic_id = :id`,
        { id },
      );
      await dbPool.query(
        `DELETE FROM treatment_categories WHERE clinic_id = :id`,
        { id },
      );
      await dbPool.query(`DELETE FROM clinics WHERE id = :id`, { id });
      throw err;
    }

    const clinic = await this.getById(id);
    return {
      ...clinic,
      admin: {
        id: adminResult.id,
        email: adminResult.email,
        fullName: adminResult.fullName,
        role: adminResult.role,
        phone: adminResult.phone,
        isActive: adminResult.isActive,
        membershipActive: adminResult.membershipActive,
      },
      inviteEmailSent: adminResult.inviteEmailSent,
      inviteEmailLogged: adminResult.inviteEmailLogged,
      temporaryPassword: adminResult.temporaryPassword,
    };
  }

  async update(id: string, dto: UpdateClinicDto): Promise<ClinicDto> {
    await this.getById(id);
    await dbPool.query(
      `UPDATE clinics SET
         name = COALESCE(:name, name),
         is_active = COALESCE(:isActive, is_active),
         is_demo = COALESCE(:isDemo, is_demo)
       WHERE id = :id`,
      {
        id,
        name: dto.name?.trim() ?? null,
        isActive: dto.isActive === undefined ? null : dto.isActive ? 1 : 0,
        isDemo: dto.isDemo === undefined ? null : dto.isDemo ? 1 : 0,
      },
    );
    return this.getById(id);
  }

  /**
   * Soft-delete: marca la clínica como eliminada (papelera ~20 días).
   * Luego purgeExpiredSoftDeletes hace el borrado definitivo.
   */
  async remove(id: string): Promise<ClinicDto> {
    const clinic = await this.getById(id);
    if (clinic.deletedAt) {
      throw httpError('La clínica ya está en papelera', 400);
    }
    await dbPool.query(
      `UPDATE clinics
       SET is_active = 0, deleted_at = NOW()
       WHERE id = :id`,
      { id },
    );
    return this.getById(id);
  }

  async restore(id: string): Promise<ClinicDto> {
    const clinic = await this.getById(id);
    if (!clinic.deletedAt) {
      throw httpError('La clínica no está en papelera', 400);
    }
    await dbPool.query(
      `UPDATE clinics
       SET is_active = 1, deleted_at = NULL
       WHERE id = :id`,
      { id },
    );
    return this.getById(id);
  }

  /**
   * Borrado definitivo manual: solo si ya está en papelera (pasó el soft-delete).
   */
  async purge(id: string): Promise<{ id: string; purged: true }> {
    const clinic = await this.getById(id);
    if (!clinic.deletedAt) {
      throw httpError(
        'Primero enviá la clínica a papelera; el borrado definitivo solo aplica desde ahí',
        400,
      );
    }
    await this.purgeHard(id);
    return { id, purged: true };
  }

  async purgeExpiredSoftDeletes(): Promise<number> {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id FROM clinics
       WHERE deleted_at IS NOT NULL
         AND deleted_at < (NOW() - INTERVAL ${CLINIC_SOFT_DELETE_DAYS} DAY)`,
    );
    let purged = 0;
    for (const row of rows) {
      await this.purgeHard(String(row.id));
      purged += 1;
    }
    return purged;
  }

  /**
   * Borrado definitivo de datos tenant + clínica.
   */
  private async purgeHard(id: string): Promise<void> {
    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();

      try {
        await conn.query(
          `UPDATE clinical_records
           SET next_appointment_id = NULL
           WHERE clinic_id = :id`,
          { id },
        );
      } catch {
        /* columna opcional */
      }

      await conn.query(`DELETE FROM payments WHERE clinic_id = :id`, { id });

      await conn.query(
        `DELETE i FROM treatment_plan_items i
         INNER JOIN treatment_plans p ON p.id = i.treatment_plan_id
         WHERE p.clinic_id = :id`,
        { id },
      );
      await conn.query(`DELETE FROM treatment_plans WHERE clinic_id = :id`, {
        id,
      });

      await conn.query(`DELETE FROM clinical_records WHERE clinic_id = :id`, {
        id,
      });
      await conn.query(`DELETE FROM odontogram_states WHERE clinic_id = :id`, {
        id,
      });
      await conn.query(`DELETE FROM appointments WHERE clinic_id = :id`, {
        id,
      });
      await conn.query(`DELETE FROM patients WHERE clinic_id = :id`, { id });

      await conn.query(`DELETE FROM treatment_catalog WHERE clinic_id = :id`, {
        id,
      });
      await conn.query(
        `DELETE FROM treatment_categories WHERE clinic_id = :id`,
        { id },
      );

      await conn.query(
        `DELETE FROM clinic_memberships WHERE clinic_id = :id`,
        { id },
      );

      try {
        await conn.query(`DELETE FROM print_formats WHERE clinic_id = :id`, {
          id,
        });
        await conn.query(`DELETE FROM print_headers WHERE clinic_id = :id`, {
          id,
        });
        await conn.query(`DELETE FROM print_footers WHERE clinic_id = :id`, {
          id,
        });
      } catch {
        /* opcionales */
      }

      try {
        await conn.query(
          `UPDATE app_errors SET clinic_id = NULL WHERE clinic_id = :id`,
          { id },
        );
        await conn.query(
          `UPDATE app_request_metrics SET clinic_id = NULL WHERE clinic_id = :id`,
          { id },
        );
      } catch {
        /* opcionales */
      }

      await conn.query(`DELETE FROM clinics WHERE id = :id`, { id });
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateSettings(
    id: string,
    dto: UpdateClinicSettingsDto,
  ): Promise<ClinicDto> {
    await this.getById(id);

    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw httpError('El nombre de la clínica es obligatorio', 400);
    }

    let themePrimary = dto.themePrimary;
    if (themePrimary !== undefined && themePrimary !== null) {
      const hex = themePrimary.trim();
      if (hex && !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        throw httpError('themePrimary debe ser un color hex (#RRGGBB)', 400);
      }
      themePrimary = hex || '#1e3a8a';
    }

    const emptyToNull = (v: string | null | undefined) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const t = v.trim();
      return t.length ? t : null;
    };

    await dbPool.query(
      `UPDATE clinics SET
         name = COALESCE(:name, name),
         logo_url = CASE WHEN :setLogo = 1 THEN :logoUrl ELSE logo_url END,
         email = CASE WHEN :setEmail = 1 THEN :email ELSE email END,
         whatsapp = CASE WHEN :setWhatsapp = 1 THEN :whatsapp ELSE whatsapp END,
         facebook_url = CASE WHEN :setFacebook = 1 THEN :facebookUrl ELSE facebook_url END,
         instagram_url = CASE WHEN :setInstagram = 1 THEN :instagramUrl ELSE instagram_url END,
         theme_primary = CASE WHEN :setTheme = 1 THEN :themePrimary ELSE theme_primary END,
         address = CASE WHEN :setAddress = 1 THEN :address ELSE address END
       WHERE id = :id`,
      {
        id,
        name: name ?? null,
        setLogo: dto.logoUrl !== undefined ? 1 : 0,
        logoUrl: emptyToNull(dto.logoUrl) ?? null,
        setEmail: dto.email !== undefined ? 1 : 0,
        email: emptyToNull(dto.email) ?? null,
        setWhatsapp: dto.whatsapp !== undefined ? 1 : 0,
        whatsapp: emptyToNull(dto.whatsapp) ?? null,
        setFacebook: dto.facebookUrl !== undefined ? 1 : 0,
        facebookUrl: emptyToNull(dto.facebookUrl) ?? null,
        setInstagram: dto.instagramUrl !== undefined ? 1 : 0,
        instagramUrl: emptyToNull(dto.instagramUrl) ?? null,
        setTheme: themePrimary !== undefined ? 1 : 0,
        themePrimary: themePrimary ?? null,
        setAddress: dto.address !== undefined ? 1 : 0,
        address: emptyToNull(dto.address) ?? null,
      },
    );

    return this.getById(id);
  }

  async listUsers(clinicId: string): Promise<ClinicUserDto[]> {
    await this.getById(clinicId);
    await this.ensureMembershipDentistColumn();
    await ensureCustomPermissionsColumn();
    const [rows] = await dbPool.query<UserRow[]>(
      `SELECT u.id, u.email, u.full_name, u.phone, u.is_active,
              r.name AS role_name, cm.is_active AS membership_active,
              cm.is_dentist, cm.custom_permissions
       FROM clinic_memberships cm
       INNER JOIN users u ON u.id = cm.user_id
       INNER JOIN roles r ON r.id = cm.role_id
       WHERE cm.clinic_id = :clinicId
       ORDER BY u.full_name ASC`,
      { clinicId },
    );
    return rows.map((row) => {
      const role = row.role_name as
        | 'ADMIN'
        | 'DENTIST'
        | 'RECEPTIONIST'
        | 'SUPERADMIN';
      const custom = parseCustomPermissions(
        (row as UserRow & { custom_permissions?: unknown }).custom_permissions,
      );
      return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role_name,
        phone: row.phone,
        isActive: Boolean(row.is_active),
        membershipActive: Boolean(row.membership_active),
        isDentist: Boolean(
          (row as UserRow & { is_dentist?: number }).is_dentist ||
            row.role_name === 'DENTIST',
        ),
        customPermissions: custom,
        permissions: effectivePermissions(role, custom),
      };
    });
  }

  async updateUser(
    clinicId: string,
    userId: string,
    dto: UpdateClinicUserDto,
  ): Promise<ClinicUserDto> {
    await this.getById(clinicId);
    await this.ensureMembershipDentistColumn();
    await ensureCustomPermissionsColumn();

    const [memRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT cm.id, cm.role_id, r.name AS role_name, cm.is_dentist
       FROM clinic_memberships cm
       INNER JOIN roles r ON r.id = cm.role_id
       WHERE cm.clinic_id = :clinicId AND cm.user_id = :userId
       LIMIT 1`,
      { clinicId, userId },
    );
    if (!memRows[0]) throw httpError('Usuario no pertenece a esta clínica', 404);

    let roleId = memRows[0].role_id as number;
    let roleName = String(memRows[0].role_name) as
      | 'ADMIN'
      | 'DENTIST'
      | 'RECEPTIONIST';

    if (dto.role) {
      if (!['ADMIN', 'DENTIST', 'RECEPTIONIST'].includes(dto.role)) {
        throw httpError('role inválido', 400);
      }
      const [roleRows] = await dbPool.query<RowDataPacket[]>(
        `SELECT id FROM roles WHERE name = :role LIMIT 1`,
        { role: dto.role },
      );
      if (!roleRows[0]) throw httpError('Rol no encontrado', 400);
      roleId = roleRows[0].id as number;
      roleName = dto.role;
    }

    const isDentist =
      roleName === 'DENTIST' ||
      (roleName === 'ADMIN' &&
        (dto.isDentist === true ||
          (dto.isDentist === undefined &&
            Boolean(memRows[0].is_dentist))));

    let customJson: string | null | undefined;
    if (dto.useRoleDefaults === true) {
      customJson = null;
    } else if (dto.customPermissions !== undefined) {
      const sanitized = sanitizePermissionsInput(dto.customPermissions);
      customJson =
        sanitized == null ? null : JSON.stringify(sanitized as Permission[]);
    }

    if (customJson !== undefined) {
      await dbPool.query(
        `UPDATE clinic_memberships SET
           role_id = :roleId,
           is_dentist = :isDentist,
           is_active = CASE
             WHEN :setActive = 1 THEN :membershipActive
             ELSE is_active
           END,
           custom_permissions = :customJson
         WHERE clinic_id = :clinicId AND user_id = :userId`,
        {
          roleId,
          isDentist: isDentist ? 1 : 0,
          setActive: dto.membershipActive !== undefined ? 1 : 0,
          membershipActive: dto.membershipActive === false ? 0 : 1,
          customJson,
          clinicId,
          userId,
        },
      );
    } else {
      await dbPool.query(
        `UPDATE clinic_memberships SET
           role_id = :roleId,
           is_dentist = :isDentist,
           is_active = CASE
             WHEN :setActive = 1 THEN :membershipActive
             ELSE is_active
           END
         WHERE clinic_id = :clinicId AND user_id = :userId`,
        {
          roleId,
          isDentist: isDentist ? 1 : 0,
          setActive: dto.membershipActive !== undefined ? 1 : 0,
          membershipActive: dto.membershipActive === false ? 0 : 1,
          clinicId,
          userId,
        },
      );
    }

    if (dto.fullName?.trim() || dto.phone !== undefined || dto.specialty !== undefined) {
      await dbPool.query(
        `UPDATE users SET
           full_name = CASE WHEN :setName = 1 THEN :fullName ELSE full_name END,
           phone = CASE WHEN :setPhone = 1 THEN :phone ELSE phone END,
           specialty = CASE
             WHEN :setSpecialty = 1 THEN :specialty
             WHEN :isDentist = 1 THEN COALESCE(NULLIF(specialty, ''), 'Odontología')
             ELSE specialty
           END
         WHERE id = :userId`,
        {
          setName: dto.fullName?.trim() ? 1 : 0,
          fullName: dto.fullName?.trim() ?? '',
          setPhone: dto.phone !== undefined ? 1 : 0,
          phone: dto.phone ?? null,
          setSpecialty: dto.specialty !== undefined ? 1 : 0,
          specialty: dto.specialty ?? null,
          isDentist: isDentist ? 1 : 0,
          userId,
        },
      );
    }

    const users = await this.listUsers(clinicId);
    const updated = users.find((u) => u.id === userId);
    if (!updated) throw httpError('Error al actualizar usuario', 500);
    return updated;
  }

  async createUser(
    clinicId: string,
    dto: CreateClinicUserDto,
  ): Promise<
    ClinicUserDto & {
      inviteEmailSent?: boolean;
      inviteEmailLogged?: boolean;
      temporaryPassword?: string;
    }
  > {
    await this.ensureMembershipDentistColumn();
    await ensureCustomPermissionsColumn();
    const clinic = await this.getById(clinicId);
    const email = dto.email?.trim().toLowerCase();
    if (!email) throw httpError('email es obligatorio', 400);
    if (!dto.fullName?.trim()) throw httpError('fullName es obligatorio', 400);
    if (!['ADMIN', 'DENTIST', 'RECEPTIONIST'].includes(dto.role)) {
      throw httpError('role inválido', 400);
    }
    const customPerms =
      dto.customPermissions !== undefined
        ? sanitizePermissionsInput(dto.customPermissions)
        : null;
    const customJson =
      customPerms == null ? null : JSON.stringify(customPerms);

    const [roleRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id FROM roles WHERE name = :role LIMIT 1`,
      { role: dto.role },
    );
    if (!roleRows[0]) throw httpError('Rol no encontrado', 400);
    const roleId = roleRows[0].id as number;

    const isDentist =
      dto.role === 'DENTIST' ||
      (dto.role === 'ADMIN' && dto.isDentist === true);

    const specialty =
      dto.specialty?.trim() ||
      (isDentist ? 'Odontología' : null);

    const provided = dto.password?.trim() ?? '';
    if (provided && provided.length < 6) {
      throw httpError(
        'La contraseña temporal debe tener al menos 6 caracteres (o dejala vacía para generar una)',
        400,
      );
    }
    const tempPassword = provided || generateTempPassword();
    const usedGeneratedPassword = !provided;
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const userId = uuidv4();
    const conn = await dbPool.getConnection();
    let isNewUser = false;
    let finalUserId = userId;

    try {
      await conn.beginTransaction();

      const [existing] = await conn.query<RowDataPacket[]>(
        `SELECT id, full_name FROM users WHERE email = :email LIMIT 1`,
        { email },
      );

      if (existing[0]) {
        finalUserId = existing[0].id as string;
        if (isDentist && specialty) {
          await conn.query(
            `UPDATE users
             SET specialty = COALESCE(NULLIF(specialty, ''), :specialty)
             WHERE id = :id`,
            { id: finalUserId, specialty },
          );
        }
        // Si el admin indicó clave temporal, resetear acceso y mandar correo con clave
        if (provided) {
          await conn.query(
            `UPDATE users SET
               password_hash = :passwordHash,
               must_change_password = 1,
               full_name = COALESCE(NULLIF(:fullName, ''), full_name)
             WHERE id = :id`,
            {
              id: finalUserId,
              passwordHash,
              fullName: dto.fullName.trim(),
            },
          );
        }
      } else {
        isNewUser = true;
        await conn.query<ResultSetHeader>(
          `INSERT INTO users
             (id, role_id, full_name, specialty, email, password_hash, phone, is_active, must_change_password)
           VALUES
             (:id, :roleId, :fullName, :specialty, :email, :passwordHash, :phone, 1, 1)`,
          {
            id: userId,
            roleId,
            fullName: dto.fullName.trim(),
            specialty,
            email,
            passwordHash,
            phone: dto.phone ?? null,
          },
        );
      }

      try {
        await conn.query(
          `INSERT INTO clinic_memberships
             (id, clinic_id, user_id, role_id, is_active, is_dentist, custom_permissions)
           VALUES
             (:id, :clinicId, :userId, :roleId, 1, :isDentist, :customJson)`,
          {
            id: uuidv4(),
            clinicId,
            userId: finalUserId,
            roleId,
            isDentist: isDentist ? 1 : 0,
            customJson,
          },
        );
      } catch (err) {
        if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
          throw httpError('El usuario ya pertenece a esta clínica', 409);
        }
        throw err;
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Ya existe un usuario con ese email', 409);
      }
      throw err;
    } finally {
      conn.release();
    }

    const users = await this.listUsers(clinicId);
    const created = users.find((u) => u.id === finalUserId);
    if (!created) throw httpError('Error al crear usuario', 500);

    let inviteEmailSent = false;
    let inviteEmailLogged = false;
    const sendInviteWithPassword = isNewUser || Boolean(provided);
    try {
      if (sendInviteWithPassword) {
        const mail = await sendUserInviteEmail({
          to: email,
          fullName: dto.fullName.trim(),
          clinicName: clinic.name,
          temporaryPassword: tempPassword,
          role: dto.role,
          copyTo: dto.inviteCopyTo ?? null,
        });
        inviteEmailSent = mail.sent;
        inviteEmailLogged = mail.logged;
      } else {
        const mail = await sendClinicAddedEmail({
          to: email,
          fullName: created.fullName,
          clinicName: clinic.name,
          role: dto.role,
        });
        inviteEmailSent = mail.sent;
        inviteEmailLogged = mail.logged;
      }
    } catch (err) {
      console.error('[mail] invite failed', err);
    }

    return {
      ...created,
      inviteEmailSent,
      inviteEmailLogged,
      ...(inviteEmailLogged && sendInviteWithPassword && usedGeneratedPassword
        ? { temporaryPassword: tempPassword }
        : {}),
    };
  }
}

export const clinicsService = new ClinicsService();
