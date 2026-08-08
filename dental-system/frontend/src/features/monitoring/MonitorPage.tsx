import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Clock,
  ServerCrash,
  Shield,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/Badge';
import { listClinicsAdminApi } from '@/services/clinics.api';
import {
  getErrorSeriesApi,
  getLatencySeriesApi,
  getMonitorByUserApi,
  getMonitorSummaryApi,
  getSlowRoutesApi,
  listAppErrorsApi,
} from '@/services/monitoring.api';

function shortBucket(b: string) {
  const part = b.slice(11, 16);
  return part || b.slice(5, 16);
}

export function MonitorPage() {
  const [hours, setHours] = useState(24);
  const [clinicId, setClinicId] = useState<string>('');

  const clinicsQ = useQuery({
    queryKey: ['platform', 'clinics'],
    queryFn: listClinicsAdminApi,
  });

  const filterClinic = clinicId || null;

  const summaryQ = useQuery({
    queryKey: ['monitor', 'summary', hours, filterClinic],
    queryFn: () => getMonitorSummaryApi(hours, filterClinic),
    refetchInterval: 30_000,
  });
  const latencyQ = useQuery({
    queryKey: ['monitor', 'latency', hours, filterClinic],
    queryFn: () => getLatencySeriesApi(hours, filterClinic),
    refetchInterval: 30_000,
  });
  const errorsSeriesQ = useQuery({
    queryKey: ['monitor', 'errors-series', hours, filterClinic],
    queryFn: () => getErrorSeriesApi(hours, filterClinic),
    refetchInterval: 30_000,
  });
  const slowQ = useQuery({
    queryKey: ['monitor', 'slow', hours, filterClinic],
    queryFn: () => getSlowRoutesApi(hours, filterClinic),
  });
  const errorsQ = useQuery({
    queryKey: ['monitor', 'errors', hours, filterClinic],
    queryFn: () =>
      listAppErrorsApi({ hours, limit: 40, clinicId: filterClinic }),
    refetchInterval: 30_000,
  });
  const byUserQ = useQuery({
    queryKey: ['monitor', 'by-user', hours, filterClinic],
    queryFn: () => getMonitorByUserApi(hours, filterClinic),
    refetchInterval: 30_000,
  });

  const userChart = useMemo(
    () =>
      (byUserQ.data ?? [])
        .filter((u) => u.requests > 0 || u.errors > 0)
        .slice(0, 12)
        .map((u) => ({
          ...u,
          label: u.fullName.split(' ')[0] || u.email.split('@')[0],
        })),
    [byUserQ.data],
  );

  const errorChart = useMemo(() => {
    const map = new Map<string, { bucket: string; backend: number; frontend: number }>();
    for (const row of errorsSeriesQ.data ?? []) {
      const cur = map.get(row.bucket) ?? {
        bucket: row.bucket,
        backend: 0,
        frontend: 0,
      };
      if (row.source === 'backend') cur.backend = row.total;
      else cur.frontend = row.total;
      map.set(row.bucket, cur);
    }
    return [...map.values()].map((r) => ({
      ...r,
      label: shortBucket(r.bucket),
    }));
  }, [errorsSeriesQ.data]);

  const latencyChart = useMemo(
    () =>
      (latencyQ.data ?? []).map((r) => ({
        ...r,
        label: shortBucket(r.bucket),
      })),
    [latencyQ.data],
  );

  const s = summaryQ.data;
  const selectedClinicName =
    clinicsQ.data?.find((c) => c.id === clinicId)?.name ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:space-y-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Shield className="h-5 w-5 text-clinic-deep" />
            <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
              Monitoreo
            </h1>
          </div>
          <p className="text-sm text-clinic-slate">
            {selectedClinicName
              ? `Vista: ${selectedClinicName}`
              : 'Vista: todas las clínicas'}{' '}
            · solo SUPERADMIN
            {filterClinic ? (
              <span className="mt-1 block text-xs">
                Incluye tráfico etiquetado de esa clínica (el de plataforma sin
                clínica solo aparece en «Todas»).
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            aria-label="Filtrar por clínica"
          >
            <option value="">Todas las clínicas</option>
            {(clinicsQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isDemo ? ' (demo)' : ''}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={6}>Últimas 6 h</option>
            <option value={24}>Últimas 24 h</option>
            <option value={72}>Últimos 3 días</option>
            <option value={168}>Última semana</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          icon={AlertTriangle}
          label="Errores"
          value={s?.errorsTotal ?? '—'}
          hint={`${s?.errorsBackend ?? 0} API · ${s?.errorsFrontend ?? 0} UI`}
        />
        <Kpi
          icon={Activity}
          label="Requests"
          value={s?.requestsTotal ?? '—'}
          hint={`${s?.requests5xx ?? 0} × 5xx · ${s?.requests4xx ?? 0} × 4xx`}
        />
        <Kpi
          icon={Clock}
          label="Latencia media"
          value={s ? `${s.avgMs} ms` : '—'}
          hint={`p95 ≈ ${s?.p95Ms ?? 0} ms`}
        />
        <Kpi
          icon={ServerCrash}
          label="Fallos 5xx"
          value={s?.requests5xx ?? '—'}
          hint="Respuestas servidor"
        />
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-clinic-ink">
            Por usuario (staff)
          </h2>
          <p className="text-xs text-clinic-slate">
            {filterClinic
              ? 'Miembros de la clínica y su actividad en el período'
              : 'Usuarios con tráfico en el período (todas las clínicas)'}
          </p>
        </div>
        {userChart.length > 0 && (
          <div className="border-b border-slate-100 p-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userChart} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => [
                      value,
                      name === 'requests' ? 'Requests' : 'Errores',
                    ]}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as
                        | { fullName?: string; role?: string }
                        | undefined;
                      return row?.fullName
                        ? `${row.fullName} · ${row.role}`
                        : '';
                    }}
                  />
                  <Legend />
                  <Bar dataKey="requests" name="Requests" fill="#1e3a8a" />
                  <Bar dataKey="errors" name="Errores" fill="#f97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-clinic-slate">
              <tr>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Requests</th>
                <th className="px-4 py-2">4xx / 5xx</th>
                <th className="px-4 py-2">Latencia</th>
                <th className="px-4 py-2">Errores</th>
              </tr>
            </thead>
            <tbody>
              {(byUserQ.data ?? []).map((u) => (
                <tr key={u.userId} className="border-t border-slate-50">
                  <td className="px-4 py-2">
                    <span className="block font-medium text-clinic-ink">
                      {u.fullName}
                    </span>
                    <span className="text-[11px] text-clinic-slate">
                      {u.email}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone="info">{u.role}</Badge>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{u.requests}</td>
                  <td className="px-4 py-2 tabular-nums text-clinic-slate">
                    {u.requests4xx} / {u.requests5xx}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {u.requests ? `${u.avgMs} ms` : '—'}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{u.errors}</td>
                </tr>
              ))}
              {!byUserQ.isLoading && !(byUserQ.data?.length) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-clinic-slate"
                  >
                    {filterClinic
                      ? 'Esta clínica aún no tiene usuarios o tráfico'
                      : 'Sin usuarios con tráfico en el período'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-clinic-ink">
            Latencia por hora (ms)
          </h2>
          <div className="h-56">
            {latencyChart.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={latencyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="avgMs"
                    name="Promedio"
                    stroke="#1e3a8a"
                    fill="#1e3a8a33"
                  />
                  <Area
                    type="monotone"
                    dataKey="maxMs"
                    name="Máximo"
                    stroke="#f97316"
                    fill="#f9731622"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-clinic-ink">
            Errores por hora
          </h2>
          <div className="h-56">
            {errorChart.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="backend" name="API" fill="#1e3a8a" stackId="a" />
                  <Bar
                    dataKey="frontend"
                    name="UI"
                    fill="#f97316"
                    stackId="a"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-clinic-ink">
            Rutas más lentas
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-clinic-slate">
              <tr>
                <th className="px-4 py-2">Método</th>
                <th className="px-4 py-2">Ruta</th>
                <th className="px-4 py-2">Promedio</th>
                <th className="px-4 py-2">Máx</th>
                <th className="px-4 py-2">Hits</th>
              </tr>
            </thead>
            <tbody>
              {(slowQ.data ?? []).map((r) => (
                <tr key={`${r.method}-${r.route}`} className="border-t border-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{r.method}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.route}</td>
                  <td className="px-4 py-2 tabular-nums">{r.avgMs} ms</td>
                  <td className="px-4 py-2 tabular-nums">{r.maxMs} ms</td>
                  <td className="px-4 py-2 tabular-nums">{r.hits}</td>
                </tr>
              ))}
              {!slowQ.data?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-clinic-slate">
                    Aún no hay tráfico registrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-clinic-ink">
            Últimos errores
          </h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {(errorsQ.data ?? []).map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={e.source === 'backend' ? 'info' : 'accent'}>
                  {e.source}
                </Badge>
                {e.statusCode != null && (
                  <Badge tone="danger">{e.statusCode}</Badge>
                )}
                <span className="text-xs text-clinic-slate">
                  {new Date(e.createdAt).toLocaleString('es')}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-clinic-ink">{e.message}</p>
              {(e.method || e.route) && (
                <p className="mt-0.5 font-mono text-[11px] text-clinic-slate">
                  {e.method} {e.route}
                </p>
              )}
              {e.stack && (
                <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">
                  {e.stack.slice(0, 1200)}
                </pre>
              )}
            </li>
          ))}
          {!errorsQ.data?.length && (
            <li className="px-4 py-8 text-center text-sm text-clinic-slate">
              Sin errores en el período · buen signo
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="panel p-3.5">
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-4 w-4 text-clinic-slate" />
        <span className="font-display text-xl font-semibold tabular-nums text-clinic-ink">
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs font-semibold text-clinic-ink">{label}</p>
      <p className="text-[10px] text-clinic-slate">{hint}</p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-clinic-slate">
      Sin datos todavía — usá la app y se llenará
    </div>
  );
}
