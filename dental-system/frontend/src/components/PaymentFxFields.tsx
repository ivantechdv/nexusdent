import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import {
  formatRate,
  formatUsd,
  formatVes,
  type PaymentCurrency,
  type RateSource,
  usdToVes,
  vesToUsd,
} from '@/lib/exchange';

interface PaymentFxFieldsProps {
  currency: PaymentCurrency;
  onCurrencyChange: (c: PaymentCurrency) => void;
  rate: string;
  onRateChange: (v: string) => void;
  rateSource: RateSource;
  onRateSourceChange: (s: RateSource) => void;
  bcvRate: number | null;
  rateDate?: string | null;
  loadingRate?: boolean;
  onRefreshRate?: () => void;
  /** Monto en la moneda seleccionada */
  amountInCurrency: number;
}

export function PaymentFxFields({
  currency,
  onCurrencyChange,
  rate,
  onRateChange,
  rateSource,
  onRateSourceChange,
  bcvRate,
  rateDate,
  loadingRate,
  onRefreshRate,
  amountInCurrency,
}: PaymentFxFieldsProps) {
  const rateN = Number(String(rate).replace(',', '.'));
  const hasRate = rateN > 0;
  const amountUsd =
    currency === 'USD'
      ? amountInCurrency
      : hasRate
        ? vesToUsd(amountInCurrency, rateN)
        : 0;
  const amountVes =
    currency === 'VES'
      ? amountInCurrency
      : hasRate
        ? usdToVes(amountInCurrency, rateN)
        : 0;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] flex-1">
          <Input
            id="pay-fx-rate"
            label={`Tasa Bs/USD (${rateSource === 'BCV' ? 'BCV' : 'manual'})`}
            type="number"
            min="0.01"
            step="0.0001"
            value={rate}
            onChange={(e) => {
              onRateChange(e.target.value);
              const n = Number(String(e.target.value).replace(',', '.'));
              if (bcvRate != null && Math.abs(n - bcvRate) > 0.00005) {
                onRateSourceChange('MANUAL');
              } else if (bcvRate != null && Math.abs(n - bcvRate) <= 0.00005) {
                onRateSourceChange('BCV');
              } else {
                onRateSourceChange('MANUAL');
              }
            }}
            placeholder="Ej.: 742.81"
          />
        </div>
        {onRefreshRate && (
          <Button
            type="button"
            variant="secondary"
            disabled={loadingRate}
            onClick={onRefreshRate}
            title="Actualizar tasa BCV"
          >
            <RefreshCw
              className={clsx('h-4 w-4', loadingRate && 'animate-spin')}
            />
            BCV
          </Button>
        )}
      </div>
      <p className="text-xs text-clinic-slate">
        {bcvRate != null
          ? `BCV del día${rateDate ? ` (${rateDate})` : ''}: ${formatRate(bcvRate)}. Podés editarla si cobrás con otra tasa.`
          : 'No se pudo cargar BCV. Ingresá la tasa a mano.'}
      </p>

      <p className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
        Moneda del cobro
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onCurrencyChange('USD')}
          className={clsx(
            'rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
            currency === 'USD'
              ? 'border-emerald-500 bg-emerald-50 text-clinic-ink ring-2 ring-emerald-200'
              : 'border-slate-200 bg-white text-clinic-ink',
          )}
        >
          Pagó en USD
        </button>
        <button
          type="button"
          onClick={() => onCurrencyChange('VES')}
          className={clsx(
            'rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
            currency === 'VES'
              ? 'border-amber-500 bg-amber-50 text-clinic-ink ring-2 ring-amber-200'
              : 'border-slate-200 bg-white text-clinic-ink',
          )}
        >
          Pagó en Bs
        </button>
      </div>

      {amountInCurrency > 0 && hasRate && (
        <p className="rounded-lg bg-white px-3 py-2 text-sm text-clinic-ink">
          <span className="font-semibold tabular-nums">
            {formatUsd(amountUsd)}
          </span>
          {' = '}
          <span className="font-semibold tabular-nums">
            {formatVes(amountVes)}
          </span>
          <span className="text-clinic-slate">
            {' '}
            @ {formatRate(rateN)}
          </span>
        </p>
      )}
    </div>
  );
}
