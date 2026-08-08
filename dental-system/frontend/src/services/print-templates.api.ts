import { api } from './api';

export type PrintDocType = 'ATTENTION_LOG' | 'MEDICAL_HISTORY';

export interface PrintHeader {
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

export interface PrintFooter {
  id: string;
  name: string;
  bodyText: string | null;
  bodyHtml: string | null;
  showStamp: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export interface PrintFormat {
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
  header?: PrintHeader | null;
  footer?: PrintFooter | null;
}

export interface PrintBundle {
  headers: PrintHeader[];
  footers: PrintFooter[];
  formats: PrintFormat[];
}

export async function getPrintBundleApi() {
  const { data } = await api.get<{ data: PrintBundle }>('/print-templates/bundle');
  return data.data;
}

export async function listPrintFormatsApi(docType: PrintDocType = 'ATTENTION_LOG') {
  const { data } = await api.get<{ data: PrintFormat[] }>('/print-templates/formats', {
    params: { docType },
  });
  return data.data;
}

export async function createPrintHeaderApi(body: Partial<PrintHeader> & { name: string }) {
  const { data } = await api.post<{ data: PrintHeader }>('/print-templates/headers', body);
  return data.data;
}

export async function updatePrintHeaderApi(
  id: string,
  body: Partial<PrintHeader> & { name: string },
) {
  const { data } = await api.patch<{ data: PrintHeader }>(
    `/print-templates/headers/${id}`,
    body,
  );
  return data.data;
}

export async function deletePrintHeaderApi(id: string) {
  await api.delete(`/print-templates/headers/${id}`);
}

export async function createPrintFooterApi(body: Partial<PrintFooter> & { name: string }) {
  const { data } = await api.post<{ data: PrintFooter }>('/print-templates/footers', body);
  return data.data;
}

export async function updatePrintFooterApi(
  id: string,
  body: Partial<PrintFooter> & { name: string },
) {
  const { data } = await api.patch<{ data: PrintFooter }>(
    `/print-templates/footers/${id}`,
    body,
  );
  return data.data;
}

export async function deletePrintFooterApi(id: string) {
  await api.delete(`/print-templates/footers/${id}`);
}

export async function createPrintFormatApi(body: Partial<PrintFormat> & { name: string }) {
  const { data } = await api.post<{ data: PrintFormat }>('/print-templates/formats', body);
  return data.data;
}

export async function updatePrintFormatApi(
  id: string,
  body: Partial<PrintFormat> & { name: string },
) {
  const { data } = await api.patch<{ data: PrintFormat }>(
    `/print-templates/formats/${id}`,
    body,
  );
  return data.data;
}

export async function deletePrintFormatApi(id: string) {
  await api.delete(`/print-templates/formats/${id}`);
}
