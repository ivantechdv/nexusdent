# NexusDent — Sistema de Gestión Clínica Odontológica

Monorepo feature-based (Dental ERP) con MySQL, Express/TypeScript y React/Vite.

## Estructura

```
dental-system/
├── database/migration.sql      # Esquema MySQL + seeds
├── database/seed_users.sql     # Seed incremental de usuarios/paciente
├── backend/                    # API Express por features
└── frontend/                   # React + Tailwind + TanStack Query + Zustand
```

## 1. Base de datos

```bash
mysql -u root -p < database/migration.sql
```

Si ya tenías el esquema sin usuarios:

```bash
mysql -u root -p < database/seed_users.sql
```

### Usuarios demo (password: `Admin123!`)

| Email | Rol |
|-------|-----|
| admin@nexusdent.local | ADMIN |
| dentist@nexusdent.local | DENTIST |
| recepcion@nexusdent.local | RECEPTIONIST |

Paciente demo: María Elena Vargas Ruiz · documento `00123456789`

## 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

API en `http://localhost:4000`

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login JWT |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/auth/dentists` | Odontólogos activos |
| GET/POST/PUT | `/api/patients` | CRUD pacientes |
| GET | `/api/patients/:id/balance` | Saldo deudor |
| GET/POST/PUT | `/api/treatments` | Catálogo de prestaciones |
| GET/POST/PATCH | `/api/appointments` | Agenda de citas |
| GET/POST | `/api/billing/plans` | Planes / presupuestos |
| POST | `/api/billing/payments` | Abonos / recibos |
| GET/PUT | `/api/odontogram/*` | Odontograma FDI |
| GET/POST | `/api/clinical-records/*` | Evoluciones clínicas |

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

UI en `http://localhost:5173`

- Login real (JWT)
- Pacientes + ficha clínica conectada a API
- Catálogo de tratamientos (prestaciones)
- Agenda de citas
- Planes de tratamiento + abonos

## Dominio clínico (glosario)

| Concepto | Qué es |
|----------|--------|
| **Tratamiento / prestación** | Ítem del catálogo tarifario (`treatment_catalog`) |
| **Plan de tratamiento** | Presupuesto con ítems para un paciente |
| **Evolución / proceso clínico** | Bitácora de lo hecho en sesión (`clinical_records`) |
| **Odontograma** | Estado de piezas FDI por cara |

## Paleta

- Ink / Deep: `#0f172a` / `#1e3a8a`
- Accent (CTA / alertas): `#f97316`
- Odontograma: Rojo requerido · Azul tratado · Negro ausente · Verde en proceso

## Roles

`ADMIN` · `DENTIST` · `RECEPTIONIST`
