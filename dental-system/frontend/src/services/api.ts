import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import { reportClientErrorApi } from '@/services/monitoring.api';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  // No pisar Authorization si la llamada ya trae un token explícito
  // (p. ej. change-password / select-clinic con challenge o preauth).
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url ?? '');

    if (status === 401) {
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
