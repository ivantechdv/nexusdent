-- Usuarios de prueba por clínica + limpiar membresías de SUPERADMIN (modo plataforma)
SET NAMES utf8mb4;

-- ADMIN solo Demo
INSERT IGNORE INTO users (id, role_id, full_name, specialty, email, password_hash, phone, is_active)
SELECT
  'a1000000-0000-4000-8000-000000000010',
  r.id,
  'Admin Demo',
  NULL,
  'demo@nexusdent.local',
  '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
  NULL,
  1
FROM roles r WHERE r.name = 'ADMIN' LIMIT 1;

INSERT IGNORE INTO clinic_memberships (id, clinic_id, user_id, role_id, is_active)
SELECT
  UUID(),
  'c1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000010',
  u.role_id,
  1
FROM users u
WHERE u.id = 'a1000000-0000-4000-8000-000000000010';

-- ADMIN alias Piloto (además de admin@)
INSERT IGNORE INTO users (id, role_id, full_name, specialty, email, password_hash, phone, is_active)
SELECT
  'a1000000-0000-4000-8000-000000000011',
  r.id,
  'Admin Piloto',
  NULL,
  'piloto@nexusdent.local',
  '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
  NULL,
  1
FROM roles r WHERE r.name = 'ADMIN' LIMIT 1;

INSERT IGNORE INTO clinic_memberships (id, clinic_id, user_id, role_id, is_active)
SELECT
  UUID(),
  'c1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000011',
  u.role_id,
  1
FROM users u
WHERE u.id = 'a1000000-0000-4000-8000-000000000011';

-- Usuario multi-clínica (Piloto + Demo) para probar selector
INSERT IGNORE INTO users (id, role_id, full_name, specialty, email, password_hash, phone, is_active)
SELECT
  'a1000000-0000-4000-8000-000000000012',
  r.id,
  'Admin Multi Clínica',
  NULL,
  'multi@nexusdent.local',
  '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
  NULL,
  1
FROM roles r WHERE r.name = 'ADMIN' LIMIT 1;

INSERT IGNORE INTO clinic_memberships (id, clinic_id, user_id, role_id, is_active)
SELECT UUID(), 'c1000000-0000-4000-8000-000000000001', u.id, u.role_id, 1
FROM users u WHERE u.id = 'a1000000-0000-4000-8000-000000000012';

INSERT IGNORE INTO clinic_memberships (id, clinic_id, user_id, role_id, is_active)
SELECT UUID(), 'c1000000-0000-4000-8000-000000000002', u.id, u.role_id, 1
FROM users u WHERE u.id = 'a1000000-0000-4000-8000-000000000012';

-- SUPERADMIN: sin membresías (entra a plataforma sin elegir clínica)
DELETE cm FROM clinic_memberships cm
INNER JOIN users u ON u.id = cm.user_id
INNER JOIN roles r ON r.id = u.role_id
WHERE r.name = 'SUPERADMIN';
