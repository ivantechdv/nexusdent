-- Separa cotizaciones (QUOTE) del cobro generado en atención (VISIT)

ALTER TABLE treatment_plans
  ADD COLUMN kind ENUM('QUOTE', 'VISIT') NOT NULL DEFAULT 'VISIT' AFTER quote_code;

UPDATE treatment_plans
SET kind = 'QUOTE'
WHERE IFNULL(notes, '') NOT LIKE '%atención%'
  AND IFNULL(notes, '') NOT LIKE '%atencion%'
  AND IFNULL(title, '') NOT LIKE 'Atención %'
  AND IFNULL(title, '') NOT LIKE 'Atencion %';

UPDATE treatment_plans
SET quote_code = NULL
WHERE kind = 'VISIT';
