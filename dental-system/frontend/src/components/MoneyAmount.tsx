import clsx from 'clsx';
import { formatUsd, formatVes, usdToVes } from '@/lib/exchange';
import { useExchangeRate } from '@/hooks/useExchangeRate';

interface MoneyAmountProps {
  /** Monto en USD (contabilidad clínica) */
  usd: number;
  className?: string;
  usdClassName?: string;
  vesClassName?: string;
  /** Si false, solo muestra USD */
  showVes?: boolean;
  /** Layout: stacked (default) o inline */
  layout?: 'stack' | 'inline';
}

/** Muestra USD y el equivalente Bs @ BCV de forma bien visible. */
export function MoneyAmount({
  usd,
  className,
  usdClassName,
  vesClassName,
  showVes = true,
  layout = 'stack',
}: MoneyAmountProps) {
  const { rate } = useExchangeRate();
  const ves = rate != null && rate > 0 ? usdToVes(usd, rate) : null;

  if (layout === 'inline') {
    return (
      <span className={clsx('inline-flex flex-wrap items-baseline gap-x-1.5 tabular-nums', className)}>
        <span className={clsx('whitespace-nowrap font-semibold', usdClassName)}>
          {formatUsd(usd)}
        </span>
        {showVes && ves != null && (
          <span
            className={clsx(
              'whitespace-nowrap rounded-md bg-clinic-deep/10 px-1.5 py-0.5 text-xs font-bold text-clinic-deep',
              vesClassName,
            )}
          >
            {formatVes(ves)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={clsx('inline-flex min-w-0 flex-col gap-0.5', className)}>
      <span
        className={clsx(
          'whitespace-nowrap tabular-nums font-semibold',
          usdClassName,
        )}
      >
        {formatUsd(usd)}
      </span>
      {showVes && ves != null && (
        <span
          className={clsx(
            'inline-flex max-w-full truncate rounded-md bg-clinic-deep/10 px-1.5 py-0.5 text-xs font-bold tabular-nums text-clinic-deep',
            vesClassName,
          )}
        >
          {formatVes(ves)}
        </span>
      )}
    </span>
  );
}
