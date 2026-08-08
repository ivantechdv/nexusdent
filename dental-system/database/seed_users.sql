-- Seed incremental (si ya aplicaste migration.sql sin usuarios)
-- Password de todos: Admin123!

USE dental_erp;

INSERT IGNORE INTO users (id, role_id, full_name, specialty, email, password_hash, phone) VALUES
  ('a1000000-0000-4000-8000-000000000001', 1, 'Admin NexusDent', NULL,
   'admin@nexusdent.local',
   '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
   '+1 809 000 0001'),
  ('a1000000-0000-4000-8000-000000000002', 2, 'Dra. Ana Quintero', 'Odontología General',
   'dentist@nexusdent.local',
   '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
   '+1 809 000 0002'),
  ('a1000000-0000-4000-8000-000000000003', 3, 'Luis Recepción', NULL,
   'recepcion@nexusdent.local',
   '$2a$10$ev4EiBtKnflJzqEoK/Mun.yAWi4NsWLT/axwssPNSQhy72n0qakDC',
   '+1 809 000 0003');

INSERT IGNORE INTO patients (
  id, document_id, full_name, birth_date, gender, phone, email,
  emergency_contact, emergency_phone,
  allergy_penicillin, has_hypertension, anamnesis_notes
) VALUES (
  'b2000000-0000-4000-8000-000000000001',
  '00123456789',
  'María Elena Vargas Ruiz',
  '1988-03-14',
  'F',
  '+1 809 555 0142',
  'maria.vargas@email.com',
  'Carlos Vargas',
  '+1 809 555 0199',
  1, 1,
  'Última PA 140/90. Evitar AINES prolongados.'
);
