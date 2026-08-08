-- Multi-tenant: clínicas + membresías + clinic_id
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS clinics (
  id          CHAR(36) NOT NULL,
  name        VARCHAR(150) NOT NULL,
  slug        VARCHAR(80) NOT NULL,
  is_demo     TINYINT(1) NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clinics_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_memberships (
  id          CHAR(36) NOT NULL,
  clinic_id   CHAR(36) NOT NULL,
  user_id     CHAR(36) NOT NULL,
  role_id     TINYINT UNSIGNED NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_membership (clinic_id, user_id),
  KEY idx_membership_user (user_id),
  CONSTRAINT fk_membership_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id),
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_membership_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clínicas iniciales
INSERT IGNORE INTO clinics (id, name, slug, is_demo, is_active) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'Clínica Piloto', 'piloto', 0, 1),
  ('c1000000-0000-4000-8000-000000000002', 'Demo NexusDent', 'demo', 1, 1);

-- clinic_id en tablas tenant
ALTER TABLE patients
  ADD COLUMN clinic_id CHAR(36) NULL AFTER id,
  ADD KEY idx_patients_clinic (clinic_id);

ALTER TABLE appointments
  ADD COLUMN clinic_id CHAR(36) NULL AFTER id,
  ADD KEY idx_appointments_clinic (clinic_id);

ALTER TABLE clinical_records
  ADD COLUMN clinic_id CHAR(36) NULL AFTER id,
  ADD KEY idx_clinical_clinic (clinic_id);

ALTER TABLE odontogram_states
  ADD COLUMN clinic_id CHAR(36) NULL AFTER id,
  ADD KEY idx_odontogram_clinic (clinic_id);

ALTER TABLE treatment_plans
  ADD COLUMN clinic_id CHAR(36) NULL AFTER id,
  ADD KEY idx_plans_clinic (clinic_id);

ALTER TABLE payments
  ADD COLUMN clinic_id CHAR(36) NULL AFTER id,
  ADD KEY idx_payments_clinic (clinic_id);

ALTER TABLE treatment_categories
  ADD COLUMN clinic_id CHAR(36) NULL AFTER id,
  ADD KEY idx_cat_clinic (clinic_id);

ALTER TABLE treatment_catalog
  ADD COLUMN clinic_id CHAR(36) NULL AFTER id,
  ADD KEY idx_treat_clinic (clinic_id);

-- Backfill → clínica piloto
UPDATE patients SET clinic_id = 'c1000000-0000-4000-8000-000000000001' WHERE clinic_id IS NULL;
UPDATE appointments SET clinic_id = 'c1000000-0000-4000-8000-000000000001' WHERE clinic_id IS NULL;
UPDATE clinical_records SET clinic_id = 'c1000000-0000-4000-8000-000000000001' WHERE clinic_id IS NULL;
UPDATE odontogram_states SET clinic_id = 'c1000000-0000-4000-8000-000000000001' WHERE clinic_id IS NULL;
UPDATE treatment_plans SET clinic_id = 'c1000000-0000-4000-8000-000000000001' WHERE clinic_id IS NULL;
UPDATE payments SET clinic_id = 'c1000000-0000-4000-8000-000000000001' WHERE clinic_id IS NULL;
UPDATE treatment_categories SET clinic_id = 'c1000000-0000-4000-8000-000000000001' WHERE clinic_id IS NULL;
UPDATE treatment_catalog SET clinic_id = 'c1000000-0000-4000-8000-000000000001' WHERE clinic_id IS NULL;

-- Membresías: usuarios no SUPERADMIN → piloto
INSERT IGNORE INTO clinic_memberships (id, clinic_id, user_id, role_id, is_active)
SELECT UUID(), 'c1000000-0000-4000-8000-000000000001', u.id, u.role_id, 1
FROM users u
INNER JOIN roles r ON r.id = u.role_id
WHERE r.name <> 'SUPERADMIN';

-- Superadmin también puede entrar a piloto y demo (soporte)
INSERT IGNORE INTO clinic_memberships (id, clinic_id, user_id, role_id, is_active)
SELECT UUID(), 'c1000000-0000-4000-8000-000000000001', u.id, u.role_id, 1
FROM users u
INNER JOIN roles r ON r.id = u.role_id
WHERE r.name = 'SUPERADMIN';

INSERT IGNORE INTO clinic_memberships (id, clinic_id, user_id, role_id, is_active)
SELECT UUID(), 'c1000000-0000-4000-8000-000000000002', u.id, u.role_id, 1
FROM users u
INNER JOIN roles r ON r.id = u.role_id
WHERE r.name = 'SUPERADMIN';

-- Uniques scoped (quitar globales conflictivos)
ALTER TABLE patients DROP INDEX uq_patients_document;
ALTER TABLE patients
  ADD UNIQUE KEY uq_patients_clinic_document (clinic_id, document_id),
  MODIFY clinic_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_patients_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id);

ALTER TABLE appointments
  MODIFY clinic_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_appointments_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id);

ALTER TABLE clinical_records
  MODIFY clinic_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_clinical_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id);

ALTER TABLE odontogram_states
  MODIFY clinic_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_odontogram_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id);

ALTER TABLE treatment_plans
  MODIFY clinic_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_plans_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id);

ALTER TABLE payments DROP INDEX uq_payments_receipt;
ALTER TABLE payments
  ADD UNIQUE KEY uq_payments_clinic_receipt (clinic_id, receipt_number),
  MODIFY clinic_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_payments_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id);

ALTER TABLE treatment_categories DROP INDEX uq_category_code;
ALTER TABLE treatment_categories
  ADD UNIQUE KEY uq_category_clinic_code (clinic_id, code),
  MODIFY clinic_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_cat_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id);

ALTER TABLE treatment_catalog DROP INDEX uq_treatment_code;
ALTER TABLE treatment_catalog
  ADD UNIQUE KEY uq_treatment_clinic_code (clinic_id, code),
  MODIFY clinic_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_treat_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id);

-- Seed mínimo demo: copiar categorías del piloto (si demo vacío)
INSERT INTO treatment_categories (code, name, sort_order, is_active, clinic_id)
SELECT c.code, c.name, c.sort_order, c.is_active, 'c1000000-0000-4000-8000-000000000002'
FROM treatment_categories c
WHERE c.clinic_id = 'c1000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM treatment_categories d
    WHERE d.clinic_id = 'c1000000-0000-4000-8000-000000000002' AND d.code = c.code
  );

INSERT INTO treatment_catalog (code, name, category, description, base_price, is_active, clinic_id)
SELECT t.code, t.name, t.category, t.description, t.base_price, t.is_active,
       'c1000000-0000-4000-8000-000000000002'
FROM treatment_catalog t
WHERE t.clinic_id = 'c1000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM treatment_catalog d
    WHERE d.clinic_id = 'c1000000-0000-4000-8000-000000000002' AND d.code = t.code
  );
