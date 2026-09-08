-- Galería clínica por paciente (fotografías odontológicas)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS patient_gallery (
  id                  CHAR(36) NOT NULL,
  clinic_id           CHAR(36) NOT NULL,
  patient_id          CHAR(36) NOT NULL,
  kind                ENUM('GALLERY', 'RADIOGRAPH') NOT NULL DEFAULT 'GALLERY',
  clinical_record_id  CHAR(36) NULL,
  category            ENUM('INTRAORAL', 'EXTRAORAL', 'TREATMENT', 'FOLLOWUP') NOT NULL DEFAULT 'INTRAORAL',
  title           VARCHAR(200) NOT NULL,
  file_url        VARCHAR(500) NOT NULL,
  original_name   VARCHAR(255) NULL,
  mime_type       VARCHAR(100) NULL,
  file_size       INT UNSIGNED NULL,
  uploaded_by     CHAR(36) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gallery_patient (clinic_id, patient_id),
  KEY idx_gallery_kind (clinic_id, patient_id, kind),
  KEY idx_gallery_record (clinical_record_id),
  KEY idx_gallery_created (created_at),
  CONSTRAINT fk_gallery_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id),
  CONSTRAINT fk_gallery_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT fk_gallery_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_gallery_record FOREIGN KEY (clinical_record_id) REFERENCES clinical_records (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
