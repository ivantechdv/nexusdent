-- Tasa del día + moneda de cobro (USD / VES) en abonos
CREATE TABLE IF NOT EXISTS daily_exchange_rates (
  id          CHAR(36) NOT NULL,
  rate_date   DATE NOT NULL,
  rate        DECIMAL(18, 6) NOT NULL,
  source      VARCHAR(20) NOT NULL DEFAULT 'BCV',
  fetched_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_rate_date_source (rate_date, source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payments
  ADD COLUMN currency_paid ENUM('USD', 'VES') NOT NULL DEFAULT 'USD' AFTER amount_paid,
  ADD COLUMN amount_paid_ves DECIMAL(18, 2) NULL AFTER currency_paid,
  ADD COLUMN exchange_rate DECIMAL(18, 6) NULL AFTER amount_paid_ves,
  ADD COLUMN rate_source ENUM('BCV', 'MANUAL') NULL AFTER exchange_rate;
