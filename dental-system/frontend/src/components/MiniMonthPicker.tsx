import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import {
  addDays,
  dayNumber,
  isSameMonth,
  monthGridRange,
  parseYmd,
  todayYmd,
  toYmd,
} from '@/features/appointments/calendarUtils';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface MiniMonthPickerProps {
  value: string;
  onChange: (ymd: string) => void;
  min?: string;
  className?: string;
}

export function MiniMonthPicker({
  value,
  onChange,
  min,
  className,
}: MiniMonthPickerProps) {
  const today = todayYmd();
  const minYmd = min ?? today;
  const [viewMonth, setViewMonth] = useState(value || today);
  const { days } = monthGridRange(viewMonth);
  const monthLabel = new Intl.DateTimeFormat('es-VE', {
    month: 'long',
    year: 'numeric',
  }).format(parseYmd(viewMonth));

  useEffect(() => {
    if (value) setViewMonth(value);
  }, [value]);

  function shiftMonth(dir: -1 | 1) {
    const d = parseYmd(viewMonth);
    d.setMonth(d.getMonth() + dir);
    setViewMonth(toYmd(d));
  }

  return (
    <div className={clsx('select-none', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-lg p-2 text-clinic-slate hover:bg-slate-100 hover:text-clinic-ink"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="font-display text-sm font-semibold capitalize text-clinic-ink">
          {monthLabel}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-lg p-2 text-clinic-slate hover:bg-slate-100 hover:text-clinic-ink"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold uppercase tracking-wide text-clinic-slate">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((ymd) => {
          const inMonth = isSameMonth(ymd, viewMonth);
          const selected = ymd === value;
          const isToday = ymd === today;
          const disabled = ymd < minYmd;
          return (
            <button
              key={ymd}
              type="button"
              disabled={disabled}
              onClick={() => onChange(ymd)}
              className={clsx(
                'aspect-square rounded-xl text-sm font-semibold transition',
                !inMonth && 'text-slate-300',
                inMonth &&
                  !selected &&
                  !disabled &&
                  'text-clinic-ink hover:bg-slate-100',
                selected && 'bg-clinic-deep text-white shadow-sm',
                !selected &&
                  isToday &&
                  inMonth &&
                  'ring-1 ring-clinic-deep/40',
                disabled && 'cursor-not-allowed opacity-35',
              )}
            >
              {dayNumber(ymd)}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[
          { label: 'Hoy', ymd: today < minYmd ? minYmd : today },
          { label: '+7 días', ymd: addDays(today, 7) },
          { label: '+14 días', ymd: addDays(today, 14) },
        ].map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onChange(q.ymd < minYmd ? minYmd : q.ymd)}
            className={clsx(
              'rounded-full px-2.5 py-1 text-xs font-semibold transition',
              value === q.ymd
                ? 'bg-clinic-deep/10 text-clinic-deep'
                : 'bg-slate-100 text-clinic-slate hover:bg-slate-200',
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
