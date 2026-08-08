-- Recordatorios de cita (email 2 días antes) + token de confirmación pública
ALTER TABLE appointments
  ADD COLUMN reminder_sent_at DATETIME NULL AFTER notes,
  ADD COLUMN confirm_token CHAR(36) NULL AFTER reminder_sent_at,
  ADD UNIQUE KEY uq_appointments_confirm_token (confirm_token),
  ADD KEY idx_appointments_reminder (scheduled_at, reminder_sent_at, status);
