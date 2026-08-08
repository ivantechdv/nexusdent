import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import { formatRate } from '@/lib/exchange';
import { useExchangeRate } from '@/hooks/useExchangeRate';

interface BcvRateCardProps {
  className?: string;
  /** Compacto para filas de stats */
  compact?: boolean;
}

/** Card con la tasa BCV del día — bien visible. */
export function BcvRateCard({ className, compact }: BcvRateCardProps) {
  const { rate, rateDate, isLoading, isError, refetch } = useExchangeRate();

  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl border-2 border-clinic-deep/20 bg-clinic-ink text-white shadow-sm',
        compact ? 'p-3' : 'p-4 sm:p-5',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/25 blur-2xl" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
            Tasa BCV del día
          </p>
          {isLoading ? (
            <p className="mt-2 text-sm text-white/80">Cargando…</p>
          ) : isError || rate == null ? (
            <p className="mt-2 text-sm font-semibold text-amber-200">
              No disponible · tocá refrescar
            </p>
          ) : (
            <>
              <p
                className={clsx(
                  'mt-1 font-display font-bold tabular-nums tracking-tight text-white',
                  compact ? 'text-2xl' : 'text-3xl sm:text-4xl',
                )}
              >
                {formatRate(rate)}
              </p>
              <p className="mt-1 text-sm font-semibold text-accent">
                Bs por cada 1 USD
              </p>
              {rateDate && (
                <p className="mt-0.5 text-xs text-white/55">
                  Vigencia {rateDate}
                </p>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-xl bg-white/10 p-2 text-white hover:bg-white/20"
          title="Actualizar tasa BCV"
        >
          <RefreshCw
            className={clsx('h-4 w-4', isLoading && 'animate-spin')}
          />
        </button>
      </div>
    </div>
  );
}

/** Chip compacto para header / sidebar. */
export function BcvRatePill({ className }: { className?: string }) {
  const { rate, isLoading, isError, refetch } = useExchangeRate();

  return (
    <button
      type="button"
      onClick={() => void refetch()}
      title="Tasa BCV · tocar para actualizar"
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-clinic-deep/20 bg-clinic-deep/10 px-2.5 py-1 text-left transition hover:bg-clinic-deep/15',
        className,
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-clinic-deep">
        BCV
      </span>
      {isLoading ? (
        <span className="text-xs text-clinic-slate">…</span>
      ) : isError || rate == null ? (
        <span className="text-xs font-semibold text-amber-700">—</span>
      ) : (
        <span className="truncate font-display text-sm font-bold tabular-nums text-clinic-ink">
          {formatRate(rate)}
        </span>
      )}
      <RefreshCw className="h-3 w-3 shrink-0 text-clinic-slate" />
    </button>
  );
}
