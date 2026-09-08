import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import { reportClientErrorApi } from '@/services/monitoring.api';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** No inyectar token del store (login challenge / preauth). */
    skipAuth?: boolean;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

function hasAuthorizationHeader(headers: unknown): boolean {
  if (!headers || typeof headers !== 'object') return false;
  const h = headers as {
    get?: (key: string) => string | null | undefined;
    Authorization?: unknown;
    authorization?: unknown;
  };
  if (typeof h.get === 'function') {
    return Boolean(h.get('Authorization') || h.get('authorization'));
  }
  return Boolean(h.Authorization || h.authorization);
}

api.interceptors.request.use((config) => {
  // FormData necesita multipart + boundary del browser; no forzar JSON.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    const headers = config.headers;
    if (headers && typeof headers.delete === 'function') {
      headers.delete('Content-Type');
    } else if (headers) {
      delete (headers as Record<string, unknown>)['Content-Type'];
    }
  }

  if (config.skipAuth) return config;

  // No pisar Authorization si la llamada ya trae un token explícito
  // (p. ej. change-password / select-clinic con challenge o preauth).
  if (hasAuthorizationHeader(config.headers)) return config;

  const token = useAuthStore.getState().token;
  if (token) {
    const headers = config.headers;
    if (headers && typeof headers.set === 'function') {
      headers.set('Authorization', `Bearer ${token}`);
    } else if (headers) {
      (headers as { Authorization: string }).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url ?? '');
    const skipAuth = Boolean(error.config?.skipAuth);

    if (status === 401 && !skipAuth) {
      useAuthStore.getState().logout();
      if (!window.location.pathname.startsWith('/login')) {
        toast('Sesión expirada. Vuelva a iniciar sesión.', 'error');
        window.location.assign('/login');
      }
    }
    if (status === 429) {
      toast(
        error.response?.data?.message ??
          'Demasiadas peticiones. Espere un momento.',
        'error',
      );
    }

    // No reportar el propio endpoint de monitoreo (bucle)
    if (
      status &&
      status >= 500 &&
      !url.includes('/monitoring/') &&
      useAuthStore.getState().token
    ) {
      void reportClientErrorApi({
        message: `API ${status}: ${error.response?.data?.message || error.message}`,
        route: url,
        meta: { method: error.config?.method },
      }).catch(() => undefined);
    }

    return Promise.reject(error);
  },
);
