-- Soft-delete de clínicas (recuperable ~20 días)
SET NAMES utf8mb4;

ALTER TABLE clinics
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_active;

