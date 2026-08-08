import { NextFunction, Request, Response } from 'express';
import { sendError } from '../../utils/http';
import { monitoringService } from './monitoring.service';

function parseClinicId(req: Request): string | null {
  const q = req.query.clinicId;
  if (typeof q === 'string' && q.trim()) return q.trim();
  return null;
}

export class MonitoringController {
  async reportClient(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as {
        message?: string;
        stack?: string;
        route?: string;
        meta?: Record<string, unknown>;
        level?: 'error' | 'warn' | 'info';
      };
      if (!body.message?.trim()) {
        res.status(400).json({ message: 'message es obligatorio' });
        return;
      }
      await monitoringService.recordError({
        source: 'frontend',
        level: body.level ?? 'error',
        message: body.message.trim(),
        stack: body.stack ?? null,
        route: body.route ?? null,
        method: 'CLIENT',
        userId: req.user?.sub ?? null,
        clinicId: req.user?.clinicId ?? null,
        userAgent: req.get('user-agent') ?? null,
        meta: body.meta ?? null,
      });
      res.status(202).json({ ok: true });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const hours = Number(req.query.hours ?? 24);
      const data = await monitoringService.getSummary(hours, parseClinicId(req));
      res.json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async latency(req: Request, res: Response, next: NextFunction) {
    try {
      const hours = Number(req.query.hours ?? 24);
      const data = await monitoringService.getLatencySeries(
        hours,
        parseClinicId(req),
      );
      res.json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async errorSeries(req: Request, res: Response, next: NextFunction) {
    try {
      const hours = Number(req.query.hours ?? 24);
      const data = await monitoringService.getErrorSeries(
        hours,
        parseClinicId(req),
      );
      res.json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async slowRoutes(req: Request, res: Response, next: NextFunction) {
    try {
      const hours = Number(req.query.hours ?? 24);
      const data = await monitoringService.getSlowRoutes(
        hours,
        10,
        parseClinicId(req),
      );
      res.json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async errors(req: Request, res: Response, next: NextFunction) {
    try {
      const hours = Number(req.query.hours ?? 24);
      const limit = Number(req.query.limit ?? 50);
      const source =
        typeof req.query.source === 'string' ? req.query.source : undefined;
      const data = await monitoringService.listErrors({
        hours,
        limit,
        source,
        clinicId: parseClinicId(req),
      });
      res.json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async byUser(req: Request, res: Response, next: NextFunction) {
    try {
      const hours = Number(req.query.hours ?? 24);
      const data = await monitoringService.getByUser(
        hours,
        parseClinicId(req),
      );
      res.json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }
}

export const monitoringController = new MonitoringController();
