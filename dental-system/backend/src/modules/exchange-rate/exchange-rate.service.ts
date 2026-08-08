import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { httpError } from '../../utils/http';

export type RateSource = 'BCV' | 'MANUAL';

export interface ExchangeRateDto {
  rate: number;
  rateDate: string;
  source: RateSource;
  fetchedAt: string;
  editable: true;
}

type RateRow = RowDataPacket & {
  id: string;
  rate_date: Date | string;
  rate: number | string;
  source: string;
  fetched_at: Date | string;
};

const DOLARAPI_BCV = 'https://ve.dolarapi.com/v1/dolares/oficial';
const MEMORY_TTL_MS = 15 * 60 * 1000;

let memoryCache: { at: number; data: ExchangeRateDto } | null = null;

function toDateStr(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mapRow(row: RateRow): ExchangeRateDto {
  return {
    rate: Number(row.rate),
    rateDate: toDateStr(row.rate_date),
    source: (row.source === 'MANUAL' ? 'MANUAL' : 'BCV') as RateSource,
    fetchedAt:
      row.fetched_at instanceof Date
        ? row.fetched_at.toISOString()
        : String(row.fetched_at),
    editable: true,
  };
}

async function readCached(rateDate: string): Promise<ExchangeRateDto | null> {
  const [rows] = await dbPool.query<RateRow[]>(
    `SELECT * FROM daily_exchange_rates
     WHERE rate_date = :rateDate AND source = 'BCV'
     LIMIT 1`,
    { rateDate },
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function upsertBcv(rateDate: string, rate: number): Promise<ExchangeRateDto> {
  const existing = await readCached(rateDate);
  if (existing) {
    await dbPool.query(
      `UPDATE daily_exchange_rates
       SET rate = :rate, fetched_at = CURRENT_TIMESTAMP
       WHERE rate_date = :rateDate AND source = 'BCV'`,
      { rate, rateDate },
    );
  } else {
    await dbPool.query(
      `INSERT INTO daily_exchange_rates (id, rate_date, rate, source)
       VALUES (:id, :rateDate, :rate, 'BCV')`,
      { id: uuidv4(), rateDate, rate },
    );
  }
  const saved = await readCached(rateDate);
  if (!saved) throw httpError('No se pudo guardar la tasa BCV', 500);
  return saved;
}

async function fetchFromDolarApi(): Promise<{ rate: number; rateDate: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(DOLARAPI_BCV, { signal: ctrl.signal });
    if (!res.ok) {
      throw httpError(`DolarAPI respondió ${res.status}`, 502);
    }
    const body = (await res.json()) as {
      promedio?: number | null;
      compra?: number | null;
      venta?: number | null;
      fechaActualizacion?: string;
    };
    const rate = Number(body.promedio ?? body.venta ?? body.compra ?? 0);
    if (!(rate > 0)) {
      throw httpError('Tasa BCV inválida desde DolarAPI', 502);
    }
    const rateDate = body.fechaActualizacion
      ? body.fechaActualizacion.slice(0, 10)
      : todayLocalDate();
    return { rate, rateDate };
  } finally {
    clearTimeout(timer);
  }
}

export class ExchangeRateService {
  async getTodayRate(forceRefresh = false): Promise<ExchangeRateDto> {
    const today = todayLocalDate();

    if (
      !forceRefresh &&
      memoryCache &&
      Date.now() - memoryCache.at < MEMORY_TTL_MS &&
      memoryCache.data.rateDate === today
    ) {
      return memoryCache.data;
    }

    if (!forceRefresh) {
      const cached = await readCached(today);
      if (cached) {
        memoryCache = { at: Date.now(), data: cached };
        return cached;
      }
    }

    try {
      const remote = await fetchFromDolarApi();
      const saved = await upsertBcv(remote.rateDate, remote.rate);
      memoryCache = { at: Date.now(), data: saved };
      return saved;
    } catch (err) {
      const fallback =
        (await readCached(today)) ??
        (await this.latestAny());
      if (fallback) {
        memoryCache = { at: Date.now(), data: fallback };
        return fallback;
      }
      throw err;
    }
  }

  private async latestAny(): Promise<ExchangeRateDto | null> {
    const [rows] = await dbPool.query<RateRow[]>(
      `SELECT * FROM daily_exchange_rates
       WHERE source = 'BCV'
       ORDER BY rate_date DESC
       LIMIT 1`,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }
}

export const exchangeRateService = new ExchangeRateService();
