-- Categorías editables + category como VARCHAR
CREATE TABLE IF NOT EXISTS treatment_categories (
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

INSERT IGNORE INTO treatment_categories (code, name, sort_order) VALUES
  ('GENERAL', 'General', 1),
  ('ENDODONCIA', 'Endodoncia', 2),
  ('CIRUGIA', 'Cirugía', 3),
  ('ORTODONCIA', 'Ortodoncia', 4),
  ('PERIODONCIA', 'Periodoncia', 5),
  ('PROTESIS', 'Prótesis', 6),
  ('RADIOLOGIA', 'Radiología', 7);

-- Liberar ENUM → VARCHAR para poder renombrar / crear categorías
ALTER TABLE treatment_catalog
  MODIFY COLUMN category VARCHAR(40) NOT NULL DEFAULT 'GENERAL';
