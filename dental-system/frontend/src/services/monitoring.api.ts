import { api } from './api';

export interface MonitorSummary {
  hours: number;
  clinicId?: string | null;
  errorsTotal: number;
  errorsFrontend: number;
  errorsBackend: number;
  requestsTotal: number;
  requests5xx: number;
  requests4xx: number;
  avgMs: number;
  p95Ms: number;
}

export interface LatencyPoint {
  bucket: string;
  avgMs: number;
  maxMs: number;
  requests: number;
}

export interface ErrorSeriesPoint {
  bucket: string;
  source: string;
  total: number;
}

export interface SlowRoute {
  route: string;
  method: string;
  avgMs: number;
  maxMs: number;
  hits: number;
}

export interface AppErrorRow {
  id: string;
  source: 'backend' | 'frontend';
  level: string;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  statusCode: number | null;
  userId: string | null;
  clinicId?: string | null;
  createdAt: string;
}

type MonitorParams = { hours?: number; clinicId?: string | null };

function withClinic(params: MonitorParams) {
  const out: Record<string, string | number> = {};
  if (params.hours != null) out.hours = params.hours;
  if (params.clinicId) out.clinicId = params.clinicId;
  return out;
}

export async function reportClientErrorApi(payload: {
  message: string;
  stack?: string;
  route?: string;
  meta?: Record<string, unknown>;
  level?: 'error' | 'warn' | 'info';
}) {
  await api.post('/monitoring/client-errors', payload);
}

export async function getMonitorSummaryApi(hours = 24, clinicId?: string | null) {
  const { data } = await api.get<{ data: MonitorSummary }>('/monitoring/summary', {
    params: withClinic({ hours, clinicId }),
  });
  return data.data;
}

export async function getLatencySeriesApi(hours = 24, clinicId?: string | null) {
  const { data } = await api.get<{ data: LatencyPoint[] }>('/monitoring/latency', {
    params: withClinic({ hours, clinicId }),
  });
  return data.data;
}

export async function getErrorSeriesApi(hours = 24, clinicId?: string | null) {
  const { data } = await api.get<{ data: ErrorSeriesPoint[] }>(
    '/monitoring/errors/series',
    { params: withClinic({ hours, clinicId }) },
  );
  return data.data;
}

export async function getSlowRoutesApi(hours = 24, clinicId?: string | null) {
  const { data } = await api.get<{ data: SlowRoute[] }>('/monitoring/slow-routes', {
    params: withClinic({ hours, clinicId }),
  });
  return data.data;
}

export interface UserMonitorRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  requests: number;
  requests5xx: number;
  requests4xx: number;
  avgMs: number;
  errors: number;
}

export async function listAppErrorsApi(params?: {
  hours?: number;
  limit?: number;
  source?: string;
  clinicId?: string | null;
}) {
  const { data } = await api.get<{ data: AppErrorRow[] }>('/monitoring/errors', {
    params: {
      ...withClinic({
        hours: params?.hours,
        clinicId: params?.clinicId,
      }),
      ...(params?.limit != null ? { limit: params.limit } : {}),
      ...(params?.source ? { source: params.source } : {}),
    },
  });
  return data.data;
}

export async function getMonitorByUserApi(
  hours = 24,
  clinicId?: string | null,
) {
  const { data } = await api.get<{ data: UserMonitorRow[] }>(
    '/monitoring/by-user',
    { params: withClinic({ hours, clinicId }) },
  );
  return data.data;
}
