import { createHash } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { dbPool } from '../config';

type IdemRow = RowDataPacket & {
  response_status: number;
  response_body: string;
};

/**
 * Idempotencia por header `Idempotency-Key`.
 * Requiere AuthGuard previo (usa req.user.sub).
 */
export function idempotency(routeKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.header('Idempotency-Key')?.trim();
    if (!raw) {
      next();
      return;
    }
    if (raw.length < 8 || raw.length > 128) {
      res.status(400).json({ message: 'Idempotency-Key inválida' });
      return;
    }

    const userId = req.user?.sub ?? 'anon';
    const keyHash = createHash('sha256')
      .update(`${userId}:${routeKey}:${raw}`)
      .digest('hex');

    try {
      const [existing] = await dbPool.query<IdemRow[]>(
        `SELECT response_status, response_body
         FROM idempotency_keys
         WHERE key_hash = :keyHash
         LIMIT 1`,
        { keyHash },
      );

      if (existing[0]) {
        const body =
          typeof existing[0].response_body === 'string'
            ? JSON.parse(existing[0].response_body)
            : existing[0].response_body;
        res.status(existing[0].response_status).json(body);
        return;
      }

      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        const status = res.statusCode || 200;
        if (status >= 200 && status < 300) {
          void dbPool
            .query<ResultSetHeader>(
              `INSERT IGNORE INTO idempotency_keys
                 (key_hash, user_id, route_key, response_status, response_body)
               VALUES
                 (:keyHash, :userId, :routeKey, :status, :body)`,
              {
                keyHash,
                userId,
                routeKey,
                status,
                body: JSON.stringify(body),
              },
            )
            .catch((err) => console.error('[idempotency] store failed', err));
        }
        return originalJson(body);
      }) as Response['json'];

      next();
    } catch (err) {
      // Si la tabla aún no existe, no bloquear el flujo
      console.error('[idempotency]', err);
      next();
    }
  };
}
