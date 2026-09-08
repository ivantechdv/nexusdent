import { useMemo, useState } from 'react';
import clsx from 'clsx';
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
import type { PaymentMethod } from '@/lib/payment-methods';
import {
  type PaymentCurrency,
  type RateSource,
  usdToVes,
  vesToUsd,
} from '@/lib/exchange';
import { getTodayExchangeRateApi } from '@/services/exchange-rate.api';
import { toast } from '@/stores/toast.store';
import type { ClinicalEvolution } from './ClinicalTimeline';

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

export function buildOpenDebts(evolutions: ClinicalEvolution[]): OpenDebt[] {
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

type RegisterPaymentPayload = {
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
};

export function usePatientPaymentModal(
  evolutions: ClinicalEvolution[],
  onRegisterPayment: (payload: RegisterPaymentPayload) => void,
) {
  const [payOpen, setPayOpen] = useState(false);
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

  function selectDebt(planId: string) {
    const debt = openDebts.find((d) => d.planId === planId);
    if (!debt) return;
    setSelectedPlanId(planId);
    setPayKind('full');
    setPayCurrency('USD');
    setAmount(String(debt.balanceDue));
    setPaySplits([newSplitLine('CASH', String(debt.balanceDue))]);
  }

  function openPayModal() {
    if (openDebts.length === 0) {
      toast('No hay saldo pendiente. Registrá una atención primero.', 'error');
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

  const modal = (
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
                    s.method === 'CASH' ? null : s.reference.trim() || null,
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
                  setPaySplits([{ ...paySplits[0], amount: e.target.value }]);
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
                    c === 'VES' && rateN > 0 ? usdToVes(due, rateN) : due,
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
  );

  return { openPayModal, paymentModal: modal, openDebts };
}
