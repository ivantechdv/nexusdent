import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { httpError } from '../../utils/http';
import {
  Patient,
  PatientBalanceDto,
  PatientDto,
  UpsertPatientDto,
} from './patients.types';

type PatientRow = Patient & RowDataPacket;
type BalanceRow = RowDataPacket & {
  patient_id: string;
  document_id: string;
  full_name: string;
  total_budgeted: number | string;
  total_paid: number | string;
  balance_due: number | string;
};

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeMedicalConditions(value?: string | null): string | null {
  if (value == null) return null;
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length) return null;
  return items.join(', ');
}

function deriveFlagsFromConditions(text: string | null) {
  const t = (text ?? '').toLowerCase();
  return {
    allergyAnesthesia: /anest/.test(t),
    allergyPenicillin: /penicil/.test(t),
    hasHypertension: /hipertens|tensi[oó]n\s*alta/.test(t),
    hasDiabetes: /diabet/.test(t),
    coagulationIssues: /coagul/.test(t),
  };
}

export function mapPatient(row: Patient): PatientDto {
  return {
    id: row.id,
    documentId: row.document_id,
    fullName: row.full_name,
    birthDate: toDateString(row.birth_date),
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    address: row.address,
    emergencyContact: row.emergency_contact,
    emergencyPhone: row.emergency_phone,
    allergyAnesthesia: Boolean(row.allergy_anesthesia),
    allergyPenicillin: Boolean(row.allergy_penicillin),
    hasHypertension: Boolean(row.has_hypertension),
    hasDiabetes: Boolean(row.has_diabetes),
    coagulationIssues: Boolean(row.coagulation_issues),
    isPregnant: Boolean(row.is_pregnant),
    anamnesisNotes: row.anamnesis_notes,
    medicalConditions: row.medical_conditions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateUpsert(dto: UpsertPatientDto) {
  if (!dto.documentId?.trim()) throw httpError('documentId es obligatorio', 400);
  if (!dto.fullName?.trim()) throw httpError('fullName es obligatorio', 400);
  if (!dto.birthDate) throw httpError('birthDate es obligatorio', 400);
}

export class PatientsService {
  async list(clinicId: string, q?: string, limit = 50): Promise<PatientDto[]> {
    const search = q?.trim();
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

    if (search) {
      const like = `%${search}%`;
      const [rows] = await dbPool.query<PatientRow[]>(
        `SELECT * FROM patients
         WHERE clinic_id = :clinicId
           AND (document_id LIKE :like
            OR full_name LIKE :like
            OR phone LIKE :like)
         ORDER BY full_name ASC
         LIMIT ${safeLimit}`,
        { clinicId, like },
      );
      return rows.map(mapPatient);
    }

    const [rows] = await dbPool.query<PatientRow[]>(
      `SELECT * FROM patients
       WHERE clinic_id = :clinicId
       ORDER BY updated_at DESC
       LIMIT ${safeLimit}`,
      { clinicId },
    );
    return rows.map(mapPatient);
  }

  async getById(clinicId: string, id: string): Promise<PatientDto> {
    const [rows] = await dbPool.query<PatientRow[]>(
      `SELECT * FROM patients WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('Paciente no encontrado', 404);
    return mapPatient(rows[0]);
  }

  async getByDocument(clinicId: string, documentId: string): Promise<PatientDto> {
    const [rows] = await dbPool.query<PatientRow[]>(
      `SELECT * FROM patients
       WHERE clinic_id = :clinicId AND document_id = :documentId
       LIMIT 1`,
      { clinicId, documentId: documentId.trim() },
    );
    if (!rows[0]) throw httpError('Paciente no encontrado', 404);
    return mapPatient(rows[0]);
  }

  async create(clinicId: string, dto: UpsertPatientDto): Promise<PatientDto> {
    validateUpsert(dto);
    const id = uuidv4();
    const medicalConditions = normalizeMedicalConditions(dto.medicalConditions);
    const derived = deriveFlagsFromConditions(medicalConditions);

    try {
      await dbPool.query<ResultSetHeader>(
        `INSERT INTO patients
           (id, clinic_id, document_id, full_name, birth_date, gender, phone, email, address,
            emergency_contact, emergency_phone, allergy_anesthesia, allergy_penicillin,
            has_hypertension, has_diabetes, coagulation_issues, is_pregnant, anamnesis_notes,
            medical_conditions)
         VALUES
           (:id, :clinicId, :documentId, :fullName, :birthDate, :gender, :phone, :email, :address,
            :emergencyContact, :emergencyPhone, :allergyAnesthesia, :allergyPenicillin,
            :hasHypertension, :hasDiabetes, :coagulationIssues, :isPregnant, :anamnesisNotes,
            :medicalConditions)`,
        {
          id,
          clinicId,
          documentId: dto.documentId.trim(),
          fullName: dto.fullName.trim(),
          birthDate: dto.birthDate,
          gender: dto.gender ?? 'UNSPECIFIED',
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          emergencyContact: dto.emergencyContact ?? null,
          emergencyPhone: dto.emergencyPhone ?? null,
          allergyAnesthesia: (dto.allergyAnesthesia ?? derived.allergyAnesthesia) ? 1 : 0,
          allergyPenicillin: (dto.allergyPenicillin ?? derived.allergyPenicillin) ? 1 : 0,
          hasHypertension: (dto.hasHypertension ?? derived.hasHypertension) ? 1 : 0,
          hasDiabetes: (dto.hasDiabetes ?? derived.hasDiabetes) ? 1 : 0,
          coagulationIssues: (dto.coagulationIssues ?? derived.coagulationIssues) ? 1 : 0,
          isPregnant: dto.isPregnant ? 1 : 0,
          anamnesisNotes: dto.anamnesisNotes ?? null,
          medicalConditions,
        },
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Ya existe un paciente con ese documento', 409);
      }
      throw err;
    }

    return this.getById(clinicId, id);
  }

  async update(
    clinicId: string,
    id: string,
    dto: UpsertPatientDto,
  ): Promise<PatientDto> {
    validateUpsert(dto);
    await this.getById(clinicId, id);
    const medicalConditions = normalizeMedicalConditions(dto.medicalConditions);
    const derived = deriveFlagsFromConditions(medicalConditions);

    try {
      await dbPool.query<ResultSetHeader>(
        `UPDATE patients SET
           document_id = :documentId,
           full_name = :fullName,
           birth_date = :birthDate,
           gender = :gender,
           phone = :phone,
           email = :email,
           address = :address,
           emergency_contact = :emergencyContact,
           emergency_phone = :emergencyPhone,
           allergy_anesthesia = :allergyAnesthesia,
           allergy_penicillin = :allergyPenicillin,
           has_hypertension = :hasHypertension,
           has_diabetes = :hasDiabetes,
           coagulation_issues = :coagulationIssues,
           is_pregnant = :isPregnant,
           anamnesis_notes = :anamnesisNotes,
           medical_conditions = :medicalConditions
         WHERE id = :id AND clinic_id = :clinicId`,
        {
          id,
          clinicId,
          documentId: dto.documentId.trim(),
          fullName: dto.fullName.trim(),
          birthDate: dto.birthDate,
          gender: dto.gender ?? 'UNSPECIFIED',
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          emergencyContact: dto.emergencyContact ?? null,
          emergencyPhone: dto.emergencyPhone ?? null,
          allergyAnesthesia: (dto.allergyAnesthesia ?? derived.allergyAnesthesia) ? 1 : 0,
          allergyPenicillin: (dto.allergyPenicillin ?? derived.allergyPenicillin) ? 1 : 0,
          hasHypertension: (dto.hasHypertension ?? derived.hasHypertension) ? 1 : 0,
          hasDiabetes: (dto.hasDiabetes ?? derived.hasDiabetes) ? 1 : 0,
          coagulationIssues: (dto.coagulationIssues ?? derived.coagulationIssues) ? 1 : 0,
          isPregnant: dto.isPregnant ? 1 : 0,
          anamnesisNotes: dto.anamnesisNotes ?? null,
          medicalConditions,
        },
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw httpError('Ya existe un paciente con ese documento', 409);
      }
      throw err;
    }

    return this.getById(clinicId, id);
  }

  async getBalance(clinicId: string, patientId: string): Promise<PatientBalanceDto> {
    await this.getById(clinicId, patientId);
    const [rows] = await dbPool.query<BalanceRow[]>(
      `SELECT patient_id, document_id, full_name,
              total_budgeted, total_paid, balance_due
       FROM v_patient_balance
       WHERE patient_id = :patientId
       LIMIT 1`,
      { patientId },
    );

    const row = rows[0];
    if (!row) {
      const patient = await this.getById(clinicId, patientId);
      return {
        patientId: patient.id,
        documentId: patient.documentId,
        fullName: patient.fullName,
        totalBudgeted: 0,
        totalPaid: 0,
        balanceDue: 0,
      };
    }

    return {
      patientId: row.patient_id,
      documentId: row.document_id,
      fullName: row.full_name,
      totalBudgeted: Number(row.total_budgeted),
      totalPaid: Number(row.total_paid),
      balanceDue: Number(row.balance_due),
    };
  }
}

export const patientsService = new PatientsService();
