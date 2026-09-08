-- Notas clínicas / críticas del paciente
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS patient_clinical_notes (
  id              CHAR(36) NOT NULL,
  clinic_id       CHAR(36) NOT NULL,
  patient_id      CHAR(36) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  tags            JSON NULL,
  is_critical     TINYINT(1) NOT NULL DEFAULT 0,
  created_by      CHAR(36) NULL,
  updated_by      CHAR(36) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notes_patient (clinic_id, patient_id),
  KEY idx_notes_critical (clinic_id, patient_id, is_critical),
  KEY idx_notes_created (created_at),
  CONSTRAINT fk_notes_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id),
  CONSTRAINT fk_notes_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_notes_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_clinical_note_events (
  id              CHAR(36) NOT NULL,
  clinic_id       CHAR(36) NOT NULL,
  patient_id      CHAR(36) NOT NULL,
  note_id         CHAR(36) NULL,
  action          ENUM('CREATED', 'UPDATED', 'DELETED') NOT NULL,
  note_title      VARCHAR(200) NOT NULL,
  actor_id        CHAR(36) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_note_events_patient (clinic_id, patient_id, created_at),
  CONSTRAINT fk_note_events_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id),
  CONSTRAINT fk_note_events_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT fk_note_events_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
