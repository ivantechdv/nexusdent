import { useAuthStore } from '@/stores/auth.store';

const DEFAULT_DEEP = '30 58 138'; // #1e3a8a

export function hexToRgbChannels(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `${r} ${g} ${b}`;
}

export function applyClinicTheme(themePrimary?: string | null) {
  const root = document.documentElement;
  const channels = themePrimary
    ? hexToRgbChannels(themePrimary)
    : DEFAULT_DEEP;
  root.style.setProperty('--clinic-deep', channels ?? DEFAULT_DEEP);
}

export function resetClinicTheme() {
  applyClinicTheme(null);
}

/** URL de archivo autenticado (logo, etc.) */
export function authenticatedMediaUrl(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  const token = useAuthStore.getState().token;
  if (!token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}access_token=${encodeURIComponent(token)}`;
}
