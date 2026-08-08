import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/Input';
import {
  PAYMENT_METHODS,
  paymentMethodNeedsRef,
  type PaymentMethod,
} from '@/lib/payment-methods';
import type { PaymentCurrency } from '@/lib/exchange';
import { roundMoney } from '@/lib/exchange';

export type PaymentSplitLine = {
  key: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
};

export function newSplitLine(
  method: PaymentMethod = 'CASH',
  amount = '',
): PaymentSplitLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    method,
    amount,
    reference: '',
  };
}

interface PaymentSplitsFieldsProps {
  currency: PaymentCurrency;
  /** Total que deben sumar las líneas (en la moneda elegida) */
  expectedTotal: number;
  lines: PaymentSplitLine[];
  onChange: (lines: PaymentSplitLine[]) => void;
}

export function PaymentSplitsFields({
  currency,
  expectedTotal,
  lines,
  onChange,
}: PaymentSplitsFieldsProps) {
  const unit = currency === 'VES' ? 'Bs' : 'USD';
  const allocated = roundMoney(
    lines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
  );
  const remaining = roundMoney(expectedTotal - allocated);
  const ok = Math.abs(remaining) <= 0.009;
  const [pickingMethod, setPickingMethod] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!lines.length) {
      setActiveKey(null);
      return;
    }
    if (!activeKey || !lines.some((l) => l.key === activeKey)) {
      setActiveKey(lines[0].key);
    }
  }, [lines, activeKey]);

  const active = lines.find((l) => l.key === activeKey) ?? lines[0] ?? null;

  function update(key: string, patch: Partial<PaymentSplitLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function remove(key: string) {
    if (lines.length <= 1) return;
    const next = lines.filter((l) => l.key !== key);
    onChange(next);
    setActiveKey(next[next.length - 1]?.key ?? null);
    setPickingMethod(false);
  }

  function addWithMethod(method: PaymentMethod) {
    const fill = remaining > 0.009 ? String(remaining) : '';
    const line = newSplitLine(method, fill);
    onChange([...lines, line]);
    setActiveKey(line.key);
    setPickingMethod(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
          Cómo pagó
        </p>
        {!ok && remaining > 0 && lines.length >= 1 && !pickingMethod && (
          <button
            type="button"
            onClick={() => setPickingMethod(true)}
            className="inline-flex items-center gap-1 rounded-full bg-clinic-deep/10 px-2.5 py-1 text-xs font-semibold text-clinic-deep"
          >
            <Plus className="h-3.5 w-3.5" />
            Otro método · {remaining.toFixed(2)} {unit}
          </button>
        )}
      </div>

      {lines.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {lines.map((line) => {
            const label =
              PAYMENT_METHODS.find((m) => m.value === line.method)?.label ??
              line.method;
            const isActive = line.key === active?.key;
            return (
              <button
                key={line.key}
                type="button"
                onClick={() => {
                  setActiveKey(line.key);
                  setPickingMethod(false);
                }}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition',
                  isActive
                    ? 'bg-clinic-deep text-white'
                    : 'bg-slate-100 text-clinic-ink ring-1 ring-slate-200',
                )}
              >
                {label}
                <span className="tabular-nums opacity-90">
                  {Number(line.amount) > 0
                    ? Number(line.amount).toFixed(2)
                    : '—'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {pickingMethod && (
        <div className="rounded-xl border border-clinic-deep/30 bg-clinic-deep/5 p-3">
          <p className="mb-2 text-sm font-semibold text-clinic-ink">
            ¿Con qué otro método?
          </p>
          <p className="mb-2 text-xs text-clinic-slate">
            Se asignan{' '}
            <span className="font-semibold tabular-nums text-clinic-ink">
              {remaining.toFixed(2)} {unit}
            </span>{' '}
            al método que elijas (podés ajustar el monto después).
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => addWithMethod(m.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-xs font-semibold text-clinic-ink transition hover:border-clinic-deep hover:bg-clinic-deep hover:text-white sm:text-sm"
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPickingMethod(false)}
            className="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-clinic-slate hover:bg-white/80"
          >
            Cancelar
          </button>
        </div>
      )}

      {active && !pickingMethod && (
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-clinic-slate">
              {lines.length > 1
                ? `Parte ${lines.findIndex((l) => l.key === active.key) + 1}`
                : 'Método de pago'}
            </p>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => remove(active.key)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Quitar
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => update(active.key, { method: m.value })}
                className={clsx(
                  'rounded-lg border px-1.5 py-2 text-[11px] font-semibold transition sm:text-xs',
                  active.method === m.value
                    ? 'border-clinic-deep bg-clinic-deep text-white'
                    : 'border-slate-200 bg-white text-clinic-ink',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Input
            id={`split-amt-${active.key}`}
            label={`Monto (${unit})`}
            type="number"
            min="0.01"
            step="0.01"
            value={active.amount}
            onChange={(e) => update(active.key, { amount: e.target.value })}
            placeholder="0.00"
          />

          {paymentMethodNeedsRef(active.method) && (
            <Input
              id={`split-ref-${active.key}`}
              label="Referencia / Nº de operación"
              value={active.reference}
              onChange={(e) =>
                update(active.key, { reference: e.target.value })
              }
              placeholder="Ej.: 0012345678"
              required
            />
          )}

          {ok === false && remaining > 0.009 && lines.length === 1 && (
            <button
              type="button"
              onClick={() => setPickingMethod(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-clinic-deep/40 bg-clinic-deep/5 px-3 py-2.5 text-sm font-semibold text-clinic-deep"
            >
              <Plus className="h-4 w-4" />
              Completar con otro método ({remaining.toFixed(2)} {unit})
            </button>
          )}
        </div>
      )}

      <p
        className={clsx(
          'rounded-lg px-3 py-2 text-sm',
          ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900',
        )}
      >
        Asignado{' '}
        <span className="font-semibold tabular-nums">
          {allocated.toFixed(2)} {unit}
        </span>
        {' · '}
        {ok ? (
          'completo'
        ) : remaining > 0 ? (
          <>
            falta{' '}
            <span className="font-semibold tabular-nums">
              {remaining.toFixed(2)} {unit}
            </span>
          </>
        ) : (
          <>
            sobra{' '}
            <span className="font-semibold tabular-nums">
              {Math.abs(remaining).toFixed(2)} {unit}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

export function validatePaymentSplits(
  lines: PaymentSplitLine[],
  expectedTotal: number,
): string | null {
  if (!lines.length) return 'Agregá al menos un método de pago';
  for (const line of lines) {
    const n = Number(line.amount);
    if (!(n > 0)) return 'Cada parte debe tener un monto mayor a 0';
    if (paymentMethodNeedsRef(line.method) && !line.reference.trim()) {
      return 'Indicá la referencia en cada método que la requiere';
    }
  }
  const allocated = roundMoney(
    lines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
  );
  if (Math.abs(allocated - expectedTotal) > 0.009) {
    return `Las partes deben sumar ${expectedTotal.toFixed(2)} (ahora ${allocated.toFixed(2)})`;
  }
  return null;
}
