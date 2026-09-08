-- Campos específicos para estudios radiográficos
SET NAMES utf8mb4;

ALTER TABLE patient_gallery
  ADD COLUMN study_type ENUM(
    'PANORAMIC',
    'PERIAPICAL',
    'BITEWING',
    'CEPHALOMETRIC',
    'CBCT',
    'OTHER'
  ) NULL AFTER category,
  ADD COLUMN notes TEXT NULL AFTER title;
