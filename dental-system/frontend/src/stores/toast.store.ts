import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message, tone = 'info') => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, message, tone }] }));
    window.setTimeout(() => {
      set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
    }, 4200);
  },
  dismiss: (id) =>
    set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export function toast(message: string, tone: ToastTone = 'info') {
  useToastStore.getState().push(message, tone);
}

export function toastError(err: unknown, fallback = 'Ocurrió un error') {
  const msg =
    (err as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ||
    (err as Error)?.message ||
    fallback;
  toast(msg, 'error');
}
