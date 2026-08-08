-- Próxima cita generada al cerrar/editar una atención
ALTER TABLE clinical_records
  ADD COLUMN next_appointment_id CHAR(36) NULL AFTER appointment_id,
  ADD KEY idx_clinical_next_appt (next_appointment_id);

-- Backfill: continuación creada en el mismo instante que la atención
UPDATE clinical_records cr
INNER JOIN appointments a
  ON a.clinic_id = cr.clinic_id
 AND a.patient_id = cr.patient_id
 AND a.reason LIKE '%ontinuaci%'
 AND a.created_at BETWEEN TIMESTAMPADD(SECOND, -30, cr.signed_at)
                      AND TIMESTAMPADD(MINUTE, 2, cr.signed_at)
SET cr.next_appointment_id = a.id
WHERE cr.next_appointment_id IS NULL;
