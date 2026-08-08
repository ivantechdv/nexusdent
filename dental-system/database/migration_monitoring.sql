-- Monitoreo central + rol SUPERADMIN (desarrollador)
ALTER TABLE roles
  MODIFY COLUMN name ENUM('ADMIN', 'DENTIST', 'RECEPTIONIST', 'SUPERADMIN') NOT NULL;

INSERT IGNORE INTO roles (id, name, description) VALUES
  (4, 'SUPERADMIN', 'Desarrollador / monitoreo global');

CREATE TABLE IF NOT EXISTS app_errors (
  id            CHAR(36) NOT NULL,
  source        ENUM('backend', 'frontend') NOT NULL,
  level         ENUM('error', 'warn', 'info') NOT NULL DEFAULT 'error',
  message       VARCHAR(500) NOT NULL,
  stack         TEXT NULL,
  route         VARCHAR(255) NULL,
  method        VARCHAR(10) NULL,
  status_code   SMALLINT UNSIGNED NULL,
  user_id       CHAR(36) NULL,
  user_agent    VARCHAR(400) NULL,
  meta_json     JSON NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_errors_created (created_at),
  KEY idx_errors_source (source),
  KEY idx_errors_status (status_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_request_metrics (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method        VARCHAR(10) NOT NULL,
  route         VARCHAR(255) NOT NULL,
  status_code   SMALLINT UNSIGNED NOT NULL,
  duration_ms   INT UNSIGNED NOT NULL,
  user_id       CHAR(36) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_metrics_created (created_at),
  KEY idx_metrics_route (route),
  KEY idx_metrics_status (status_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password: Admin123!
INSERT IGNORE INTO users (id, role_id, full_name, specialty, email, password_hash, phone) VALUES
  ('a1000000-0000-4000-8000-000000000099', 4, 'Superadmin Dev', 'Ingeniería',
   'superadmin@nexusdent.local',
   '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
   '+1 809 000 0099');
