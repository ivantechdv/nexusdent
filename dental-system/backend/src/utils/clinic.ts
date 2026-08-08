import { Request } from 'express';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { dbPool } from '../config';
import { httpError } from './http';

/** Exige clinicId en el JWT (rutas clínicas). */
export function requireClinicId(req: Request): string {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    throw httpError('Debe seleccionar una clínica para continuar', 403);
  }
  return clinicId;
}

/** Verifica que el paciente exista en la clínica activa. */
export async function assertPatientInClinic(
  clinicId: string,
  patientId: string,
  conn?: PoolConnection,
): Promise<void> {
  const db = conn ?? dbPool;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM patients WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
    { id: patientId, clinicId },
  );
  if (!rows[0]) {
    throw httpError('Paciente no encontrado', 404);
  }
}
