import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckSquare,
  ChevronDown,
  ClipboardPlus,
  FileText,
  Pencil,
  Printer,
  Square,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import { MoneyAmount } from '@/components/MoneyAmount';
import { Button } from '@/components/Button';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { printAttentionDays } from '@/lib/printAttentionDays';
import {
  printMedicalHistory,
  type MedicalHistoryPatient,
} from '@/lib/printMedicalHistory';
import { PrintFormatPicker } from '@/features/print/PrintFormatPicker';
import { getClinicSettingsApi } from '@/services/clinic-settings.api';
import type { PrintFormat } from '@/services/print-templates.api';
import type { OdontogramStateItem } from '@/features/clinical-history/odontogram.types';
export interface ClinicalEvolution {
  id: string;
  patientId?: string;
  signedAt: string;
  dentistName: string;
  appointmentId?: string | null;
  toothNumber?: number | null;
  treatmentName?: string | null;
  treatmentCode?: string | null;
  clinicalNotes: string;
  prescription?: string | null;
  attachmentUrl?: string | null;
  billing?: {
    planId: string;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    items: Array<{
      treatmentId: number;
      code: string;
      name: string;
      toothNumber: number | null;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
  } | null;
  sessionAppointment?: {
    id: string;
    scheduledAt: string;
    status: string;
    reason: string | null;
    dentistName?: string | null;
  } | null;
  nextAppointment?: {
    id: string;
    scheduledAt: string;
    status: string;
    reason: string | null;
    dentistName?: string | null;
  } | null;
  procedures?: Array<{
    code?: string | null;
    name?: string | null;
    toothNumber?: number | null;
    quantity?: number;
    unitPrice?: number;
    lineTotal?: number;
  }>;
}

interface ClinicalTimelineProps {
  evolutions: ClinicalEvolution[];
  patientName?: string;
  documentId?: string;
  clinicName?: string | null;
  /** Datos para imprimir historia clínico-odontológica */
  medicalPatient?: MedicalHistoryPatient | null;
  odontogramStates?: OdontogramStateItem[];
  onOpenVisitSession?: () => void;
  onEditEvolution?: (id: string) => void;
  onDeleteEvolution?: (id: string) => Promise<void> | void;
}

type DayGroup = {
  key: string;
  label: string;
  items: ClinicalEvolution[];
};

function AuthenticatedAttachmentLink({ url }: { url: string }) {
  const token = useAuthStore((s) => s.token);
  const href =
    token && url.includes('/api/uploads/')
      ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`
      : url;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-block text-xs font-semibold text-clinic-deep hover:underline"
    >
      Ver adjunto clínico
    </a>
  );
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ej: "miércoles 27/03/2026" */
function formatDayHeader(iso: string): string {
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat('es-VE', { weekday: 'long' }).format(d);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${weekday} ${dd}/${mm}/${yyyy}`;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatApptWhen(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return `${date} ${time}`;
}

const APPT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  WAITING_ROOM: 'Sala de espera',
  IN_PROGRESS: 'En consulta',
  COMPLETED: 'Realizada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

function isSessionStub(notes: string): boolean {
  const plain = notes.replace(/<[^>]+>/g, '').trim();
  return /^sesión conjunta/i.test(plain);
}

function stripHtml(notes: string): string {
  return notes.includes('<')
    ? notes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : notes.trim();
}

/** Quita el bloque Procedimientos del texto si ya van en badges */
function stripProceduresSection(notes: string): string {
  const plain = notes.includes('<')
    ? notes
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
    : notes;

  const cut = plain.search(/\n\s*Procedimientos(\s+realizados)?\s*:/i);
  const trimmed =
    cut >= 0 ? plain.slice(0, cut).trim() : plain.trim();
  // Piezas ya van en badges
  return trimmed
    .replace(/\n\s*Piezas( trabajadas)?:\s*[^\n]+/gi, '')
    .replace(/\n\s*Adjuntos:\s*[^\n]+/gi, '')
    .trim();
}

/** Quita listados de procs duplicados y stubs en el cuerpo */
function cleanClinicalNotes(notes: string): string {
  const plain = notes.includes('<')
    ? notes
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
    : notes;

  const lines = plain
    .split(/\n/)
    .map((l) => l.trimEnd())
    .filter((l) => !/^sesión conjunta/i.test(l.trim()));

  const hasProcs = lines.some((l) => /^procedimientos(\s+realizados)?\s*:?\s*$/i.test(l.trim()));
  let seenProcsHeader = false;
  const deduped: string[] = [];
  for (const line of lines) {
    if (/^procedimientos(\s+realizados)?\s*:?\s*$/i.test(line.trim())) {
      if (seenProcsHeader) continue;
      seenProcsHeader = true;
      deduped.push('Procedimientos:');
      continue;
    }
    // Evitar bloque "Procedimientos:" del default + "Procedimientos realizados:" del backend
    if (
      hasProcs &&
      seenProcsHeader &&
      /^procedimientos(\s+realizados)?\s*:?\s*$/i.test(line.trim())
    ) {
      continue;
    }
    deduped.push(line);
  }

  // Recortar líneas vacías repetidas
  const compact = deduped
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return compact.replace(/\n/g, '<br/>');
}

function sessionGroupKey(ev: ClinicalEvolution): string {
  if (ev.appointmentId) return `appt:${ev.appointmentId}`;
  const minute = new Date(ev.signedAt);
  minute.setSeconds(0, 0);
  return `t:${minute.toISOString()}|d:${ev.dentistName}`;
}

/**
 * Une stubs "Sesión conjunta" de la misma atención en una sola tarjeta.
 */
function consolidateSessions(
  evolutions: ClinicalEvolution[],
): ClinicalEvolution[] {
  const map = new Map<string, ClinicalEvolution[]>();
  for (const ev of evolutions) {
    const key = sessionGroupKey(ev);
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }

  const result: ClinicalEvolution[] = [];
  for (const group of map.values()) {
    if (group.length === 1) {
      const only = group[0];
      result.push({
        ...only,
        clinicalNotes: isSessionStub(only.clinicalNotes)
          ? ''
          : cleanClinicalNotes(only.clinicalNotes),
        billing: only.billing ?? null,
        sessionAppointment: only.sessionAppointment ?? null,
        nextAppointment: only.nextAppointment ?? null,
        procedures: mergeProcedures(
          only.treatmentName || only.treatmentCode
            ? [
                {
                  code: only.treatmentCode,
                  name: only.treatmentName,
                  toothNumber: only.toothNumber,
                },
              ]
            : [],
        ),
      });
      continue;
    }

    const primary =
      group.find((g) => !isSessionStub(g.clinicalNotes)) ?? group[0];
    const procedures = mergeProcedures(
      group
        .filter((g) => g.treatmentName || g.treatmentCode)
        .map((g) => ({
          code: g.treatmentCode,
          name: g.treatmentName,
          toothNumber: g.toothNumber,
        })),
    );

    result.push({
      ...primary,
      toothNumber: null,
      treatmentName: null,
      treatmentCode: null,
      clinicalNotes: isSessionStub(primary.clinicalNotes)
        ? ''
        : cleanClinicalNotes(primary.clinicalNotes),
      prescription: group.find((g) => g.prescription)?.prescription ?? null,
      attachmentUrl: group.find((g) => g.attachmentUrl)?.attachmentUrl ?? null,
      billing:
        group.find((g) => !isSessionStub(g.clinicalNotes) && g.billing)
          ?.billing ??
        group.find((g) => g.billing)?.billing ??
        primary.billing ??
        null,
      sessionAppointment:
        group.find((g) => g.sessionAppointment)?.sessionAppointment ??
        primary.sessionAppointment ??
        null,
      nextAppointment:
        group.find((g) => g.nextAppointment)?.nextAppointment ??
        primary.nextAppointment ??
        null,
      procedures,
    });
  }

  return result.sort(
    (a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime(),
  );
}

type ProcLine = {
  code?: string | null;
  name?: string | null;
  toothNumber?: number | null;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
};

function mergeProcedures(
  procs: Array<{
    code?: string | null;
    name?: string | null;
    toothNumber?: number | null;
    quantity?: number;
    unitPrice?: number;
    lineTotal?: number;
  }>,
): ProcLine[] {
  const withTooth = procs.filter((p) => p.toothNumber != null);
  const withoutTooth = procs.filter((p) => p.toothNumber == null);

  const counts = new Map<string, ProcLine>();

  function add(p: (typeof procs)[number]) {
    const key = `${p.code ?? ''}|${p.name ?? ''}|${p.toothNumber ?? ''}`;
    const prev = counts.get(key);
    const qty = p.quantity ?? 1;
    if (prev) {
      prev.quantity += qty;
      if (p.lineTotal != null) {
        prev.lineTotal = (prev.lineTotal ?? 0) + p.lineTotal;
      }
      return;
    }
    counts.set(key, {
      code: p.code,
      name: p.name,
      toothNumber: p.toothNumber,
      quantity: qty,
      unitPrice: p.unitPrice,
      lineTotal: p.lineTotal,
    });
  }

  for (const p of withTooth) add(p);

  for (const p of withoutTooth) {
    const covered = [...counts.values()].some(
      (r) => r.code === p.code && r.name === p.name && r.toothNumber != null,
    );
    if (covered) continue;
    add(p);
  }

  return [...counts.values()];
}

function proceduresFromBilling(
  billing: NonNullable<ClinicalEvolution['billing']>,
): ProcLine[] {
  return billing.items.map((i) => ({
    code: i.code,
    name: i.name,
    toothNumber: i.toothNumber,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
  }));
}

function groupByDayNewestFirst(evolutions: ClinicalEvolution[]): DayGroup[] {
  const map = new Map<string, ClinicalEvolution[]>();
  const sorted = [...evolutions].sort(
    (a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime(),
  );

  for (const ev of sorted) {
    const key = dayKey(ev.signedAt);
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }

  return [...map.entries()].map(([key, items]) => ({
    key,
    label: formatDayHeader(items[0].signedAt),
    items,
  }));
}

function EvolutionCard({
  ev,
  onEdit,
  onDelete,
}: {
  ev: ClinicalEvolution;
  onEdit?: ClinicalTimelineProps['onEditEvolution'];
  onDelete?: ClinicalTimelineProps['onDeleteEvolution'];
}) {
  const procs: ProcLine[] = ev.billing?.items?.length
    ? proceduresFromBilling(ev.billing)
    : ev.procedures && ev.procedures.length > 0
      ? mergeProcedures(ev.procedures)
      : ev.treatmentName || ev.treatmentCode
        ? mergeProcedures([
            {
              code: ev.treatmentCode,
              name: ev.treatmentName,
              toothNumber: ev.toothNumber,
            },
          ])
        : [];

  const rawNotes = ev.clinicalNotes?.trim() ?? '';
  const displayPlain =
    procs.length > 0 ? stripProceduresSection(rawNotes) : stripHtml(rawNotes);
  const isGenericNote = /^atención del d[ií]a\.?$/i.test(displayPlain.trim());
  const showBody =
    Boolean(displayPlain) &&
    !isSessionStub(displayPlain) &&
    !isGenericNote;
  const bodyHtml = showBody ? displayPlain.replace(/\n/g, '<br/>') : '';
  const billing = ev.billing;

  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!onDelete) return;
    const ok = window.confirm(
      '¿Eliminar esta atención del día? Se borran las notas y el cobro asociado (si no tiene abonos).',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await onDelete(ev.id);
      toast('Atención eliminada', 'success');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo eliminar';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="space-y-3 py-3">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums text-clinic-ink">
            {formatTime(ev.signedAt)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-clinic-slate">
            <Stethoscope className="h-3.5 w-3.5 shrink-0 text-clinic-deep" />
            <span className="truncate">{ev.dentistName}</span>
          </p>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex shrink-0 gap-0.5">
            {onEdit && (
              <button
                type="button"
                className="rounded-lg p-1.5 text-clinic-slate hover:bg-slate-100 hover:text-clinic-deep"
                title="Editar atención"
                onClick={() => onEdit(ev.id)}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="rounded-lg p-1.5 text-clinic-slate hover:bg-red-50 hover:text-red-600"
                title="Eliminar atención"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </header>

      {procs.length > 0 && (
        <ul className="space-y-2.5">
          {procs.map((p, i) => (
            <li key={`${p.code}-${p.toothNumber}-${i}`} className="min-w-0">
              <p className="text-sm font-medium leading-snug text-clinic-ink">
                {p.name || 'Procedimiento'}
              </p>
              <p className="mt-0.5 text-[11px] leading-normal text-clinic-slate">
                {[
                  p.code || null,
                  `Cant. ${p.quantity}`,
                  p.toothNumber != null ? `Pieza ${p.toothNumber}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {p.lineTotal != null && (
                <p className="mt-1 text-sm font-semibold tabular-nums text-clinic-ink">
                  <MoneyAmount
                    usd={p.lineTotal}
                    layout="inline"
                    usdClassName="text-sm font-semibold text-clinic-ink"
                    vesClassName="text-[10px] font-bold"
                  />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {billing && (
        <div className="space-y-1 border-t border-dashed border-slate-200 pt-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-clinic-slate">Abonado</span>
            <MoneyAmount
              usd={billing.paidAmount}
              showVes={false}
              usdClassName="font-semibold text-clinic-ink"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-clinic-slate">Por abonar</span>
            <MoneyAmount
              usd={billing.balanceDue}
              showVes={false}
              usdClassName={`font-semibold ${
                billing.balanceDue > 0.009
                  ? 'text-amber-800'
                  : 'text-emerald-700'
              }`}
            />
          </div>
        </div>
      )}

      <div className="space-y-1 border-t border-slate-100 pt-2 text-xs text-clinic-slate">
        {ev.sessionAppointment ? (
          <p>
            <span className="font-medium text-clinic-ink">Cita de origen · </span>
            {formatApptWhen(ev.sessionAppointment.scheduledAt)}
            {' · '}
            {APPT_STATUS_LABEL[ev.sessionAppointment.status] ??
              ev.sessionAppointment.status}
          </p>
        ) : (
          <p>
            <span className="font-medium text-clinic-ink">Atención directa · </span>
            Sin cita previa · Realizada
          </p>
        )}

        {ev.nextAppointment ? (
          <p>
            <span className="font-medium text-violet-900">Próxima · </span>
            {formatApptWhen(ev.nextAppointment.scheduledAt)}
            {ev.nextAppointment.dentistName
              ? ` · ${ev.nextAppointment.dentistName}`
              : ''}
            {' · '}
            {APPT_STATUS_LABEL[ev.nextAppointment.status] ??
              ev.nextAppointment.status}
          </p>
        ) : (
          <p>Sin próxima cita</p>
        )}
      </div>

      {showBody && (
        <div
          className="rich-html text-sm leading-relaxed text-clinic-slate"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      )}
      {!showBody && onEdit && (
        <button
          type="button"
          className="text-xs font-medium text-clinic-deep hover:underline"
          onClick={() => onEdit(ev.id)}
        >
          + Completar notas de la sesión
        </button>
      )}
      {ev.prescription && (
        <div className="text-xs text-clinic-slate">
          <span className="font-semibold text-clinic-ink">
            Receta / Indicaciones:{' '}
          </span>
          <span
            className="rich-html"
            dangerouslySetInnerHTML={{
              __html: ev.prescription.includes('<')
                ? ev.prescription
                : ev.prescription.replace(/\n/g, '<br/>'),
            }}
          />
        </div>
      )}

      {ev.attachmentUrl && (
        <AuthenticatedAttachmentLink url={ev.attachmentUrl} />
      )}
    </article>
  );
}

export function ClinicalTimeline({
  evolutions,
  patientName,
  documentId,
  clinicName,
  medicalPatient,
  odontogramStates,
  onOpenVisitSession,
  onEditEvolution,
  onDeleteEvolution,
}: ClinicalTimelineProps) {
  const consolidated = useMemo(
    () => consolidateSessions(evolutions),
    [evolutions],
  );
  const groups = useMemo(
    () => groupByDayNewestFirst(consolidated),
    [consolidated],
  );

  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const [selectedDays, setSelectedDays] = useState<Record<string, boolean>>({});
  const [printOpen, setPrintOpen] = useState(false);
  const { rate } = useExchangeRate();
  const authClinic = useAuthStore((s) => s.user?.clinicName);
  const clinicId = useAuthStore((s) => s.user?.clinicId);

  const clinicQ = useQuery({
    queryKey: ['clinic-settings', clinicId],
    queryFn: getClinicSettingsApi,
    enabled: Boolean(clinicId),
    staleTime: 60_000,
  });

  const selectedCount = groups.filter((g) => selectedDays[g.key]).length;
  const allSelected =
    groups.length > 0 && groups.every((g) => selectedDays[g.key]);

  function isDayOpen(key: string, index: number) {
    if (openDays[key] !== undefined) return openDays[key];
    return index === 0;
  }

  function toggleDay(key: string, index: number) {
    setOpenDays((prev) => ({
      ...prev,
      [key]: !isDayOpen(key, index),
    }));
  }

  function toggleSelectDay(key: string) {
    setSelectedDays((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedDays({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.key] = true;
    setSelectedDays(next);
  }

  function handlePrintClick() {
    const days = groups.filter((g) => selectedDays[g.key]);
    if (!days.length) {
      toast('Seleccioná uno o más días para imprimir', 'error');
      return;
    }
    setPrintOpen(true);
  }

  function runPrint(format: PrintFormat) {
    const days = groups.filter((g) => selectedDays[g.key]);
    if (!days.length) return;
    try {
      const c = clinicQ.data;
      const clinic = {
        name: c?.name ?? clinicName ?? authClinic ?? null,
        email: c?.email ?? null,
        whatsapp: c?.whatsapp ?? null,
        address: c?.address ?? null,
        logoUrl: c?.logoUrl ?? null,
      };

      if (format.docType === 'MEDICAL_HISTORY') {
        const selectedEvolutions = days.flatMap((d) => d.items);
        printMedicalHistory({
          patient: medicalPatient ?? {
            fullName: patientName ?? 'Paciente',
            documentId: documentId ?? undefined,
          },
          evolutions: selectedEvolutions.length
            ? selectedEvolutions
            : evolutions,
          odontogramStates: odontogramStates ?? [],
          clinic,
          format,
        });
      } else {
        printAttentionDays({
          patientName: patientName ?? 'Paciente',
          documentId: documentId ?? '—',
          days,
          exchangeRate: rate,
          clinic,
          format,
        });
      }
      setPrintOpen(false);
    } catch {
      toast('No se pudo preparar la impresión', 'error');
    }
  }

  return (
    <div className="panel relative p-5 pb-24">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-clinic-ink">
            Evolución clínica / Bitácora
          </h3>
          <p className="text-sm text-clinic-slate">
            Atenciones del día · elegí días para imprimir
          </p>
        </div>
        {groups.length > 0 && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              onClick={toggleSelectAll}
              className="shrink-0 px-3"
              title={allSelected ? 'Quitar selección' : 'Seleccionar todos'}
              aria-label={allSelected ? 'Quitar selección' : 'Seleccionar todos'}
            >
              {allSelected ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {allSelected ? 'Quitar' : 'Todos'}
              </span>
            </Button>
            <Button
              type="button"
              onClick={handlePrintClick}
              disabled={selectedCount === 0}
              className="min-w-0 flex-1 justify-center sm:flex-none"
            >
              <Printer className="h-4 w-4 shrink-0" />
              Imprimir
              {selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-clinic-slate">
            Aún no hay atenciones registradas. Usá Atención de hoy.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, index) => {
            const open = isDayOpen(group.key, index);
            const selected = Boolean(selectedDays[group.key]);
            return (
              <section
                key={group.key}
                className={`overflow-hidden rounded-xl border bg-white ${
                  selected
                    ? 'border-clinic-deep ring-2 ring-clinic-deep/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-stretch">
                  <label
                    className="flex cursor-pointer items-center px-3 hover:bg-slate-50"
                    title="Seleccionar día para imprimir"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-clinic-deep focus:ring-clinic-deep"
                      checked={selected}
                      onChange={() => toggleSelectDay(group.key)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleDay(group.key, index)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pr-4 text-left transition hover:bg-slate-50"
                    aria-expanded={open}
                  >
                    <span>
                      <span className="block font-display text-base font-semibold capitalize text-clinic-ink">
                        {group.label}
                      </span>
                      <span className="text-xs text-clinic-slate">
                        {group.items.length}{' '}
                        {group.items.length === 1 ? 'atención' : 'atenciones'}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-clinic-slate transition-transform ${
                        open ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>

                {open && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100 px-4">
                    {group.items.map((item) => (
                      <EvolutionCard
                        key={item.id}
                        ev={item}
                        onEdit={onEditEvolution}
                        onDelete={onDeleteEvolution}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {onOpenVisitSession && (
        <div className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 md:bottom-8 md:right-8">
          <div className="pointer-events-auto group relative flex flex-col items-center">
            <span className="mb-1 max-w-[7.5rem] rounded-full bg-clinic-ink/90 px-2 py-0.5 text-center text-[10px] font-medium text-white opacity-90 shadow sm:absolute sm:right-14 sm:top-1/2 sm:mb-0 sm:-translate-y-1/2 sm:whitespace-nowrap sm:opacity-0 sm:transition sm:group-hover:opacity-100">
              Atención de hoy
            </span>
            <button
              type="button"
              onClick={onOpenVisitSession}
              aria-label="Registrar atención de hoy"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-orange-500/35 transition hover:scale-105 hover:brightness-105 active:scale-95"
            >
              <ClipboardPlus className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      <PrintFormatPicker
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        onConfirm={runPrint}
        selectedCount={selectedCount}
      />
    </div>
  );
}
