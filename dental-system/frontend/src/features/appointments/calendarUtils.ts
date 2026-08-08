/** Helpers de fechas locales para la agenda (sin UTC/Z). */

export type CalendarView = 'day' | 'week' | 'month';

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function todayYmd(): string {
  return toYmd(new Date());
}

export function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

/** Lunes = inicio de semana (ISO-like, local). */
export function startOfWeek(ymd: string): string {
  const d = parseYmd(ymd);
  const day = d.getDay(); // 0=dom
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toYmd(d);
}

export function endOfWeek(ymd: string): string {
  return addDays(startOfWeek(ymd), 6);
}

export function startOfMonth(ymd: string): string {
  const d = parseYmd(ymd);
  d.setDate(1);
  return toYmd(d);
}

export function endOfMonth(ymd: string): string {
  const d = parseYmd(ymd);
  d.setMonth(d.getMonth() + 1, 0);
  return toYmd(d);
}

/** Grid del mes: desde el lunes de la 1ª semana hasta el domingo de la última. */
export function monthGridRange(ymd: string): { from: string; to: string; days: string[] } {
  const from = startOfWeek(startOfMonth(ymd));
  const to = endOfWeek(endOfMonth(ymd));
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return { from, to, days };
}

export function weekDays(ymd: string): string[] {
  const start = startOfWeek(ymd);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function rangeForView(
  view: CalendarView,
  anchor: string,
): { from: string; to: string } {
  // Espacio en vez de T: MySQL DATETIME compara bien; evita rarezas de parseo
  if (view === 'day') {
    return { from: `${anchor} 00:00:00`, to: `${anchor} 23:59:59` };
  }
  if (view === 'week') {
    const from = startOfWeek(anchor);
    const to = endOfWeek(anchor);
    return { from: `${from} 00:00:00`, to: `${to} 23:59:59` };
  }
  const { from, to } = monthGridRange(anchor);
  return { from: `${from} 00:00:00`, to: `${to} 23:59:59` };
}

export function shiftAnchor(view: CalendarView, anchor: string, dir: -1 | 1): string {
  if (view === 'day') return addDays(anchor, dir);
  if (view === 'week') return addDays(anchor, dir * 7);
  const d = parseYmd(anchor);
  d.setMonth(d.getMonth() + dir);
  return toYmd(d);
}

export function formatViewTitle(view: CalendarView, anchor: string): string {
  const d = parseYmd(anchor);
  if (view === 'day') {
    return new Intl.DateTimeFormat('es-VE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  }
  if (view === 'week') {
    const from = parseYmd(startOfWeek(anchor));
    const to = parseYmd(endOfWeek(anchor));
    const sameMonth = from.getMonth() === to.getMonth();
    const left = new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: sameMonth ? undefined : 'short',
    }).format(from);
    const right = new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(to);
    return `${left} – ${right}`;
  }
  return new Intl.DateTimeFormat('es-VE', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function weekdayShort(ymd: string): string {
  return new Intl.DateTimeFormat('es-VE', { weekday: 'short' }).format(parseYmd(ymd));
}

export function dayNumber(ymd: string): number {
  return parseYmd(ymd).getDate();
}

export function isSameMonth(ymd: string, anchor: string): boolean {
  const a = parseYmd(ymd);
  const b = parseYmd(anchor);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Interpreta fecha/hora de agenda como reloj de pared (sin shift UTC).
 * MySQL DATETIME + JSON ISO con Z suelen representar la hora local de la clínica.
 */
export function wallClock(iso: string): { ymd: string; hour: number; minute: number } {
  const m = String(iso).match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/,
  );
  if (m) {
    return {
      ymd: `${m[1]}-${m[2]}-${m[3]}`,
      hour: Number(m[4]),
      minute: Number(m[5]),
    };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { ymd: todayYmd(), hour: 0, minute: 0 };
  }
  return {
    ymd: toYmd(d),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

export function ymdFromIso(iso: string): string {
  return wallClock(iso).ymd;
}

export function timeFromIso(iso: string): string {
  const { hour, minute } = wallClock(iso);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function minutesFromMidnight(iso: string): number {
  const { hour, minute } = wallClock(iso);
  return hour * 60 + minute;
}

/** Franja visible del día/semana (minutos desde 00:00). */
export const DAY_START_MIN = 7 * 60; // 07:00
export const DAY_END_MIN = 20 * 60; // 20:00
export const SLOT_PX = 28; // px por hora — compacto

export function hourLabels(): number[] {
  const hours: number[] = [];
  for (let h = DAY_START_MIN / 60; h < DAY_END_MIN / 60; h++) hours.push(h);
  return hours;
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}
