import { useAuthStore } from '@/stores/auth.store';

/** Añade access_token a imgs de /api/uploads para vista previa e impresión. */
export function hydratePrintHtmlMedia(html: string | null | undefined): string {
  if (!html) return '';
  const token = useAuthStore.getState().token;
  if (!token) return html;
  return html.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi,
    (_m, pre: string, src: string, post: string) => {
      if (!src.includes('/api/uploads/')) return `${pre}${src}${post}`;
      const clean = src.replace(/([?&])access_token=[^&]*/g, '').replace(/[?&]$/, '');
      const sep = clean.includes('?') ? '&' : '?';
      return `${pre}${clean}${sep}access_token=${encodeURIComponent(token)}${post}`;
    },
  );
}

/** Quita tokens de query al guardar HTML. */
export function persistPrintHtmlMedia(html: string | null | undefined): string | null {
  if (!html) return null;
  const cleaned = html.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi,
    (_m, pre: string, src: string, post: string) => {
      const clean = src
        .replace(/([?&])access_token=[^&]*/g, '')
        .replace(/\?&/, '?')
        .replace(/[?&]$/, '');
      return `${pre}${clean}${post}`;
    },
  );
  const empty = cleaned
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
  const hasMedia = /<img\b|<table\b/i.test(cleaned);
  if (!empty && !hasMedia) return null;
  return cleaned;
}
