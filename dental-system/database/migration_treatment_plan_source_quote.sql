-- Vincula el cobro de la atención con el presupuesto que lo originó

ALTER TABLE treatment_plans
  ADD COLUMN source_quote_id CHAR(36) NULL AFTER kind;

ALTER TABLE treatment_plans
  ADD KEY idx_plans_source_quote (source_quote_id);
