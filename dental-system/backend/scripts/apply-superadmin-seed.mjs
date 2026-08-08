/**
 * Superadmin Ivan + limpia usuarios demo.
 * node scripts/apply-superadmin-seed.mjs
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const EMAIL = 'ing.ivanrojas@gmail.com';
const PASSWORD = 'ivantech098*';
const FULL_NAME = 'Ivan Rojas';
const SUPER_ID = 'a1000000-0000-4000-8000-000000000099';

const DEMO_EMAILS = [
  'piloto@nexusdent.local',
  'demo@nexusdent.local',
  'multi@nexusdent.local',
  'superadmin@nexusdent.local',
  'admin@nexusdent.local',
  'dentist@nexusdent.local',
  'recepcion@nexusdent.local',
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dental_erp',
    namedPlaceholders: true,
  });

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const [roles] = await conn.query(
      `SELECT id FROM roles WHERE name = 'SUPERADMIN' LIMIT 1`,
    );
    if (!roles[0]) throw new Error('Rol SUPERADMIN no existe');
    const roleId = roles[0].id;

    // Si ya existe por email, actualizar; si no, por id seed; si no, insertar
    const [byEmail] = await conn.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1`,
      { email: EMAIL },
    );

    if (byEmail[0]) {
      await conn.query(
        `UPDATE users SET
           role_id = :roleId,
           full_name = :fullName,
           specialty = 'Ingeniería',
           password_hash = :passwordHash,
           is_active = 1,
           must_change_password = 0
         WHERE id = :id`,
        {
          id: byEmail[0].id,
          roleId,
          fullName: FULL_NAME,
          passwordHash,
        },
      );
      console.log('updated existing', EMAIL, byEmail[0].id);
    } else {
      const [byId] = await conn.query(
        `SELECT id, email FROM users WHERE id = :id LIMIT 1`,
        { id: SUPER_ID },
      );
      if (byId[0]) {
        await conn.query(
          `UPDATE users SET
             role_id = :roleId,
             full_name = :fullName,
             specialty = 'Ingeniería',
             email = :email,
             password_hash = :passwordHash,
             is_active = 1,
             must_change_password = 0
           WHERE id = :id`,
          {
            id: SUPER_ID,
            roleId,
            fullName: FULL_NAME,
            email: EMAIL,
            passwordHash,
          },
        );
        console.log('updated seed id →', EMAIL);
      } else {
        await conn.query(
          `INSERT INTO users
             (id, role_id, full_name, specialty, email, password_hash, phone, is_active, must_change_password)
           VALUES
             (:id, :roleId, :fullName, 'Ingeniería', :email, :passwordHash, NULL, 1, 0)`,
          {
            id: SUPER_ID,
            roleId,
            fullName: FULL_NAME,
            email: EMAIL,
            passwordHash,
          },
        );
        console.log('inserted', EMAIL);
      }
    }

    const [ivanRows] = await conn.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1`,
      { email: EMAIL },
    );
    const ivanId = ivanRows[0].id;

    await conn.query(
      `DELETE FROM clinic_memberships WHERE user_id = :id`,
      { id: ivanId },
    );

    const [demoUsers] = await conn.query(
      `SELECT id, email FROM users
       WHERE LOWER(email) IN (${DEMO_EMAILS.map((_, i) => `:e${i}`).join(',')})
         AND id <> :ivanId`,
      Object.fromEntries([
        ...DEMO_EMAILS.map((e, i) => [`e${i}`, e]),
        ['ivanId', ivanId],
      ]),
    );

    if (demoUsers.length) {
      const ids = demoUsers.map((u) => u.id);
      const inList = ids.map((_, i) => `:d${i}`).join(',');
      const params = Object.fromEntries(ids.map((id, i) => [`d${i}`, id]));

      await conn.query(
        `DELETE FROM clinic_memberships WHERE user_id IN (${inList})`,
        params,
      );

      await conn.query(
        `UPDATE appointments SET dentist_id = :ivanId WHERE dentist_id IN (${inList})`,
        { ...params, ivanId },
      );
      await conn.query(
        `UPDATE clinical_records SET dentist_id = :ivanId WHERE dentist_id IN (${inList})`,
        { ...params, ivanId },
      );
      await conn.query(
        `UPDATE treatment_plans SET created_by = NULL WHERE created_by IN (${inList})`,
        params,
      );
      await conn.query(
        `UPDATE payments SET received_by = NULL WHERE received_by IN (${inList})`,
        params,
      );

      try {
        await conn.query(
          `UPDATE app_errors SET user_id = NULL WHERE user_id IN (${inList})`,
          params,
        );
      } catch {
        /* optional */
      }

      await conn.query(`DELETE FROM users WHERE id IN (${inList})`, params);
      console.log(
        'deleted demos:',
        demoUsers.map((u) => u.email).join(', '),
      );
    } else {
      console.log('no demo users found');
    }

    // Desactivar otros SUPERADMIN que no sean Ivan
    await conn.query(
      `UPDATE users u
       INNER JOIN roles r ON r.id = u.role_id AND r.name = 'SUPERADMIN'
       SET u.is_active = 0
       WHERE u.id <> :ivanId`,
      { ivanId },
    );

    const [check] = await conn.query(
      `SELECT u.email, r.name AS role, u.is_active
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'SUPERADMIN' OR LOWER(u.email) LIKE '%@nexusdent.local'
       ORDER BY r.name, u.email`,
    );
    console.table(check);
    console.log('OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
