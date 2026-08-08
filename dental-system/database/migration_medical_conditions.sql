-- Antecedentes libres (enfermedades / alergias separadas por coma)
ALTER TABLE patients
  ADD COLUMN medical_conditions TEXT NULL
    COMMENT 'Enfermedades/alergias separadas por coma'
    AFTER anamnesis_notes;
