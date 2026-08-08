import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { dbPool } from '../../config';
import { httpError } from '../../utils/http';
import {
  Category,
  CategoryDto,
  UpsertCategoryDto,
} from './categories.types';

type CategoryRow = Category & RowDataPacket & { treatment_count?: number };

function mapCategory(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    treatmentCount: Number(row.treatment_count ?? 0),
  };
}

function normalizeCode(code: string) {
  return code
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

function validate(dto: UpsertCategoryDto) {
  if (!dto.code?.trim()) throw httpError('code es obligatorio', 400);
  if (!dto.name?.trim()) throw httpError('name es obligatorio', 400);
  const code = normalizeCode(dto.code);
  if (!code) throw httpError('code inválido', 400);
  return code;
}

export class CategoriesService {
  async list(clinicId: string, all = false): Promise<CategoryDto[]> {
    const where = all
      ? 'WHERE c.clinic_id = :clinicId'
      : 'WHERE c.clinic_id = :clinicId AND c.is_active = 1';
    const [rows] = await dbPool.query<CategoryRow[]>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM treatment_catalog t
               WHERE t.category = c.code AND t.clinic_id = c.clinic_id) AS treatment_count
       FROM treatment_categories c
       ${where}
       ORDER BY c.sort_order ASC, c.name ASC`,
      { clinicId },
    );
    return rows.map(mapCategory);
  }

  async getById(clinicId: string, id: number): Promise<CategoryDto> {
    const [rows] = await dbPool.query<CategoryRow[]>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM treatment_catalog t
               WHERE t.category = c.code AND t.clinic_id = c.clinic_id) AS treatment_count
       FROM treatment_categories c
       WHERE c.id = :id AND c.clinic_id = :clinicId
       LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('Categoría no encontrada', 404);
    return mapCategory(rows[0]);
  }

  async create(clinicId: string, dto: UpsertCategoryDto): Promise<CategoryDto> {
    const code = validate(dto);
    try {
      const [result] = await dbPool.query<ResultSetHeader>(
        `INSERT INTO treatment_categories (clinic_id, code, name, sort_order, is_active)
         VALUES (:clinicId, :code, :name, :sortOrder, :isActive)`,
        {
          clinicId,
          code,
          name: dto.name.trim(),
          sortOrder: dto.sortOrder ?? 99,
          isActive: dto.isActive === false ? 0 : 1,
        },
      );
      return this.getById(clinicId, result.insertId);
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Ya existe una categoría con ese código', 409);
      }
      throw err;
    }
  }

  async update(
    clinicId: string,
    id: number,
    dto: UpsertCategoryDto,
  ): Promise<CategoryDto> {
    const code = validate(dto);
    const current = await this.getById(clinicId, id);
    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE treatment_categories SET
           code = :code,
           name = :name,
           sort_order = :sortOrder,
           is_active = :isActive
         WHERE id = :id AND clinic_id = :clinicId`,
        {
          id,
          clinicId,
          code,
          name: dto.name.trim(),
          sortOrder: dto.sortOrder ?? current.sortOrder,
          isActive: dto.isActive === false ? 0 : 1,
        },
      );
      if (code !== current.code) {
        await conn.query(
          `UPDATE treatment_catalog
           SET category = :code
           WHERE category = :oldCode AND clinic_id = :clinicId`,
          { code, oldCode: current.code, clinicId },
        );
      }
      await conn.commit();
      return this.getById(clinicId, id);
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Ya existe una categoría con ese código', 409);
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  async remove(clinicId: string, id: number): Promise<void> {
    const current = await this.getById(clinicId, id);
    if (current.treatmentCount > 0) {
      throw httpError(
        'No se puede eliminar: hay prestaciones en esta categoría',
        409,
      );
    }
    await dbPool.query(
      `DELETE FROM treatment_categories WHERE id = :id AND clinic_id = :clinicId`,
      { id, clinicId },
    );
  }
}

export const categoriesService = new CategoriesService();
