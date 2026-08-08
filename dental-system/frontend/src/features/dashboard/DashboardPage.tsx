import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Clock,
  DollarSign,
  Stethoscope,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/Badge';
import { BcvRateCard } from '@/components/BcvRateCard';
import { useAuthStore } from '@/stores/auth.store';
import {
  listAppointmentsApi,
  type Appointment,
  type AppointmentStatus,
} from '@/services/appointments.api';
import { getDashboardStatsApi } from '@/services/dashboard.api';
import { listPatientsApi } from '@/services/patients.api';
import { listTreatmentsApi } from '@/services/treatments.api';
import {
  addDays,
  timeFromIso,
  todayYmd,
  ymdFromIso,
} from '@/features/appointments/calendarUtils';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  WAITING_ROOM: 'Sala de espera',
  IN_PROGRESS: 'En consulta',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

const STATUS_TONE: Partial<
  Record<AppointmentStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'>
> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  WAITING_ROOM: 'warning',
  IN_PROGRESS: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
};

const CHART_ORANGE = '#ea580c';
const CHART_TEAL = '#0f766e';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatDayLabel(ymd: string, today: string) {
  if (ymd === today) return 'Hoy';
  if (ymd === addDays(today, 1)) return 'Mañana';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function shortDay(ymd: string, today: string) {
  if (ymd === today) return 'Hoy';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es', {
    weekday: 'short',
    day: 'numeric',
  });
}

function shortProcName(name: string, max = 18) {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

function isActiveAppt(a: Appointment) {
  return !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status);
}

function moneyTick(v: number) {
  if (v >= 1000) return `$${Math.round(v / 100) / 10}k`;
  return `$${v}`;
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const today = todayYmd();
  const weekTo = addDays(today, 7);

  const range = useMemo(
    () => ({
      from: `${today} 00:00:00`,
      to: `${weekTo} 23:59:59`,
    }),
    [today, weekTo],
  );

  const { data: appointments = [], isLoading: loadingAppt } = useQuery({
    queryKey: ['appointments', 'dash', today, weekTo],
    queryFn: () => listAppointmentsApi(range),
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients', 'dash'],
    queryFn: () => listPatientsApi(),
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments', 'active'],
    queryFn: () => listTreatmentsApi(),
  });

  const statsQ = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: getDashboardStatsApi,
    refetchInterval: 60_000,
  });

  const todayAppts = appointments
    .filter((a) => ymdFromIso(a.scheduledAt) === today)
    .sort((a, b) =>
      timeFromIso(a.scheduledAt).localeCompare(timeFromIso(b.scheduledAt)),
    );
  const waiting = todayAppts.filter((a) => a.status === 'WAITING_ROOM').length;
  const inProgress = todayAppts.filter((a) => a.status === 'IN_PROGRESS').length;

  const upcoming = appointments
    .filter((a) => isActiveAppt(a) && ymdFromIso(a.scheduledAt) >= today)
    .sort((a, b) => {
      const da = ymdFromIso(a.scheduledAt);
      const db = ymdFromIso(b.scheduledAt);
      if (da !== db) return da.localeCompare(db);
      return timeFromIso(a.scheduledAt).localeCompare(timeFromIso(b.scheduledAt));
    });

  const procsToday = useMemo(
    () =>
      (statsQ.data?.proceduresToday ?? []).map((p) => ({
        ...p,
        label: shortProcName(p.name),
      })),
    [statsQ.data?.proceduresToday],
  );

  const procsWeek = useMemo(
    () =>
      (statsQ.data?.proceduresWeek ?? []).map((p) => ({
        ...p,
        label: shortProcName(p.name),
      })),
    [statsQ.data?.proceduresWeek],
  );

  const dailyChart = useMemo(
    () =>
      (statsQ.data?.dailyPerformance ?? []).map((d) => ({
        ...d,
        label: shortDay(d.date, today),
      })),
    [statsQ.data?.dailyPerformance, today],
  );

  const firstName = user?.fullName?.split(' ')[0] ?? '';

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:space-y-5 sm:p-6">
      <div>
        <p className="text-sm text-clinic-slate">{greeting()}</p>
        <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
          {firstName ? `Hola, ${firstName}` : 'Inicio'}
        </h1>
        <p className="text-sm text-clinic-slate">
          Resumen operativo ·{' '}
          {new Date(`${today}T12:00:00`).toLocaleDateString('es', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_minmax(200px,280px)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatCard
            label="Citas hoy"
            value={todayAppts.length}
            icon={CalendarDays}
            to="/appointments"
          />
          <StatCard
            label="En espera"
            value={waiting}
            icon={Clock}
            to="/appointments"
          />
          <StatCard
            label="En consulta"
            value={inProgress}
            icon={Activity}
            to="/atencion"
          />
          <StatCard
            label="Pacientes"
            value={patients.length}
            icon={Users}
            to="/patients"
          />
        </div>
        <BcvRateCard />
      </div>

      {/* Gráficos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Procedimientos de hoy"
          subtitle="Los más realizados hoy"
          icon={Stethoscope}
          loading={statsQ.isLoading}
          empty={!procsToday.length}
          emptyText="Aún no hay procedimientos registrados hoy"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={procsToday}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={92}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                formatter={(v) => [`${Number(v ?? 0)} und.`, 'Cantidad']}
                labelFormatter={(_, payload) =>
                  String(payload?.[0]?.payload?.name ?? '')
                }
              />
              <Bar dataKey="quantity" name="Cantidad" fill={CHART_TEAL} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Procedimientos de la semana"
          subtitle="Últimos 7 días"
          icon={Stethoscope}
          loading={statsQ.isLoading}
          empty={!procsWeek.length}
          emptyText="Sin procedimientos en los últimos 7 días"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={procsWeek}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={92}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                formatter={(v) => [`${Number(v ?? 0)} und.`, 'Cantidad']}
                labelFormatter={(_, payload) =>
                  String(payload?.[0]?.payload?.name ?? '')
                }
              />
              <Bar dataKey="quantity" name="Cantidad" fill={CHART_ORANGE} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Ingresos vs pacientes"
        subtitle="Últimos 7 días · cobrado (USD) y pacientes atendidos"
        icon={DollarSign}
        loading={statsQ.isLoading}
        empty={dailyChart.every((d) => d.patients === 0 && d.incomeUsd === 0)}
        emptyText="Todavía no hay atenciones ni cobros esta semana"
      >
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={dailyChart}
            margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="money"
              orientation="left"
              tick={{ fontSize: 11 }}
              tickFormatter={moneyTick}
              width={44}
            />
            <YAxis
              yAxisId="people"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              width={28}
            />
            <Tooltip
              formatter={(value, name) => {
                const n = Number(value ?? 0);
                const label = String(name ?? '');
                if (label === 'Ingresos USD') {
                  return [
                    `USD ${n.toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`,
                    label,
                  ];
                }
                return [n, label];
              }}
              labelFormatter={(label, payload) => {
                const date = payload?.[0]?.payload?.date as string | undefined;
                if (!date) return String(label);
                return formatDayLabel(date, today);
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              yAxisId="money"
              dataKey="incomeUsd"
              name="Ingresos USD"
              fill={CHART_TEAL}
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
            />
            <Line
              yAxisId="people"
              type="monotone"
              dataKey="patients"
              name="Pacientes"
              stroke={CHART_ORANGE}
              strokeWidth={2.5}
              dot={{ r: 4, fill: CHART_ORANGE }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-1 px-1 text-[11px] text-clinic-slate">
          Ejemplo: muchos pacientes no siempre = más ingreso. Barras = cobrado;
          línea = personas atendidas.
        </p>
      </ChartCard>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-clinic-ink">
            Agenda · hoy y próximas
          </h2>
          <Link
            to="/appointments"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-clinic-deep"
          >
            Ver calendario
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loadingAppt ? (
          <p className="px-4 py-6 text-sm text-clinic-slate">Cargando…</p>
        ) : upcoming.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-clinic-slate">
              No hay citas pendientes en los próximos días
            </p>
            <Link
              to="/appointments"
              className="mt-2 inline-block text-sm font-semibold text-clinic-deep"
            >
              Ir a agenda
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {upcoming.slice(0, 8).map((a) => {
              const day = ymdFromIso(a.scheduledAt);
              const isToday = day === today;
              return (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={`flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${
                      isToday
                        ? 'bg-accent/15 text-accent'
                        : 'bg-clinic-deep/10 text-clinic-deep'
                    }`}
                  >
                    <span className="text-[9px] font-bold uppercase leading-none">
                      {formatDayLabel(day, today)}
                    </span>
                    <span className="text-xs font-bold tabular-nums leading-tight">
                      {timeFromIso(a.scheduledAt)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-clinic-ink">
                      {a.patientName ?? 'Paciente'}
                    </p>
                    <p className="truncate text-xs text-clinic-slate">
                      {a.reason || a.dentistName || 'Sin motivo'}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>
                    {STATUS_LABEL[a.status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/atencion"
          className="panel flex items-center gap-3 p-4 transition active:bg-slate-50 hover:bg-slate-50/80"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-sm">
            <Activity className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-clinic-ink">Nueva atención</p>
            <p className="text-xs text-clinic-slate">
              Registrar procedimientos y evolución
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-clinic-slate" />
        </Link>
        <Link
          to="/treatments"
          className="panel flex items-center gap-3 p-4 transition active:bg-slate-50 hover:bg-slate-50/80"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-clinic-deep/10 text-clinic-deep">
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-clinic-ink">Catálogo activo</p>
            <p className="text-xs text-clinic-slate">
              {treatments.length} prestaciones disponibles
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-clinic-slate" />
        </Link>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  loading,
  empty,
  emptyText,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Stethoscope;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel overflow-hidden p-3 sm:p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-clinic-deep/10 text-clinic-deep">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-clinic-ink">{title}</h2>
          <p className="text-xs text-clinic-slate">{subtitle}</p>
        </div>
      </div>
      {loading ? (
        <p className="py-10 text-center text-sm text-clinic-slate">Cargando…</p>
      ) : empty ? (
        <p className="py-10 text-center text-sm text-clinic-slate">
          {emptyText ?? 'Sin datos'}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: number;
  icon: typeof CalendarDays;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="panel flex flex-col gap-2 p-3.5 transition active:bg-slate-50 hover:bg-slate-50/60"
    >
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-clinic-slate" />
        <span className="font-display text-2xl font-semibold tabular-nums text-clinic-ink">
          {value}
        </span>
      </div>
      <p className="text-xs font-medium text-clinic-slate">{label}</p>
    </Link>
  );
}
