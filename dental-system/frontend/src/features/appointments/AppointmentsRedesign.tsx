import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Plus,
  Search,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { listDentistsApi } from '@/services/auth.api';
import { listPatientsApi } from '@/services/patients.api';
import {
  createAppointmentApi,
  listAppointmentsApi,
  updateAppointmentApi,
  type Appointment,
  type AppointmentStatus,
} from '@/services/appointments.api';
import { toast, toastError } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  appointmentWhatsAppMessage,
  whatsappHref,
} from '@/lib/contact';
import {
  type CalendarView,
  dayNumber,
  formatHour,
  isSameMonth,
  minutesFromMidnight,
  monthGridRange,
  parseYmd,
  rangeForView,
  shiftAnchor,
  timeFromIso,
  todayYmd,
  weekDays,
  weekdayShort,
  ymdFromIso,
} from './calendarUtils';

/** Franja Figma Agenda: 07:00–14:00 */
const GRID_START_MIN = 7 * 60;
const GRID_END_MIN = 14 * 60;
/** ~64px/hora para cards como en el frame */
const SLOT_PX = 64;

function gridHours(): number[] {
  const hours: number[] = [];
  for (let h = GRID_START_MIN / 60; h <= GRID_END_MIN / 60; h++) hours.push(h);
  return hours;
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  WAITING_ROOM: 'En Espera',
  IN_PROGRESS: 'En Consulta',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No Asistió',
};

const STATUS_VISUAL: Record<
  AppointmentStatus,
  { card: string; accent: string; dot: string }
> = {
  PENDING: {
    card: 'bg-amber-50 border-amber-200/80 text-amber-950',
    accent: 'bg-amber-400',
    dot: 'bg-amber-400',
  },
  CONFIRMED: {
    card: 'bg-emerald-50 border-emerald-200/80 text-emerald-950',
    accent: 'bg-emerald-500',
    dot: 'bg-emerald-500',
  },
  WAITING_ROOM: {
    card: 'bg-sky-50 border-sky-200/80 text-sky-950',
    accent: 'bg-sky-400',
    dot: 'bg-sky-400',
  },
  IN_PROGRESS: {
    card: 'bg-teal-50 border-teal-300/80 text-teal-950',
    accent: 'bg-teal-700',
    dot: 'bg-teal-700',
  },
  COMPLETED: {
    card: 'bg-slate-100 border-slate-200 text-slate-700',
    accent: 'bg-slate-500',
    dot: 'bg-slate-500',
  },
  CANCELLED: {
    card: 'bg-red-50 border-red-200/80 text-red-900',
    accent: 'bg-red-500',
    dot: 'bg-red-500',
  },
  NO_SHOW: {
    card: 'bg-fuchsia-50 border-fuchsia-200/80 text-fuchsia-950',
    accent: 'bg-fuchsia-500',
    dot: 'bg-fuchsia-500',
  },
};

const LEGEND: Array<{ label: string; dot: string }> = [
  { label: 'Pendiente', dot: 'bg-amber-400' },
  { label: 'Confirmada', dot: 'bg-emerald-500' },
  { label: 'En Espera', dot: 'bg-sky-400' },
  { label: 'En Consulta', dot: 'bg-teal-700' },
  { label: 'Completada', dot: 'bg-slate-500' },
  { label: 'Cancelada', dot: 'bg-red-500' },
  { label: 'No Asistió', dot: 'bg-fuchsia-500' },
  { label: 'Reprogramada', dot: 'bg-violet-500' },
];

function formatDuration(min: number) {
  const m = Math.max(0, min || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

function monthYearTitle(anchor: string) {
  const d = parseYmd(anchor);
  const month = new Intl.DateTimeFormat('es-VE', { month: 'long' }).format(d);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${d.getFullYear()}`;
}

function titleCaseName(name?: string | null) {
  const t = (name ?? '').trim();
  if (!t) return 'Doctor';
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function longTodayLabel(ymd: string) {
  const raw = new Intl.DateTimeFormat('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parseYmd(ymd));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function dayHeaderLabel(ymd: string) {
  const wd = weekdayShort(ymd).replace('.', '');
  const short = wd.charAt(0).toUpperCase() + wd.slice(1, 3);
  return `${short} ${dayNumber(ymd)}`;
}

/** Semana laboral Lun–Sáb como en el frame Figma */
function workWeekDays(anchor: string): string[] {
  return weekDays(anchor).slice(0, 6);
}

function groupByDay(appointments: Appointment[]) {
  const map = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = ymdFromIso(a.scheduledAt);
    const list = map.get(key);
    if (list) list.push(a);
    else map.set(key, [a]);
  }
  for (const list of map.values()) {
    list.sort(
      (x, y) =>
        minutesFromMidnight(x.scheduledAt) - minutesFromMidnight(y.scheduledAt),
    );
  }
  return map;
}

function AppointmentCard({
  a,
  onClick,
}: {
  a: Appointment;
  onClick: () => void;
}) {
  const vis = STATUS_VISUAL[a.status] ?? STATUS_VISUAL.PENDING;
  const dur = Math.max(15, a.durationMin || 30);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        'relative flex h-full w-full flex-col overflow-hidden rounded-md border border-slate-200/80 border-l-[3px] py-1 pl-2 pr-1.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:brightness-[0.98]',
        vis.card,
      )}
      style={{
        borderLeftColor:
          a.status === 'PENDING'
            ? '#fbbf24'
            : a.status === 'CONFIRMED'
              ? '#10b981'
              : a.status === 'WAITING_ROOM'
                ? '#38bdf8'
                : a.status === 'IN_PROGRESS'
                  ? '#0f766e'
                  : a.status === 'COMPLETED'
                    ? '#64748b'
                    : a.status === 'CANCELLED'
                      ? '#ef4444'
                      : '#d946ef',
      }}
      title={`${timeFromIso(a.scheduledAt)} · ${a.patientName ?? 'Paciente'}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] font-bold tabular-nums leading-none">
          {timeFromIso(a.scheduledAt)}
        </span>
        <span className="text-[10px] font-medium leading-none opacity-65">
          {formatDuration(dur)}
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] font-bold leading-tight">
        {a.patientName ?? 'Paciente'}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-medium leading-tight opacity-70">
        {(a.reason ?? '').trim() || 'Consulta'}
      </p>
      <span
        className={clsx(
          'absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full',
          vis.dot,
        )}
      />
    </button>
  );
}

function TimeGrid({
  days,
  byDay,
  onSelect,
  onCreateAt,
}: {
  days: string[];
  byDay: Map<string, Appointment[]>;
  onSelect: (a: Appointment) => void;
  onCreateAt: (ymd: string, time?: string) => void;
}) {
  const hours = gridHours();
  const totalMin = GRID_END_MIN - GRID_START_MIN;
  const height = (totalMin / 60) * SLOT_PX;
  const today = todayYmd();
  const colCount = days.length;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className="min-w-[760px]"
        style={{
          display: 'grid',
          gridTemplateColumns: `48px repeat(${colCount}, minmax(0, 1fr))`,
          gridTemplateRows: `40px ${height}px`,
        }}
      >
        <div className="border-b border-slate-100 bg-white" />
        {days.map((d) => {
          const isToday = d === today;
          return (
            <div
              key={`h-${d}`}
              className="relative flex flex-col items-center justify-center border-b border-l border-slate-100 bg-white px-1"
            >
              <p
                className={clsx(
                  'text-[12px] font-semibold',
                  isToday ? 'text-[#2b7a78]' : 'text-slate-500',
                )}
              >
                {dayHeaderLabel(d)}
              </p>
              {isToday && (
                <span className="absolute bottom-0 left-4 right-4 h-[3px] rounded-full bg-[#2b7a78]" />
              )}
            </div>
          );
        })}

        <div className="relative border-r border-slate-100 bg-white">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute right-1.5 -translate-y-1/2 text-[11px] font-medium tabular-nums text-slate-400"
              style={{ top: ((h * 60 - GRID_START_MIN) / 60) * SLOT_PX }}
            >
              {formatHour(h)}
            </div>
          ))}
        </div>

        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          return (
            <div
              key={`c-${d}`}
              className={clsx(
                'relative border-l border-slate-100 bg-white',
                d === today && 'bg-[#f0fdfa]/40',
              )}
              onClick={(e) => {
                const rect = (
                  e.currentTarget as HTMLDivElement
                ).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const mins =
                  GRID_START_MIN + Math.round(((y / SLOT_PX) * 60) / 15) * 15;
                const clamped = Math.max(
                  GRID_START_MIN,
                  Math.min(GRID_END_MIN - 15, mins),
                );
                const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
                const mm = String(clamped % 60).padStart(2, '0');
                onCreateAt(d, `${hh}:${mm}`);
              }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t border-slate-100"
                  style={{ top: ((h * 60 - GRID_START_MIN) / 60) * SLOT_PX }}
                />
              ))}
              {list.map((a) => {
                const start = minutesFromMidnight(a.scheduledAt);
                const dur = Math.max(15, a.durationMin || 30);
                let top: number;
                let hPx: number;
                if (start + dur <= GRID_START_MIN) {
                  top = 0;
                  hPx = 44;
                } else if (start >= GRID_END_MIN) {
                  top = height - 44;
                  hPx = 44;
                } else {
                  const clippedStart = Math.max(start, GRID_START_MIN);
                  const clippedEnd = Math.min(start + dur, GRID_END_MIN);
                  top = ((clippedStart - GRID_START_MIN) / 60) * SLOT_PX;
                  hPx = Math.max(
                    44,
                    ((clippedEnd - clippedStart) / 60) * SLOT_PX - 3,
                  );
                }
                return (
                  <div
                    key={a.id}
                    className="absolute inset-x-1.5 z-[2]"
                    style={{
                      top,
                      height: Math.min(hPx, height - top - 2),
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AppointmentCard a={a} onClick={() => onSelect(a)} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  anchor,
  byDay,
  onSelect,
  onCreateAt,
  onPickDay,
}: {
  anchor: string;
  byDay: Map<string, Appointment[]>;
  onSelect: (a: Appointment) => void;
  onCreateAt: (ymd: string, time?: string) => void;
  onPickDay: (ymd: string) => void;
}) {
  const { days } = monthGridRange(anchor);
  const today = todayYmd();
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[11px] font-semibold text-slate-500"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const inMonth = isSameMonth(d, anchor);
          return (
            <div
              key={d}
              className={clsx(
                'min-h-[96px] border-b border-r border-slate-100 p-1.5',
                !inMonth && 'bg-slate-50/60',
                d === today && 'bg-teal-50/40',
              )}
              onClick={() => onCreateAt(d, '10:00')}
              onDoubleClick={() => onPickDay(d)}
            >
              <button
                type="button"
                className={clsx(
                  'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  d === today
                    ? 'bg-[#2b7a78] text-white'
                    : inMonth
                      ? 'text-slate-700'
                      : 'text-slate-400',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onPickDay(d);
                }}
              >
                {dayNumber(d)}
              </button>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(a);
                    }}
                    className={clsx(
                      'block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold',
                      STATUS_VISUAL[a.status]?.card,
                    )}
                  >
                    {timeFromIso(a.scheduledAt)} {a.patientName}
                  </button>
                ))}
                {list.length > 3 && (
                  <p className="px-1 text-[10px] font-medium text-slate-400">
                    +{list.length - 3} más
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AppointmentsRedesign() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clinicName = user?.clinicName;
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState(todayYmd());
  const [dentistFilter, setDentistFilter] = useState<string | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [form, setForm] = useState({
    patientId: '',
    dentistId: '',
    date: todayYmd(),
    time: '10:00',
    durationMin: 30,
    reason: '',
  });
  const [edit, setEdit] = useState({
    date: todayYmd(),
    time: '10:00',
    durationMin: 30,
    reason: '',
    dentistId: '',
    status: 'CONFIRMED' as AppointmentStatus,
  });

  const today = todayYmd();
  const range = useMemo(() => rangeForView(view, anchor), [view, anchor]);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments', 'v2', view, range.from, range.to],
    queryFn: () => listAppointmentsApi(range),
  });

  const todayRange = useMemo(
    () => ({ from: `${today} 00:00:00`, to: `${today} 23:59:59` }),
    [today],
  );

  const { data: todayAppts = [] } = useQuery({
    queryKey: ['appointments', 'v2', 'today', today],
    queryFn: () => listAppointmentsApi(todayRange),
    refetchInterval: 60_000,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients', 'appt'],
    queryFn: () => listPatientsApi(undefined, 200),
    enabled: createOpen,
  });

  const { data: dentists = [] } = useQuery({
    queryKey: ['dentists'],
    queryFn: listDentistsApi,
  });

  useEffect(() => {
    if (!detail) return;
    setEdit({
      date: ymdFromIso(detail.scheduledAt),
      time: timeFromIso(detail.scheduledAt),
      durationMin: detail.durationMin || 30,
      reason: detail.reason ?? '',
      dentistId: detail.dentistId,
      status: detail.status,
    });
  }, [detail]);

  const filtered = useMemo(() => {
    if (dentistFilter === 'ALL') return appointments;
    return appointments.filter((a) => a.dentistId === dentistFilter);
  }, [appointments, dentistFilter]);

  const byDay = useMemo(() => groupByDay(filtered), [filtered]);

  const todayFiltered = useMemo(() => {
    const base =
      dentistFilter === 'ALL'
        ? todayAppts
        : todayAppts.filter((a) => a.dentistId === dentistFilter);
    return [...base].sort(
      (a, b) =>
        minutesFromMidnight(a.scheduledAt) - minutesFromMidnight(b.scheduledAt),
    );
  }, [todayAppts, dentistFilter]);

  const todayStats = useMemo(() => {
    const total = todayFiltered.length;
    const confirmed = todayFiltered.filter((a) => a.status === 'CONFIRMED').length;
    const pending = todayFiltered.filter((a) => a.status === 'PENDING').length;
    const cancelled = todayFiltered.filter(
      (a) => a.status === 'CANCELLED' || a.status === 'NO_SHOW',
    ).length;
    const waiting = todayFiltered.filter((a) => a.status === 'WAITING_ROOM').length;
    return { total, confirmed, pending, cancelled, waiting };
  }, [todayFiltered]);

  const upcoming = useMemo(() => {
    const nowMin =
      new Date().getHours() * 60 + new Date().getMinutes();
    return todayFiltered
      .filter(
        (a) =>
          !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status) &&
          minutesFromMidnight(a.scheduledAt) >= nowMin - 30,
      )
      .slice(0, 5);
  }, [todayFiltered]);

  const createMut = useMutation({
    mutationFn: createAppointmentApi,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setCreateOpen(false);
      setAnchor(ymdFromIso(created.scheduledAt));
      toast('Cita creada', 'success');
    },
    onError: (err) => toastError(err, 'No se pudo crear la cita'),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      scheduledAt?: string;
      durationMin?: number;
      reason?: string | null;
      dentistId?: string;
      status?: AppointmentStatus;
    }) => updateAppointmentApi(id, payload),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setDetail(updated);
      setAnchor(ymdFromIso(updated.scheduledAt));
      toast('Cita actualizada', 'success');
    },
    onError: (err) => toastError(err, 'No se pudo actualizar la cita'),
  });

  function openCreate(ymd: string, time = '10:00') {
    setForm((f) => ({
      ...f,
      date: ymd,
      time,
      dentistId: dentistFilter !== 'ALL' ? dentistFilter : f.dentistId,
    }));
    setCreateOpen(true);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    createMut.mutate({
      patientId: form.patientId,
      dentistId: form.dentistId,
      scheduledAt: `${form.date}T${form.time}:00`,
      durationMin: form.durationMin,
      reason: form.reason || null,
      status: 'CONFIRMED',
    });
  }

  function onSaveDetail(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    updateMut.mutate({
      id: detail.id,
      scheduledAt: `${edit.date}T${edit.time}:00`,
      durationMin: edit.durationMin,
      reason: edit.reason.trim() || null,
      dentistId: edit.dentistId || undefined,
      status: edit.status,
    });
  }

  const gridDays =
    view === 'day' ? [anchor] : view === 'week' ? workWeekDays(anchor) : [];

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col bg-[#f8fafc] p-4 md:min-h-0 sm:p-5 lg:p-6">
      {/* Figma: columna izq (header+agenda) | panel der desde el top */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row xl:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {/* Header alineado con el top del panel derecho */}
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-[22px] font-bold leading-tight text-slate-900">
                Agenda
              </h1>
              <p className="mt-1 text-[12px] font-medium text-slate-500">
                Clínica{' '}
                <span className="mx-0.5 text-slate-300">›</span>{' '}
                <span className="font-semibold text-[#2b7a78]">
                  {clinicName?.trim() || 'Sede'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <label className="relative hidden w-[240px] md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  readOnly
                  placeholder="Buscar paciente..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
                aria-label="Notificaciones"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#ff7a00]" />
              </button>
            </div>
          </div>

          {/* Toolbar con borde blanco completo (Figma) */}
          <div className="grid grid-cols-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-4 lg:grid-cols-[1fr_auto_1fr]">
            <div className="justify-self-start">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100/90 p-0.5">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm"
                  onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[110px] px-2 text-center text-[13px] font-bold text-slate-800">
                  {monthYearTitle(anchor)}
                </span>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm"
                  onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
                  aria-label="Siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="justify-self-center">
              <div className="inline-flex rounded-lg bg-slate-100/90 p-0.5">
                {(
                  [
                    { id: 'day' as const, label: 'Día' },
                    { id: 'week' as const, label: 'Semana' },
                    { id: 'month' as const, label: 'Mes' },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    className={clsx(
                      'rounded-md px-4 py-1.5 text-[13px] font-semibold transition',
                      view === id
                        ? 'bg-white text-[#2b7a78] shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="justify-self-end">
              <button
                type="button"
                onClick={() => openCreate(anchor, '10:00')}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ff7a00] px-4 text-[13px] font-semibold text-white hover:bg-[#ea6e00]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Nueva Cita
              </button>
            </div>
          </div>

          {/* Médicos */}
          <div className="flex items-center gap-2.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[12px] font-semibold text-slate-500">
              Médicos:
            </span>
            {dentists.map((d) => {
              const active = dentistFilter === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDentistFilter(d.id)}
                  className={clsx(
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold transition',
                    active
                      ? 'border-[#2b7a78] bg-[#e6f4f3] text-[#2b7a78]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[#2b7a78] text-[10px] font-bold text-white">
                    {titleCaseName(d.fullName).slice(0, 1)}
                    {active && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white text-[#2b7a78] ring-1 ring-[#2b7a78]">
                        <span className="text-[7px] font-black leading-none">✓</span>
                      </span>
                    )}
                  </span>
                  {titleCaseName(d.fullName)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setDentistFilter('ALL')}
              className={clsx(
                'shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition',
                dentistFilter === 'ALL'
                  ? 'border-[#2b7a78] bg-[#e6f4f3] text-[#2b7a78]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              Todos los Doctores
            </button>
          </div>

          {isLoading ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Cargando agenda…
            </p>
          ) : view === 'month' ? (
            <MonthGrid
              anchor={anchor}
              byDay={byDay}
              onSelect={setDetail}
              onCreateAt={openCreate}
              onPickDay={(ymd) => {
                setAnchor(ymd);
                setView('day');
              }}
            />
          ) : (
            <TimeGrid
              days={gridDays}
              byDay={byDay}
              onSelect={setDetail}
              onCreateAt={openCreate}
            />
          )}

          {/* Leyenda estados */}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pt-1">
            <span className="text-[11px] font-semibold text-slate-400">
              Estados:
            </span>
            {LEGEND.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600"
              >
                <span className={clsx('h-2 w-2 rounded-full', item.dot)} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* Panel derecho: un solo contenedor a alto completo */}
        <aside className="flex w-full shrink-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:w-[300px] xl:self-stretch">
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">Citas de Hoy</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {longTodayLabel(today)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  Total
                </p>
                <p className="mt-0.5 font-display text-xl font-bold text-slate-900">
                  {todayStats.total}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                  Confirmadas
                </p>
                <p className="mt-0.5 font-display text-xl font-bold text-emerald-700">
                  {todayStats.confirmed}
                </p>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700">
                  Pendientes
                </p>
                <p className="mt-0.5 font-display text-xl font-bold text-amber-700">
                  {todayStats.pending}
                </p>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-red-700">
                  Canceladas
                </p>
                <p className="mt-0.5 font-display text-xl font-bold text-red-700">
                  {todayStats.cancelled}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 min-h-0 flex-1">
            <h2 className="text-[15px] font-bold text-slate-800">
              Próximas Sesiones
            </h2>
            {upcoming.length === 0 ? (
              <p className="mt-6 text-center text-[12px] text-slate-400">
                Sin próximas citas hoy
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-white overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                {upcoming.map((a) => {
                  const vis = STATUS_VISUAL[a.status];
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setDetail(a)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-100/80"
                      >
                        <div className="w-[72px] shrink-0">
                          <p className="text-[13px] font-bold tabular-nums text-slate-800">
                            {timeFromIso(a.scheduledAt)}
                          </p>
                          <p className="truncate text-[11px] font-medium text-slate-500">
                            {(a.reason ?? '').trim() || 'Consulta'}
                          </p>
                        </div>
                        <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800">
                          {a.patientName ?? 'Paciente'}
                        </p>
                        <span
                          className={clsx(
                            'h-2 w-2 shrink-0 rounded-full',
                            vis.dot,
                          )}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div
            className={clsx(
              'mt-auto flex gap-2.5 rounded-xl border px-3.5 py-3',
              todayStats.waiting > 0
                ? 'border-teal-200 bg-[#e6f4f3]'
                : 'border-slate-200 bg-slate-50',
            )}
          >
            <AlertTriangle
              className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#2b7a78]"
              strokeWidth={2}
            />
            <div>
              <p className="text-[12px] font-bold text-teal-900">
                Control de Espera
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-teal-800/90">
                {todayStats.waiting > 0
                  ? `Hay ${todayStats.waiting} paciente${todayStats.waiting === 1 ? '' : 's'} en sala de espera. Favor coordinar el ingreso a consulta.`
                  : 'No hay pacientes en sala de espera.'}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Modales (misma lógica que legacy) */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nueva cita"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="appointment-create-form-v2"
              disabled={createMut.isPending}
            >
              Agendar
            </Button>
          </>
        }
      >
        <form
          id="appointment-create-form-v2"
          className="space-y-3"
          onSubmit={onCreate}
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              Paciente
            </span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
              required
            >
              <option value="">Seleccionar…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} · {p.documentId}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              Odontólogo
            </span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              value={form.dentistId}
              onChange={(e) => setForm({ ...form, dentistId: e.target.value })}
              required
            >
              <option value="">Seleccionar…</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="appt-date-v2"
              label="Fecha"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
            <Input
              id="time-v2"
              label="Hora"
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              required
            />
          </div>
          <Input
            id="duration-v2"
            label="Duración (min)"
            type="number"
            min={15}
            step={15}
            value={form.durationMin}
            onChange={(e) =>
              setForm({ ...form, durationMin: Number(e.target.value) })
            }
          />
          <Input
            id="reason-v2"
            label="Motivo / qué se va a hacer"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Ej.: Continuación endodoncia, control…"
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Editar cita"
        footer={
          detail ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDetail(null)}
              >
                Cerrar
              </Button>
              <Button
                type="submit"
                form="appointment-edit-form-v2"
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <form
            id="appointment-edit-form-v2"
            className="space-y-3"
            onSubmit={onSaveDetail}
          >
            <div>
              <p className="font-display text-lg font-semibold text-clinic-ink">
                {detail.patientName ?? 'Paciente'}
              </p>
              {detail.patientDocument && (
                <p className="text-sm text-clinic-slate">
                  Doc. {detail.patientDocument}
                </p>
              )}
              {detail.patientPhone &&
                (() => {
                  const wa = whatsappHref(
                    detail.patientPhone,
                    appointmentWhatsAppMessage({
                      patientName: detail.patientName ?? 'paciente',
                      clinicName,
                      dateLabel: edit.date.split('-').reverse().join('/'),
                      timeLabel: edit.time || null,
                    }),
                  );
                  if (!wa) return null;
                  return (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp recordatorio
                    </a>
                  );
                })()}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="edit-date-v2"
                label="Fecha"
                type="date"
                value={edit.date}
                onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                required
              />
              <Input
                id="edit-time-v2"
                label="Hora"
                type="time"
                value={edit.time}
                onChange={(e) => setEdit({ ...edit, time: e.target.value })}
                required
              />
            </div>

            <Input
              id="edit-duration-v2"
              label="Duración (min)"
              type="number"
              min={15}
              step={15}
              value={edit.durationMin}
              onChange={(e) =>
                setEdit({ ...edit, durationMin: Number(e.target.value) || 30 })
              }
            />

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Odontólogo
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                value={edit.dentistId}
                onChange={(e) =>
                  setEdit({ ...edit, dentistId: e.target.value })
                }
              >
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            </label>

            <Input
              id="edit-reason-v2"
              label="Motivo / qué se va a hacer"
              value={edit.reason}
              onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
            />

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Estado
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                value={edit.status}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    status: e.target.value as AppointmentStatus,
                  })
                }
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </form>
        )}
      </Modal>
    </div>
  );
}
