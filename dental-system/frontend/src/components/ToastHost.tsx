import { useToastStore } from '@/stores/toast.store';
import clsx from 'clsx';

export function ToastHost() {
  const { items, dismiss } = useToastStore();
  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 md:top-4 md:items-end md:px-6">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={clsx(
            'pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-left text-sm font-medium shadow-lg ring-1 transition',
            t.tone === 'success' &&
              'bg-emerald-600 text-white ring-emerald-500/30',
            t.tone === 'error' && 'bg-red-600 text-white ring-red-500/30',
            t.tone === 'info' && 'bg-clinic-deep text-white ring-clinic-deep/30',
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
