-- Permisos personalizados por membresía (JSON array de permission keys)
SET NAMES utf8mb4;

ALTER TABLE clinic_memberships
  ADD COLUMN custom_permissions JSON NULL AFTER is_dentist;
