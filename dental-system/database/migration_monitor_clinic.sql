-- clinic_id en monitoreo
SET NAMES utf8mb4;

ALTER TABLE app_errors
  ADD COLUMN clinic_id CHAR(36) NULL AFTER user_id,
  ADD KEY idx_errors_clinic (clinic_id);

ALTER TABLE app_request_metrics
  ADD COLUMN clinic_id CHAR(36) NULL AFTER user_id,
  ADD KEY idx_metrics_clinic (clinic_id);
