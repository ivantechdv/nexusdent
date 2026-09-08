import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertCircle,
  HeartPulse,
  Mail,
  Printer,
  Search,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { PaymentFxFields } from '@/components/PaymentFxFields';
import {
  PaymentSplitsFields,
  newSplitLine,
  validatePaymentSplits,
  type PaymentSplitLine,
} from '@/components/PaymentSplitsFields';
import { MoneyAmount } from '@/components/MoneyAmount';
import { Odontogram } from '@/features/clinical-history/Odontogram';
import type { OdontogramStateItem } from '@/features/clinical-history/odontogram.types';
import { ActivePatient } from '@/stores/active-patient.store';
import { mailtoHref, patientWhatsAppMessage, whatsappHref } from '@/lib/contact';
import { useAuthStore } from '@/stores/auth.store';
import { printMedicalHistory } from '@/lib/printMedicalHistory';
import { getClinicSettingsApi } from '@/services/clinic-settings.api';
import { listPrintFormatsApi } from '@/services/print-templates.api';
import {
  ClinicalEvolution,
  ClinicalTimeline,
} from './ClinicalTimeline';
import { PatientBudgetsPanel } from './PatientBudgetsPanel';
import { FinancialBanner, PatientBalance } from './FinancialBanner';
import type { PaymentMethod } from '@/lib/payment-methods';
import {
  type PaymentCurrency,
  type RateSource,
  usdToVes,
  vesToUsd,
} from '@/lib/exchange';
import { getTodayExchangeRateApi } from '@/services/exchange-rate.api';
import { toast } from '@/stores/toast.store';

type OpenDebt = {
  planId: string;
  signedAt: string;
  dentistName: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  proceduresLabel: string;
};

function formatConsultDate(iso: string) {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildOpenDebts(evolutions: ClinicalEvolution[]): OpenDebt[] {
  const byPlan = new Map<string, OpenDebt>();
  for (const ev of evolutions) {
    const b = ev.billing;
    if (!b || b.balanceDue <= 0.009) continue;
    if (byPlan.has(b.planId)) continue;
    const fromItems = b.items
      .map((i) => i.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    const fromEvo =
      ev.treatmentName ||
      (ev.procedures ?? [])
        .map((p) => p.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
    byPlan.set(b.planId, {
      planId: b.planId,
      signedAt: ev.signedAt,
      dentistName: ev.dentistName,
      totalAmount: b.totalAmount,
      paidAmount: b.paidAmount,
      balanceDue: b.balanceDue,
      proceduresLabel: fromItems || fromEvo || 'Atención clínica',
    });
  }
  return [...byPlan.values()].sort(
    (a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime(),
  );
}

export interface PatientFileProps {
  patient: ActivePatient & {
    address?: string | null;
    gender?: string;
    emergencyPhone?: string | null;
  };
  balance: PatientBalance;
  odontogramStates: OdontogramStateItem[];
  evolutions: ClinicalEvolution[];
  onOdontogramChange: (state: OdontogramStateItem) => void;
  onRegisterPayment: (payload: {
    treatmentPlanId: string;
    currencyPaid: PaymentCurrency;
    exchangeRate: number;
    rateSource: RateSource;
    notes?: string;
    splits: Array<{
      paymentMethod: PaymentMethod;
      amountPaid: number;
      reference?: string | null;
    }>;
  }) => void;
  onEditEvolution?: (id: string) => void;
  onDeleteEvolution?: (id: string) => Promise<void> | void;
  onSearchDocument?: (documentId: string) => void;
  onOpenVisitSession?: () => void;
  /** Pantalla standalone Evolución SOAP (Figma) */
  onOpenEvolutionSoap?: () => void;
}

export function PatientFile({
  patient,
  balance,
  odontogramStates,
  evolutions,
  onOdontogramChange,
  onRegisterPayment,
  onEditEvolution,
  onDeleteEvolution,
  onSearchDocument,
  onOpenVisitSession,
}: PatientFileProps) {
  const clinicName = useAuthStore((s) => s.user?.clinicName);
  const clinicQ = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: getClinicSettingsApi,
    staleTime: 60_000,
  });

  async function handlePrintHistory() {
    try {
      const c = clinicQ.data;
      const formats = await listPrintFormatsApi('MEDICAL_HISTORY');
      const format =
        formats.find((f) => f.isDefault) ?? formats[0] ?? null;
      printMedicalHistory({
        patient: {
          fullName: patient.fullName,
          documentId: patient.documentId,
          birthDate: patient.birthDate,
          phone: patient.phone,
          address: patient.address,
          anamnesisNotes: patient.anamnesisNotes,
          medicalConditions: patient.medicalConditions,
          allergyAnesthesia: patient.allergyAnesthesia,
          allergyPenicillin: patient.allergyPenicillin,
          hasHypertension: patient.hasHypertension,
          hasDiabetes: patient.hasDiabetes,
          coagulationIssues: patient.coagulationIssues,
          isPregnant: patient.isPregnant,
        },
        evolutions,
        odontogramStates,
        clinic: {
          name: c?.name ?? clinicName ?? null,
          email: c?.email ?? null,
          whatsapp: c?.whatsapp ?? null,
          address: c?.address ?? null,
          logoUrl: c?.logoUrl ?? null,
        },
        format,
      });
    } catch {
      toast('No se pudo preparar la historia para imprimir', 'error');
    }
  }

  const [payOpen, setPayOpen] = useState(false);
  const [searchDoc, setSearchDoc] = useState('');
  const [payKind, setPayKind] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [paySplits, setPaySplits] = useState<PaymentSplitLine[]>([
    newSplitLine('CASH'),
  ]);
  const [payNotes, setPayNotes] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [payCurrency, setPayCurrency] = useState<PaymentCurrency>('USD');
  const [payRate, setPayRate] = useState('');
  const [payRateSource, setPayRateSource] = useState<RateSource>('BCV');
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [bcvDate, setBcvDate] = useState<string | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);

  const openDebts = useMemo(() => buildOpenDebts(evolutions), [evolutions]);
  const selectedDebt =
    openDebts.find((d) => d.planId === selectedPlanId) ?? openDebts[0] ?? null;

  const age = patient.birthDate
    ? Math.floor(
        (Date.now() - new Date(patient.birthDate).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;

  const conditionTags = (patient.medicalConditions ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const anamnesisFlags = [
    ...conditionTags,
    ...(!conditionTags.length
      ? ([
          patient.allergyAnesthesia && 'Alergia anestesia',
          patient.allergyPenicillin && 'Alergia penicilina',
          patient.hasHypertension && 'Hipertensión',
          patient.hasDiabetes && 'Diabetes',
          patient.coagulationIssues && 'Trastorno coagulación',
        ].filter(Boolean) as string[])
      : []),
    patient.isPregnant && 'Embarazo',
  ].filter(Boolean) as string[];

  async function loadExchangeRate(refresh = false) {
    setLoadingRate(true);
    try {
      const data = await getTodayExchangeRateApi(refresh);
      setBcvRate(data.rate);
      setBcvDate(data.rateDate);
      setPayRate(String(data.rate));
      setPayRateSource('BCV');
    } catch {
      toast('No se pudo cargar la tasa BCV. Ingresala a mano.', 'error');
    } finally {
      setLoadingRate(false);
    }
  }

  function openPayModal() {
    if (openDebts.length === 0) {
      toast(
        'No hay saldo pendiente. Registrá una atención primero.',
        'error',
      );
      return;
    }
    const first = openDebts[0];
    setSelectedPlanId(first.planId);
    setPayKind('full');
    setPayCurrency('USD');
    setAmount(String(first.balanceDue));
    setPaySplits([newSplitLine('CASH', String(first.balanceDue))]);
    setPayNotes('');
    setPayRateSource('BCV');
    setPayOpen(true);
    void loadExchangeRate();
  }

  function selectDebt(planId: string) {
    const debt = openDebts.find((d) => d.planId === planId);
    if (!debt) return;
    setSelectedPlanId(planId);
    setPayKind('full');
    setPayCurrency('USD');
    setAmount(String(debt.balanceDue));
    setPaySplits([newSplitLine('CASH', String(debt.balanceDue))]);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      {onSearchDocument && (
        <form
          className="flex items-stretch gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (searchDoc.trim()) onSearchDocument(searchDoc.trim());
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              id="doc-search"
              placeholder="Buscar por DNI / Cédula…"
              value={searchDoc}
              onChange={(e) => setSearchDoc(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="h-[42px] shrink-0 px-3.5"
            aria-label="Buscar paciente"
            title="Buscar"
          >
            <Search className="h-5 w-5" />
            <span className="hidden sm:inline">Buscar</span>
          </Button>
        </form>
      )}

      <header className="panel overflow-hidden">
        <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-clinic-deep/5 to-transparent p-4 sm:gap-4 sm:p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-clinic-deep text-white sm:h-14 sm:w-14">
            <UserRound className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="break-words font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
                {patient.fullName}
              </h1>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={handlePrintHistory}
                title="Imprimir historia médico-odontológica"
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Historia</span>
              </Button>
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-clinic-slate">
              <span>Doc. {patient.documentId}</span>
              {age != null && <span>{age} años</span>}
            </p>
            {patient.phone && (
              <a
                href={
                  whatsappHref(
                    patient.phone,
                    patientWhatsAppMessage(patient.fullName, clinicName),
                  ) ?? undefined
                }
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
                title="Abrir WhatsApp"
              >
                <WhatsAppIcon className="h-4 w-4 shrink-0" />
                <span className="break-all">{patient.phone}</span>
              </a>
            )}
            {patient.email && (
              <a
                href={mailtoHref(patient.email) ?? undefined}
                className="mt-1 flex max-w-full items-start gap-1.5 text-sm font-medium text-clinic-deep hover:underline"
                title="Enviar email"
              >
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-all">{patient.email}</span>
              </a>
            )}
            {anamnesisFlags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {anamnesisFlags.map((f) => (
                  <Badge key={f} tone="accent">
                    <AlertCircle className="mr-1 inline h-3 w-3" />
                    {f}
                  </Badge>
                ))}
              </div>
            )}
            {patient.emergencyContact && (
              <p className="mt-2 text-xs text-clinic-slate">
                <HeartPulse className="mr-1 inline h-3.5 w-3.5" />
                Emergencia: {patient.emergencyContact}
              </p>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <FinancialBanner balance={balance} onRegisterPayment={openPayModal} />
        </div>
      </header>

      <Odontogram states={odontogramStates} onChange={onOdontogramChange} />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Presupuestos
        </h2>
        <PatientBudgetsPanel
          patientId={patient.id}
          patientName={patient.fullName}
        />
      </section>

      <div className="relative">
        <ClinicalTimeline
          evolutions={evolutions}
          patientName={patient.fullName}
          documentId={patient.documentId}
          medicalPatient={{
            fullName: patient.fullName,
            documentId: patient.documentId,
            birthDate: patient.birthDate,
            phone: patient.phone,
            address: patient.address,
            anamnesisNotes: patient.anamnesisNotes,
            medicalConditions: patient.medicalConditions,
            allergyAnesthesia: patient.allergyAnesthesia,
            allergyPenicillin: patient.allergyPenicillin,
            hasHypertension: patient.hasHypertension,
            hasDiabetes: patient.hasDiabetes,
            coagulationIssues: patient.coagulationIssues,
            isPregnant: patient.isPregnant,
          }}
          odontogramStates={odontogramStates}
          onOpenVisitSession={onOpenVisitSession}
          onEditEvolution={onEditEvolution}
          onDeleteEvolution={onDeleteEvolution}
        />
      </div>

      <Modal
        open={payOpen}
        title="¿Cómo quedó el cobro?"
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPayOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!selectedDebt) {
                  toast('No hay consulta pendiente para abonar', 'error');
                  return;
                }
                const rateN = Number(payRate);
                if (!(rateN > 0)) {
                  toast('Indicá la tasa de cambio del día', 'error');
                  return;
                }
                const n =
                  payKind === 'full'
                    ? payCurrency === 'VES'
                      ? usdToVes(selectedDebt.balanceDue, rateN)
                      : selectedDebt.balanceDue
                    : Number(amount);
                if (!n || n <= 0) {
                  toast('Indicá un monto válido', 'error');
                  return;
                }
                const amountUsd =
                  payCurrency === 'VES' ? vesToUsd(n, rateN) : n;
                if (amountUsd > selectedDebt.balanceDue + 0.009) {
                  toast('El abono no puede superar el pendiente', 'error');
                  return;
                }
                const splitErr = validatePaymentSplits(paySplits, n);
                if (splitErr) {
                  toast(splitErr, 'error');
                  return;
                }
                onRegisterPayment({
                  treatmentPlanId: selectedDebt.planId,
                  currencyPaid: payCurrency,
                  exchangeRate: rateN,
                  rateSource: payRateSource,
                  notes: payNotes || undefined,
                  splits: paySplits.map((s) => ({
                    paymentMethod: s.method,
                    amountPaid: Number(s.amount),
                    reference:
                      s.method === 'CASH'
                        ? null
                        : s.reference.trim() || null,
                  })),
                });
                setPayOpen(false);
                setAmount('');
                setPayNotes('');
              }}
            >
              Confirmar abono
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {selectedDebt && (
            <div className="rounded-xl bg-clinic-ink px-4 py-3 text-white">
              <p className="text-xs uppercase tracking-wide text-white/70">
                Abono a esta consulta
              </p>
              <p className="mt-1 font-display text-lg font-semibold">
                {formatConsultDate(selectedDebt.signedAt)}
              </p>
              <p className="mt-0.5 text-sm text-white/80">
                {selectedDebt.dentistName} · {selectedDebt.proceduresLabel}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex flex-col">
                  <span className="text-white/70">Total</span>
                  <MoneyAmount
                    usd={selectedDebt.totalAmount}
                    usdClassName="font-semibold text-white"
                    vesClassName="text-white/65"
                  />
                </span>
                <span className="inline-flex flex-col">
                  <span className="text-white/70">Abonado</span>
                  <MoneyAmount
                    usd={selectedDebt.paidAmount}
                    usdClassName="text-white"
                    vesClassName="text-white/65"
                  />
                </span>
                <span className="inline-flex flex-col">
                  <span className="text-white/70">Pendiente</span>
                  <MoneyAmount
                    usd={selectedDebt.balanceDue}
                    usdClassName="font-semibold text-white"
                    vesClassName="text-white/65"
                  />
                </span>
              </div>
            </div>
          )}

          {openDebts.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Consulta a abonar
              </p>
              <div className="grid gap-2">
                {openDebts.map((d) => (
                  <button
                    key={d.planId}
                    type="button"
                    onClick={() => selectDebt(d.planId)}
                    className={clsx(
                      'rounded-xl border px-3 py-2.5 text-left transition',
                      selectedDebt?.planId === d.planId
                        ? 'border-clinic-deep bg-clinic-deep/5 ring-2 ring-clinic-deep/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <p className="text-sm font-semibold text-clinic-ink">
                      {formatConsultDate(d.signedAt)}
                    </p>
                    <p className="text-xs text-clinic-slate">
                      {d.proceduresLabel} · pendiente{' '}
                      <MoneyAmount usd={d.balanceDue} layout="inline" />
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => {
                setPayKind('full');
                if (selectedDebt) {
                  const rateN = Number(payRate);
                  const total =
                    payCurrency === 'VES' && rateN > 0
                      ? usdToVes(selectedDebt.balanceDue, rateN)
                      : selectedDebt.balanceDue;
                  setAmount(String(total));
                  setPaySplits([newSplitLine('CASH', String(total))]);
                }
              }}
              className={clsx(
                'rounded-xl border px-4 py-3 text-left transition',
                payKind === 'full'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <p className="font-semibold text-clinic-ink">Pagó todo</p>
              <p className="text-xs text-clinic-slate">
                Cubre el saldo pendiente de esta consulta
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setPayKind('partial');
                if (selectedDebt && !amount) {
                  const rateN = Number(payRate);
                  const total =
                    payCurrency === 'VES' && rateN > 0
                      ? usdToVes(selectedDebt.balanceDue, rateN)
                      : selectedDebt.balanceDue;
                  setAmount(String(total));
                  setPaySplits([newSplitLine('CASH', String(total))]);
                }
              }}
              className={clsx(
                'rounded-xl border px-4 py-3 text-left transition',
                payKind === 'partial'
                  ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <p className="font-semibold text-clinic-ink">Abono parcial</p>
              <p className="text-xs text-clinic-slate">
                Pagó algo · el resto sigue pendiente
              </p>
            </button>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-3">
            {payKind === 'partial' && (
              <Input
                id="pay-amount"
                label={
                  payCurrency === 'VES'
                    ? 'Monto del abono (Bs)'
                    : 'Monto del abono (USD)'
                }
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (paySplits.length === 1) {
                    setPaySplits([
                      { ...paySplits[0], amount: e.target.value },
                    ]);
                  } else if (Number(e.target.value) > 0) {
                    setPaySplits([newSplitLine('CASH', e.target.value)]);
                  }
                }}
                placeholder="0.00"
              />
            )}
            <PaymentFxFields
              currency={payCurrency}
              onCurrencyChange={(c) => {
                const rateN = Number(payRate);
                const due = selectedDebt?.balanceDue ?? 0;
                const convert = (v: number) => {
                  if (!(rateN > 0) || !(v > 0)) return v;
                  if (c === 'VES') {
                    return usdToVes(
                      payCurrency === 'USD' ? v : vesToUsd(v, rateN),
                      rateN,
                    );
                  }
                  return payCurrency === 'VES' ? vesToUsd(v, rateN) : v;
                };
                if (payKind === 'partial') {
                  const next = convert(Number(amount) || 0);
                  setAmount(next > 0 ? String(next) : '');
                } else {
                  setAmount(
                    String(
                      c === 'VES' && rateN > 0
                        ? usdToVes(due, rateN)
                        : due,
                    ),
                  );
                }
                setPaySplits((prev) =>
                  prev.map((l) => ({
                    ...l,
                    amount: (() => {
                      const n = Number(l.amount);
                      if (!(n > 0)) return l.amount;
                      return String(convert(n));
                    })(),
                  })),
                );
                setPayCurrency(c);
              }}
              rate={payRate}
              onRateChange={setPayRate}
              rateSource={payRateSource}
              onRateSourceChange={setPayRateSource}
              bcvRate={bcvRate}
              rateDate={bcvDate}
              loadingRate={loadingRate}
              onRefreshRate={() => void loadExchangeRate(true)}
              amountInCurrency={
                payKind === 'full' && selectedDebt
                  ? payCurrency === 'VES' && Number(payRate) > 0
                    ? usdToVes(selectedDebt.balanceDue, Number(payRate))
                    : selectedDebt.balanceDue
                  : Number(amount) || 0
              }
            />
            <PaymentSplitsFields
              currency={payCurrency}
              expectedTotal={
                payKind === 'full' && selectedDebt
                  ? payCurrency === 'VES' && Number(payRate) > 0
                    ? usdToVes(selectedDebt.balanceDue, Number(payRate))
                    : selectedDebt.balanceDue
                  : Number(amount) || 0
              }
              lines={paySplits}
              onChange={setPaySplits}
            />
            <Input
              id="pay-notes"
              label="Notas (opcional)"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

