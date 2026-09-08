import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** sm default · lg formularios · xl registro paciente rediseño */
  size?: 'sm' | 'lg' | 'xl';
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'sm',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center md:items-center md:p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-clinic-ink/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`modal-sheet relative z-10 flex w-full max-h-[min(92dvh,100%)] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-slate-200 bg-white shadow-panel md:max-h-[90vh] md:rounded-xl md:border-b ${
          size === 'xl'
            ? 'md:max-w-4xl'
            : size === 'lg'
              ? 'md:max-w-2xl'
              : 'md:max-w-lg'
        }`}
      >
        {/* Handle móvil */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-1 md:px-5 md:pb-4 md:pt-4">
          <h2
            id="modal-title"
            className="font-display text-lg font-semibold text-clinic-ink"
          >
            {title}
          </h2>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar modal">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5 ${
            footer
              ? 'pb-4'
              : 'pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4'
          }`}
        >
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:px-5 [&_button]:w-full sm:[&_button]:w-auto">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
