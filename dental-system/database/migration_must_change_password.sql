-- Forzar cambio de contraseña en primer ingreso
SET NAMES utf8mb4;

ALTER TABLE users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;
