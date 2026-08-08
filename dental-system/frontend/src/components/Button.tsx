import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-clinic-slate hover:bg-slate-100',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(variants[variant], 'disabled:opacity-50', className)}
      {...props}
    >
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
