/** Colores estables por código de categoría (catálogo / filtros). */

const KNOWN: Record<string, string> = {
  GENERAL: 'bg-slate-100 text-slate-700',
  ENDODONCIA: 'bg-sky-50 text-sky-800',
  CIRUGIA: 'bg-rose-50 text-rose-800',
  ORTODONCIA: 'bg-teal-50 text-teal-800',
  PERIODONCIA: 'bg-amber-50 text-amber-900',
  PROTESIS: 'bg-indigo-50 text-indigo-800',
  RADIOLOGIA: 'bg-cyan-50 text-cyan-800',
};

const FALLBACK = [
  'bg-emerald-50 text-emerald-800',
  'bg-orange-50 text-orange-900',
  'bg-lime-50 text-lime-900',
  'bg-fuchsia-50 text-fuchsia-800',
  'bg-blue-50 text-blue-800',
  'bg-stone-100 text-stone-700',
];

function hashCode(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function categoryBadgeClass(code: string): string {
  const key = code.trim().toUpperCase();
  if (KNOWN[key]) return KNOWN[key];
  return FALLBACK[hashCode(key) % FALLBACK.length];
}
