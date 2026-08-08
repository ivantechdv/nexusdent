import { Request, Response, NextFunction } from 'express';
import { monitoringService } from '../modules/monitoring/monitoring.service';

/** Normaliza path quitando UUIDs / números para agrupar métricas */
export function normalizeRoute(path: string): string {
  return path
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id',
    )
    .replace(/\/\d+/g, '/:id');
}

export function requestMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path === '/health' || req.path.startsWith('/api/monitoring')) {
    next();
    return;
  }

  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const route = normalizeRoute(req.originalUrl.split('?')[0] || req.path);
    void monitoringService
      .recordMetric({
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs,
        userId: req.user?.sub ?? null,
        clinicId: req.user?.clinicId ?? null,
      })
      .catch(() => undefined);

    if (res.statusCode >= 500) {
      void monitoringService
        .recordError({
          source: 'backend',
          level: 'error',
          message: `HTTP ${res.statusCode} ${req.method} ${route}`,
          route,
          method: req.method,
          statusCode: res.statusCode,
          userId: req.user?.sub ?? null,
          clinicId: req.user?.clinicId ?? null,
          userAgent: req.get('user-agent') ?? null,
          meta: { durationMs },
        })
        .catch(() => undefined);
    }
  });

  next();
}
