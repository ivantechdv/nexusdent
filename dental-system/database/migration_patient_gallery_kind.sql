-- Tipo de imagen: galería clínica vs radiografía vinculada a atención
SET NAMES utf8mb4;

ALTER TABLE patient_gallery
  ADD COLUMN kind ENUM('GALLERY', 'RADIOGRAPH') NOT NULL DEFAULT 'GALLERY' AFTER patient_id,
  ADD COLUMN clinical_record_id CHAR(36) NULL AFTER kind,
  ADD KEY idx_gallery_kind (clinic_id, patient_id, kind),
  ADD KEY idx_gallery_record (clinical_record_id),
  ADD CONSTRAINT fk_gallery_record
    FOREIGN KEY (clinical_record_id) REFERENCES clinical_records (id) ON DELETE SET NULL;
