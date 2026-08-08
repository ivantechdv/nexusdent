import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientErrorApi } from '@/services/monitoring.api';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportClientErrorApi({
      message: error.message || 'React render error',
      stack: error.stack,
      route: window.location.pathname,
      meta: { componentStack: info.componentStack },
    }).catch(() => undefined);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-display text-lg font-semibold text-clinic-ink">
            Algo falló en la interfaz
          </p>
          <p className="max-w-sm text-sm text-clinic-slate">
            El error ya quedó registrado para el equipo técnico.
          </p>
          <button
            type="button"
            className="rounded-xl bg-clinic-deep px-4 py-2.5 text-sm font-semibold text-white"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.assign('/');
            }}
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (ev) => {
    void reportClientErrorApi({
      message: ev.message || 'window.error',
      stack: ev.error?.stack,
      route: window.location.pathname,
      meta: { filename: ev.filename, lineno: ev.lineno },
    }).catch(() => undefined);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'unhandledrejection';
    void reportClientErrorApi({
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      route: window.location.pathname,
    }).catch(() => undefined);
  });
}
