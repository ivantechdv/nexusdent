/** Métodos de pago usados en clínica (VE). */

export type PaymentMethod =
  | 'CASH'
  | 'ZELLE'
  | 'TRANSFER'
  | 'PAGO_MOVIL'
  | 'CARD';

export const PAYMENT_METHODS: Array<{
  value: PaymentMethod;
  label: string;
  needsRef: boolean;
}> = [
  { value: 'CASH', label: 'Efectivo', needsRef: false },
  { value: 'ZELLE', label: 'Zelle', needsRef: true },
  { value: 'TRANSFER', label: 'Transf', needsRef: true },
  { value: 'PAGO_MOVIL', label: 'Pago móvil', needsRef: true },
  { value: 'CARD', label: 'Tarjeta', needsRef: true },
];

export function paymentMethodNeedsRef(method: PaymentMethod): boolean {
  return PAYMENT_METHODS.find((m) => m.value === method)?.needsRef ?? true;
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}
