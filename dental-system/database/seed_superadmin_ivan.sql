-- Superadmin único + limpieza de cuentas demo
SET NAMES utf8mb4;

-- 1) Upsert SUPERADMIN: ing.ivanrojas@gmail.com
INSERT INTO users (
  id, role_id, full_name, specialty, email, password_hash, phone, is_active, must_change_password
)
SELECT
  'a1000000-0000-4000-8000-000000000099',
  r.id,
  'Ivan Rojas',
  'Ingeniería',
  'ing.ivanrojas@gmail.com',
  '$2a$10$OG0muaXoQ6WI5AKPDPhFOenyRcYH1pckbpMmTbK3xny/zKaNnMlSq',
  NULL,
  1,
  0
FROM roles r
WHERE r.name = 'SUPERADMIN'
LIMIT 1
ON DUPLICATE KEY UPDATE
  role_id = VALUES(role_id),
  full_name = VALUES(full_name),
  specialty = VALUES(specialty),
  email = VALUES(email),
  password_hash = VALUES(password_hash),
  is_active = 1,
  must_change_password = 0;

-- Si el id seed ya existe con otro email, o el correo ya está en otra fila:
UPDATE users u
INNER JOIN roles r ON r.id = u.role_id AND r.name = 'SUPERADMIN'
SET
  u.email = 'ing.ivanrojas@gmail.com',
  u.full_name = 'Ivan Rojas',
  u.password_hash = '$2a$10$OG0muaXoQ6WI5AKPDPhFOenyRcYH1pckbpMmTbK3xny/zKaNnMlSq',
  u.is_active = 1,
  u.must_change_password = 0
WHERE u.id = 'a1000000-0000-4000-8000-000000000099'
   OR u.email IN (
     'superadmin@nexusdent.local',
     'ing.ivanrojas@gmail.com'
   );

-- Por si el correo ya existía en otro usuario (sin id seed): promover a SUPERADMIN
UPDATE users u
INNER JOIN roles rsuper ON rsuper.name = 'SUPERADMIN'
SET
  u.role_id = rsuper.id,
  u.full_name = COALESCE(NULLIF(u.full_name, ''), 'Ivan Rojas'),
  u.password_hash = '$2a$10$OG0muaXoQ6WI5AKPDPhFOenyRcYH1pckbpMmTbK3xny/zKaNnMlSq',
  u.is_active = 1,
  u.must_change_password = 0
WHERE LOWER(u.email) = 'ing.ivanrojas@gmail.com';

-- SUPERADMIN sin membresías (entra en modo plataforma)
DELETE cm FROM clinic_memberships cm
INNER JOIN users u ON u.id = cm.user_id
INNER JOIN roles r ON r.id = u.role_id
WHERE r.name = 'SUPERADMIN';

-- 2) Borrar usuarios demo / piloto / multi / superadmin local
DELETE cm FROM clinic_memberships cm
INNER JOIN users u ON u.id = cm.user_id
WHERE LOWER(u.email) IN (
  'piloto@nexusdent.local',
  'demo@nexusdent.local',
  'multi@nexusdent.local',
  'superadmin@nexusdent.local',
  'admin@nexusdent.local',
  'dentist@nexusdent.local',
  'recepcion@nexusdent.local'
);

-- Limpiar FKs blandas hacia esos usuarios antes de borrarlos
UPDATE appointments SET dentist_id = (
  SELECT id FROM users WHERE email = 'ing.ivanrojas@gmail.com' LIMIT 1
)
WHERE dentist_id IN (
  SELECT id FROM (
    SELECT id FROM users WHERE LOWER(email) IN (
      'piloto@nexusdent.local',
      'demo@nexusdent.local',
      'multi@nexusdent.local',
      'superadmin@nexusdent.local',
      'admin@nexusdent.local',
      'dentist@nexusdent.local',
      'recepcion@nexusdent.local'
    )
  ) t
);

UPDATE clinical_records SET dentist_id = (
  SELECT id FROM users WHERE email = 'ing.ivanrojas@gmail.com' LIMIT 1
)
WHERE dentist_id IN (
  SELECT id FROM (
    SELECT id FROM users WHERE LOWER(email) IN (
      'piloto@nexusdent.local',
      'demo@nexusdent.local',
      'multi@nexusdent.local',
      'superadmin@nexusdent.local',
      'admin@nexusdent.local',
      'dentist@nexusdent.local',
      'recepcion@nexusdent.local'
    )
  ) t
);

UPDATE treatment_plans SET created_by = NULL
WHERE created_by IN (
  SELECT id FROM (
    SELECT id FROM users WHERE LOWER(email) IN (
      'piloto@nexusdent.local',
      'demo@nexusdent.local',
      'multi@nexusdent.local',
      'superadmin@nexusdent.local',
      'admin@nexusdent.local',
      'dentist@nexusdent.local',
      'recepcion@nexusdent.local'
    )
  ) t
);

UPDATE payments SET received_by = NULL
WHERE received_by IN (
  SELECT id FROM (
    SELECT id FROM users WHERE LOWER(email) IN (
      'piloto@nexusdent.local',
      'demo@nexusdent.local',
      'multi@nexusdent.local',
      'superadmin@nexusdent.local',
      'admin@nexusdent.local',
      'dentist@nexusdent.local',
      'recepcion@nexusdent.local'
    )
  ) t
);

DELETE FROM users
WHERE LOWER(email) IN (
  'piloto@nexusdent.local',
  'demo@nexusdent.local',
  'multi@nexusdent.local',
  'superadmin@nexusdent.local',
  'admin@nexusdent.local',
  'dentist@nexusdent.local',
  'recepcion@nexusdent.local'
)
AND LOWER(email) <> 'ing.ivanrojas@gmail.com';

-- Verificación
SELECT u.email, r.name AS role, u.is_active
FROM users u
INNER JOIN roles r ON r.id = u.role_id
WHERE r.name = 'SUPERADMIN' OR LOWER(u.email) LIKE '%nexusdent.local%'
ORDER BY r.name, u.email;
