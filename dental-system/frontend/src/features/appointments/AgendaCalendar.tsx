import clsx from 'clsx';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarRange,
  LayoutList,
} from 'lucide-react';
import { Button } from '@/components/Button';
import type { Appointment, AppointmentStatus } from '@/services/appointments.api';
import {
  type CalendarView,
  DAY_END_MIN,
  DAY_START_MIN,
  SLOT_PX,
  dayNumber,
  formatHour,
  formatViewTitle,
  hourLabels,
  isSameMonth,
  minutesFromMidnight,
  monthGridRange,
  shiftAnchor,
  timeFromIso,
  todayYmd,
  weekDays,
  weekdayShort,
  ymdFromIso,
} from './calendarUtils';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  WAITING_ROOM: 'Sala de espera',
  IN_PROGRESS: 'En consulta',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

function statusTone(status: AppointmentStatus): string {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-900 border-emerald-200';
  if (status === 'CANCELLED' || status === 'NO_SHOW')
    return 'bg-red-50 text-red-800 border-red-200';
  if (status === 'IN_PROGRESS' || status === 'WAITING_ROOM')
    return 'bg-amber-50 text-amber-900 border-amber-200';
  return 'bg-sky-50 text-sky-900 border-sky-200';
}

function eventTone(a: Appointment): string {
  if (a.status === 'COMPLETED') return 'bg-emerald-50 border-emerald-200 text-emerald-900';
  if (a.status === 'CANCELLED' || a.status === 'NO_SHOW')
    return 'bg-red-50 border-red-200 text-red-800';
  if (a.status === 'IN_PROGRESS' || a.status === 'WAITING_ROOM')
    return 'bg-amber-50 border-amber-200 text-amber-900';
  if (/continuaci[oó]n/i.test(a.reason ?? ''))
    return 'bg-violet-50 border-violet-200 text-violet-900';
  return 'bg-clinic-deep/10 border-clinic-deep/25 text-clinic-ink';
}

export interface AgendaCalendarProps {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  anchor: string;
  onAnchorChange: (ymd: string) => void;
  appointments: Appointment[];
  loading?: boolean;
  onSelectAppointment: (a: Appointment) => void;
  onCreateAt: (ymd: string, time?: string) => void;
}

function groupByDay(appointments: Appointment[]): Map<string, Appointment[]> {
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

function EventChip({
  a,
  compact,
  dense,
  onClick,
}: {
  a: Appointment;
  compact?: boolean;
  /** Una sola línea para grilla semanal/día */
  dense?: boolean;
  onClick: () => void;
}) {
  const cont = /continuaci[oó]n/i.test(a.reason ?? '');
  const reasonShort = cont
    ? 'Continuación'
    : (a.reason ?? '').trim() || null;
  const label = `${timeFromIso(a.scheduledAt)} · ${a.patientName ?? 'Paciente'}${
    reasonShort ? ` · ${reasonShort}` : ''
  }`;

  if (dense) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title={label}
        className={clsx(
          'flex h-full w-full items-start overflow-hidden rounded border px-1 py-0.5 text-left text-[10px] leading-tight transition hover:brightness-[0.97]',
          eventTone(a),
        )}
      >
        <span className="min-w-0 truncate">
          <span className="font-bold tabular-nums">
            {timeFromIso(a.scheduledAt)}
          </span>
          <span className="mx-0.5 opacity-40">·</span>
          <span className="font-semibold">{a.patientName ?? 'Paciente'}</span>
          {reasonShort && (
            <span className="opacity-75"> · {reasonShort}</span>
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        'w-full rounded border px-1 py-0.5 text-left transition hover:brightness-[0.97] active:scale-[0.99]',
        eventTone(a),
        compact ? 'text-[9px] leading-tight' : 'text-[11px] leading-snug',
      )}
      title={label}
    >
      <span className="font-bold tabular-nums">
        {timeFromIso(a.scheduledAt)}
      </span>
      {!compact && (
        <>
          <span className="mx-0.5 opacity-40">·</span>
          <span className="font-semibold">{a.patientName ?? 'Paciente'}</span>
        </>
      )}
      {compact && (
        <span className="mt-0 block truncate font-semibold">
          {a.patientName ?? 'Paciente'}
        </span>
      )}
      {!compact && reasonShort && (
        <span className="mt-0 block truncate text-[10px] opacity-75">
          {reasonShort}
          {a.dentistName ? ` · ${a.dentistName.split(' ')[0]}` : ''}
        </span>
      )}
    </button>
  );
}

function TimeGrid({
  days,
  byDay,
  onSelectAppointment,
  onCreateAt,
}: {
  days: string[];
  byDay: Map<string, Appointment[]>;
  onSelectAppointment: (a: Appointment) => void;
  onCreateAt: (ymd: string, time?: string) => void;
}) {
  const hours = hourLabels();
  const totalMin = DAY_END_MIN - DAY_START_MIN;
  const height = (totalMin / 60) * SLOT_PX;
  const today = todayYmd();
  const colCount = days.length;

  return (
    <div className="overflow-x-auto">
      <div
        className="min-w-[560px]"
        style={{
          display: 'grid',
          gridTemplateColumns: `40px repeat(${colCount}, minmax(0, 1fr))`,
          gridTemplateRows: `auto ${height}px`,
        }}
      >
        <div className="border-b border-slate-100 bg-white" />
        {days.map((d) => (
          <div
            key={`h-${d}`}
            className={clsx(
              'border-b border-l border-slate-100 bg-white px-1 py-1 text-center',
              d === today && 'bg-clinic-deep/5',
            )}
          >
            <p className="text-[9px] font-semibold uppercase tracking-wide text-clinic-slate">
              {weekdayShort(d)}
            </p>
            <p
              className={clsx(
                'font-display text-sm font-semibold leading-none',
                d === today ? 'text-clinic-deep' : 'text-clinic-ink',
              )}
            >
              {dayNumber(d)}
            </p>
          </div>
        ))}

        <div className="relative border-r border-slate-100 bg-white">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute right-0.5 -translate-y-1/2 text-[9px] tabular-nums text-clinic-slate"
              style={{ top: ((h * 60 - DAY_START_MIN) / 60) * SLOT_PX }}
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
              className="relative border-l border-slate-100 bg-slate-50/20"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const mins =
                  DAY_START_MIN + Math.round(((y / SLOT_PX) * 60) / 15) * 15;
                const clamped = Math.max(
                  DAY_START_MIN,
                  Math.min(DAY_END_MIN - 15, mins),
                );
                const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
                const mm = String(clamped % 60).padStart(2, '0');
                onCreateAt(d, `${hh}:${mm}`);
              }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t border-slate-100/80"
                  style={{ top: ((h * 60 - DAY_START_MIN) / 60) * SLOT_PX }}
                />
              ))}
              {list.map((a) => {
                const start = minutesFromMidnight(a.scheduledAt);
                const dur = Math.max(15, a.durationMin || 30);
                // Si está fuera de franja, extender visualmente al borde (sin mentir la hora del chip)
                let top: number;
                let hPx: number;
                if (start + dur <= DAY_START_MIN) {
                  top = 0;
                  hPx = 22;
                } else if (start >= DAY_END_MIN) {
                  top = height - 22;
                  hPx = 22;
                } else {
                  const clippedStart = Math.max(start, DAY_START_MIN);
                  const clippedEnd = Math.min(start + dur, DAY_END_MIN);
                  top = ((clippedStart - DAY_START_MIN) / 60) * SLOT_PX;
                  hPx = Math.max(22, ((clippedEnd - clippedStart) / 60) * SLOT_PX - 1);
                }
                return (
                  <div
                    key={a.id}
                    className="absolute inset-x-0.5 z-[2]"
                    style={{
                      top,
                      height: Math.min(hPx, height - top - 1),
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EventChip
                      a={a}
                      dense
                      onClick={() => onSelectAppointment(a)}
                    />
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

export function AgendaCalendar({
  view,
  onViewChange,
  anchor,
  onAnchorChange,
  appointments,
  loading,
  onSelectAppointment,
  onCreateAt,
}: AgendaCalendarProps) {
  const byDay = groupByDay(appointments);
  const today = todayYmd();
  const title = formatViewTitle(view, anchor);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {(
              [
                { id: 'day' as const, label: 'Día', Icon: LayoutList },
                { id: 'week' as const, label: 'Semana', Icon: CalendarRange },
                { id: 'month' as const, label: 'Mes', Icon: CalendarDays },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onViewChange(id)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition',
                  view === id
                    ? 'bg-clinic-deep text-white'
                    : 'text-clinic-slate hover:bg-slate-50',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onAnchorChange(todayYmd())}
            className="!px-2.5 !py-1 text-[11px]"
          >
            Hoy
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Anterior"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-clinic-slate hover:bg-slate-50"
            onClick={() => onAnchorChange(shiftAnchor(view, anchor, -1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <p className="min-w-[9rem] text-center font-display text-sm font-semibold capitalize text-clinic-ink sm:min-w-[12rem]">
            {title}
          </p>
          <button
            type="button"
            aria-label="Siguiente"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-clinic-slate hover:bg-slate-50"
            onClick={() => onAnchorChange(shiftAnchor(view, anchor, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="panel p-8 text-center text-sm text-clinic-slate">
          Cargando agenda…
        </p>
      ) : view === 'month' ? (
        <MonthView
          anchor={anchor}
          byDay={byDay}
          today={today}
          onSelectDay={(d) => {
            onAnchorChange(d);
            onViewChange('day');
          }}
          onSelectAppointment={onSelectAppointment}
          onCreateAt={onCreateAt}
        />
      ) : view === 'week' ? (
        <div className="space-y-3">
          <div className="panel overflow-hidden p-0">
            <TimeGrid
              days={weekDays(anchor)}
              byDay={byDay}
              onSelectAppointment={onSelectAppointment}
              onCreateAt={onCreateAt}
            />
          </div>
          {appointments.length > 0 && (
            <div className="panel space-y-2 p-3 md:hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Citas de la semana ({appointments.length})
              </p>
              <ul className="space-y-1.5">
                {appointments.map((a) => (
                  <li key={a.id}>
                    <EventChip
                      a={a}
                      onClick={() => onSelectAppointment(a)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <DayView
          anchor={anchor}
          list={byDay.get(anchor) ?? []}
          onSelectAppointment={onSelectAppointment}
          onCreateAt={onCreateAt}
        />
      )}
    </div>
  );
}

function MonthView({
  anchor,
  byDay,
  today,
  onSelectDay,
  onSelectAppointment,
  onCreateAt,
}: {
  anchor: string;
  byDay: Map<string, Appointment[]>;
  today: string;
  onSelectDay: (ymd: string) => void;
  onSelectAppointment: (a: Appointment) => void;
  onCreateAt: (ymd: string, time?: string) => void;
}) {
  const { days } = monthGridRange(anchor);
  const headers = weekDays(anchor);

  return (
    <div className="panel overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80">
        {headers.map((d) => (
          <div
            key={d}
            className="px-0.5 py-1 text-center text-[9px] font-semibold uppercase tracking-wide text-clinic-slate"
          >
            {weekdayShort(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const inMonth = isSameMonth(d, anchor);
          const maxShow = 4;
          const extra = list.length - maxShow;
          return (
            <div
              key={d}
              className={clsx(
                'min-h-[72px] border-b border-r border-slate-100 p-0.5 sm:min-h-[84px]',
                !inMonth && 'bg-slate-50/60',
                d === today && 'bg-clinic-deep/[0.04]',
              )}
              onClick={() => onCreateAt(d, '10:00')}
            >
              <button
                type="button"
                className={clsx(
                  'mb-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                  d === today
                    ? 'bg-clinic-deep text-white'
                    : inMonth
                      ? 'text-clinic-ink hover:bg-slate-100'
                      : 'text-slate-400 hover:bg-slate-100',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectDay(d);
                }}
              >
                {dayNumber(d)}
              </button>
              <div className="space-y-px">
                {list.slice(0, maxShow).map((a) => (
                  <EventChip
                    key={a.id}
                    a={a}
                    compact
                    onClick={() => onSelectAppointment(a)}
                  />
                ))}
                {extra > 0 && (
                  <button
                    type="button"
                    className="w-full px-0.5 text-left text-[9px] font-semibold text-clinic-deep hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDay(d);
                    }}
                  >
                    +{extra} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  anchor,
  list,
  onSelectAppointment,
  onCreateAt,
}: {
  anchor: string;
  list: Appointment[];
  onSelectAppointment: (a: Appointment) => void;
  onCreateAt: (ymd: string, time?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="panel overflow-hidden p-0">
        <TimeGrid
          days={[anchor]}
          byDay={new Map([[anchor, list]])}
          onSelectAppointment={onSelectAppointment}
          onCreateAt={onCreateAt}
        />
      </div>

      <div className="panel space-y-2 p-3 sm:hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
          Turnos del día
        </p>
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm text-clinic-slate">
            Sin citas. Tocá el timeline para agendar.
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={clsx(
                    'w-full rounded-lg border px-3 py-2.5 text-left',
                    eventTone(a),
                  )}
                  onClick={() => onSelectAppointment(a)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold tabular-nums">
                        {timeFromIso(a.scheduledAt)}
                        <span className="ml-1 text-xs font-normal opacity-70">
                          · {a.durationMin} min
                        </span>
                      </p>
                      <p className="mt-0.5 font-medium">
                        {a.patientName ?? 'Paciente'}
                      </p>
                      <p className="text-xs opacity-80">
                        {a.dentistName}
                        {a.reason ? ` · ${a.reason}` : ''}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                        statusTone(a.status),
                      )}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          className="w-full"
          onClick={() => onCreateAt(anchor, '10:00')}
        >
          Nueva cita
        </Button>
      </div>
    </div>
  );
}

export { STATUS_LABEL };
