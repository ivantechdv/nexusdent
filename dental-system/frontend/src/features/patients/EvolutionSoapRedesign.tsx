import clsx from 'clsx';
import {
  AlertTriangle,
  ChevronRight,
  KeyRound,
  PenLine,
  Smile,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import {
  ageYears,
  formatDocument,
  patientAlertTags,
  patientInitials,
} from '@/features/patients/patientFile.helpers';
import {
  LOWER_TEETH,
  UPPER_TEETH,
  parseSoapNotes,
  soapSummary,
  type SoapFields,
} from '@/features/patients/soap.helpers';
import type { ClinicalEvolution } from '@/features/patients/ClinicalTimeline';
import type { Patient } from '@/services/patients.api';
import type { Treatment } from '@/services/treatments.api';

export type EvolutionSoapRedesignProps = {
  patient: Patient;
  balanceDue: number;
  soap: SoapFields;
  onSoapChange: (patch: Partial<SoapFields>) => void;
  selectedTeeth: number[];
  onToggleTooth: (n: number) => void;
  treatments: Treatment[];
  treatmentId: number | null;
  onTreatmentChange: (id: number | null) => void;
  evolutions: ClinicalEvolution[];
  dentistName: string;
  dentistSpecialty?: string | null;
  saving: boolean;
  error?: string;
  isEditing?: boolean;
  onCancel: () => void;
  onSave: () => void;
  onSaveAndBill: () => void;
};

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTodayLabel(d = new Date()) {
  return d.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isSameLocalDay(iso: string, ref = new Date()) {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

const SOAP_BLOCKS: Array<{
  key: keyof SoapFields;
  letter: string;
  title: string;
  subtitle: string;
  color: string;
  placeholder: string;
}> = [
  {
    key: 'subjective',
    letter: 'S',
    title: 'Subjetivo',
    subtitle: 'Motivo de Consulta',
    color: 'bg-sky-500',
    placeholder:
      'Ej. Paciente refiere dolor agudo en pieza 46 al masticar y al ingerir líquidos fríos…',
  },
  {
    key: 'objective',
    letter: 'O',
    title: 'Objetivo',
    subtitle: 'Hallazgos Clínicos',
    color: 'bg-violet-500',
    placeholder:
      'Ej. Se observa filtración marginal en restauración previa de pieza 46. Prueba de vitalidad positiva…',
  },
  {
    key: 'assessment',
    letter: 'A',
    title: 'Análisis',
    subtitle: 'Diagnóstico Clínico',
    color: 'bg-amber-500',
    placeholder: 'Ej. Caries secundaria / Pulpitis reversible. Pieza 46.',
  },
  {
    key: 'plan',
    letter: 'P',
    title: 'Plan de Tratamiento',
    subtitle: '',
    color: 'bg-[#2b7a78]',
    placeholder:
      'Ej. Remoción de restauración antigua, eliminación de caries y nueva restauración en resina…',
  },
];

function ToothChip({
  n,
  selected,
  onToggle,
}: {
  n: number;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`Pieza ${n}`}
      className={clsx(
        'flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-[11px] font-bold transition',
        selected
          ? 'bg-[#2b7a78] text-white shadow-sm ring-2 ring-[#2b7a78]/30'
          : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100',
      )}
    >
      <Smile
        className={clsx('mb-0.5 h-3 w-3', selected ? 'opacity-90' : 'opacity-40')}
      />
      {n}
    </button>
  );
}

export function EvolutionSoapRedesign({
  patient,
  balanceDue,
  soap,
  onSoapChange,
  selectedTeeth,
  onToggleTooth,
  treatments,
  treatmentId,
  onTreatmentChange,
  evolutions,
  dentistName,
  dentistSpecialty,
  saving,
  error,
  isEditing,
  onCancel,
  onSave,
  onSaveAndBill,
}: EvolutionSoapRedesignProps) {
  const age = ageYears(patient.birthDate);
  const alerts = patientAlertTags(patient);
  const lastVisit = evolutions[0];
  const solvent = balanceDue <= 0.009;

  const selectedTreatment = treatments.find((t) => t.id === treatmentId);
  const teethLabel =
    selectedTeeth.length > 0
      ? ` (Pieza ${selectedTeeth.sort((a, b) => a - b).join(', ')})`
      : '';

  const historyItems = evolutions.slice(0, 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4f6f8]">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 pb-0 pt-4 sm:px-6 lg:px-8">
        {/* Breadcrumb + sillón */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
            <Link
              to={patient.id ? `/patients/${patient.id}` : '/patients'}
              className="font-medium transition hover:text-[#2b7a78]"
            >
              Módulo de Atención Clínica
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className="font-semibold text-slate-800">Evolución SOAP</span>
          </nav>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Sesión activa
          </span>
        </div>

        {/* Header paciente */}
        <section className="mb-5 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-teal-50 text-base font-bold text-[#2b7a78] ring-2 ring-white sm:h-16 sm:w-16 sm:text-lg"
                aria-hidden
              >
                {patientInitials(patient.fullName)}
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-lg font-bold leading-tight text-slate-900 sm:text-xl">
                  {patient.fullName}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
                  <span>Cédula: {formatDocument(patient.documentId)}</span>
                  {age != null && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span>Edad: {age} años</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-stretch gap-3 sm:gap-4">
              <div className="min-w-[140px] rounded-lg border border-red-100 bg-red-50/80 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                  Alertas Médicas
                </p>
                {alerts.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {alerts.slice(0, 3).map((a) => (
                      <span
                        key={a.key}
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {a.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Sin alertas
                  </p>
                )}
              </div>

              <div className="min-w-[110px] rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Última Visita
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {lastVisit ? formatShortDate(lastVisit.signedAt) : '—'}
                </p>
              </div>

              <div className="min-w-[120px] rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Estado de Cuenta
                </p>
                <p
                  className={clsx(
                    'mt-1 text-sm font-bold',
                    solvent ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {solvent ? 'Solvente' : 'Pendiente'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Workspace 2 columnas */}
        <div className="grid min-h-0 flex-1 gap-5 pb-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
          {/* Form SOAP */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-display text-lg font-bold text-slate-900">
              {isEditing ? 'Editar Evolución SOAP' : 'Nueva Evolución SOAP'}
            </h2>

            <div className="mt-5 space-y-5">
              {SOAP_BLOCKS.map((block) => (
                <label key={block.key} className="block">
                  <span className="mb-2 flex items-center gap-2.5">
                    <span
                      className={clsx(
                        'flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white',
                        block.color,
                      )}
                    >
                      {block.letter}
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {block.title}
                      {block.subtitle ? (
                        <span className="font-medium text-slate-500">
                          {' '}
                          ({block.subtitle})
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <textarea
                    rows={3}
                    value={soap[block.key]}
                    onChange={(e) =>
                      onSoapChange({ [block.key]: e.target.value })
                    }
                    placeholder={block.placeholder}
                    className="w-full resize-y rounded-lg border border-slate-200 bg-[#f8fafb] px-3.5 py-3 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-[#2b7a78] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2b7a78]/20"
                  />
                </label>
              ))}
            </div>

            {/* Piezas */}
            <div className="mt-6">
              <p className="text-sm font-bold text-slate-800">
                Selección de Piezas Dentales{' '}
                <span className="font-medium text-slate-500">
                  (Odontograma de Referencia)
                </span>
              </p>
              <div className="mt-3 space-y-2 overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex gap-1.5">
                  {UPPER_TEETH.map((n) => (
                    <ToothChip
                      key={n}
                      n={n}
                      selected={selectedTeeth.includes(n)}
                      onToggle={() => onToggleTooth(n)}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {LOWER_TEETH.map((n) => (
                    <ToothChip
                      key={n}
                      n={n}
                      selected={selectedTeeth.includes(n)}
                      onToggle={() => onToggleTooth(n)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Procedimiento */}
            <div className="mt-6">
              <label className="block">
                <span className="text-sm font-bold text-slate-800">
                  Procedimiento Realizado
                </span>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 focus:border-[#2b7a78] focus:outline-none focus:ring-2 focus:ring-[#2b7a78]/20"
                  value={treatmentId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onTreatmentChange(v ? Number(v) : null);
                  }}
                >
                  <option value="">Seleccionar procedimiento…</option>
                  {treatments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.code ? ` (${t.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTreatment && (
                <p className="mt-2 text-xs text-slate-500">
                  {selectedTreatment.name}
                  {teethLabel}
                </p>
              )}
            </div>

            {/* Firma */}
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <PenLine className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  Firmado digitalmente por {dentistName}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 text-sky-700">
                    <KeyRound className="h-3 w-3" />
                    Clave de Firma Digital Activa
                  </span>
                  {dentistSpecialty ? (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>{dentistSpecialty}</span>
                    </>
                  ) : null}
                </p>
              </div>
            </div>

            {error ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                {error}
              </p>
            ) : null}
          </section>

          {/* Historial */}
          <aside className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Historial de Evoluciones
            </h2>

            <ol className="relative mt-5 space-y-0 border-l-2 border-slate-100 pl-5">
              {/* Hoy en curso (borrador actual) */}
              {!isEditing && (
                <li className="relative pb-6">
                  <span className="absolute -left-[1.4rem] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#2b7a78] ring-4 ring-white" />
                  <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">
                        Hoy ({formatTodayLabel()})
                      </p>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                        En Curso
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{dentistName}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      {soapSummary(soap) ||
                        'Completá el SOAP para ver el resumen aquí.'}
                    </p>
                    {selectedTreatment && (
                      <span className="mt-2 inline-flex rounded-md bg-[#2b7a78]/10 px-2 py-0.5 text-[11px] font-semibold text-[#2b7a78]">
                        {selectedTreatment.name}
                      </span>
                    )}
                  </div>
                </li>
              )}

              {historyItems.map((ev) => {
                const parsed = parseSoapNotes(ev.clinicalNotes);
                const today = isSameLocalDay(ev.signedAt);
                return (
                  <li key={ev.id} className="relative pb-6 last:pb-0">
                    <span
                      className={clsx(
                        'absolute -left-[1.4rem] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-white',
                        today ? 'bg-amber-400' : 'bg-emerald-500',
                      )}
                    />
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">
                          {today
                            ? `Hoy (${formatShortDate(ev.signedAt)})`
                            : formatShortDate(ev.signedAt)}
                        </p>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                          Completado
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {ev.dentistName}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        {soapSummary(parsed) ||
                          ev.clinicalNotes
                            ?.replace(/<[^>]+>/g, ' ')
                            .slice(0, 140) ||
                          '—'}
                      </p>
                      {(ev.treatmentName ||
                        (ev.billing?.items?.[0]?.name ?? null)) && (
                        <span className="mt-2 inline-flex rounded-md bg-[#2b7a78]/10 px-2 py-0.5 text-[11px] font-semibold text-[#2b7a78]">
                          {ev.treatmentName ||
                            ev.billing?.items?.[0]?.name}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}

              {historyItems.length === 0 && isEditing === false && (
                <li className="pb-2 text-sm text-slate-500">
                  Aún no hay evoluciones previas.
                </li>
              )}
            </ol>
          </aside>
        </div>
      </div>

      {/* Footer acciones */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-slate-200 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <Button
            type="button"
            variant="secondary"
            className="border-slate-200 bg-white text-slate-700"
            disabled={saving}
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Button
              type="button"
              disabled={saving}
              className="border-0 bg-orange-500 hover:bg-orange-600"
              onClick={onSave}
            >
              {saving ? 'Guardando…' : 'Guardar Evolución'}
            </Button>
            <Button
              type="button"
              disabled={saving}
              className="border-0 bg-[#2b7a78] hover:bg-[#236663]"
              onClick={onSaveAndBill}
            >
              {saving ? 'Guardando…' : 'Guardar y Generar Cobro'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
