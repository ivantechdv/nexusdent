-- Presupuestos: código PRES-YYYY-NNN y estados Rechazado / Cancelado

ALTER TABLE treatment_plans
  MODIFY COLUMN status ENUM(
    'DRAFT',
    'APPROVED',
    'IN_PROGRESS',
    'CLOSED',
    'REJECTED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'DRAFT';

ALTER TABLE treatment_plans
  ADD COLUMN quote_code VARCHAR(32) NULL AFTER title;

ALTER TABLE treatment_plans
  ADD UNIQUE KEY uq_plans_clinic_quote (clinic_id, quote_code);

-- Códigos para presupuestos ya existentes
UPDATE treatment_plans tp
JOIN (
  SELECT id,
         CONCAT(
           'PRES-',
           YEAR(created_at),
           '-',
           LPAD(
             ROW_NUMBER() OVER (
               PARTITION BY clinic_id, YEAR(created_at)
               ORDER BY created_at, id
             ),
             3,
             '0'
           )
         ) AS code
  FROM treatment_plans
  WHERE quote_code IS NULL
) x ON tp.id = x.id
SET tp.quote_code = x.code;
