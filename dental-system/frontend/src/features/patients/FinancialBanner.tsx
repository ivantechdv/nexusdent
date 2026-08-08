import { AlertTriangle, Receipt, Wallet } from 'lucide-react';
import { Button } from '@/components/Button';
import { MoneyAmount } from '@/components/MoneyAmount';
import { BcvRatePill } from '@/components/BcvRateCard';
import clsx from 'clsx';

export interface PatientBalance {
  totalBudgeted: number;
  totalPaid: number;
  balanceDue: number;
}

interface FinancialBannerProps {
  balance: PatientBalance;
  onRegisterPayment: () => void;
}

export function FinancialBanner({
  balance,
  onRegisterPayment,
}: FinancialBannerProps) {
  const hasDebt = balance.balanceDue > 0.009;
  const isCritical = balance.balanceDue > balance.totalBudgeted * 0.5;

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-xl border px-3 py-3 sm:px-5 sm:py-4',
        hasDebt
          ? isCritical
            ? 'border-red-200 bg-gradient-to-br from-red-50 to-amber-50'
            : 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/60'
          : 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white',
      )}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div
          className={clsx(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9',
            hasDebt
              ? 'bg-white/80 text-amber-700'
              : 'bg-white/80 text-emerald-700',
          )}
        >
          {hasDebt ? (
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-clinic-slate sm:text-xs">
            Resumen financiero
          </p>
          <div className="mt-1">
            <BcvRatePill />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
        <MetricRow label="Presupuestado" usd={balance.totalBudgeted} />
        <MetricRow label="Pagado" usd={balance.totalPaid} />
        <MetricRow
          label="Deuda"
          usd={balance.balanceDue}
          emphasize={hasDebt}
          danger={isCritical}
        />
      </div>

      <Button
        onClick={onRegisterPayment}
        className="mt-3 w-full justify-center sm:mt-4"
      >
        <Receipt className="h-4 w-4 shrink-0" />
        <span className="truncate sm:hidden">Registrar abono</span>
        <span className="hidden sm:inline">Registrar Abono / Emitir Recibo</span>
      </Button>
    </div>
  );
}

function MetricRow({
  label,
  usd,
  emphasize,
  danger,
}: {
  label: string;
  usd: number;
  emphasize?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/60 px-2.5 py-2">
      <p className="shrink-0 text-xs font-medium text-clinic-slate">{label}</p>
      <MoneyAmount
        usd={usd}
        layout="inline"
        className="min-w-0 justify-end"
        usdClassName={clsx(
          'text-sm font-bold',
          danger && 'text-red-600',
          emphasize && !danger && 'text-amber-700',
          !emphasize && !danger && 'text-clinic-ink',
        )}
        vesClassName={clsx(
          'text-[10px] font-bold',
          danger && 'text-red-500/80',
          emphasize && !danger && 'text-amber-600/80',
        )}
      />
    </div>
  );
}
