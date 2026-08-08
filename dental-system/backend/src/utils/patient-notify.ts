import { RowDataPacket } from 'mysql2';
import { dbPool } from '../config';
import {
  sendPaymentReceiptEmail,
  sendVisitSummaryEmail,
  type VisitSummaryProc,
} from './mail';

const CLINIC_TZ =
  process.env.CLINIC_TZ?.trim() ||
  process.env.APPOINTMENT_REMINDER_TZ?.trim() ||
  'America/Caracas';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  ZELLE: 'Zelle',
  TRANSFER: 'Transferencia',
  PAGO_MOVIL: 'Pago móvil',
  CARD: 'Tarjeta',
};

export function formatClinicDateTime(value: Date | string): string {
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

/** Envío best-effort: no falla la atención si el mail cae. */
export async function maybeSendVisitSummaryEmail(opts: {
  clinicId: string;
  patientId: string;
  dentistId: string;
  procedures: VisitSummaryProc[];
  prescription?: string | null;
  totalAmount?: number | null;
  nextAppointmentId?: string | null;
}): Promise<void> {
  try {
    const [patients] = await dbPool.query<RowDataPacket[]>(
      `SELECT full_name, email FROM patients
       WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
      { id: opts.patientId, clinicId: opts.clinicId },
    );
    const patient = patients[0];
    const email = String(patient?.email ?? '').trim();
    if (!email) return;

    const [[clinic], [dentist], nextRows] = await Promise.all([
      dbPool
        .query<RowDataPacket[]>(
          `SELECT name FROM clinics WHERE id = :id LIMIT 1`,
          { id: opts.clinicId },
        )
        .then(([r]) => r),
      dbPool
        .query<RowDataPacket[]>(
          `SELECT full_name FROM users WHERE id = :id LIMIT 1`,
          { id: opts.dentistId },
        )
        .then(([r]) => r),
      opts.nextAppointmentId
        ? dbPool
            .query<RowDataPacket[]>(
              `SELECT a.scheduled_at, u.full_name AS dentist_name
               FROM appointments a
               LEFT JOIN users u ON u.id = a.dentist_id
               WHERE a.id = :id AND a.clinic_id = :clinicId
               LIMIT 1`,
              { id: opts.nextAppointmentId, clinicId: opts.clinicId },
            )
            .then(([r]) => r)
        : Promise.resolve([] as RowDataPacket[]),
    ]);

    const next = nextRows[0];
    await sendVisitSummaryEmail({
      to: email,
      patientName: String(patient.full_name),
      clinicName: String(clinic?.name ?? 'Clínica'),
      dentistName: String(dentist?.full_name ?? 'Odontólogo'),
      attendedAtLabel: formatClinicDateTime(new Date()),
      procedures: opts.procedures,
      prescription: opts.prescription ?? null,
      totalAmount: opts.totalAmount ?? null,
      nextAppointmentLabel: next
        ? formatClinicDateTime(next.scheduled_at)
        : null,
      nextDentistName: next?.dentist_name
        ? String(next.dentist_name)
        : null,
    });
  } catch (err) {
    console.error('[mail] visit summary failed', err);
  }
}

export async function maybeSendPaymentReceiptEmail(opts: {
  clinicId: string;
  patientId: string;
  amountUsd: number;
  amountVes: number;
  exchangeRate: number;
  methods: string[];
  receiptNumbers: string[];
  balanceDue: number;
}): Promise<void> {
  try {
    const [patients] = await dbPool.query<RowDataPacket[]>(
      `SELECT full_name, email FROM patients
       WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
      { id: opts.patientId, clinicId: opts.clinicId },
    );
    const patient = patients[0];
    const email = String(patient?.email ?? '').trim();
    if (!email) return;

    const [clinics] = await dbPool.query<RowDataPacket[]>(
      `SELECT name FROM clinics WHERE id = :id LIMIT 1`,
      { id: opts.clinicId },
    );

    const methodsLabel = [
      ...new Set(opts.methods.map((m) => METHOD_LABEL[m] ?? m)),
    ].join(', ');

    await sendPaymentReceiptEmail({
      to: email,
      patientName: String(patient.full_name),
      clinicName: String(clinics[0]?.name ?? 'Clínica'),
      amountUsd: opts.amountUsd,
      amountVes: opts.amountVes,
      exchangeRate: opts.exchangeRate,
      methodsLabel,
      receiptNumbers: opts.receiptNumbers,
      paidAtLabel: formatClinicDateTime(new Date()),
      balanceDue: opts.balanceDue,
    });
  } catch (err) {
    console.error('[mail] payment receipt failed', err);
  }
}
