import { authenticatedMediaUrl } from '@/lib/clinicTheme';
import { hydratePrintHtmlMedia } from '@/lib/printHtml';
import type { ClinicalEvolution } from '@/features/patients/ClinicalTimeline';
import type { OdontogramStateItem } from '@/features/clinical-history/odontogram.types';
import {
  LOWER_TEETH,
  UPPER_TEETH,
  lingualOrPalatal,
  resolveSurfaceColor,
  type OdontogramCondition,
  type OdontogramStatus,
  type ToothSurface,
} from '@/features/clinical-history/odontogram.types';
import type { ClinicPrintContext } from '@/lib/printAttentionDays';
import type { PrintFormat } from '@/services/print-templates.api';

const UPPER_PRIMARY = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65] as const;
const LOWER_PRIMARY = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75] as const;

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

function ageFromBirth(birthDate?: string | null): string {
  if (!birthDate) return '';
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return '';
  const years = Math.floor(
    (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
  return years >= 0 ? String(years) : '';
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Montos cortos para que la tabla no se salga del papel. */
function formatPrintMoney(value: number): string {
  const n = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `$${n}`;
}

function findState(
  states: OdontogramStateItem[],
  surface: ToothSurface,
): OdontogramStateItem | undefined {
  return (
    states.find((s) => s.surface === surface) ??
    states.find((s) => s.surface === 'WHOLE')
  );
}

function fillFor(
  toothStates: OdontogramStateItem[],
  surface: ToothSurface,
): string {
  const st = findState(toothStates, surface);
  if (!st) return '#fff';
  return resolveSurfaceColor(
    st.condition as OdontogramCondition,
    st.status as OdontogramStatus,
  );
}

/** Diente circular 5 caras (estilo ficha papel Ortodent). */
function toothSvg(n: number, allStates: OdontogramStateItem[]): string {
  const toothStates = allStates.filter((s) => s.toothNumber === n);
  const lp = lingualOrPalatal(n);
  const whole = findState(toothStates, 'WHOLE');
  const missing =
    whole?.condition === 'MISSING' || whole?.status === 'ABSENT';

  if (missing) {
    return `<td class="odo-cell">
      <svg viewBox="0 0 28 28" class="odo-svg" aria-hidden="true">
        <circle cx="14" cy="14" r="12" fill="#374151" stroke="#1e3a5f" stroke-width="1.2"/>
        <line x1="7" y1="7" x2="21" y2="21" stroke="#f8fafc" stroke-width="1.5"/>
        <line x1="21" y1="7" x2="7" y2="21" stroke="#f8fafc" stroke-width="1.5"/>
        <text x="14" y="26.5" text-anchor="middle" font-size="5.5" font-family="system-ui,sans-serif" fill="#334155">${n}</text>
      </svg>
    </td>`;
  }

  const v = fillFor(toothStates, 'V');
  const m = fillFor(toothStates, 'M');
  const o = fillFor(toothStates, 'O');
  const d = fillFor(toothStates, 'D');
  const l = fillFor(toothStates, lp);

  return `<td class="odo-cell">
    <svg viewBox="0 0 28 32" class="odo-svg" aria-hidden="true">
      <circle cx="14" cy="13" r="11.5" fill="none" stroke="#1e3a5f" stroke-width="1.15"/>
      <path d="M14 1.5 L22.5 8.2 L14 13 Z" fill="${v}" stroke="#1e3a5f" stroke-width="0.7"/>
      <path d="M2.5 8.2 L14 13 L5.5 18.5 Z" fill="${m}" stroke="#1e3a5f" stroke-width="0.7"/>
      <circle cx="14" cy="13" r="3.6" fill="${o}" stroke="#1e3a5f" stroke-width="0.7"/>
      <path d="M25.5 8.2 L14 13 L22.5 18.5 Z" fill="${d}" stroke="#1e3a5f" stroke-width="0.7"/>
      <path d="M5.5 18.5 L14 13 L22.5 18.5 L14 24.5 Z" fill="${l}" stroke="#1e3a5f" stroke-width="0.7"/>
      <text x="14" y="31" text-anchor="middle" font-size="5.5" font-family="system-ui,sans-serif" fill="#334155">${n}</text>
    </svg>
  </td>`;
}

function odoRow(
  nums: readonly number[],
  states: OdontogramStateItem[],
): string {
  return `<tr>${nums.map((n) => toothSvg(n, states)).join('')}</tr>`;
}

function antecedentesPersonales(patient: MedicalHistoryPatient): string {
  const flags: string[] = [];
  if (patient.allergyPenicillin) flags.push('Alergia penicilina');
  if (patient.allergyAnesthesia) flags.push('Alergia anestesia');
  if (patient.hasHypertension) flags.push('Hipertensión');
  if (patient.hasDiabetes) flags.push('Diabetes');
  if (patient.coagulationIssues) flags.push('Trastornos coagulación');
  if (patient.isPregnant) flags.push('Embarazo');
  const notes = (patient.anamnesisNotes ?? '').trim();
  const cond = (patient.medicalConditions ?? '').trim();
  const parts = [...flags];
  if (cond) parts.push(cond);
  if (notes && !notes.startsWith('{')) parts.push(notes);
  if (notes.startsWith('{')) {
    try {
      const raw = JSON.parse(notes) as {
        diseaseNotes?: string;
        specialAttention?: string;
        generalNotes?: string;
      };
      if (raw.diseaseNotes?.trim()) parts.push(raw.diseaseNotes.trim());
      if (raw.specialAttention?.trim()) parts.push(raw.specialAttention.trim());
      if (raw.generalNotes?.trim()) parts.push(raw.generalNotes.trim());
    } catch {
      /* ignore */
    }
  }
  return parts.join(' · ');
}

function treatmentText(ev: ClinicalEvolution): string {
  const procs = ev.billing?.items?.length
    ? ev.billing.items.map((i) => {
        const tooth = i.toothNumber != null ? ` (pieza ${i.toothNumber})` : '';
        return `${i.name}${tooth}`;
      })
    : (ev.procedures ?? []).map((p) => {
        const tooth =
          p.toothNumber != null ? ` (pieza ${p.toothNumber})` : '';
        return `${p.name ?? 'Procedimiento'}${tooth}`;
      });
  if (procs.length) return procs.join('; ');
  if (ev.treatmentName) {
    const tooth =
      ev.toothNumber != null ? ` (pieza ${ev.toothNumber})` : '';
    return `${ev.treatmentName}${tooth}`;
  }
  const notes = stripHtml(ev.clinicalNotes ?? '');
  if (notes && !/^atención del d[ií]a\.?$/i.test(notes)) {
    return notes.slice(0, 180);
  }
  return 'Atención clínica';
}

export type MedicalHistoryPatient = {
  fullName: string;
  documentId?: string;
  birthDate?: string | null;
  phone?: string | null;
  address?: string | null;
  anamnesisNotes?: string | null;
  medicalConditions?: string | null;
  allergyAnesthesia?: boolean;
  allergyPenicillin?: boolean;
  hasHypertension?: boolean;
  hasDiabetes?: boolean;
  coagulationIssues?: boolean;
  isPregnant?: boolean;
  consultReason?: string | null;
};

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

  const waitImages = () => {
    const imgs = Array.from(doc.images ?? []);
    if (!imgs.length) return Promise.resolve();
    return Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
      ),
    ).then(() => undefined);
  };

  void waitImages().then(() => {
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } finally {
        setTimeout(() => iframe.remove(), 1000);
      }
    }, 150);
  });
}

function logoMarkup(clinic: ClinicPrintContext, clinicName: string): string {
  const logo = authenticatedMediaUrl(clinic.logoUrl);
  if (logo) {
    return `<img src="${escapeHtml(logo)}" alt="" style="max-height:72px;max-width:78px;object-fit:contain"/>`;
  }
  return `<div style="width:72px;height:72px;border:1px solid #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-size:10px;font-weight:700;color:#1e3a5f;text-align:center;padding:4px;margin:0 auto;">${escapeHtml(clinicName.slice(0, 12))}</div>`;
}

function renderHeader(
  format: PrintFormat | null | undefined,
  clinic: ClinicPrintContext,
  clinicName: string,
): string {
  const header = format?.header;
  const showLogo = header?.showLogo !== false;
  const clinicLogoUrl = authenticatedMediaUrl(clinic.logoUrl);

  if (header?.bodyHtml?.trim()) {
    let html = hydratePrintHtmlMedia(header.bodyHtml);
    const hasEmbeddedImg = /<img\b/i.test(html);

    if (html.includes('{{LOGO}}')) {
      // Solo el logo de la clínica; si no hay, quitar el marcador (no caja de texto)
      const logoHtml = clinicLogoUrl
        ? `<img src="${escapeHtml(clinicLogoUrl)}" alt="" style="max-height:72px;max-width:78px;object-fit:contain"/>`
        : '';
      html = html.replace(/\{\{LOGO\}\}/g, logoHtml);
    }

    // Si el diseño ya trae imagen (subida en el editor), no anteponer otro logo
    if (!hasEmbeddedImg && showLogo && clinicLogoUrl && !/<img\b/i.test(html)) {
      html = `<div style="display:flex;align-items:center;gap:12px;">
        <img src="${escapeHtml(clinicLogoUrl)}" alt="" style="max-height:72px;max-width:78px;object-fit:contain"/>
        <div style="flex:1">${html}</div>
      </div>`;
    }

    return `<header class="mh-hdr rich">${html}</header>`;
  }

  const title =
    header?.title?.trim() || 'HISTORIA MÉDICO ODONTOLÓGICA';
  const subtitle = header?.subtitle?.trim() || clinicName;
  const logo = showLogo ? logoMarkup(clinic, clinicName) : '';

  return `<header class="hdr">
    ${showLogo ? logo : '<div style="width:78px;flex-shrink:0"></div>'}
    <h1 class="hdr-title">
      ${escapeHtml(title)}
      ${subtitle ? `<span class="hdr-clinic">${escapeHtml(subtitle)}</span>` : ''}
    </h1>
    <div style="width:78px;flex-shrink:0"></div>
  </header>`;
}

function renderFooter(
  format: PrintFormat | null | undefined,
  clinicName: string,
): string {
  const footer = format?.footer;
  if (!footer) {
    return `<p class="foot-note">Documento generado por NexusDent · ${escapeHtml(clinicName)}</p>`;
  }
  const body = footer.bodyHtml?.trim()
    ? hydratePrintHtmlMedia(footer.bodyHtml)
    : footer.bodyText
      ? `<p>${escapeHtml(footer.bodyText).replace(/\n/g, '<br/>')}</p>`
      : '';
  const stamp = footer.showStamp
    ? `<p class="foot-note">Impreso ${escapeHtml(new Date().toLocaleString('es-VE'))}</p>`
    : '';
  return `<div class="clinic-footer">${body}${stamp}</div>`;
}

/**
 * Reporte estilo ficha Ortodent:
 * cabecera (desde Impresión) + datos paciente + odontograma + tabla tratamientos.
 */
export function printMedicalHistory(opts: {
  patient: MedicalHistoryPatient;
  evolutions: ClinicalEvolution[];
  odontogramStates?: OdontogramStateItem[];
  clinic?: ClinicPrintContext;
  format?: PrintFormat | null;
  consultReason?: string | null;
  familyHistory?: string | null;
}) {
  const clinic = opts.clinic ?? {};
  const patient = opts.patient;
  const format = opts.format;
  const states = opts.odontogramStates ?? [];
  const logoUrl = authenticatedMediaUrl(clinic.logoUrl);
  const age = ageFromBirth(patient.birthDate);
  const antPers = antecedentesPersonales(patient);
  const antFam = (opts.familyHistory ?? '').trim();
  const motivo =
    (opts.consultReason ?? patient.consultReason ?? '').trim() ||
    (() => {
      const first = opts.evolutions[0];
      return first?.sessionAppointment?.reason?.trim() || '';
    })();

  const clinicName = clinic.name?.trim() || 'Clínica';
  const showPrices = format?.showPrices !== false;

  const sorted = [...opts.evolutions].sort(
    (a, b) => new Date(a.signedAt).getTime() - new Date(b.signedAt).getTime(),
  );

  let runningSaldo = 0;
  const rowsHtml = sorted
    .map((ev) => {
      const costo = ev.billing?.totalAmount ?? null;
      const abono = ev.billing?.paidAmount ?? null;
      if (costo != null) runningSaldo += costo;
      if (abono != null) runningSaldo -= abono;
      const saldoCell =
        showPrices && (costo != null || abono != null)
          ? escapeHtml(formatPrintMoney(Math.max(0, runningSaldo)))
          : '';
      return `<tr>
        <td class="c-fecha">${escapeHtml(dateLabel(ev.signedAt))}</td>
        <td class="c-tx">${escapeHtml(treatmentText(ev))}</td>
        <td class="c-num">${showPrices && costo != null ? escapeHtml(formatPrintMoney(costo)) : ''}</td>
        <td class="c-num">${showPrices && abono != null && abono > 0 ? escapeHtml(formatPrintMoney(abono)) : ''}</td>
        <td class="c-num">${saldoCell}</td>
        <td class="c-firma"></td>
      </tr>`;
    })
    .join('');

  const emptyRows = Array.from({ length: Math.max(0, 12 - sorted.length) })
    .map(
      () =>
        `<tr><td class="c-fecha">&nbsp;</td><td></td><td></td><td></td><td></td><td class="c-firma"></td></tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Historia — ${escapeHtml(patient.fullName)}</title>
<style>
  @page { size: letter portrait; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  html, body {
    width: 100%;
    max-width: 100%;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
  }
  body {
    color: #111;
    font-family: Georgia, 'Times New Roman', Times, serif;
    font-size: 11px;
    line-height: 1.35;
  }
  .sheet {
    position: relative;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }
  .wm {
    position: absolute;
    inset: 28% 10% 18% 10%;
    background: ${logoUrl ? `url('${escapeHtml(logoUrl)}') center/contain no-repeat` : 'none'};
    opacity: 0.06;
    pointer-events: none;
    z-index: 0;
  }
  .content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 100%;
  }
  .hdr, .mh-hdr {
    margin-bottom: 10px;
    max-width: 100%;
    overflow: hidden;
  }
  .hdr {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 2.5px solid #1e3a5f;
    padding-bottom: 8px;
  }
  .mh-hdr.rich img { max-height: 64px; max-width: 72px; object-fit: contain; display: inline-block; }
  .mh-hdr.rich p { margin: 0; }
  .mh-hdr.rich table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; }
  .mh-hdr.rich td, .mh-hdr.rich th { vertical-align: middle; padding: 2px 4px; border: none; }
  .mh-hdr.rich td[data-valign='middle'], .mh-hdr.rich th[data-valign='middle'] { vertical-align: middle; }
  .mh-hdr.rich td[data-valign='bottom'], .mh-hdr.rich th[data-valign='bottom'] { vertical-align: bottom; }
  .mh-hdr.rich td[data-valign='top'], .mh-hdr.rich th[data-valign='top'] { vertical-align: top; }
  .hdr img, .hdr > div:first-child {
    width: 72px;
    height: 72px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .hdr-title {
    flex: 1;
    text-align: center;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    margin: 0;
  }
  .hdr-clinic {
    display: block;
    margin-top: 4px;
    font-family: system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    color: #334155;
  }
  .field-row {
    display: flex;
    gap: 12px;
    margin: 6px 0;
    align-items: flex-end;
    max-width: 100%;
  }
  .field {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .field.sm { flex: 0 0 90px; }
  .field.md { flex: 0 0 140px; }
  .lbl { white-space: nowrap; }
  .line {
    flex: 1;
    border-bottom: 1px solid #334155;
    min-height: 16px;
    padding: 0 2px 1px;
    font-family: system-ui, sans-serif;
    font-size: 11px;
    min-width: 0;
    overflow: hidden;
  }
  .sec-title {
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    margin: 12px 0 6px;
    text-transform: uppercase;
  }
  .odo-wrap { margin: 4px 0 10px; max-width: 100%; overflow: hidden; }
  .odo-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .odo-cell { padding: 0; text-align: center; vertical-align: bottom; overflow: hidden; }
  .odo-svg { width: 100%; max-width: 18px; height: auto; display: inline-block; }
  .odo-label {
    text-align: center;
    font-family: system-ui, sans-serif;
    font-size: 8px;
    color: #64748b;
    margin: 2px 0;
  }
  table.ledger {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 4px;
    font-family: system-ui, sans-serif;
    font-size: 8.5px;
  }
  table.ledger th, table.ledger td {
    border: 1px solid #1e293b;
    padding: 3px 2px;
    vertical-align: top;
    overflow: hidden;
    word-break: break-word;
  }
  table.ledger th {
    background: #f8fafc;
    font-size: 7.5px;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
  col.c-fecha { width: 13%; }
  col.c-tx { width: 39%; }
  col.c-num { width: 11%; }
  col.c-firma { width: 15%; }
  .c-fecha { white-space: nowrap; }
  .c-num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .c-firma { height: 20px; }
  .clinic-footer {
    margin-top: 8px;
    font-family: system-ui, sans-serif;
    font-size: 9px;
    color: #64748b;
  }
  .foot-note {
    margin-top: 6px;
    font-family: system-ui, sans-serif;
    font-size: 8px;
    color: #94a3b8;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet, .content, table.ledger { max-width: 100% !important; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="wm"></div>
  <div class="content">
    ${renderHeader(format, clinic, clinicName)}

    <div class="field-row">
      <div class="field">
        <span class="lbl">Nombre:</span>
        <span class="line">${escapeHtml(patient.fullName)}</span>
      </div>
      <div class="field sm">
        <span class="lbl">Edad:</span>
        <span class="line">${escapeHtml(age)}</span>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <span class="lbl">Dirección:</span>
        <span class="line">${escapeHtml(patient.address ?? '')}</span>
      </div>
      <div class="field md">
        <span class="lbl">Teléfono:</span>
        <span class="line">${escapeHtml(patient.phone ?? '')}</span>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <span class="lbl">Antecedentes Personales:</span>
        <span class="line">${escapeHtml(antPers)}</span>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <span class="lbl">Antecedentes Familiares:</span>
        <span class="line">${escapeHtml(antFam)}</span>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <span class="lbl">Motivo de consulta:</span>
        <span class="line">${escapeHtml(motivo)}</span>
      </div>
    </div>

    <div class="sec-title">Odontograma</div>
    <div class="odo-wrap">
      <div class="odo-label">Superior permanente</div>
      <table class="odo-table">${odoRow(UPPER_TEETH, states)}</table>
      <div class="odo-label">Superior temporal</div>
      <table class="odo-table">${odoRow(UPPER_PRIMARY, states)}</table>
      <div class="odo-label">Inferior temporal</div>
      <table class="odo-table">${odoRow(LOWER_PRIMARY, states)}</table>
      <div class="odo-label">Inferior permanente</div>
      <table class="odo-table">${odoRow(LOWER_TEETH, states)}</table>
    </div>

    <table class="ledger">
      <colgroup>
        <col class="c-fecha" />
        <col class="c-tx" />
        <col class="c-num" />
        <col class="c-num" />
        <col class="c-num" />
        <col class="c-firma" />
      </colgroup>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tratamiento</th>
          <th>Costo</th>
          <th>Abono</th>
          <th>Saldo</th>
          <th>Firma</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}${emptyRows}
      </tbody>
    </table>
    ${renderFooter(format, clinicName)}
  </div>
</div>
</body>
</html>`;

  printViaIframe(html);
}
