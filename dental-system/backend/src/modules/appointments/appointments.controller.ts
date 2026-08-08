import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { getErrorStatus, sendError } from '../../utils/http';
import { appointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './appointments.types';

export class AppointmentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await appointmentsService.list(clinicId, {
        from: typeof req.query.from === 'string' ? req.query.from : undefined,
        to: typeof req.query.to === 'string' ? req.query.to : undefined,
        dentistId:
          typeof req.query.dentistId === 'string' ? req.query.dentistId : undefined,
        patientId:
          typeof req.query.patientId === 'string' ? req.query.patientId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
      });
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await appointmentsService.getById(clinicId, req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await appointmentsService.create(
        clinicId,
        req.body as CreateAppointmentDto,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await appointmentsService.update(
        clinicId,
        req.params.id,
        req.body as UpdateAppointmentDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async publicConfirm(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await appointmentsService.respondByToken(
        req.params.token,
        'confirm',
      );
      res
        .type('html')
        .send(publicResultHtml('Cita confirmada', data, 'confirm'));
    } catch (err) {
      if (wantsHtml(req)) {
        res.status(statusFromErr(err)).type('html').send(publicErrorHtml(err));
        return;
      }
      if (!sendError(res, err)) next(err);
    }
  }

  async publicCancel(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await appointmentsService.respondByToken(
        req.params.token,
        'cancel',
      );
      res
        .type('html')
        .send(publicResultHtml('Cita cancelada', data, 'cancel'));
    } catch (err) {
      if (wantsHtml(req)) {
        res.status(statusFromErr(err)).type('html').send(publicErrorHtml(err));
        return;
      }
      if (!sendError(res, err)) next(err);
    }
  }
}

function wantsHtml(req: Request) {
  const accept = req.get('accept') ?? '';
  return accept.includes('text/html') || !accept.includes('application/json');
}

function statusFromErr(err: unknown): number {
  return getErrorStatus(err);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-VE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function publicResultHtml(
  title: string,
  data: {
    patientName: string;
    clinicName: string;
    scheduledAt: string;
    dentistName: string;
    status: string;
  },
  action: 'confirm' | 'cancel',
): string {
  const accent = action === 'confirm' ? '#166534' : '#991b1b';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>${escapeHtml(title)} · NexusDent</title></head>
<body style="margin:0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f6f8;color:#1a1a1a;">
  <div style="max-width:480px;margin:48px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
    <p style="margin:0 0 8px;color:#1e3a8a;font-weight:700;">NexusDent</p>
    <h1 style="margin:0 0 12px;font-size:22px;color:${accent};">${escapeHtml(title)}</h1>
    <p style="line-height:1.6;color:#334155;">
      <strong>${escapeHtml(data.patientName)}</strong><br/>
      ${escapeHtml(data.clinicName)} · ${escapeHtml(formatLabel(data.scheduledAt))}<br/>
      Odontólogo: ${escapeHtml(data.dentistName)}
    </p>
    <p style="color:#64748b;font-size:14px;">Ya podés cerrar esta ventana.</p>
  </div>
</body></html>`;
}

function publicErrorHtml(err: unknown): string {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : 'No se pudo procesar el enlace';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>Enlace no válido · NexusDent</title></head>
<body style="margin:0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f6f8;">
  <div style="max-width:480px;margin:48px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
    <p style="margin:0 0 8px;color:#1e3a8a;font-weight:700;">NexusDent</p>
    <h1 style="margin:0 0 12px;font-size:22px;">No se pudo completar</h1>
    <p style="color:#334155;">${escapeHtml(message)}</p>
  </div>
</body></html>`;
}

export const appointmentsController = new AppointmentsController();
