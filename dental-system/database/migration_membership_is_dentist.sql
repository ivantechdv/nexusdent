-- Flag: el miembro también atiende como odontólogo (útil para ADMIN dueño)
SET NAMES utf8mb4;

ALTER TABLE clinic_memberships
  ADD COLUMN is_dentist TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;

UPDATE clinic_memberships cm
INNER JOIN roles r ON r.id = cm.role_id
SET cm.is_dentist = 1
WHERE r.name = 'DENTIST';
