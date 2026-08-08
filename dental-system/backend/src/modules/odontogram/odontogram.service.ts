import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { assertPatientInClinic } from '../../utils/clinic';
import { httpError } from '../../utils/http';
import {
  BulkUpsertOdontogramDto,
  isValidFdiTooth,
  OdontogramState,
  UpsertOdontogramDto,
} from './odontogram.types';

type OdontogramRow = OdontogramState & RowDataPacket;

export class OdontogramService {
  async getByPatient(
    clinicId: string,
    patientId: string,
  ): Promise<OdontogramState[]> {
    await assertPatientInClinic(clinicId, patientId);
    const [rows] = await dbPool.query<OdontogramRow[]>(
      `SELECT id, patient_id, tooth_number, surface, \`condition\`, status,
              notes, recorded_by, recorded_at, updated_at
       FROM odontogram_states
       WHERE patient_id = :patientId AND clinic_id = :clinicId
       ORDER BY tooth_number ASC, surface ASC`,
      { patientId, clinicId },
    );
    return rows;
  }

  async getTooth(
    clinicId: string,
    patientId: string,
    toothNumber: number,
  ): Promise<OdontogramState[]> {
    if (!isValidFdiTooth(toothNumber)) {
      throw httpError('Número FDI inválido', 400);
    }
    await assertPatientInClinic(clinicId, patientId);

    const [rows] = await dbPool.query<OdontogramRow[]>(
      `SELECT id, patient_id, tooth_number, surface, \`condition\`, status,
              notes, recorded_by, recorded_at, updated_at
       FROM odontogram_states
       WHERE patient_id = :patientId
         AND clinic_id = :clinicId
         AND tooth_number = :toothNumber
       ORDER BY surface ASC`,
      { patientId, clinicId, toothNumber },
    );
    return rows;
  }

  async upsertState(
    clinicId: string,
    dto: UpsertOdontogramDto,
  ): Promise<OdontogramState> {
    if (!isValidFdiTooth(dto.toothNumber)) {
      throw httpError('Número FDI inválido (11-48 adulto)', 400);
    }
    await assertPatientInClinic(clinicId, dto.patientId);

    const id = uuidv4();
    const status = dto.status ?? this.inferStatus(dto.condition);

    await dbPool.query<ResultSetHeader>(
      `INSERT INTO odontogram_states
         (id, clinic_id, patient_id, tooth_number, surface, \`condition\`, status, notes, recorded_by)
       VALUES
         (:id, :clinicId, :patientId, :toothNumber, :surface, :condition, :status, :notes, :recordedBy)
       ON DUPLICATE KEY UPDATE
         \`condition\` = VALUES(\`condition\`),
         status = VALUES(status),
         notes = VALUES(notes),
         recorded_by = VALUES(recorded_by),
         updated_at = CURRENT_TIMESTAMP`,
      {
        id,
        clinicId,
        patientId: dto.patientId,
        toothNumber: dto.toothNumber,
        surface: dto.surface,
        condition: dto.condition,
        status,
        notes: dto.notes ?? null,
        recordedBy: dto.recordedBy ?? null,
      },
    );

    const [rows] = await dbPool.query<OdontogramRow[]>(
      `SELECT id, patient_id, tooth_number, surface, \`condition\`, status,
              notes, recorded_by, recorded_at, updated_at
       FROM odontogram_states
       WHERE patient_id = :patientId
         AND clinic_id = :clinicId
         AND tooth_number = :toothNumber
         AND surface = :surface
       LIMIT 1`,
      {
        patientId: dto.patientId,
        clinicId,
        toothNumber: dto.toothNumber,
        surface: dto.surface,
      },
    );

    return rows[0];
  }

  async bulkUpsert(
    clinicId: string,
    dto: BulkUpsertOdontogramDto,
  ): Promise<{ upserted: number }> {
    await assertPatientInClinic(clinicId, dto.patientId);
    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();

      for (const state of dto.states) {
        if (!isValidFdiTooth(state.toothNumber)) {
          throw httpError(`FDI inválido: ${state.toothNumber}`, 400);
        }

        await conn.query(
          `INSERT INTO odontogram_states
             (id, clinic_id, patient_id, tooth_number, surface, \`condition\`, status, notes, recorded_by)
           VALUES
             (:id, :clinicId, :patientId, :toothNumber, :surface, :condition, :status, :notes, :recordedBy)
           ON DUPLICATE KEY UPDATE
             \`condition\` = VALUES(\`condition\`),
             status = VALUES(status),
             notes = VALUES(notes),
             recorded_by = VALUES(recorded_by),
             updated_at = CURRENT_TIMESTAMP`,
          {
            id: uuidv4(),
            clinicId,
            patientId: dto.patientId,
            toothNumber: state.toothNumber,
            surface: state.surface,
            condition: state.condition,
            status: state.status ?? this.inferStatus(state.condition),
            notes: state.notes ?? null,
            recordedBy: dto.recordedBy ?? null,
          },
        );
      }

      await conn.commit();
      return { upserted: dto.states.length };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async deleteState(clinicId: string, id: string): Promise<void> {
    const [result] = await dbPool.query<ResultSetHeader>(
      `DELETE FROM odontogram_states WHERE id = :id AND clinic_id = :clinicId`,
      { id, clinicId },
    );
    if (result.affectedRows === 0) {
      throw httpError('Estado odontograma no encontrado', 404);
    }
  }

  private inferStatus(
    condition: UpsertOdontogramDto['condition'],
  ): UpsertOdontogramDto['status'] extends infer S ? NonNullable<S> : never {
    if (condition === 'MISSING') return 'ABSENT';
    if (condition === 'RESTORATION' || condition === 'CROWN' || condition === 'IMPLANT') {
      return 'TREATED';
    }
    if (condition === 'CARIES' || condition === 'ENDO_NEEDED' || condition === 'EXTRACTION_NEEDED') {
      return 'PRESENT';
    }
    return 'PRESENT';
  }
}

export const odontogramService = new OdontogramService();
