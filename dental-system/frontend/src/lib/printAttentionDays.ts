import {
  formatRate,
  formatUsd,
  formatVes,
  usdToVes,
} from '@/lib/exchange';
import { authenticatedMediaUrl } from '@/lib/clinicTheme';
import { hydratePrintHtmlMedia } from '@/lib/printHtml';
import type { ClinicalEvolution } from '@/features/patients/ClinicalTimeline';
import type { PrintFormat } from '@/services/print-templates.api';

type DayGroup = {
  key: string;
  label: string;
  items: ClinicalEvolution[];
};

type ProcRow = {
  name: string;
  code: string;
  qty: number;
  tooth: number | null;
  unit: number | null;
  total: number | null;
};

export type ClinicPrintContext = {
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  logoUrl?: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function isGenericNote(notes: string): boolean {
  return (
    !notes ||
    /^atención del d[ií]a\.?$/i.test(notes) ||
    /^sesión conjunta/i.test(notes)
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function moneyUsd(usd: number): string {
  return formatUsd(usd);
}

function moneyBs(usd: number, rate: number | null): string {
  if (!(rate != null && rate > 0)) return '';
  return formatVes(usdToVes(usd, rate));
}

function moneyCell(usd: number | null, rate: number | null): string {
  if (usd == null) return '—';
  const bs = moneyBs(usd, rate);
  return `<div>${escapeHtml(moneyUsd(usd))}</div>${
    bs ? `<div class="bs">${escapeHtml(bs)}</div>` : ''
  }`;
}

function procsFor(ev: ClinicalEvolution): ProcRow[] {
  if (ev.billing?.items?.length) {
    return ev.billing.items.map((i) => ({
      name: i.name,
      code: i.code,
      qty: i.quantity,
      tooth: i.toothNumber,
      unit: i.unitPrice,
      total: i.lineTotal,
    }));
  }
  return (ev.procedures ?? []).map((p) => ({
    name: p.name ?? 'Procedimiento',
    code: p.code ?? '',
    qty: p.quantity ?? 1,
    tooth: p.toothNumber ?? null,
    unit: p.unitPrice ?? null,
    total: p.lineTotal ?? null,
  }));
}

function printViaIframe(html: string) {
  const existing = document.getElementById('nexusdent-print-frame');
  existing?.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'nexusdent-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument ?? win?.document;
  if (!doc || !win) {
    iframe.remove();
    throw new Error('No se pudo abrir el marco de impresión');
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(() => iframe.remove(), 1000);
    }
  }, 250);
}

function renderHeaderHtml(
  format: PrintFormat | null | undefined,
  clinic: ClinicPrintContext,
): string {
  const header = format?.header;
  if (header?.bodyHtml?.trim()) {
    return `<header class="doc-header rich">${hydratePrintHtmlMedia(header.bodyHtml)}</header>`;
  }

  if (!header) {
    return clinic.name
      ? `<div class="doc-header"><div class="doc-title">${escapeHtml(clinic.name)}</div></div>`
      : '';
  }

  const logo = header.showLogo
    ? authenticatedMediaUrl(clinic.logoUrl)
    : null;
  const title =
    header.title?.trim() ||
    clinic.name ||
    'Clínica';
  const subtitle = header.subtitle?.trim() || '';

  const contactParts: string[] = [];
  if (header.showContact) {
    if (clinic.address) contactParts.push(clinic.address);
    if (clinic.whatsapp) contactParts.push(`WhatsApp ${clinic.whatsapp}`);
    if (clinic.email) contactParts.push(clinic.email);
  }

  return `<header class="doc-header">
    ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt=""/>` : ''}
    <div class="hdr-text">
      <div class="doc-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="doc-sub">${escapeHtml(subtitle)}</div>` : ''}
      ${
        contactParts.length
          ? `<div class="doc-contact">${escapeHtml(contactParts.join(' · '))}</div>`
          : ''
      }
      ${
        header.extraText
          ? `<div class="doc-extra">${escapeHtml(header.extraText).replace(/\n/g, '<br/>')}</div>`
          : ''
      }
    </div>
  </header>`;
}

function renderFooterBlock(
  format: PrintFormat | null | undefined,
  printedAt: string,
): string {
  const footer = format?.footer;
  if (!footer) {
    return `<p class="stamp">Impreso ${escapeHtml(printedAt)}</p>`;
  }
  const body = footer.bodyHtml?.trim()
    ? hydratePrintHtmlMedia(footer.bodyHtml)
    : footer.bodyText
      ? `<p>${escapeHtml(footer.bodyText).replace(/\n/g, '<br/>')}</p>`
      : '';
  return `<div class="clinic-footer rich">
    ${body}
    ${footer.showStamp ? `<p class="stamp">Impreso ${escapeHtml(printedAt)}</p>` : ''}
  </div>`;
}

function renderSignatures(format: PrintFormat | null | undefined): string {
  if (!format?.showSignatures) return '';
  const left = format.signatureLeftLabel?.trim() || 'Odontólogo';
  const right = format.signatureRightLabel?.trim() || 'Paciente / Responsable';
  return `<div class="signatures">
    <div class="sig">
      <div class="sig-line"></div>
      <div class="sig-label">${escapeHtml(left)}</div>
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      <div class="sig-label">${escapeHtml(right)}</div>
    </div>
  </div>`;
}

export function printAttentionDays(opts: {
  patientName: string;
  documentId: string;
  days: DayGroup[];
  exchangeRate?: number | null;
  clinic?: ClinicPrintContext;
  /** @deprecated usar clinic.name */
  clinicName?: string | null;
  format?: PrintFormat | null;
}) {
  const {
    patientName,
    documentId,
    days,
    exchangeRate,
    format,
  } = opts;
  if (!days.length) return;

  const clinic: ClinicPrintContext = {
    name: opts.clinic?.name ?? opts.clinicName ?? null,
    email: opts.clinic?.email ?? null,
    whatsapp: opts.clinic?.whatsapp ?? null,
    address: opts.clinic?.address ?? null,
    logoUrl: opts.clinic?.logoUrl ?? null,
  };

  const showPrices = format?.showPrices !== false;
  const showNotes = format?.showClinicalNotes !== false;
  const rate = exchangeRate ?? null;
  const printedAt = new Date().toLocaleString('es-VE');

  const footerNotes: string[] = [];
  let grandTotal = 0;
  let grandPaid = 0;
  let grandDue = 0;
  let hasBilling = false;

  const bodyRows: string[] = [];
  const colSpan = showPrices ? 4 : 2;

  for (const day of days) {
    bodyRows.push(
      `<tr class="day-row"><td colspan="${colSpan}">${escapeHtml(day.label)}</td></tr>`,
    );

    for (const ev of day.items) {
      const notes = stripHtml(ev.clinicalNotes ?? '');
      const rx = ev.prescription ? stripHtml(ev.prescription) : '';
      if (showNotes && !isGenericNote(notes)) {
        footerNotes.push(
          `${day.label} · ${formatTime(ev.signedAt)} — ${notes}`,
        );
      }
      if (showNotes && rx) {
        footerNotes.push(
          `${day.label} · ${formatTime(ev.signedAt)} — Receta: ${rx}`,
        );
      }

      if (ev.billing) {
        hasBilling = true;
        grandTotal += ev.billing.totalAmount;
        grandPaid += ev.billing.paidAmount;
        grandDue += ev.billing.balanceDue;
      }

      const procs = procsFor(ev);
      if (!procs.length) {
        bodyRows.push(
          showPrices
            ? `<tr>
            <td class="proc muted">${escapeHtml(formatTime(ev.signedAt))} · ${escapeHtml(ev.dentistName)} — Sin procedimientos</td>
            <td class="num">—</td>
            <td class="money">—</td>
            <td class="money">—</td>
          </tr>`
            : `<tr>
            <td class="proc muted">${escapeHtml(formatTime(ev.signedAt))} · ${escapeHtml(ev.dentistName)} — Sin procedimientos</td>
            <td class="num">—</td>
          </tr>`,
        );
        continue;
      }

      for (const p of procs) {
        const label = [
          p.name,
          p.code ? `(${p.code})` : '',
          p.tooth != null ? `· Pieza ${p.tooth}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        bodyRows.push(
          showPrices
            ? `<tr>
            <td class="proc">${escapeHtml(label)}</td>
            <td class="num">${p.qty}</td>
            <td class="money">${moneyCell(p.unit, rate)}</td>
            <td class="money">${moneyCell(p.total, rate)}</td>
          </tr>`
            : `<tr>
            <td class="proc">${escapeHtml(label)}</td>
            <td class="num">${p.qty}</td>
          </tr>`,
        );
      }
    }
  }

  const totalsHtml =
    showPrices && hasBilling
      ? `<tfoot>
        <tr>
          <td colspan="3" class="tot-label">Total</td>
          <td class="money">${moneyCell(grandTotal, rate)}</td>
        </tr>
        <tr>
          <td colspan="3" class="tot-label">Abonado</td>
          <td class="money">${moneyCell(grandPaid, rate)}</td>
        </tr>
        <tr>
          <td colspan="3" class="tot-label">Pendiente</td>
          <td class="money"><strong>${moneyCell(grandDue, rate)}</strong></td>
        </tr>
      </tfoot>`
      : '';

  const notesHtml =
    showNotes && footerNotes.length
      ? `<footer class="page-footer">
        <h3>Notas y observaciones</h3>
        <ol>
          ${footerNotes
            .map((n) => `<li>${escapeHtml(n).replace(/\n/g, '<br/>')}</li>`)
            .join('')}
        </ol>
      </footer>`
      : '';

  const thead = showPrices
    ? `<tr>
        <th class="proc">Procedimiento</th>
        <th class="num">Cant.</th>
        <th class="money">Precio</th>
        <th class="money">Subtotal</th>
      </tr>`
    : `<tr>
        <th class="proc">Procedimiento</th>
        <th class="num">Cant.</th>
      </tr>`;

  const formatName = format?.name ? ` · ${format.name}` : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Atenciones · ${escapeHtml(patientName)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      margin: 14mm 12mm;
      font-size: 10.5pt;
      line-height: 1.3;
    }
    .doc-header {
      margin-bottom: 4mm;
      padding-bottom: 3mm;
      border-bottom: 1.5px solid #222;
    }
    .doc-header:not(.rich) {
      display: flex;
      gap: 4mm;
      align-items: flex-start;
    }
    .doc-header.rich img,
    .clinic-footer.rich img {
      max-height: 22mm;
      max-width: 45mm;
      object-fit: contain;
    }
    .doc-header.rich table,
    .clinic-footer.rich table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin: 1mm 0;
    }
    .doc-header.rich td,
    .doc-header.rich th,
    .clinic-footer.rich td,
    .clinic-footer.rich th {
      border: 1px solid #333;
      padding: 1mm 1.5mm;
      vertical-align: top;
    }
    .doc-header.rich td[data-valign='middle'],
    .doc-header.rich th[data-valign='middle'],
    .clinic-footer.rich td[data-valign='middle'],
    .clinic-footer.rich th[data-valign='middle'] {
      vertical-align: middle;
    }
    .doc-header.rich td[data-valign='bottom'],
    .doc-header.rich th[data-valign='bottom'],
    .clinic-footer.rich td[data-valign='bottom'],
    .clinic-footer.rich th[data-valign='bottom'] {
      vertical-align: bottom;
    }
    .doc-header.rich h2,
    .clinic-footer.rich h2 {
      font-size: 12pt;
      margin: 0 0 1mm;
    }
    .doc-header.rich p,
    .clinic-footer.rich p {
      margin: 0.5mm 0;
    }
    .logo {
      width: 16mm;
      height: 16mm;
      object-fit: contain;
    }
    .doc-title { font-size: 13pt; font-weight: 700; margin: 0; }
    .doc-sub { font-size: 9pt; color: #333; margin-top: 0.5mm; }
    .doc-contact, .doc-extra { font-size: 8pt; color: #444; margin-top: 1mm; }
    h1 { font-size: 12pt; margin: 0 0 2mm; }
    h3 { font-size: 9.5pt; margin: 0 0 2mm; }
    .meta { font-size: 8.5pt; color: #333; margin-bottom: 4mm; }
    table.detail {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    table.detail th,
    table.detail td {
      border: 1px solid #222;
      padding: 1.6mm 2mm;
      vertical-align: top;
    }
    table.detail thead th {
      background: #e8e8e8;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    tr.day-row td {
      background: #ddd;
      font-weight: 700;
      text-transform: capitalize;
      font-size: 9pt;
      border-top: 2px solid #111;
    }
    td.proc, th.proc { text-align: left; width: ${showPrices ? '50%' : '85%'}; }
    td.num, th.num { text-align: center; width: ${showPrices ? '10%' : '15%'}; }
    td.money, th.money { text-align: right; width: 20%; white-space: nowrap; }
    .bs { font-size: 7.5pt; color: #444; margin-top: 0.3mm; }
    .muted { color: #666; font-style: italic; }
    tfoot .tot-label { text-align: right; font-weight: 700; background: #f0f0f0; }
    tfoot td { background: #f0f0f0; }
    .page-footer {
      margin-top: 6mm;
      padding-top: 3mm;
      border-top: 1px solid #222;
      font-size: 8.5pt;
      page-break-inside: avoid;
    }
    .page-footer ol { margin: 0; padding-left: 5mm; }
    .page-footer li { margin-bottom: 1.5mm; }
    .clinic-footer {
      margin-top: 5mm;
      padding-top: 2mm;
      border-top: 1px solid #bbb;
      font-size: 8pt;
      color: #444;
    }
    .stamp { margin-top: 2mm; font-size: 7.5pt; color: #555; }
    .signatures {
      display: flex;
      justify-content: space-between;
      gap: 12mm;
      margin-top: 14mm;
      page-break-inside: avoid;
    }
    .sig { flex: 1; text-align: center; }
    .sig-line {
      border-bottom: 1px solid #222;
      height: 14mm;
      margin-bottom: 2mm;
    }
    .sig-label { font-size: 8.5pt; color: #333; }
    @media print {
      body { margin: 10mm 8mm; }
    }
  </style>
</head>
<body>
  ${renderHeaderHtml(format, clinic)}
  <h1>Detalle de atenciones${escapeHtml(formatName)}</h1>
  <p class="meta">
    Paciente: <strong>${escapeHtml(patientName)}</strong>
    · Doc. ${escapeHtml(documentId)}
    ${rate != null && rate > 0 && showPrices ? ` · Tasa BCV ${escapeHtml(formatRate(rate))} Bs/USD` : ''}
  </p>
  <table class="detail">
    <thead>${thead}</thead>
    <tbody>
      ${bodyRows.join('')}
    </tbody>
    ${totalsHtml}
  </table>
  ${notesHtml}
  ${renderSignatures(format)}
  ${renderFooterBlock(format, printedAt)}
</body>
</html>`;

  printViaIframe(html);
}
