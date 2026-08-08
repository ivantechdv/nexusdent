import { InputHTMLAttributes, forwardRef, useId } from 'react';
import { HelpCircle } from 'lucide-react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Override default uppercase label style */
  labelClassName?: string;
  /** Texto del tip junto al label (ícono ?) */
  tip?: string;
  /** Ayuda debajo del campo */
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, error, id, labelClassName, tip, hint, ...props },
    ref,
  ) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const tipId = tip ? `${inputId}-tip` : undefined;

    return (
      <div className="block space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="flex items-center gap-1.5"
          >
            <span
              className={
                labelClassName ??
                'text-xs font-semibold uppercase tracking-wide text-clinic-slate'
              }
            >
              {label}
            </span>
            {tip && (
              <span className="group relative inline-flex">
                <button
                  type="button"
                  className="rounded-full text-clinic-slate/80 outline-none hover:text-clinic-deep focus-visible:ring-2 focus-visible:ring-clinic-deep/30"
                  aria-label={tip}
                  aria-describedby={tipId}
                  title={tip}
                >
                  <HelpCircle className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
                <span
                  id={tipId}
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-52 -translate-x-1/2 rounded-lg bg-clinic-ink px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {tip}
                </span>
              </span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-clinic-ink',
            'placeholder:text-slate-400 focus:border-clinic-deep focus:outline-none focus:ring-2 focus:ring-clinic-deep/20',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-200',
            className,
          )}
          {...props}
        />
        {error && <span className="text-xs text-red-600">{error}</span>}
        {!error && hint && (
          <span className="text-xs text-clinic-slate">{hint}</span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
