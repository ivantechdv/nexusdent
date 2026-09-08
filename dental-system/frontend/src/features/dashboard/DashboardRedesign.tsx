import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ClipboardPlus,
  Clock,
  CreditCard,
  DollarSign,
  List,
  Search,
  Stethoscope,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuthStore } from '@/stores/auth.store';
import {
  listAppointmentsApi,
  type AppointmentStatus,
} from '@/services/appointments.api';
import { getDashboardStatsApi } from '@/services/dashboard.api';
import { listPatientsApi } from '@/services/patients.api';
import {
  timeFromIso,
  todayYmd,
  ymdFromIso,
} from '@/features/appointments/calendarUtils';
import { can, type Permission } from '@/lib/permissions';

const TEAL = '#2b7a78';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  WAITING_ROOM: 'En Espera',
  IN_PROGRESS: 'En Consulta',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

const STATUS_CLASS: Partial<Record<AppointmentStatus, string>> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  WAITING_ROOM: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-teal-100 text-teal-800',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-red-100 text-red-700',
};

function money(n: number) {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function greetName(fullName?: string | null) {
  const t = fullName?.trim() || '';
  if (!t) return 'doctor';
  if (/^(dr\.?|dra\.?)\b/i.test(t)) return t.split(/\s+/).slice(0, 2).join(' ');
  return `Dr. ${t.split(/\s+/)[0]}`;
}

function longDateLabel(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function weekdayShort(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-VE', { weekday: 'short' });
}

type KpiProps = {
  label: string;
  value: string | number;
  icon: typeof CalendarDays;
  iconClass: string;
  to?: string;
};

function KpiCard({ label, value, icon: Icon, iconClass, to }: KpiProps) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <span
          className={clsx(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="font-display text-2xl font-bold tabular-nums text-slate-800">
        {value}
      </p>
    </>
  );

  const className =
    'flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300';

  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

export function DashboardRedesign() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const perms = (user?.permissions ?? null) as Permission[] | null;
  const today = todayYmd();

  const range = {
    from: `${today} 00:00:00`,
    to: `${today} 23:59:59`,
  };

  const apptsQ = useQuery({
    queryKey: ['appointments', 'dash-v2', today],
    queryFn: () => listAppointmentsApi(range),
  });

  const patientsQ = useQuery({
    queryKey: ['patients', 'dash-v2'],
    queryFn: () => listPatientsApi(),
  });

  const statsQ = useQuery({
    queryKey: ['dashboard', 'stats', 'v2'],
    queryFn: getDashboardStatsApi,
    refetchInterval: 60_000,
  });

  const todayAppts = (apptsQ.data ?? [])
    .filter((a) => ymdFromIso(a.scheduledAt) === today)
    .sort((a, b) =>
      timeFromIso(a.scheduledAt).localeCompare(timeFromIso(b.scheduledAt)),
    );

  const waiting = todayAppts.filter((a) => a.status === 'WAITING_ROOM').length;
  const inProgress = todayAppts.filter((a) => a.status === 'IN_PROGRESS').length;
  const finance = statsQ.data?.finance;
  const incomeChart = (statsQ.data?.dailyPerformance ?? []).map((d) => ({
    label: weekdayShort(d.date),
    income: d.incomeUsd,
  }));
  const patientsChart = statsQ.data?.newPatientsWeekly ?? [];
  const topTreatments = statsQ.data?.proceduresWeek ?? [];
  const maxQty = Math.max(1, ...topTreatments.map((t) => t.quantity));

  const alerts = [
    finance && finance.incomeTodayUsd > 0
      ? {
          id: 'pay',
          icon: CheckCircle2,
          tone: 'text-emerald-600 bg-emerald-50',
          title: 'Pagos registrados hoy',
          detail: `${money(finance.incomeTodayUsd)} cobrados`,
          ago: 'Hoy',
        }
      : null,
    finance && finance.outstandingUsd > 0
      ? {
          id: 'bal',
          icon: AlertTriangle,
          tone: 'text-amber-600 bg-amber-50',
          title: 'Saldo pendiente por cobrar',
          detail: money(finance.outstandingUsd),
          ago: 'Actual',
        }
      : null,
    todayAppts.find((a) => a.status === 'CONFIRMED')
      ? {
          id: 'appt',
          icon: CalendarDays,
          tone: 'text-teal-700 bg-teal-50',
          title: 'Citas confirmadas para hoy',
          detail: `${todayAppts.filter((a) => a.status === 'CONFIRMED').length} confirmada(s)`,
          ago: 'Hoy',
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    icon: typeof CheckCircle2;
    tone: string;
    title: string;
    detail: string;
    ago: string;
  }>;

  return (
    <div className="min-h-full bg-[#f8fafc]">
      {/* Header tipo Figma (dentro del área de contenido) */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Inicio{' '}
            <span className="text-slate-300">›</span>{' '}
            <span className="font-semibold text-[#2b7a78]">Dashboard</span>
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-xl font-bold text-slate-800">
              Hola, {greetName(user?.fullName)}
            </h1>
            <p className="text-[13px] font-medium capitalize text-slate-500">
              {longDateLabel(today)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="relative hidden min-w-[240px] flex-1 md:block lg:min-w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              readOnly
              placeholder="Buscar pacientes, citas..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-12 text-[13px] text-slate-700 outline-none placeholder:text-slate-500 focus:border-teal-600 focus:bg-white"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-400">
              ⌘K
            </span>
          </label>
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0f766e] text-xs font-bold text-white">
            {(user?.fullName ?? 'N').slice(0, 1).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {/* KPI 2×4 */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard
            label="Citas Hoy"
            value={todayAppts.length}
            icon={CalendarDays}
            iconClass="bg-emerald-50 text-emerald-600"
            to="/appointments"
          />
          <KpiCard
            label="En Espera"
            value={waiting}
            icon={Clock}
            iconClass="bg-amber-50 text-amber-600"
            to="/appointments"
          />
          <KpiCard
            label="En Consulta"
            value={inProgress}
            icon={Stethoscope}
            iconClass="bg-teal-50 text-teal-700"
            to="/atencion"
          />
          <KpiCard
            label="Pacientes Total"
            value={(patientsQ.data ?? []).length.toLocaleString('en-US')}
            icon={Users}
            iconClass="bg-blue-50 text-blue-600"
            to="/patients"
          />
          <KpiCard
            label="Ingresos Hoy"
            value={money(finance?.incomeTodayUsd ?? 0)}
            icon={DollarSign}
            iconClass="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            label="Ingresos Mes"
            value={money(finance?.incomeMonthUsd ?? 0)}
            icon={Activity}
            iconClass="bg-teal-50 text-teal-700"
          />
          <KpiCard
            label="Por Cobrar"
            value={money(finance?.outstandingUsd ?? 0)}
            icon={AlertTriangle}
            iconClass="bg-orange-50 text-orange-600"
          />
          <KpiCard
            label="Cobrado"
            value={money(finance?.collectedUsd ?? 0)}
            icon={CheckCircle2}
            iconClass="bg-emerald-50 text-emerald-600"
          />
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-slate-800">
              Ingresos Últimos 7 Días
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Cobrado en USD</p>
            <div className="mt-4 h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeChart} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={44} />
                  <Tooltip formatter={(v) => [money(Number(v ?? 0)), 'Ingresos']} />
                  <Bar dataKey="income" fill={TEAL} radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-slate-800">Pacientes Nuevos</h2>
            <p className="mt-0.5 text-xs text-slate-500">Últimas 7 semanas</p>
            <div className="mt-4 h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={patientsChart} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Altas"
                    stroke={TEAL}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: TEAL }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Agenda + tratamientos */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-slate-800">
                  Agenda del Día
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Próximas citas ordenadas cronológicamente
                </p>
              </div>
              <CalendarDays
                className="mt-0.5 h-5 w-5 shrink-0 text-[#2b7a78]"
                strokeWidth={2}
              />
            </div>
            {apptsQ.isLoading ? (
              <p className="px-5 py-8 text-sm text-slate-500">Cargando…</p>
            ) : todayAppts.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No hay citas para hoy</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {todayAppts.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                      {timeFromIso(a.scheduledAt)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {a.patientName ?? 'Paciente'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {a.reason || a.dentistName || 'Consulta'}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        STATUS_CLASS[a.status] ?? 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-slate-800">
                  Top Tratamientos Solicitados
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Procedimientos más realizados del mes
                </p>
              </div>
              <BarChart3
                className="mt-0.5 h-5 w-5 shrink-0 text-[#2b7a78]"
                strokeWidth={2}
              />
            </div>
            {statsQ.isLoading ? (
              <p className="px-5 py-8 text-sm text-slate-500">Cargando…</p>
            ) : topTreatments.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">
                Sin tratamientos en la semana
              </p>
            ) : (
              <ul className="space-y-3 px-5 py-4">
                {topTreatments.slice(0, 6).map((t, i) => (
                  <li key={t.treatmentId}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        <span className="mr-2 text-slate-400">#{i + 1}</span>
                        {t.name}
                      </p>
                      <span className="shrink-0 text-xs font-medium text-slate-500">
                        {t.quantity} pact.
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#2b7a78]"
                        style={{ width: `${(t.quantity / maxQty) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Acceso rápido — layout Figma: título izq / acciones der */}
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <Zap className="h-[18px] w-[18px] shrink-0 fill-accent text-accent" />
            <p className="truncate text-[15px] font-bold text-slate-800">
              Acceso Rápido Administrativo
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/atencion"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              <ClipboardPlus className="h-4 w-4" strokeWidth={2.25} />
              Nueva Atención
            </Link>
            {can(role, 'appointments.write', perms) && (
              <Link
                to="/appointments"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <CalendarPlus className="h-4 w-4 text-slate-700" strokeWidth={2} />
                Nueva Cita
              </Link>
            )}
            {can(role, 'patients.write', perms) && (
              <Link
                to="/patients/new"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <UserPlus className="h-4 w-4 text-slate-700" strokeWidth={2} />
                Nuevo Paciente
              </Link>
            )}
            {can(role, 'billing.payments.write', perms) && (
              <Link
                to="/patients"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <CreditCard className="h-4 w-4 text-slate-700" strokeWidth={2} />
                Nuevo Pago
              </Link>
            )}
            {can(role, 'treatments.read', perms) && (
              <Link
                to="/treatments"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <List className="h-4 w-4 text-slate-700" strokeWidth={2} />
                Catálogo
              </Link>
            )}
          </div>
        </section>

        {/* Alertas */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-[15px] font-bold text-slate-800">
              Alertas y Eventos Recientes
            </h2>
          </div>
          {alerts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">Sin alertas por ahora</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span
                    className={clsx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      a.tone,
                    )}
                  >
                    <a.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {a.title}
                    </p>
                    <p className="truncate text-xs text-slate-500">{a.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{a.ago}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
