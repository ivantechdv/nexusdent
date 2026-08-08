-- =============================================================================
-- NexusDent / Dental ERP — Migración MySQL (InnoDB)
-- Sistema de Gestión Clínica Odontológica
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS dental_erp
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE dental_erp;

-- -----------------------------------------------------------------------------
-- roles
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS treatment_plan_items;
DROP TABLE IF EXISTS treatment_plans;
DROP TABLE IF EXISTS clinical_records;
DROP TABLE IF EXISTS odontogram_states;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS treatment_catalog;
DROP TABLE IF EXISTS treatment_categories;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

CREATE TABLE roles (
  id          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        ENUM('ADMIN', 'DENTIST', 'RECEPTIONIST', 'SUPERADMIN') NOT NULL,
  description VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id            CHAR(36) NOT NULL,
  role_id       TINYINT UNSIGNED NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  specialty     VARCHAR(100) NULL COMMENT 'Ej: Endodoncia, Ortodoncia, Cirugía Oral',
  email         VARCHAR(180) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(30) NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role_id),
  KEY idx_users_active (is_active),
  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id) REFERENCES roles (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- patients (ficha + anamnesis)
-- -----------------------------------------------------------------------------
CREATE TABLE patients (
  id                 CHAR(36) NOT NULL,
  document_id        VARCHAR(40) NOT NULL COMMENT 'DNI / Cédula / Pasaporte',
  full_name          VARCHAR(180) NOT NULL,
  birth_date         DATE NOT NULL,
  gender             ENUM('M', 'F', 'OTHER', 'UNSPECIFIED') NOT NULL DEFAULT 'UNSPECIFIED',
  phone              VARCHAR(30) NULL,
  email              VARCHAR(180) NULL,
  address            VARCHAR(255) NULL,
  emergency_contact  VARCHAR(180) NULL,
  emergency_phone    VARCHAR(30) NULL,
  -- Anamnesis clínica
  allergy_anesthesia TINYINT(1) NOT NULL DEFAULT 0,
  allergy_penicillin TINYINT(1) NOT NULL DEFAULT 0,
  has_hypertension   TINYINT(1) NOT NULL DEFAULT 0,
  has_diabetes       TINYINT(1) NOT NULL DEFAULT 0,
  coagulation_issues TINYINT(1) NOT NULL DEFAULT 0,
  is_pregnant        TINYINT(1) NOT NULL DEFAULT 0,
  anamnesis_notes    TEXT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_patients_document (document_id),
  KEY idx_patients_name (full_name),
  KEY idx_patients_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- treatment_categories (especialidades / grupos)
-- -----------------------------------------------------------------------------
CREATE TABLE treatment_categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(40) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_category_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- treatment_catalog (prestaciones / procedimientos)
-- -----------------------------------------------------------------------------
CREATE TABLE treatment_catalog (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(30) NOT NULL,
  name        VARCHAR(150) NOT NULL,
  category    VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
  description TEXT NULL,
  base_price  DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_treatment_code (code),
  KEY idx_treatment_category (category),
  KEY idx_treatment_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- appointments (citas / turnos)
-- -----------------------------------------------------------------------------
CREATE TABLE appointments (
  id           CHAR(36) NOT NULL,
  patient_id   CHAR(36) NOT NULL,
  dentist_id   CHAR(36) NOT NULL,
  scheduled_at DATETIME NOT NULL,
  duration_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  status       ENUM(
                  'PENDING',
                  'CONFIRMED',
                  'WAITING_ROOM',
                  'IN_PROGRESS',
                  'COMPLETED',
                  'CANCELLED',
                  'NO_SHOW'
                ) NOT NULL DEFAULT 'PENDING',
  reason       VARCHAR(255) NULL,
  notes        TEXT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointments_patient (patient_id),
  KEY idx_appointments_dentist (dentist_id),
  KEY idx_appointments_scheduled (scheduled_at),
  KEY idx_appointments_status (status),
  KEY idx_appointments_dentist_date (dentist_id, scheduled_at),
  CONSTRAINT fk_appointments_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_appointments_dentist
    FOREIGN KEY (dentist_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- odontogram_states (mapa dental FDI — 5 caras)
-- ToothNumber FDI adulto: 11-18, 21-28, 31-38, 41-48
-- Surfaces: V (Vestibular), L (Lingual), P (Palatina), M (Mesial), D (Distal), O (Oclusal/Incisal)
-- -----------------------------------------------------------------------------
CREATE TABLE odontogram_states (
  id            CHAR(36) NOT NULL,
  patient_id    CHAR(36) NOT NULL,
  tooth_number  SMALLINT UNSIGNED NOT NULL COMMENT 'Notación FDI 11-48',
  surface       ENUM('V', 'L', 'P', 'M', 'D', 'O', 'WHOLE') NOT NULL DEFAULT 'WHOLE',
  `condition`   ENUM(
                  'HEALTHY',
                  'CARIES',
                  'RESTORATION',
                  'MISSING',
                  'ENDO_NEEDED',
                  'CROWN',
                  'EXTRACTION_NEEDED',
                  'IMPLANT',
                  'FRACTURE'
                ) NOT NULL DEFAULT 'HEALTHY',
  status        ENUM('PRESENT', 'TREATED', 'IN_PROGRESS', 'ABSENT') NOT NULL DEFAULT 'PRESENT',
  notes         VARCHAR(500) NULL,
  recorded_by   CHAR(36) NULL,
  recorded_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_odontogram_tooth_surface (patient_id, tooth_number, surface),
  KEY idx_odontogram_patient (patient_id),
  KEY idx_odontogram_tooth (tooth_number),
  KEY idx_odontogram_condition (`condition`),
  CONSTRAINT chk_odontogram_fdi
    CHECK (tooth_number BETWEEN 11 AND 48),
  CONSTRAINT fk_odontogram_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_odontogram_user
    FOREIGN KEY (recorded_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- clinical_records (evoluciones / bitácora)
-- -----------------------------------------------------------------------------
CREATE TABLE clinical_records (
  id              CHAR(36) NOT NULL,
  patient_id      CHAR(36) NOT NULL,
  dentist_id      CHAR(36) NOT NULL,
  appointment_id  CHAR(36) NULL,
  tooth_number    SMALLINT UNSIGNED NULL COMMENT 'Pieza FDI tratada (opcional)',
  treatment_id    INT UNSIGNED NULL,
  clinical_notes  TEXT NOT NULL,
  prescription    TEXT NULL COMMENT 'Receta / indicaciones post-operatorias',
  attachment_url  VARCHAR(500) NULL,
  signed_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_clinical_patient (patient_id),
  KEY idx_clinical_dentist (dentist_id),
  KEY idx_clinical_appointment (appointment_id),
  KEY idx_clinical_treatment (treatment_id),
  KEY idx_clinical_signed (signed_at),
  CONSTRAINT fk_clinical_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_clinical_dentist
    FOREIGN KEY (dentist_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_clinical_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_clinical_treatment
    FOREIGN KEY (treatment_id) REFERENCES treatment_catalog (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- treatment_plans (presupuestos / planes de tratamiento)
-- -----------------------------------------------------------------------------
CREATE TABLE treatment_plans (
  id            CHAR(36) NOT NULL,
  patient_id    CHAR(36) NOT NULL,
  created_by    CHAR(36) NULL,
  title         VARCHAR(180) NULL DEFAULT 'Plan de tratamiento',
  total_amount  DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  paid_amount   DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  status        ENUM('DRAFT', 'APPROVED', 'IN_PROGRESS', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
  notes         TEXT NULL,
  approved_at   DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plans_patient (patient_id),
  KEY idx_plans_status (status),
  CONSTRAINT fk_plans_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_plans_creator
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ítems del plan (prestaciones presupuestadas)
CREATE TABLE treatment_plan_items (
  id                 CHAR(36) NOT NULL,
  treatment_plan_id  CHAR(36) NOT NULL,
  treatment_id       INT UNSIGNED NOT NULL,
  tooth_number       SMALLINT UNSIGNED NULL,
  quantity           SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  unit_price         DECIMAL(12, 2) NOT NULL,
  discount_pct       DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  line_total         DECIMAL(12, 2) NOT NULL,
  status             ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plan_items_plan (treatment_plan_id),
  KEY idx_plan_items_treatment (treatment_id),
  CONSTRAINT fk_plan_items_plan
    FOREIGN KEY (treatment_plan_id) REFERENCES treatment_plans (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_plan_items_treatment
    FOREIGN KEY (treatment_id) REFERENCES treatment_catalog (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- payments (abonos / recibos de caja)
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
  id                 CHAR(36) NOT NULL,
  patient_id         CHAR(36) NOT NULL,
  treatment_plan_id  CHAR(36) NOT NULL,
  amount_paid        DECIMAL(12, 2) NOT NULL,
  payment_method     ENUM('CASH', 'CARD', 'TRANSFER') NOT NULL,
  receipt_number     VARCHAR(50) NOT NULL,
  notes              VARCHAR(500) NULL,
  received_by        CHAR(36) NULL,
  paid_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_receipt (receipt_number),
  KEY idx_payments_patient (patient_id),
  KEY idx_payments_plan (treatment_plan_id),
  KEY idx_payments_paid_at (paid_at),
  CONSTRAINT fk_payments_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payments_plan
    FOREIGN KEY (treatment_plan_id) REFERENCES treatment_plans (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payments_receiver
    FOREIGN KEY (received_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_payment_amount
    CHECK (amount_paid > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- SEED: roles
-- -----------------------------------------------------------------------------
INSERT INTO roles (id, name, description) VALUES
  (1, 'ADMIN', 'Administrador del sistema'),
  (2, 'DENTIST', 'Odontólogo / Cirujano dentista'),
  (3, 'RECEPTIONIST', 'Recepción y caja'),
  (4, 'SUPERADMIN', 'Desarrollador / monitoreo global');

-- -----------------------------------------------------------------------------
-- SEED: usuarios demo (password: Admin123!)
-- hash bcrypt: $2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC
-- -----------------------------------------------------------------------------
INSERT INTO users (id, role_id, full_name, specialty, email, password_hash, phone) VALUES
  ('a1000000-0000-4000-8000-000000000001', 1, 'Admin NexusDent', NULL,
   'admin@nexusdent.local',
   '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
   '+1 809 000 0001'),
  ('a1000000-0000-4000-8000-000000000002', 2, 'Dra. Ana Quintero', 'Odontología General',
   'dentist@nexusdent.local',
   '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
   '+1 809 000 0002'),
  ('a1000000-0000-4000-8000-000000000003', 3, 'Luis Recepción', NULL,
   'recepcion@nexusdent.local',
   '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
   '+1 809 000 0003'),
  ('a1000000-0000-4000-8000-000000000099', 4, 'Superadmin Dev', 'Ingeniería',
   'superadmin@nexusdent.local',
   '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
   '+1 809 000 0099');

-- -----------------------------------------------------------------------------
-- SEED: categorías
-- -----------------------------------------------------------------------------
INSERT INTO treatment_categories (code, name, sort_order) VALUES
  ('GENERAL', 'General', 1),
  ('ENDODONCIA', 'Endodoncia', 2),
  ('CIRUGIA', 'Cirugía', 3),
  ('ORTODONCIA', 'Ortodoncia', 4),
  ('PERIODONCIA', 'Periodoncia', 5),
  ('PROTESIS', 'Prótesis', 6),
  ('RADIOLOGIA', 'Radiología', 7);

-- -----------------------------------------------------------------------------
-- SEED: catálogo de prestaciones (ejemplos)
-- -----------------------------------------------------------------------------
INSERT INTO treatment_catalog (code, name, category, base_price) VALUES
  ('EXA-001', 'Examen clínico inicial', 'GENERAL', 25.00),
  ('RAD-001', 'Examen radiográfico (periapical)', 'RADIOLOGIA', 15.00),
  ('RAD-002', 'Ortopantomografía', 'RADIOLOGIA', 45.00),
  ('GEN-001', 'Detartraje / Limpieza dental', 'PERIODONCIA', 40.00),
  ('GEN-002', 'Resina / Calza (1 cara)', 'GENERAL', 50.00),
  ('GEN-003', 'Resina / Calza (2+ caras)', 'GENERAL', 75.00),
  ('END-001', 'Endodoncia unirradicular', 'ENDODONCIA', 180.00),
  ('END-002', 'Endodoncia multirradicular', 'ENDODONCIA', 280.00),
  ('CIR-001', 'Exodoncia simple', 'CIRUGIA', 60.00),
  ('CIR-002', 'Exodoncia de cordal (tercer molar)', 'CIRUGIA', 150.00),
  ('ORT-001', 'Consulta ortodoncia', 'ORTODONCIA', 35.00),
  ('ORT-002', 'Instalación brackets (arco)', 'ORTODONCIA', 450.00),
  ('PRO-001', 'Corona unitaria', 'PROTESIS', 320.00);

-- -----------------------------------------------------------------------------
-- SEED: paciente demo
-- -----------------------------------------------------------------------------
INSERT INTO patients (
  id, document_id, full_name, birth_date, gender, phone, email,
  emergency_contact, emergency_phone,
  allergy_penicillin, has_hypertension, anamnesis_notes
) VALUES (
  'b2000000-0000-4000-8000-000000000001',
  '00123456789',
  'María Elena Vargas Ruiz',
  '1988-03-14',
  'F',
  '+1 809 555 0142',
  'maria.vargas@email.com',
  'Carlos Vargas',
  '+1 809 555 0199',
  1, 1,
  'Última PA 140/90. Evitar AINES prolongados.'
);

-- =============================================================================
-- Vista útil: saldo deudor por paciente
-- =============================================================================
CREATE OR REPLACE VIEW v_patient_balance AS
SELECT
  p.id AS patient_id,
  p.document_id,
  p.full_name,
  COALESCE(SUM(tp.total_amount), 0) AS total_budgeted,
  COALESCE(SUM(tp.paid_amount), 0)  AS total_paid,
  COALESCE(SUM(tp.total_amount - tp.paid_amount), 0) AS balance_due
FROM patients p
LEFT JOIN treatment_plans tp
  ON tp.patient_id = p.id
 AND tp.status IN ('APPROVED', 'IN_PROGRESS', 'CLOSED')
GROUP BY p.id, p.document_id, p.full_name;
