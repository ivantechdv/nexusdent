import fs from 'fs';
import './config/env';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import patientsRoutes from './modules/patients/patients.routes';
import categoriesRoutes from './modules/categories/categories.routes';
import treatmentsRoutes from './modules/treatments/treatments.routes';
import appointmentsRoutes from './modules/appointments/appointments.routes';
import billingRoutes from './modules/billing/billing.routes';
import exchangeRateRoutes from './modules/exchange-rate/exchange-rate.routes';
import odontogramRoutes from './modules/odontogram/odontogram.routes';
import clinicalRecordsRoutes from './modules/clinical-records/clinical-records.routes';
import visitsRoutes from './modules/visits/visits.routes';
import uploadsRoutes, { uploadDir } from './modules/uploads/uploads.routes';
import monitoringRoutes from './modules/monitoring/monitoring.routes';
import clinicsRoutes from './modules/clinics/clinics.routes';
import clinicSettingsRoutes from './modules/clinic-settings/clinic-settings.routes';
import printTemplatesRoutes from './modules/print-templates/print-templates.routes';
import staffRoutes from './modules/staff/staff.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import { generalLimiter } from './middlewares/rate-limit';
import { requestMetricsMiddleware } from './middlewares/request-metrics';
import { monitoringService } from './modules/monitoring/monitoring.service';
import { isMailConfigured } from './utils/mail';
import { startAppointmentReminderScheduler } from './jobs/appointment-reminders';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const isProd = process.env.NODE_ENV === 'production';

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

const allowedOrigins = isProd
  ? [corsOrigin]
  : [corsOrigin, 'http://localhost:5173', 'http://localhost:5174'];

app.use(
  cors({
    origin: allowedOrigins,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(generalLimiter);
app.use(requestMetricsMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dental-erp-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/clinics', clinicsRoutes);
app.use('/api/clinic-settings', clinicSettingsRoutes);
app.use('/api/print-templates', printTemplatesRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/treatments', treatmentsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/exchange-rate', exchangeRateRoutes);
app.use('/api/odontogram', odontogramRoutes);
app.use('/api/clinical-records', clinicalRecordsRoutes);
app.use('/api/visits', visitsRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/monitoring', monitoringRoutes);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Error]', err);
  void monitoringService.recordError({
    source: 'backend',
    level: 'error',
    message: err.message || 'Error interno',
    stack: err.stack ?? null,
    route: req.originalUrl?.split('?')[0] ?? req.path,
    method: req.method,
    statusCode: 500,
    userId: req.user?.sub ?? null,
    clinicId: req.user?.clinicId ?? null,
    userAgent: req.get('user-agent') ?? null,
  });
  const msg = err.message?.includes('archivo')
    ? err.message
    : 'Error interno del servidor';
  res.status(500).json({ message: msg });
});

setInterval(() => {
  void monitoringService.pruneOld();
}, 6 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Dental ERP API escuchando en http://localhost:${PORT}`);
  console.log(
    `Email (Resend): ${isMailConfigured() ? 'configurado' : 'sin API key'}`,
  );
  startAppointmentReminderScheduler();
});
