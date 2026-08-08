-- Vincular evolución clínica con el plan/presupuesto del día
ALTER TABLE clinical_records
  ADD COLUMN treatment_plan_id CHAR(36) NULL AFTER appointment_id,
  ADD KEY idx_clinical_plan (treatment_plan_id),
  ADD CONSTRAINT fk_clinical_plan
    FOREIGN KEY (treatment_plan_id) REFERENCES treatment_plans (id)
    ON UPDATE CASCADE ON DELETE SET NULL;
