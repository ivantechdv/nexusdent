# NexusDent — checklist técnico (roadmap)

## Hecho en este ciclo
- [x] WhatsApp soporte → `+584121809294` (`frontend/src/config/support.ts`)
- [x] WhatsApp con texto prearmado (pacientes + agenda)
- [x] APIs alineadas a `PermissionGuard` (pacientes, agenda, billing, tratamientos, categorías, uploads, clínico, odontograma, dashboard, FX, dentists)

## Siguiente (Fase A)
- [ ] PDF recibo / bitácora (`printAttentionDays.ts` + lib PDF)
- [ ] Plantilla print cobro (`print-templates` docType nuevo)
- [ ] Pantalla Caja del día (`/caja` + `billing` list by date)

## Luego (Fase B/C)
- [ ] WhatsApp Business API (automático)
- [ ] Uploads por `clinic_id` en path
- [ ] FX manual override admin
- [ ] Soft-delete / archivo pacientes
