import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { MoneyAmount } from '@/components/MoneyAmount';
import { PaymentFxFields } from '@/components/PaymentFxFields';
import {
  PaymentSplitsFields,
  newSplitLine,
  validatePaymentSplits,
  type PaymentSplitLine,
} from '@/components/PaymentSplitsFields';
import { EvolutionSoapRedesign } from '@/features/patients/EvolutionSoapRedesign';
import {
  emptySoap,
  formatSoapNotes,
  parseSoapNotes,
  type SoapFields,
} from '@/features/patients/soap.helpers';
import {
  formatUsdWithVes,
  type PaymentCurrency,
  type RateSource,
  usdToVes,
  vesToUsd,
} from '@/lib/exchange';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { getEvolutionApi, listEvolutionsApi } from '@/services/clinical.api';
import { registerPaymentApi } from '@/services/billing.api';
import { getTodayExchangeRateApi } from '@/services/exchange-rate.api';
import {
  getPatientApi,
  getPatientBalanceApi,
} from '@/services/patients.api';
import { listTreatmentsApi } from '@/services/treatments.api';
import {
  completeVisitApi,
  updateVisitApi,
} from '@/services/visits.api';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';

export function EvolutionSoapPage() {
  const [params] = useSearchParams();
  const patientId = params.get('patientId') ?? '';
  const evolutionId = params.get('evolutionId');
  const isEditing = Boolean(evolutionId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { rate: bcvToday } = useExchangeRate();

  const [soap, setSoap] = useState<SoapFields>(emptySoap);
  const [teeth, setTeeth] = useState<number[]>([]);
  const [treatmentId, setTreatmentId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState('');

  const [payOpen, setPayOpen] = useState(false);
  const [payKind, setPayKind] = useState<'full' | 'partial' | 'pending'>('full');
  const [payCurrency, setPayCurrency] = useState<PaymentCurrency>('USD');
  const [payPartial, setPayPartial] = useState('');
  const [paySplits, setPaySplits] = useState<PaymentSplitLine[]>([
    newSplitLine('CASH'),
  ]);
  const [payRate, setPayRate] = useState('');
  const [payRateSource, setPayRateSource] = useState<RateSource>('BCV');
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [bcvDate, setBcvDate] = useState<string | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);
  const [pendingChargeTotal, setPendingChargeTotal] = useState(0);

  const patientQ = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => getPatientApi(patientId),
    enabled: Boolean(patientId),
  });

  const balanceQ = useQuery({
    queryKey: ['balance', patientId],
    queryFn: () => getPatientBalanceApi(patientId),
    enabled: Boolean(patientId),
  });

  const evolutionsQ = useQuery({
    queryKey: ['evolutions', patientId],
    queryFn: () => listEvolutionsApi(patientId),
    enabled: Boolean(patientId),
  });

  const treatmentsQ = useQuery({
    queryKey: ['treatments'],
    queryFn: () => listTreatmentsApi(),
    staleTime: 60_000,
  });

  const evolutionQ = useQuery({
    queryKey: ['evolution', evolutionId],
    queryFn: () => getEvolutionApi(evolutionId!),
    enabled: Boolean(evolutionId),
  });

  const treatments = treatmentsQ.data ?? [];
  const evolutions = evolutionsQ.data ?? [];

  const selectedTreatment = useMemo(
    () => treatments.find((t) => t.id === treatmentId) ?? null,
    [treatments, treatmentId],
  );

  const grandTotal = selectedTreatment
    ? Number(selectedTreatment.basePrice ?? 0)
    : 0;

  useEffect(() => {
    if (!evolutionQ.data || !evolutionId) return;
    if (hydrated === evolutionId) return;
    const ev = evolutionQ.data;
    setSoap(parseSoapNotes(ev.clinicalNotes));
    const fromBilling = (ev.billing?.items ?? [])
      .map((i) => i.toothNumber)
      .filter((n): n is number => n != null);
    const fromField =
      ev.toothNumber != null ? [ev.toothNumber] : ([] as number[]);
    setTeeth([...new Set([...fromBilling, ...fromField])]);
    const tid =
      ev.billing?.items?.[0]?.treatmentId ??
      treatments.find((t) => t.name === ev.treatmentName)?.id ??
      null;
    setTreatmentId(tid);
    setHydrated(evolutionId);
  }, [evolutionQ.data, evolutionId, hydrated, treatments]);

  const visitMut = useMutation({
    mutationFn: async (payload: Parameters<typeof completeVisitApi>[0]) => {
      if (isEditing && evolutionId) {
        const { patientId: _p, appointmentId: _a, walkIn: _w, ...rest } =
          payload;
        return updateVisitApi(evolutionId, rest);
      }
      return completeVisitApi(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolutions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      if (evolutionId) {
        qc.invalidateQueries({ queryKey: ['evolution', evolutionId] });
      }
    },
  });

  function onSoapChange(patch: Partial<SoapFields>) {
    setSoap((prev) => ({ ...prev, ...patch }));
  }

  function onToggleTooth(n: number) {
    setTeeth((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );
  }

  function validate(): boolean {
    if (!patientId || !patientQ.data) {
      setError('Paciente no encontrado');
      toast('Paciente no encontrado', 'error');
      return false;
    }
    const hasSoap =
      soap.subjective.trim() ||
      soap.objective.trim() ||
      soap.assessment.trim() ||
      soap.plan.trim();
    if (!hasSoap) {
      setError('Completá al menos un campo del SOAP');
      toast('Completá al menos un campo del SOAP', 'error');
      return false;
    }
    if (!treatmentId) {
      setError('Seleccioná el procedimiento realizado');
      toast('Seleccioná el procedimiento realizado', 'error');
      return false;
    }
    setError('');
    return true;
  }

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

  async function commitSave(opts: {
    withPayment: boolean;
    kind?: 'full' | 'partial' | 'pending';
    amount?: number;
    currencyPaid?: PaymentCurrency;
    exchangeRate?: number;
    rateSource?: RateSource;
    splits?: PaymentSplitLine[];
  }) {
    if (!patientQ.data || !treatmentId) return;
    setSaving(true);
    setPayOpen(false);
    setError('');

    const notes = formatSoapNotes(soap);
    const toothNote =
      teeth.length > 0
        ? `\n\nPiezas trabajadas: ${[...teeth].sort((a, b) => a - b).join(', ')}`
        : '';

    try {
      const result = await visitMut.mutateAsync({
        patientId,
        walkIn: false,
        dentistId: user?.role === 'DENTIST' ? user.id : undefined,
        clinicalNotes: `${notes}${toothNote}`,
        billProcedures: true,
        notifyPatient: true,
        toothNumbers: teeth,
        procedures: [
          {
            treatmentId,
            quantity: 1,
            toothNumber: teeth[0] ?? null,
          },
        ],
      });

      if (
        opts.withPayment &&
        opts.kind &&
        opts.kind !== 'pending' &&
        result.planId &&
        opts.splits?.length &&
        (opts.amount ?? 0) > 0.009
      ) {
        try {
          const currency = opts.currencyPaid ?? 'USD';
          const rate = opts.exchangeRate ?? 0;
          const amountInCurrency = opts.amount!;
          const amountUsd =
            currency === 'VES'
              ? vesToUsd(amountInCurrency, rate)
              : amountInCurrency;
          await registerPaymentApi({
            patientId,
            treatmentPlanId: result.planId,
            currencyPaid: currency,
            exchangeRate: rate,
            rateSource: opts.rateSource ?? 'BCV',
            notes:
              opts.kind === 'full'
                ? 'Pago total al cerrar evolución SOAP'
                : 'Abono al cerrar evolución SOAP',
            splits: opts.splits.map((s) => ({
              paymentMethod: s.method,
              amountPaid: Number(s.amount),
              reference:
                s.method === 'CASH' ? null : s.reference.trim() || null,
            })),
          });
          toast(
            opts.kind === 'full'
              ? `Pagó todo · ${formatUsdWithVes(amountUsd, rate || bcvToday)}`
              : `Abono · ${formatUsdWithVes(amountUsd, rate || bcvToday)}`,
            'success',
          );
        } catch {
          toast(
            'Evolución guardada, pero no se pudo registrar el pago. Cargalo desde la ficha.',
            'error',
          );
        }
      }

      toast(
        isEditing ? 'Evolución actualizada' : 'Evolución SOAP guardada',
        'success',
      );
      navigate(`/patients/${patientId}`, { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        'No se pudo guardar la evolución';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  function onSave() {
    if (!validate()) return;
    void commitSave({ withPayment: false });
  }

  function onSaveAndBill() {
    if (!validate()) return;
    if (grandTotal <= 0.009) {
      void commitSave({ withPayment: false });
      return;
    }
    setPendingChargeTotal(grandTotal);
    setPayKind('full');
    setPayCurrency('USD');
    setPayPartial(String(grandTotal));
    setPaySplits([newSplitLine('CASH', String(grandTotal))]);
    setPayRateSource('BCV');
    setPayOpen(true);
    void loadExchangeRate();
  }

  function onCancel() {
    if (patientId) navigate(`/patients/${patientId}`);
    else navigate('/patients');
  }

  if (!patientId) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-6">
        <p className="text-sm text-slate-600">
          Abrí Evolución SOAP desde la ficha del paciente.
        </p>
        <Button variant="secondary" onClick={() => navigate('/patients')}>
          Ir a Pacientes
        </Button>
      </div>
    );
  }

  if (patientQ.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Cargando paciente…
      </div>
    );
  }

  if (patientQ.isError || !patientQ.data) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-6">
        <p className="text-sm text-red-600">Paciente no encontrado</p>
        <Button variant="secondary" onClick={() => navigate('/patients')}>
          Volver
        </Button>
      </div>
    );
  }

  const rateN = Number(payRate) || bcvRate || 0;

  return (
    <>
      <EvolutionSoapRedesign
        patient={patientQ.data}
        balanceDue={balanceQ.data?.balanceDue ?? patientQ.data.balanceDue ?? 0}
        soap={soap}
        onSoapChange={onSoapChange}
        selectedTeeth={teeth}
        onToggleTooth={onToggleTooth}
        treatments={treatments}
        treatmentId={treatmentId}
        onTreatmentChange={setTreatmentId}
        evolutions={evolutions}
        dentistName={user?.fullName ?? 'Odontólogo'}
        dentistSpecialty={user?.specialty}
        saving={saving}
        error={error}
        isEditing={isEditing}
        onCancel={onCancel}
        onSave={onSave}
        onSaveAndBill={onSaveAndBill}
      />

      <Modal
        open={payOpen}
        onClose={() => !saving && setPayOpen(false)}
        title="Generar cobro"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setPayOpen(false)}
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                if (payKind === 'pending') {
                  void commitSave({ withPayment: false });
                  return;
                }
                if (!(rateN > 0)) {
                  toast('Indicá la tasa de cambio del día', 'error');
                  return;
                }
                const amount =
                  payKind === 'full'
                    ? payCurrency === 'VES'
                      ? usdToVes(pendingChargeTotal, rateN)
                      : pendingChargeTotal
                    : Number(payPartial);
                if (!amount || amount <= 0) {
                  toast('Indicá un monto válido', 'error');
                  return;
                }
                const amountUsd =
                  payCurrency === 'VES' ? vesToUsd(amount, rateN) : amount;
                if (amountUsd > pendingChargeTotal + 0.009) {
                  toast('El abono no puede superar el total', 'error');
                  return;
                }
                const splitErr = validatePaymentSplits(paySplits, amount);
                if (splitErr) {
                  toast(splitErr, 'error');
                  return;
                }
                void commitSave({
                  withPayment: true,
                  kind: payKind,
                  amount,
                  currencyPaid: payCurrency,
                  exchangeRate: rateN,
                  rateSource: payRateSource,
                  splits: paySplits,
                });
              }}
            >
              {saving
                ? 'Guardando…'
                : payKind === 'pending'
                  ? 'Guardar sin pago'
                  : 'Confirmar cobro'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-clinic-ink px-4 py-3 text-center text-white">
            <span className="block text-xs uppercase tracking-wide text-white/70">
              Total del procedimiento
            </span>
            <MoneyAmount
              usd={pendingChargeTotal}
              className="mt-1 items-center"
              usdClassName="font-display text-2xl font-semibold text-white"
              vesClassName="text-sm text-white/75"
            />
          </p>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['full', 'Pago total'],
                ['partial', 'Abono'],
                ['pending', 'Sin pago'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setPayKind(k);
                  if (k === 'full') {
                    setPayPartial(String(pendingChargeTotal));
                    setPaySplits([
                      newSplitLine('CASH', String(pendingChargeTotal)),
                    ]);
                  }
                }}
                className={
                  payKind === k
                    ? 'rounded-lg bg-[#2b7a78] px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600'
                }
              >
                {label}
              </button>
            ))}
          </div>

          {payKind !== 'pending' && (
            <div className="space-y-3">
              {payKind === 'partial' && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                    Monto del abono
                  </span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                    value={payPartial}
                    onChange={(e) => {
                      setPayPartial(e.target.value);
                      setPaySplits([newSplitLine('CASH', e.target.value)]);
                    }}
                    inputMode="decimal"
                  />
                </label>
              )}
              <PaymentFxFields
                currency={payCurrency}
                onCurrencyChange={(c) => {
                  const r = Number(payRate);
                  const convert = (v: number) => {
                    if (!(r > 0) || !(v > 0)) return v;
                    if (c === 'VES') {
                      return usdToVes(
                        payCurrency === 'USD' ? v : vesToUsd(v, r),
                        r,
                      );
                    }
                    return payCurrency === 'VES' ? vesToUsd(v, r) : v;
                  };
                  if (payKind === 'partial') {
                    const next = convert(Number(payPartial) || 0);
                    setPayPartial(next > 0 ? String(next) : '');
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
                  payKind === 'full'
                    ? payCurrency === 'VES' && rateN > 0
                      ? usdToVes(pendingChargeTotal, rateN)
                      : pendingChargeTotal
                    : Number(payPartial) || 0
                }
              />
              <PaymentSplitsFields
                currency={payCurrency}
                expectedTotal={
                  payKind === 'full'
                    ? payCurrency === 'VES' && rateN > 0
                      ? usdToVes(pendingChargeTotal, rateN)
                      : pendingChargeTotal
                    : Number(payPartial) || 0
                }
                lines={paySplits}
                onChange={setPaySplits}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
