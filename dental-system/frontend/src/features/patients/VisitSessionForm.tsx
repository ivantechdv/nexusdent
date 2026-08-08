import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Stethoscope, UserRound } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import {
  RichTextEditor,
  isRichTextEmpty,
} from '@/components/RichTextEditor';
import { listDentistsApi } from '@/services/auth.api';
import { listTreatmentsApi, type Treatment } from '@/services/treatments.api';
import type { CompleteVisitPayload } from '@/services/visits.api';
import { useAuthStore } from '@/stores/auth.store';

export type ProcedureLine = {
  key: string;
  treatmentId: number;
  toothNumber: string;
};

export interface VisitSessionFormProps {
  patientId: string;
  patientName: string;
  onSubmit: (payload: CompleteVisitPayload) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  /** Reinicia el formulario cuando cambia (ej. otro paciente) */
  resetKey?: string;
  /** Oculta botones internos; usar footer del Modal */
  hideActions?: boolean;
  /** Expone handleSave para el footer externo */
  saveActionRef?: MutableRefObject<(() => void) | null>;
}

function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultNextFriday(): string {
  const d = new Date();
  const day = d.getDay();
  let add = (5 - day + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function VisitSessionForm({
  patientId,
  patientName,
  onSubmit,
  onCancel,
  submitting,
  resetKey,
  hideActions,
  saveActionRef,
}: VisitSessionFormProps) {
  const user = useAuthStore((s) => s.user);
  const [walkIn, setWalkIn] = useState(true);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [prescription, setPrescription] = useState('');
  const [billProcedures, setBillProcedures] = useState(true);
  const [notifyPatient, setNotifyPatient] = useState(true);
  const [lines, setLines] = useState<ProcedureLine[]>([]);
  const [pickId, setPickId] = useState('');
  const [scheduleNext, setScheduleNext] = useState(true);
  const [nextDate, setNextDate] = useState(defaultNextFriday());
  const [nextTime, setNextTime] = useState('10:00');
  const [nextDentistId, setNextDentistId] = useState('');
  const [nextReason, setNextReason] = useState('Control / continuación');
  const [error, setError] = useState('');

  const treatmentsQ = useQuery({
    queryKey: ['treatments'],
    queryFn: () => listTreatmentsApi(),
  });

  const dentistsQ = useQuery({
    queryKey: ['dentists'],
    queryFn: listDentistsApi,
  });

  useEffect(() => {
    setWalkIn(true);
    setClinicalNotes('');
    setPrescription('');
    setBillProcedures(true);
    setNotifyPatient(true);
    setLines([]);
    setPickId('');
    setScheduleNext(true);
    setNextDate(defaultNextFriday());
    setNextTime('10:00');
    setNextReason('Control / continuación');
    setError('');
    setNextDentistId(user?.role === 'DENTIST' ? user.id : '');
  }, [resetKey, patientId, user]);

  useEffect(() => {
    if (nextDentistId) return;
    const first = dentistsQ.data?.[0]?.id;
    if (first) setNextDentistId(first);
  }, [dentistsQ.data, nextDentistId]);

  const byId = useMemo(() => {
    const map = new Map<number, Treatment>();
    for (const t of treatmentsQ.data ?? []) map.set(t.id, t);
    return map;
  }, [treatmentsQ.data]);

  function addProcedure() {
    const id = Number(pickId);
    if (!id) return;
    setLines((prev) => [
      ...prev,
      { key: `${id}-${Date.now()}`, treatmentId: id, toothNumber: '' },
    ]);
    setPickId('');
  }

  async function handleSave() {
    setError('');
    if (!lines.length) {
      setError('Agregue al menos un procedimiento realizado');
      return;
    }
    if (isRichTextEmpty(clinicalNotes)) {
      setError('Describa qué se hizo en la atención');
      return;
    }
    if (scheduleNext && (!nextDate || !nextTime || !nextDentistId)) {
      setError('Complete fecha, hora y odontólogo de la próxima cita');
      return;
    }

    await onSubmit({
      patientId,
      walkIn,
      dentistId: user?.role === 'DENTIST' ? user.id : nextDentistId || undefined,
      clinicalNotes: clinicalNotes,
      prescription: isRichTextEmpty(prescription) ? null : prescription,
      billProcedures,
      notifyPatient,
      procedures: lines.map((l) => ({
        treatmentId: l.treatmentId,
        toothNumber: l.toothNumber ? Number(l.toothNumber) : null,
        quantity: 1,
      })),
      nextAppointment: scheduleNext
        ? {
            scheduledAt: `${nextDate}T${nextTime}:00`,
            dentistId: nextDentistId,
            durationMin: 30,
            reason: nextReason.trim() || 'Control / continuación',
          }
        : null,
    });
  }

  useEffect(() => {
    if (!saveActionRef) return;
    saveActionRef.current = () => {
      void handleSave();
    };
    return () => {
      saveActionRef.current = null;
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-clinic-deep/15 bg-clinic-deep/5 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-clinic-deep text-white">
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
            Atendiendo ahora
          </p>
          <p className="font-display text-lg font-semibold text-clinic-ink">
            {patientName}
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={walkIn}
          onChange={(e) => setWalkIn(e.target.checked)}
        />
        Llegó sin cita (walk-in)
      </label>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-clinic-ink">
          <Stethoscope className="h-4 w-4 text-clinic-deep" />
          1. Procedimientos realizados
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
          >
            <option value="">Elegir del catálogo…</option>
            {(treatmentsQ.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} · {t.name} ({t.basePrice.toFixed(2)})
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={addProcedure}>
            Agregar
          </Button>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-clinic-slate">
            Ej.: 2 resinas por caries + endodoncia → agregue cada uno con su pieza.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => {
              const t = byId.get(line.treatmentId);
              return (
                <li
                  key={line.key}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 font-medium">
                    {t
                      ? `${t.code} · ${t.name}`
                      : `Tratamiento #${line.treatmentId}`}
                  </span>
                  <Input
                    id={`tooth-${line.key}`}
                    className="w-24"
                    placeholder="Pieza"
                    type="number"
                    value={line.toothNumber}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) =>
                          x.key === line.key
                            ? { ...x, toothNumber: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setLines((prev) => prev.filter((x) => x.key !== line.key))
                    }
                  >
                    Quitar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={billProcedures}
            onChange={(e) => setBillProcedures(e.target.checked)}
          />
          Sumar al presupuesto / saldo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notifyPatient}
            onChange={(e) => setNotifyPatient(e.target.checked)}
          />
          Enviar resumen por email al paciente
        </label>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-clinic-ink">
          2. Notas y receta
        </p>
        <RichTextEditor
          label="Qué se hizo hoy"
          value={clinicalNotes}
          onChange={setClinicalNotes}
          placeholder="Ej.: Llegó sin cita. Se realizaron resinas y tratamiento de conducto…"
          minHeight="96px"
        />
        <RichTextEditor
          label="Receta / indicaciones"
          value={prescription}
          onChange={setPrescription}
          placeholder="Ej.: Ibuprofeno 400 mg c/8h SOS…"
          minHeight="72px"
        />
      </section>

      <section className="space-y-3 rounded-xl border border-slate-100 bg-blue-50/40 p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-clinic-ink">
          <input
            type="checkbox"
            checked={scheduleNext}
            onChange={(e) => setScheduleNext(e.target.checked)}
          />
          <CalendarPlus className="h-4 w-4 text-clinic-deep" />
          3. Agendar próxima cita
        </label>

        {scheduleNext && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="next-date"
              label="Fecha"
              type="date"
              min={todayLocalDate()}
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
            <Input
              id="next-time"
              label="Hora"
              type="time"
              value={nextTime}
              onChange={(e) => setNextTime(e.target.value)}
            />
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Odontólogo
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                value={nextDentistId}
                onChange={(e) => setNextDentistId(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {(dentistsQ.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Input
                id="next-reason"
                label="Motivo"
                value={nextReason}
                onChange={(e) => setNextReason(e.target.value)}
              />
            </div>
          </div>
        )}
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!hideActions && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={submitting}>
              Cancelar
            </Button>
          )}
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Guardando…' : 'Cerrar atención'}
          </Button>
        </div>
      )}
    </div>
  );
}
