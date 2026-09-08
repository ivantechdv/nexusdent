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

/** El usuario (odontólogo u otro rol clínico) debe tener membresía activa en la clínica. */
export async function assertDentistInClinic(
  clinicId: string,
  dentistId: string,
  conn?: PoolConnection,
): Promise<void> {
  const db = conn ?? dbPool;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT cm.user_id
     FROM clinic_memberships cm
     INNER JOIN users u ON u.id = cm.user_id
     WHERE cm.clinic_id = :clinicId
       AND cm.user_id = :dentistId
       AND cm.is_active = 1
       AND u.is_active = 1
     LIMIT 1`,
    { clinicId, dentistId },
  );
  if (!rows[0]) {
    throw httpError('El odontólogo no pertenece a esta clínica', 400);
  }
}
