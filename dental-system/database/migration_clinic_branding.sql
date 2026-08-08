-- Branding y contacto de clínica (Mi clínica)
ALTER TABLE clinics
  ADD COLUMN logo_url VARCHAR(500) NULL AFTER slug,
  ADD COLUMN email VARCHAR(180) NULL AFTER logo_url,
  ADD COLUMN whatsapp VARCHAR(40) NULL AFTER email,
  ADD COLUMN facebook_url VARCHAR(300) NULL AFTER whatsapp,
  ADD COLUMN instagram_url VARCHAR(300) NULL AFTER facebook_url,
  ADD COLUMN theme_primary VARCHAR(20) NULL DEFAULT '#1e3a8a' AFTER instagram_url,
  ADD COLUMN address VARCHAR(255) NULL AFTER theme_primary;
