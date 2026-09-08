export type PlanKind = 'QUOTE' | 'VISIT';
export type PlanStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'CLOSED'
  | 'REJECTED'
  | 'CANCELLED';
export type PlanItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'TRANSFER'
  | 'ZELLE'
  | 'PAGO_MOVIL';

export type PaymentCurrency = 'USD' | 'VES';
export type RateSource = 'BCV' | 'MANUAL';

export const PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'CARD',
  'TRANSFER',
  'ZELLE',
  'PAGO_MOVIL',
];

export const PAYMENT_CURRENCIES: PaymentCurrency[] = ['USD', 'VES'];

export interface TreatmentPlanDto {
  id: string;
  patientId: string;
  createdBy: string | null;
  createdByName?: string | null;
  quoteCode?: string | null;
  kind?: PlanKind;
  title: string | null;
  totalAmount: number;
  paidAmount: number;
  status: PlanStatus;
  notes: string | null;
  approvedAt: string | null;
  items?: TreatmentPlanItemDto[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TreatmentPlanItemDto {
  id: string;
  treatmentPlanId: string;
  treatmentId: number;
  toothNumber: number | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  lineTotal: number;
  status: PlanItemStatus;
  treatmentName?: string;
  treatmentCode?: string;
}

export interface PaymentDto {
  id: string;
  patientId: string;
  treatmentPlanId: string;
  planTitle?: string | null;
  planTotal?: number | null;
  amountPaid: number;
  currencyPaid: PaymentCurrency;
  amountPaidVes: number | null;
  exchangeRate: number | null;
  rateSource: RateSource | null;
  paymentMethod: PaymentMethod;
  reference: string | null;
  receiptNumber: string;
  notes: string | null;
  receivedBy: string | null;
  paidAt: string;
}

export interface PlanItemInput {
  treatmentId: number;
  toothNumber?: number | null;
  quantity?: number;
  unitPrice?: number;
  discountPct?: number;
  status?: PlanItemStatus;
}

export interface CreatePlanDto {
  patientId: string;
  title?: string;
  notes?: string | null;
  status?: PlanStatus;
  items: PlanItemInput[];
  /** Enviar el presupuesto por email al paciente */
  notifyPatient?: boolean;
  nextAppointment?: {
    scheduledAt: string;
    dentistId?: string;
    durationMin?: number;
    reason?: string | null;
  } | null;
}

export interface UpdatePlanDto {
  title?: string;
  notes?: string | null;
  items: PlanItemInput[];
  notifyPatient?: boolean;
}

export interface CreatePaymentDto {
  patientId: string;
  treatmentPlanId: string;
  /** Monto en la moneda indicada por currencyPaid */
  amountPaid: number;
  paymentMethod: PaymentMethod;
  currencyPaid?: PaymentCurrency;
  exchangeRate?: number | null;
  rateSource?: RateSource | null;
  reference?: string | null;
  notes?: string | null;
  receiptNumber?: string;
}

export interface PaymentSplitInput {
  paymentMethod: PaymentMethod;
  /** Monto en currencyPaid */
  amountPaid: number;
  reference?: string | null;
}

export interface CreatePaymentBatchDto {
  patientId: string;
  treatmentPlanId: string;
  currencyPaid?: PaymentCurrency;
  exchangeRate?: number | null;
  rateSource?: RateSource | null;
  notes?: string | null;
  splits: PaymentSplitInput[];
}
