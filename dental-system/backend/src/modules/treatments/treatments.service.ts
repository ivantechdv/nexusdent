import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { dbPool } from '../../config';
import { httpError } from '../../utils/http';
import { Treatment, TreatmentDto, UpsertTreatmentDto } from './treatments.types';

type TreatmentRow = Treatment & RowDataPacket;

function mapTreatment(row: Treatment): TreatmentDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    description: row.description,
    basePrice: Number(row.base_price),
    isActive: Boolean(row.is_active),
  };
}

function validate(dto: UpsertTreatmentDto) {
  if (!dto.code?.trim()) throw httpError('code es obligatorio', 400);
  if (!dto.name?.trim()) throw httpError('name es obligatorio', 400);
  if (dto.basePrice == null || Number.isNaN(Number(dto.basePrice))) {
    throw httpError('basePrice es obligatorio', 400);
  }
}

export class TreatmentsService {
  async list(
    clinicId: string,
    opts?: {
      q?: string;
      category?: string;
      activeOnly?: boolean;
    },
  ): Promise<TreatmentDto[]> {
    const clauses: string[] = ['clinic_id = :clinicId'];
    const params: Record<string, string> = { clinicId };

    if (opts?.activeOnly !== false) {
      clauses.push('is_active = 1');
    }
    if (opts?.category) {
      clauses.push('category = :category');
      params.category = opts.category;
    }
    if (opts?.q?.trim()) {
      clauses.push('(code LIKE :like OR name LIKE :like)');
      params.like = `%${opts.q.trim()}%`;
    }

    const where = `WHERE ${clauses.join(' AND ')}`;
    const [rows] = await dbPool.query<TreatmentRow[]>(
      `SELECT * FROM treatment_catalog ${where} ORDER BY category ASC, name ASC`,
      params,
    );
    return rows.map(mapTreatment);
  }

  async getById(clinicId: string, id: number): Promise<TreatmentDto> {
    const [rows] = await dbPool.query<TreatmentRow[]>(
      `SELECT * FROM treatment_catalog
       WHERE id = :id AND clinic_id = :clinicId
       LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('Tratamiento no encontrado', 404);
    return mapTreatment(rows[0]);
  }

  async create(clinicId: string, dto: UpsertTreatmentDto): Promise<TreatmentDto> {
    validate(dto);
    try {
      const [result] = await dbPool.query<ResultSetHeader>(
        `INSERT INTO treatment_catalog
           (clinic_id, code, name, category, description, base_price, is_active)
         VALUES
           (:clinicId, :code, :name, :category, :description, :basePrice, :isActive)`,
        {
          clinicId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          category: dto.category ?? 'GENERAL',
          description: dto.description ?? null,
          basePrice: Number(dto.basePrice),
          isActive: dto.isActive === false ? 0 : 1,
        },
      );
      return this.getById(clinicId, result.insertId);
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Ya existe un tratamiento con ese código', 409);
      }
      throw err;
    }
  }

  async update(
    clinicId: string,
    id: number,
    dto: UpsertTreatmentDto,
  ): Promise<TreatmentDto> {
    validate(dto);
    await this.getById(clinicId, id);
    try {
      await dbPool.query<ResultSetHeader>(
        `UPDATE treatment_catalog SET
           code = :code,
           name = :name,
           category = :category,
           description = :description,
           base_price = :basePrice,
           is_active = :isActive
         WHERE id = :id AND clinic_id = :clinicId`,
        {
          id,
          clinicId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          category: dto.category ?? 'GENERAL',
          description: dto.description ?? null,
          basePrice: Number(dto.basePrice),
          isActive: dto.isActive === false ? 0 : 1,
        },
      );
      return this.getById(clinicId, id);
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Ya existe un tratamiento con ese código', 409);
      }
      throw err;
    }
  }
}

export const treatmentsService = new TreatmentsService();
