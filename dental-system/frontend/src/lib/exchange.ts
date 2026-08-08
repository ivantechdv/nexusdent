/** Helpers de conversión USD ↔ Bs para cobros VE. */

export type PaymentCurrency = 'USD' | 'VES';
export type RateSource = 'BCV' | 'MANUAL';

export function roundMoney(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function usdToVes(usd: number, rate: number): number {
  if (!(rate > 0)) return 0;
  return roundMoney(usd * rate);
}

export function vesToUsd(ves: number, rate: number): number {
  if (!(rate > 0)) return 0;
  return roundMoney(ves / rate);
}

/** Formato fijo en Bs (Intl VES es inconsistente entre navegadores). */
export function formatVes(value: number): string {
  const n = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `Bs ${n}`;
}

export function formatUsd(value: number): string {
  const n = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `USD ${n}`;
}

export function formatRate(rate: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(rate);
}

/** USD principal + equivalente Bs (si hay tasa). */
export function formatUsdWithVes(
  usd: number,
  rate: number | null | undefined,
): string {
  const main = formatUsd(usd);
  if (!(rate != null && rate > 0)) return main;
  return `${main} · ${formatVes(usdToVes(usd, rate))}`;
}
