export type PrintDocType = 'ATTENTION_LOG' | 'MEDICAL_HISTORY';

export interface PrintHeaderDto {
  id: string;
  name: string;
  title: string | null;
  subtitle: string | null;
  showLogo: boolean;
  showContact: boolean;
  extraText: string | null;
  bodyHtml: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface PrintFooterDto {
  id: string;
  name: string;
  bodyText: string | null;
  bodyHtml: string | null;
  showStamp: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export interface PrintFormatDto {
  id: string;
  name: string;
  description: string | null;
  docType: PrintDocType;
  headerId: string | null;
  footerId: string | null;
  showPrices: boolean;
  showClinicalNotes: boolean;
  showSignatures: boolean;
  signatureLeftLabel: string | null;
  signatureRightLabel: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  header?: PrintHeaderDto | null;
  footer?: PrintFooterDto | null;
}

export interface UpsertPrintHeaderDto {
  name: string;
  title?: string | null;
  subtitle?: string | null;
  showLogo?: boolean;
  showContact?: boolean;
  extraText?: string | null;
  bodyHtml?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface UpsertPrintFooterDto {
  name: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  showStamp?: boolean;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface UpsertPrintFormatDto {
  name: string;
  description?: string | null;
  docType?: PrintDocType;
  headerId?: string | null;
  footerId?: string | null;
  showPrices?: boolean;
  showClinicalNotes?: boolean;
  showSignatures?: boolean;
  signatureLeftLabel?: string | null;
  signatureRightLabel?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface PrintBundleDto {
  headers: PrintHeaderDto[];
  footers: PrintFooterDto[];
  formats: PrintFormatDto[];
}
