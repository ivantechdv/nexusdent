import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../config';
import { sendAppointmentReminderEmail } from '../utils/mail';

const CLINIC_TZ =
  process.env.APPOINTMENT_REMINDER_TZ?.trim() ||
  process.env.CLINIC_TZ?.trim() ||
  'America/Caracas';

type ReminderRow = RowDataPacket & {
  id: string;
  confirm_token: string | null;
  scheduled_at: Date | string;
  reason: string | null;
  patient_name: string;
  patient_email: string;
  dentist_name: string;
  clinic_name: string;
};

function apiPublicUrl(): string {
  return (
    process.env.API_PUBLIC_URL?.trim() ||
    `http://localhost:${process.env.PORT ?? 4000}`
  ).replace(/\/$/, '');
}

function formatScheduledAt(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: CLINIC_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function getTzParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Instant UTC cuando en CLINIC_TZ es y-m-d h:mi:s */
function wallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): number {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i++) {
    const parts = getTzParts(new Date(utc));
    const shown = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    utc += desired - shown;
  }
  return utc;
}

function addCalendarDays(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Fecha objetivo del recordatorio: hoy (calendario clínica) + 2 días */
export function reminderTargetDate(now = new Date()): string {
  const p = getTzParts(now);
  const t = addCalendarDays(p.year, p.month, p.day, 2);
  return formatYmd(t.year, t.month, t.day);
}

/** @deprecated usar reminderTargetDate */
export function reminderTargetDateNy(now = new Date()): string {
  return reminderTargetDate(now);
}

function msUntilNextHour(hour: number, nowMs = Date.now()): number {
  const p = getTzParts(new Date(nowMs));
  let target = wallTimeToUtcMs(p.year, p.month, p.day, hour, 0, 0);
  if (target <= nowMs) {
    const next = addCalendarDays(p.year, p.month, p.day, 1);
    target = wallTimeToUtcMs(next.year, next.month, next.day, hour, 0, 0);
  }
  return Math.max(1000, target - nowMs);
}

let running = false;

/**
 * Envía recordatorios a pacientes con cita dentro de 2 días calendario (CLINIC_TZ)
 * (status PENDING/CONFIRMED, con email, aún no notificados).
 */
export async function runAppointmentReminders(): Promise<{
  candidates: number;
  sent: number;
  logged: number;
  failed: number;
  targetDate: string;
}> {
  const targetDate = reminderTargetDate();
  if (running) {
    return { candidates: 0, sent: 0, logged: 0, failed: 0, targetDate };
  }
  running = true;

  const stats = { candidates: 0, sent: 0, logged: 0, failed: 0, targetDate };

  try {
    const [rows] = await dbPool.query<ReminderRow[]>(
      `SELECT a.id, a.confirm_token, a.scheduled_at, a.reason,
              p.full_name AS patient_name, p.email AS patient_email,
              u.full_name AS dentist_name,
              c.name AS clinic_name
       FROM appointments a
       INNER JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
       INNER JOIN users u ON u.id = a.dentist_id
       INNER JOIN clinics c ON c.id = a.clinic_id
       WHERE a.reminder_sent_at IS NULL
         AND a.status IN ('PENDING', 'CONFIRMED')
         AND p.email IS NOT NULL
         AND TRIM(p.email) <> ''
         AND DATE(a.scheduled_at) = :targetDate
       ORDER BY a.scheduled_at ASC
       LIMIT 200`,
      { targetDate },
    );

    stats.candidates = rows.length;
    const base = apiPublicUrl();

    for (const row of rows) {
      let token = row.confirm_token;
      if (!token) {
        token = uuidv4();
        await dbPool.query<ResultSetHeader>(
          `UPDATE appointments SET confirm_token = :token WHERE id = :id AND confirm_token IS NULL`,
          { token, id: row.id },
        );
      }

      try {
        const mail = await sendAppointmentReminderEmail({
          to: row.patient_email.trim(),
          patientName: row.patient_name,
          clinicName: row.clinic_name,
          dentistName: row.dentist_name,
          scheduledAtLabel: formatScheduledAt(row.scheduled_at),
          reason: row.reason,
          confirmUrl: `${base}/api/appointments/public/${token}/confirm`,
          cancelUrl: `${base}/api/appointments/public/${token}/cancel`,
        });

        await dbPool.query<ResultSetHeader>(
          `UPDATE appointments SET reminder_sent_at = NOW() WHERE id = :id`,
          { id: row.id },
        );

        if (mail.sent) stats.sent += 1;
        if (mail.logged) stats.logged += 1;
      } catch (err) {
        stats.failed += 1;
        console.error('[reminders] fallo al enviar', row.id, err);
      }
    }

    console.info(
      `[reminders] target=${targetDate} candidatos=${stats.candidates} enviados=${stats.sent} log=${stats.logged} fallidos=${stats.failed}`,
    );
  } catch (err) {
    console.error('[reminders] job error', err);
  } finally {
    running = false;
  }

  return stats;
}

export function startAppointmentReminderScheduler() {
  const enabled = process.env.APPOINTMENT_REMINDER_ENABLED !== '0';
  if (!enabled) {
    console.info('[reminders] deshabilitado (APPOINTMENT_REMINDER_ENABLED=0)');
    return;
  }

  const hour = Math.min(
    23,
    Math.max(
      0,
      Number(
        process.env.APPOINTMENT_REMINDER_HOUR ??
          process.env.APPOINTMENT_REMINDER_HOUR_NY ??
          9,
      ) || 9,
    ),
  );

  const scheduleNext = () => {
    const delay = msUntilNextHour(hour);
    const nextAt = new Date(Date.now() + delay);
    console.info(
      `[reminders] próxima corrida ${nextAt.toISOString()} (≈ ${hour}:00 ${CLINIC_TZ})`,
    );
    setTimeout(() => {
      void runAppointmentReminders().finally(() => scheduleNext());
    }, delay);
  };

  scheduleNext();

  if (process.env.APPOINTMENT_REMINDER_RUN_ON_BOOT === '1') {
    setTimeout(() => {
      void runAppointmentReminders();
    }, Number(process.env.APPOINTMENT_REMINDER_BOOT_DELAY_MS ?? 5_000));
    console.info('[reminders] RUN_ON_BOOT=1 — corrida extra al arrancar');
  }
}
