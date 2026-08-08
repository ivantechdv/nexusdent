-- Idempotencia de escrituras (visitas / pagos)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key_hash         CHAR(64) NOT NULL,
  user_id          VARCHAR(36) NOT NULL,
  route_key        VARCHAR(120) NOT NULL,
  response_status  INT NOT NULL,
  response_body    JSON NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key_hash),
  KEY idx_idem_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
