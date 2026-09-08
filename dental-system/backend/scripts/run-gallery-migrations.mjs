import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbDir = path.resolve(__dirname, '../../database');
const files = [
  'migration_patient_gallery.sql',
  'migration_patient_gallery_kind.sql',
  'migration_patient_radiograph_fields.sql',
  'migration_patient_clinical_notes.sql',
  'migration_treatment_plan_quotes.sql',
  'migration_treatment_plan_kind.sql',
  'migration_treatment_plan_source_quote.sql',
];

const ignorable = new Set([
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_FIELDNAME',
  'ER_DUP_KEYNAME',
  'ER_CANT_DROP_FIELD_OR_KEY',
]);

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'dental_erp',
    multipleStatements: true,
  });

  try {
    for (const file of files) {
      const full = path.join(dbDir, file);
      const sql = fs.readFileSync(full, 'utf8');
      process.stdout.write(`Ejecutando ${file}... `);
      try {
        await conn.query(sql);
        console.log('OK');
      } catch (err) {
        if (ignorable.has(err.code)) {
          console.log(`omitido (${err.code})`);
        } else {
          throw err;
        }
      }
    }

    const [cols] = await conn.query('DESCRIBE patient_clinical_notes');
    console.log('\nColumnas patient_clinical_notes:');
    for (const c of cols) {
      console.log(` - ${c.Field} (${c.Type})`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
