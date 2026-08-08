import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET?.trim();

if (!jwtSecret || jwtSecret === 'change-me-in-production') {
  if (isProd) {
    throw new Error(
      'JWT_SECRET es obligatorio en producción y no puede ser el valor por defecto',
    );
  }
  console.warn(
    '[security] JWT_SECRET ausente o inseguro. Defínalo en .env antes de producción.',
  );
}

export const dbPool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'dental_erp',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  timezone: 'Z',
  charset: 'utf8mb4',
});

export const jwtConfig = {
  secret: jwtSecret || 'nexusdent-dev-only-not-for-prod',
  expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  issuer: 'nexusdent-api',
};

export const cloudStorageConfig = {
  bucket: process.env.STORAGE_BUCKET ?? '',
  region: process.env.STORAGE_REGION ?? '',
  publicBaseUrl: process.env.STORAGE_PUBLIC_URL ?? '',
};
