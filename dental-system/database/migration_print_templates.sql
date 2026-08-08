-- Plantillas de impresión por clínica
CREATE TABLE IF NOT EXISTS print_headers (
  id            CHAR(36) NOT NULL,
  clinic_id     CHAR(36) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  title         VARCHAR(180) NULL,
  subtitle      VARCHAR(255) NULL,
  show_logo     TINYINT(1) NOT NULL DEFAULT 1,
  show_contact  TINYINT(1) NOT NULL DEFAULT 1,
  extra_text    TEXT NULL,
  is_default    TINYINT(1) NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_print_headers_clinic (clinic_id),
  CONSTRAINT fk_print_headers_clinic
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS print_footers (
  id            CHAR(36) NOT NULL,
  clinic_id     CHAR(36) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  body_text     TEXT NULL,
  show_stamp    TINYINT(1) NOT NULL DEFAULT 1,
  is_default    TINYINT(1) NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_print_footers_clinic (clinic_id),
  CONSTRAINT fk_print_footers_clinic
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS print_formats (
  id                    CHAR(36) NOT NULL,
  clinic_id             CHAR(36) NOT NULL,
  name                  VARCHAR(120) NOT NULL,
  description           VARCHAR(255) NULL,
  doc_type              VARCHAR(40) NOT NULL DEFAULT 'ATTENTION_LOG',
  header_id             CHAR(36) NULL,
  footer_id             CHAR(36) NULL,
  show_prices           TINYINT(1) NOT NULL DEFAULT 1,
  show_clinical_notes   TINYINT(1) NOT NULL DEFAULT 1,
  show_signatures       TINYINT(1) NOT NULL DEFAULT 0,
  signature_left_label  VARCHAR(80) NULL DEFAULT 'Odontólogo',
  signature_right_label VARCHAR(80) NULL DEFAULT 'Paciente / Responsable',
  is_default            TINYINT(1) NOT NULL DEFAULT 0,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  sort_order            SMALLINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_print_formats_clinic (clinic_id),
  KEY idx_print_formats_type (clinic_id, doc_type),
  CONSTRAINT fk_print_formats_clinic
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
  CONSTRAINT fk_print_formats_header
    FOREIGN KEY (header_id) REFERENCES print_headers(id) ON DELETE SET NULL,
  CONSTRAINT fk_print_formats_footer
    FOREIGN KEY (footer_id) REFERENCES print_footers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
