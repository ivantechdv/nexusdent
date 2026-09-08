import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CalendarPlus,
  Check,
  Clock,
  FileUp,
  History,
  Plus,
  Printer,
  ScanLine,
  Search,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { MoneyAmount } from '@/components/MoneyAmount';
import { OdontogramDigital } from '@/features/clinical-history/OdontogramDigital';
import type { OdontogramStateItem } from '@/features/clinical-history/odontogram.types';
import {
  ageYears,
  formatDocument,
  formatGender,
  patientInitials,
} from '@/features/patients/patientFile.helpers';
import {
  getOdontogramApi,
  upsertOdontogramApi,
} from '@/services/clinical.api';
import type { Patient } from '@/services/patients.api';
import type { Treatment } from '@/services/treatments.api';
import type { AttentionFile, AttentionFileKind } from '@/features/patients/attention.types';
import { formatUsd } from '@/lib/exchange';

type SelectedProc = { treatmentId: number; quantity: number };

export type AttentionRedesignProps = {
  patient: Patient | null;
  patientLoading?: boolean;
  preselectError?: boolean;
  isEditing: boolean;
  patientQuery: string;
  debouncedQ: string;
  showPicker: boolean;
  patientsLoading: boolean;
  patientResults: Patient[];
  procSearch: string;
  category: string;
  categories: Array<{ id: number; code: string; name: string }>;
  filteredTreatments: Treatment[];
  selectedMap: Map<number, SelectedProc>;
  lineItems: Array<{
    treatmentId: number;
    quantity: number;
    name: string;
    unitPrice: number;
    subtotal: number;
  }>;
  grandTotal: number;
  savingAll: boolean;
  visitPending: boolean;
  canAddTreatment: boolean;
  quoteMode?: boolean;
  flash: string;
  error: string;
  onPatientQueryChange: (v: string) => void;
  onShowPicker: (v: boolean) => void;
  onPickPatient: (p: Patient) => void;
  onClearPatient: () => void;
  onNewPatient: () => void;
  onProcSearchChange: (v: string) => void;
  onCategoryChange: (code: string) => void;
  onToggleProcedure: (id: number) => void;
  onOpenNewTreatment: () => void;
  /** Guarda atención y abre modal de cobro si hay monto */
  onSaveAttention: () => void;
  files: AttentionFile[];
  uploading: boolean;
  onFilesChosen: (list: FileList | null, kind: AttentionFileKind) => void;
  onRemoveFile: (url: string) => void;
  scheduleNext: boolean;
  scheduleLabel?: string | null;
  onToggleSchedule: () => void;
  onPrint?: () => void;
};

function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function fileKindMeta(kind: AttentionFileKind) {
  if (kind === 'RADIOGRAPH') {
    return { label: 'Rx', className: 'bg-violet-100 text-violet-700' };
  }
  if (kind === 'GALLERY') {
    return { label: 'Foto', className: 'bg-teal-50 text-[#2b7a78]' };
  }
  return { label: 'PDF', className: 'bg-slate-100 text-slate-600' };
}

export function AttentionRedesign({
  patient,
  patientLoading = false,
  preselectError = false,
  isEditing,
  patientQuery,
  debouncedQ,
  showPicker,
  patientsLoading,
  patientResults,
  procSearch,
  category,
  categories,
  filteredTreatments,
  selectedMap,
  lineItems,
  grandTotal,
  savingAll,
  visitPending,
  canAddTreatment,
  flash,
  error,
  onPatientQueryChange,
  onShowPicker,
  onPickPatient,
  onClearPatient,
  onNewPatient,
  onProcSearchChange,
  onCategoryChange,
  onToggleProcedure,
  onOpenNewTreatment,
  onSaveAttention,
  quoteMode,
  files,
  uploading,
  onFilesChosen,
  onRemoveFile,
  scheduleNext,
  scheduleLabel,
  onToggleSchedule,
  onPrint,
}: AttentionRedesignProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const odontogramQ = useQuery({
    queryKey: ['odontogram', patient?.id],
    queryFn: () => getOdontogramApi(patient!.id),
    enabled: Boolean(patient?.id),
  });

  const odontogramMut = useMutation({
    mutationFn: upsertOdontogramApi,
    onSuccess: () => {
      if (patient?.id) {
        void qc.invalidateQueries({ queryKey: ['odontogram', patient.id] });
      }
    },
  });

  function onOdontogramChange(next: OdontogramStateItem) {
    if (!patient?.id) return;
    odontogramMut.mutate({
      patientId: patient.id,
      toothNumber: next.toothNumber,
      surface: next.surface,
      condition: next.condition,
      status: next.status,
    });
  }

  if (patientLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2b7a78] border-t-transparent" />
        <p className="text-sm text-slate-500">Cargando atención del paciente…</p>
      </div>
    );
  }

  if (preselectError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-red-600">
          No se pudo cargar el paciente. Verificá que exista o elegí otro.
        </p>
        <Button type="button" variant="secondary" onClick={onClearPatient}>
          Volver a buscar
        </Button>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-[#2b7a78]">
              <UserRound className="h-6 w-6" />
            </span>
            <h1 className="mt-3 font-display text-xl font-bold text-slate-900">
              Atención clínica
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Buscá un paciente para abrir el odontograma y registrar procedimientos.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-10 text-sm focus:border-[#2b7a78] focus:outline-none focus:ring-2 focus:ring-[#2b7a78]/20"
              placeholder="Buscar por nombre o documento…"
              value={patientQuery}
              onChange={(e) => {
                onPatientQueryChange(e.target.value);
                onShowPicker(true);
              }}
              onFocus={() => onShowPicker(true)}
              autoFocus
            />
            {patientQuery && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100"
                onClick={() => {
                  onPatientQueryChange('');
                  onShowPicker(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {showPicker && debouncedQ.length >= 1 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {patientsLoading ? (
                  <p className="px-3 py-3 text-sm text-slate-500">Buscando…</p>
                ) : patientResults.length ? (
                  patientResults.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onPickPatient(p)}
                    >
                      <span className="font-medium">{p.fullName}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {p.documentId}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-sm text-slate-500">
                    Sin resultados.
                  </p>
                )}
              </div>
            )}
          </div>
          <Button type="button" className="mt-4 w-full" onClick={onNewPatient}>
            <UserPlus className="h-4 w-4" />
            Nuevo paciente
          </Button>
        </div>
      </div>
    );
  }

  const age = ageYears(patient.birthDate);
  const selectedCount = lineItems.length;

  return (
    <div className="flex min-h-[calc(100dvh-1px)] min-w-0 flex-1 flex-col pb-24">
      {flash && (
        <div className="mx-4 mb-3 mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 sm:mx-6">
          <Check className="h-4 w-4" />
          {flash}
        </div>
      )}

      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        {quoteMode && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-orange-600">
            Presupuesto · se guarda sin cobro
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-[#2b7a78]">
              {patientInitials(patient.fullName)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold text-slate-900 sm:text-xl">
                {patient.fullName}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="font-semibold text-[#2b7a78]">
                  {formatDocument(patient.documentId)}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600">{formatGender(patient.gender)}</span>
                {age != null && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-600">{age} años</span>
                  </>
                )}
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">
                  Historial Clínico: #{patient.id.slice(-4).toUpperCase()}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="border-slate-200 bg-white text-slate-700"
              onClick={onPrint}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-slate-200 bg-white text-slate-700"
              onClick={() => navigate(`/patients/${patient.id}`)}
            >
              <History className="h-4 w-4" />
              Historial
            </Button>
            {!isEditing && (
              <Button type="button" variant="ghost" onClick={onClearPatient}>
                Cambiar paciente
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="min-h-[420px] border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
          <OdontogramDigital
            states={odontogramQ.data ?? []}
            onChange={onOdontogramChange}
          />
        </section>

        <aside className="flex min-h-0 flex-col bg-slate-50/50">
          <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900">
                Procedimientos disponibles
              </h2>
              {canAddTreatment && (
                <button
                  type="button"
                  onClick={onOpenNewTreatment}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2b7a78] text-white hover:bg-[#236663]"
                  aria-label="Agregar procedimiento"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:border-[#2b7a78] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2b7a78]/20"
                placeholder="Buscar procedimiento…"
                value={procSearch}
                onChange={(e) => onProcSearchChange(e.target.value)}
              />
            </div>
            <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => onCategoryChange('ALL')}
                className={clsx(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                  category === 'ALL'
                    ? 'bg-[#2b7a78] text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200',
                )}
              >
                General
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onCategoryChange(c.code)}
                  className={clsx(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                    category === c.code
                      ? 'bg-[#2b7a78] text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
            {filteredTreatments.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No hay procedimientos con ese filtro.
              </p>
            ) : (
              filteredTreatments.map((t) => {
                const sel = selectedMap.get(t.id);
                const checked = Boolean(sel);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onToggleProcedure(t.id)}
                    className={clsx(
                      'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition',
                      checked
                        ? 'border-[#2b7a78]/40 bg-teal-50/60 ring-1 ring-[#2b7a78]/20'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <span
                      className={clsx(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'border-[#2b7a78] bg-[#2b7a78] text-white'
                          : 'border-slate-300 bg-white',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">
                        {t.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          45 min
                        </span>
                        <MoneyAmount
                          usd={t.basePrice}
                          layout="inline"
                          usdClassName="font-bold text-slate-800"
                          vesClassName="text-[10px] font-semibold text-slate-500"
                        />
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {error && (
        <p className="mx-4 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-[0_-4px_24px_rgba(15,23,42,0.08)] lg:left-60">
        <div className="mx-auto flex max-w-[2000px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Paciente
              </p>
              <p className="font-semibold text-slate-800">
                {shortName(patient.fullName)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Procedimientos
              </p>
              <p className="font-semibold text-slate-800">
                {selectedCount} seleccionado{selectedCount === 1 ? '' : 's'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total estimado
              </p>
              <p className="font-display text-lg font-bold text-slate-900">
                {grandTotal > 0 ? (
                  <MoneyAmount usd={grandTotal} layout="inline" />
                ) : (
                  formatUsd(0)
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label
                className={clsx(
                  'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  uploading
                    ? 'pointer-events-none border-slate-200 bg-slate-50 text-slate-400'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <FileUp className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">
                  {uploading ? 'Subiendo…' : 'Foto clínica'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.heic,.heif"
                  onChange={(e) => {
                    void onFilesChosen(e.target.files, 'GALLERY');
                    e.target.value = '';
                  }}
                />
              </label>

              <label
                className={clsx(
                  'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  uploading
                    ? 'pointer-events-none border-violet-100 bg-violet-50 text-violet-300'
                    : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100',
                )}
              >
                <ScanLine className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">
                  {uploading ? 'Subiendo…' : 'Radiografía'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.heic,.heif"
                  onChange={(e) => {
                    void onFilesChosen(e.target.files, 'RADIOGRAPH');
                    e.target.value = '';
                  }}
                />
              </label>

              <label
                className={clsx(
                  'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  uploading
                    ? 'pointer-events-none border-slate-200 bg-slate-50 text-slate-400'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <FileUp className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">PDF</span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,application/pdf,.doc,.docx,.txt"
                  onChange={(e) => {
                    void onFilesChosen(e.target.files, 'ATTACHMENT');
                    e.target.value = '';
                  }}
                />
              </label>

              {files.length > 0 && (
                <div className="hidden max-w-[260px] flex-wrap gap-1 sm:flex">
                  {files.slice(0, 3).map((f) => {
                    const meta = fileKindMeta(f.kind);
                    return (
                      <span
                        key={f.url}
                        className="inline-flex max-w-[120px] items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                      >
                        <span
                          className={clsx(
                            'shrink-0 rounded px-1 font-bold uppercase',
                            meta.className,
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="truncate">{f.originalName}</span>
                        <button
                          type="button"
                          className="shrink-0 text-slate-400 hover:text-red-600"
                          onClick={() => onRemoveFile(f.url)}
                          aria-label="Quitar archivo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                  {files.length > 3 && (
                    <span className="text-[10px] text-slate-400">
                      +{files.length - 3}
                    </span>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={onToggleSchedule}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  scheduleNext
                    ? 'border-violet-300 bg-violet-50 text-violet-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <span
                  className={clsx(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    scheduleNext
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-slate-300 bg-white',
                  )}
                >
                  {scheduleNext && <Check className="h-3 w-3" />}
                </span>
                <CalendarPlus className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">
                  {scheduleNext
                    ? scheduleLabel || 'Cita agendada'
                    : quoteMode
                      ? 'Agendar cita'
                      : 'Crear cita'}
                </span>
              </button>
            </div>

            <Button
              type="button"
              className="ml-auto border-0 bg-[#2b7a78] hover:bg-[#236663] sm:ml-0"
              disabled={savingAll || visitPending || selectedCount === 0}
              onClick={onSaveAttention}
            >
              {savingAll || visitPending
                ? 'Guardando…'
                : quoteMode
                  ? 'Guardar presupuesto'
                  : 'Guardar Atención'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
