import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';

export type ErrorSource = 'backend' | 'frontend';
export type ErrorLevel = 'error' | 'warn' | 'info';

export interface RecordErrorInput {
  source: ErrorSource;
  level?: ErrorLevel;
  message: string;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  clinicId?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface RecordMetricInput {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  userId?: string | null;
  clinicId?: string | null;
}

function clinicFilter(clinicId?: string | null) {
  if (!clinicId) return { sql: '', params: {} as Record<string, string> };
  // Incluye filas con clinic_id explícito + histórico sin tag
  // de usuarios que solo pertenecen a esa clínica
  return {
    sql: `AND (
      clinic_id = :clinicId
      OR (
        clinic_id IS NULL
        AND user_id IN (
          SELECT t.user_id FROM (
            SELECT cm.user_id
            FROM clinic_memberships cm
            WHERE cm.is_active = 1
            GROUP BY cm.user_id
            HAVING COUNT(*) = 1 AND MIN(cm.clinic_id) = :clinicId
          ) t
        )
      )
    )`,
    params: { clinicId },
  };
}

export class MonitoringService {
  async recordError(input: RecordErrorInput): Promise<void> {
    const message = (input.message || 'Error').slice(0, 500);
    try {
      await dbPool.query<ResultSetHeader>(
        `INSERT INTO app_errors
           (id, source, level, message, stack, route, method, status_code,
            user_id, clinic_id, user_agent, meta_json)
         VALUES
           (:id, :source, :level, :message, :stack, :route, :method, :statusCode,
            :userId, :clinicId, :userAgent, :metaJson)`,
        {
          id: uuidv4(),
          source: input.source,
          level: input.level ?? 'error',
          message,
          stack: input.stack?.slice(0, 8000) ?? null,
          route: input.route?.slice(0, 255) ?? null,
          method: input.method?.slice(0, 10) ?? null,
          statusCode: input.statusCode ?? null,
          userId: input.userId ?? null,
          clinicId: input.clinicId ?? null,
          userAgent: input.userAgent?.slice(0, 400) ?? null,
          metaJson: input.meta ? JSON.stringify(input.meta) : null,
        },
      );
    } catch (err) {
      console.error('[monitoring] recordError failed', err);
    }
  }

  async recordMetric(input: RecordMetricInput): Promise<void> {
    try {
      await dbPool.query<ResultSetHeader>(
        `INSERT INTO app_request_metrics
           (method, route, status_code, duration_ms, user_id, clinic_id)
         VALUES
           (:method, :route, :statusCode, :durationMs, :userId, :clinicId)`,
        {
          method: input.method.slice(0, 10),
          route: input.route.slice(0, 255),
          statusCode: input.statusCode,
          durationMs: Math.max(0, Math.min(input.durationMs, 120_000)),
          userId: input.userId ?? null,
          clinicId: input.clinicId ?? null,
        },
      );
    } catch (err) {
      console.error('[monitoring] recordMetric failed', err);
    }
  }

  async getSummary(hours = 24, clinicId?: string | null) {
    const h = Math.min(Math.max(hours, 1), 168);
    const cf = clinicFilter(clinicId);
    const params = { h, ...cf.params };

    const [kpi] = await dbPool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM app_errors
            WHERE created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}) AS errorsTotal,
         (SELECT COUNT(*) FROM app_errors
            WHERE source = 'frontend'
              AND created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}) AS errorsFrontend,
         (SELECT COUNT(*) FROM app_errors
            WHERE source = 'backend'
              AND created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}) AS errorsBackend,
         (SELECT COUNT(*) FROM app_request_metrics
            WHERE created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}) AS requestsTotal,
         (SELECT COUNT(*) FROM app_request_metrics
            WHERE status_code >= 500
              AND created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}) AS requests5xx,
         (SELECT COUNT(*) FROM app_request_metrics
            WHERE status_code >= 400 AND status_code < 500
              AND created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}) AS requests4xx,
         (SELECT ROUND(AVG(duration_ms)) FROM app_request_metrics
            WHERE created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}) AS avgMs`,
      params,
    );

    const [p95] = await dbPool.query<RowDataPacket[]>(
      `SELECT ROUND(duration_ms) AS p95Ms FROM (
         SELECT duration_ms,
                PERCENT_RANK() OVER (ORDER BY duration_ms) AS pct
         FROM app_request_metrics
         WHERE created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}
       ) t
       WHERE pct >= 0.95
       ORDER BY pct ASC
       LIMIT 1`,
      params,
    );

    const row = kpi[0] ?? {};
    return {
      hours: h,
      clinicId: clinicId ?? null,
      errorsTotal: Number(row.errorsTotal ?? 0),
      errorsFrontend: Number(row.errorsFrontend ?? 0),
      errorsBackend: Number(row.errorsBackend ?? 0),
      requestsTotal: Number(row.requestsTotal ?? 0),
      requests5xx: Number(row.requests5xx ?? 0),
      requests4xx: Number(row.requests4xx ?? 0),
      avgMs: Number(row.avgMs ?? 0),
      p95Ms: Number(p95[0]?.p95Ms ?? row.avgMs ?? 0),
    };
  }

  async getLatencySeries(hours = 24, clinicId?: string | null) {
    const h = Math.min(Math.max(hours, 1), 168);
    const cf = clinicFilter(clinicId);
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT
         DATE_FORMAT(created_at, '%Y-%m-%d %H:00') AS bucket,
         ROUND(AVG(duration_ms)) AS avgMs,
         ROUND(MAX(duration_ms)) AS maxMs,
         COUNT(*) AS requests
       FROM app_request_metrics
       WHERE created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}
       GROUP BY bucket
       ORDER BY bucket ASC`,
      { h, ...cf.params },
    );
    return rows.map((r) => ({
      bucket: String(r.bucket),
      avgMs: Number(r.avgMs ?? 0),
      maxMs: Number(r.maxMs ?? 0),
      requests: Number(r.requests ?? 0),
    }));
  }

  async getErrorSeries(hours = 24, clinicId?: string | null) {
    const h = Math.min(Math.max(hours, 1), 168);
    const cf = clinicFilter(clinicId);
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT
         DATE_FORMAT(created_at, '%Y-%m-%d %H:00') AS bucket,
         source,
         COUNT(*) AS total
       FROM app_errors
       WHERE created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}
       GROUP BY bucket, source
       ORDER BY bucket ASC`,
      { h, ...cf.params },
    );
    return rows.map((r) => ({
      bucket: String(r.bucket),
      source: String(r.source),
      total: Number(r.total ?? 0),
    }));
  }

  async getSlowRoutes(hours = 24, limit = 10, clinicId?: string | null) {
    const h = Math.min(Math.max(hours, 1), 168);
    const cf = clinicFilter(clinicId);
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT route, method,
              ROUND(AVG(duration_ms)) AS avgMs,
              ROUND(MAX(duration_ms)) AS maxMs,
              COUNT(*) AS hits
       FROM app_request_metrics
       WHERE created_at >= NOW() - INTERVAL :h HOUR ${cf.sql}
       GROUP BY route, method
       HAVING hits >= 1
       ORDER BY avgMs DESC
       LIMIT :limit`,
      { h, limit, ...cf.params },
    );
    return rows.map((r) => ({
      route: String(r.route),
      method: String(r.method),
      avgMs: Number(r.avgMs ?? 0),
      maxMs: Number(r.maxMs ?? 0),
      hits: Number(r.hits ?? 0),
    }));
  }

  async listErrors(opts: {
    hours?: number;
    limit?: number;
    source?: string;
    clinicId?: string | null;
  }) {
    const h = Math.min(Math.max(opts.hours ?? 24, 1), 168);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const cf = clinicFilter(opts.clinicId);
    const params: Record<string, string | number> = { h, limit, ...cf.params };
    let sourceClause = '';
    if (opts.source === 'backend' || opts.source === 'frontend') {
      sourceClause = 'AND source = :source';
      params.source = opts.source;
    }
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id, source, level, message, stack, route, method, status_code,
              user_id, clinic_id, user_agent, meta_json, created_at
       FROM app_errors
       WHERE created_at >= NOW() - INTERVAL :h HOUR
       ${cf.sql}
       ${sourceClause}
       ORDER BY created_at DESC
       LIMIT :limit`,
      params,
    );
    return rows.map((r) => ({
      id: String(r.id),
      source: r.source as ErrorSource,
      level: r.level as ErrorLevel,
      message: String(r.message),
      stack: r.stack ? String(r.stack) : null,
      route: r.route ? String(r.route) : null,
      method: r.method ? String(r.method) : null,
      statusCode: r.status_code != null ? Number(r.status_code) : null,
      userId: r.user_id ? String(r.user_id) : null,
      clinicId: r.clinic_id ? String(r.clinic_id) : null,
      userAgent: r.user_agent ? String(r.user_agent) : null,
      meta: r.meta_json
        ? typeof r.meta_json === 'string'
          ? JSON.parse(r.meta_json)
          : r.meta_json
        : null,
      createdAt: r.created_at,
    }));
  }

  async getByUser(hours = 24, clinicId?: string | null) {
    const h = Math.min(Math.max(hours, 1), 168);

    if (clinicId) {
      const [rows] = await dbPool.query<RowDataPacket[]>(
        `SELECT
           u.id AS userId,
           u.full_name AS fullName,
           u.email AS email,
           r.name AS role,
           COUNT(m.id) AS requests,
           SUM(CASE WHEN m.status_code >= 500 THEN 1 ELSE 0 END) AS requests5xx,
           SUM(CASE WHEN m.status_code >= 400 AND m.status_code < 500 THEN 1 ELSE 0 END) AS requests4xx,
           ROUND(AVG(m.duration_ms)) AS avgMs,
           COALESCE((
             SELECT COUNT(*) FROM app_errors e
             WHERE e.user_id = u.id
               AND e.created_at >= NOW() - INTERVAL :h HOUR
               AND (
                 e.clinic_id = :clinicId
                 OR (
                   e.clinic_id IS NULL
                   AND e.user_id IN (
                     SELECT t.user_id FROM (
                       SELECT cm2.user_id
                       FROM clinic_memberships cm2
                       WHERE cm2.is_active = 1
                       GROUP BY cm2.user_id
                       HAVING COUNT(*) = 1 AND MIN(cm2.clinic_id) = :clinicId
                     ) t
                   )
                 )
               )
           ), 0) AS errors
         FROM clinic_memberships cm
         INNER JOIN users u ON u.id = cm.user_id
         INNER JOIN roles r ON r.id = cm.role_id
         LEFT JOIN app_request_metrics m
           ON m.user_id = u.id
          AND m.created_at >= NOW() - INTERVAL :h HOUR
          AND (
            m.clinic_id = :clinicId
            OR (
              m.clinic_id IS NULL
              AND m.user_id IN (
                SELECT t2.user_id FROM (
                  SELECT cm3.user_id
                  FROM clinic_memberships cm3
                  WHERE cm3.is_active = 1
                  GROUP BY cm3.user_id
                  HAVING COUNT(*) = 1 AND MIN(cm3.clinic_id) = :clinicId
                ) t2
              )
            )
          )
         WHERE cm.clinic_id = :clinicId
           AND cm.is_active = 1
           AND r.name <> 'SUPERADMIN'
         GROUP BY u.id, u.full_name, u.email, r.name
         ORDER BY requests DESC, fullName ASC`,
        { h, clinicId },
      );

      return rows.map((r) => ({
        userId: String(r.userId),
        fullName: String(r.fullName),
        email: String(r.email),
        role: String(r.role),
        requests: Number(r.requests ?? 0),
        requests5xx: Number(r.requests5xx ?? 0),
        requests4xx: Number(r.requests4xx ?? 0),
        avgMs: Number(r.avgMs ?? 0),
        errors: Number(r.errors ?? 0),
      }));
    }

    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT
         u.id AS userId,
         u.full_name AS fullName,
         u.email AS email,
         r.name AS role,
         COUNT(m.id) AS requests,
         SUM(CASE WHEN m.status_code >= 500 THEN 1 ELSE 0 END) AS requests5xx,
         SUM(CASE WHEN m.status_code >= 400 AND m.status_code < 500 THEN 1 ELSE 0 END) AS requests4xx,
         ROUND(AVG(m.duration_ms)) AS avgMs,
         COALESCE((
           SELECT COUNT(*) FROM app_errors e
           WHERE e.user_id = u.id
             AND e.created_at >= NOW() - INTERVAL :h HOUR
         ), 0) AS errors
       FROM app_request_metrics m
       INNER JOIN users u ON u.id = m.user_id
       INNER JOIN roles r ON r.id = u.role_id
       WHERE m.created_at >= NOW() - INTERVAL :h HOUR
         AND m.user_id IS NOT NULL
       GROUP BY u.id, u.full_name, u.email, r.name
       ORDER BY requests DESC, fullName ASC
       LIMIT 40`,
      { h },
    );

    return rows.map((r) => ({
      userId: String(r.userId),
      fullName: String(r.fullName),
      email: String(r.email),
      role: String(r.role),
      requests: Number(r.requests ?? 0),
      requests5xx: Number(r.requests5xx ?? 0),
      requests4xx: Number(r.requests4xx ?? 0),
      avgMs: Number(r.avgMs ?? 0),
      errors: Number(r.errors ?? 0),
    }));
  }

  async pruneOld(): Promise<void> {
    try {
      await dbPool.query(
        `DELETE FROM app_request_metrics WHERE created_at < NOW() - INTERVAL 14 DAY`,
      );
      await dbPool.query(
        `DELETE FROM app_errors WHERE created_at < NOW() - INTERVAL 30 DAY`,
      );
    } catch {
      /* ignore */
    }
  }
}

export const monitoringService = new MonitoringService();
