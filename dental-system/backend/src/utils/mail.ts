import { Resend } from 'resend';
import { getAppUrl, getMailFrom, getResendApiKey } from '../config/env';

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = getResendApiKey();
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export function isMailConfigured() {
  return Boolean(getResendApiKey());
}

function getLoginUrl(): string {
  return `${getAppUrl()}/login`;
}

function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#1e3a8a;padding:20px 24px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">NexusDent</p>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
          Este mensaje fue enviado automáticamente por NexusDent.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; logged: boolean }> {
  const resend = getClient();
  if (!resend) {
    console.info(
      `[mail:dev] RESEND_API_KEY ausente — To: ${opts.to}\nSubject: ${opts.subject}\n\n${opts.text}\n`,
    );
    return { sent: false, logged: true };
  }

  const { error } = await resend.emails.send({
    from: getMailFrom(),
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
    html:
      opts.html ??
      emailLayout(opts.subject, `<pre style="white-space:pre-wrap">${opts.text}</pre>`),
  });

  if (error) {
    console.error('[mail] Resend error:', error);
    throw new Error(error.message);
  }

  return { sent: true, logged: false };
}

export async function sendUserInviteEmail(opts: {
  to: string;
  fullName: string;
  clinicName: string;
  temporaryPassword: string;
  role: string;
}) {
  const loginUrl = getLoginUrl();
  const text = [
    `Hola ${opts.fullName},`,
    '',
    `Se creó tu cuenta en NexusDent para la clínica "${opts.clinicName}".`,
    `Rol: ${opts.role}`,
    '',
    `Email: ${opts.to}`,
    `Contraseña temporal: ${opts.temporaryPassword}`,
    '',
    `Entrá en: ${loginUrl}`,
    'Al iniciar sesión te pediremos cambiar la contraseña por seguridad.',
    '',
    '— NexusDent',
  ].join('\n');

  const html = emailLayout(
    'Tu acceso a NexusDent',
    `
      <p>Hola <strong>${opts.fullName}</strong>,</p>
      <p>Se creó tu cuenta para la clínica <strong>${opts.clinicName}</strong>
      (rol: ${opts.role}).</p>
      <p>
        <strong>Email:</strong> ${opts.to}<br/>
        <strong>Contraseña temporal:</strong>
        <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${opts.temporaryPassword}</code>
      </p>
      <p><a href="${loginUrl}" style="color:#1e3a8a">Iniciar sesión</a></p>
      <p style="color:#64748b;font-size:14px">
        Al entrar te pediremos cambiar la contraseña por seguridad.
      </p>
    `,
  );

  return sendMail({
    to: opts.to,
    subject: `Acceso NexusDent · ${opts.clinicName}`,
    text,
    html,
  });
}

export async function sendClinicAddedEmail(opts: {
  to: string;
  fullName: string;
  clinicName: string;
  role: string;
}) {
  const url = getLoginUrl();
  const text = [
    `Hola ${opts.fullName},`,
    '',
    `Te agregaron a la clínica "${opts.clinicName}" en NexusDent (rol: ${opts.role}).`,
    `Usá tu misma cuenta: ${opts.to}`,
    `Entrá en: ${url}`,
    'Si tenés más de una clínica, podrás elegir al iniciar sesión.',
    '',
    '— NexusDent',
  ].join('\n');

  const html = emailLayout(
    'Nueva clínica en NexusDent',
    `
      <p>Hola <strong>${opts.fullName}</strong>,</p>
      <p>Te agregaron a la clínica <strong>${opts.clinicName}</strong>
      (rol: ${opts.role}).</p>
      <p>Usá tu misma cuenta: <strong>${opts.to}</strong></p>
      <p><a href="${url}" style="color:#1e3a8a">Iniciar sesión</a></p>
    `,
  );

  return sendMail({
    to: opts.to,
    subject: `Nueva clínica en NexusDent · ${opts.clinicName}`,
    text,
    html,
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  fullName: string;
  resetUrl: string;
}) {
  const text = [
    `Hola ${opts.fullName},`,
    '',
    'Recibimos un pedido para restablecer tu contraseña de NexusDent.',
    `Abrí este enlace (válido 1 hora):`,
    opts.resetUrl,
    '',
    'Si no pediste esto, ignorá este correo.',
    '',
    '— NexusDent',
  ].join('\n');

  const html = emailLayout(
    'Restablecer contraseña',
    `
      <p>Hola <strong>${escapeHtml(opts.fullName)}</strong>,</p>
      <p>Recibimos un pedido para restablecer tu contraseña de NexusDent.</p>
      <p><a href="${opts.resetUrl}" style="color:#1e3a8a">Elegir nueva contraseña</a></p>
      <p style="color:#64748b;font-size:14px">El enlace vence en 1 hora. Si no pediste esto, ignorá el mensaje.</p>
    `,
  );

  return sendMail({
    to: opts.to,
    subject: 'Restablecer contraseña · NexusDent',
    text,
    html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendAppointmentReminderEmail(opts: {
  to: string;
  patientName: string;
  clinicName: string;
  dentistName: string;
  scheduledAtLabel: string;
  reason: string | null;
  confirmUrl: string;
  cancelUrl: string;
}) {
  const reasonLine = opts.reason?.trim()
    ? `Motivo: ${opts.reason.trim()}`
    : null;
  const text = [
    `Hola ${opts.patientName},`,
    '',
    `Te recordamos tu cita en ${opts.clinicName} en 2 días.`,
    '',
    `Fecha y hora: ${opts.scheduledAtLabel}`,
    `Odontólogo: ${opts.dentistName}`,
    reasonLine,
    '',
    `Confirmar asistencia: ${opts.confirmUrl}`,
    `Cancelar cita: ${opts.cancelUrl}`,
    '',
    '— NexusDent',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const html = emailLayout(
    'Confirmá tu cita',
    `
      <p>Hola <strong>${escapeHtml(opts.patientName)}</strong>,</p>
      <p>Te recordamos tu cita en <strong>${escapeHtml(opts.clinicName)}</strong>
      dentro de <strong>2 días</strong>.</p>
      <p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;line-height:1.6;">
        <strong>Fecha y hora:</strong> ${escapeHtml(opts.scheduledAtLabel)}<br/>
        <strong>Odontólogo:</strong> ${escapeHtml(opts.dentistName)}
        ${
          opts.reason?.trim()
            ? `<br/><strong>Motivo:</strong> ${escapeHtml(opts.reason.trim())}`
            : ''
        }
      </p>
      <p style="margin:24px 0 8px;">¿Confirmás tu asistencia?</p>
      <p>
        <a href="${opts.confirmUrl}"
           style="display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;margin-right:8px;">
          Confirmar cita
        </a>
        <a href="${opts.cancelUrl}"
           style="display:inline-block;background:#ffffff;color:#b91c1c;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;border:1px solid #fecaca;">
          Cancelar
        </a>
      </p>
    `,
  );

  return sendMail({
    to: opts.to,
    subject: `Confirmá tu cita · ${opts.clinicName} · ${opts.scheduledAtLabel}`,
    text,
    html,
  });
}

export type VisitSummaryProc = {
  name: string;
  code: string;
  quantity: number;
  toothNumber?: number | null;
};

export async function sendVisitSummaryEmail(opts: {
  to: string;
  patientName: string;
  clinicName: string;
  dentistName: string;
  attendedAtLabel: string;
  procedures: VisitSummaryProc[];
  prescription?: string | null;
  totalAmount?: number | null;
  nextAppointmentLabel?: string | null;
  nextDentistName?: string | null;
}) {
  const procLines = opts.procedures.map((p) => {
    const tooth = p.toothNumber != null ? ` · pieza ${p.toothNumber}` : '';
    return `• ${p.name} (${p.code}) ×${p.quantity}${tooth}`;
  });

  const text = [
    `Hola ${opts.patientName},`,
    '',
    `Resumen de tu atención en ${opts.clinicName}.`,
    '',
    `Fecha: ${opts.attendedAtLabel}`,
    `Odontólogo: ${opts.dentistName}`,
    '',
    'Procedimientos:',
    ...procLines,
    opts.totalAmount != null && opts.totalAmount > 0
      ? `\nTotal de la atención: USD ${opts.totalAmount.toFixed(2)}`
      : null,
    opts.prescription?.trim()
      ? `\nIndicaciones:\n${opts.prescription.trim()}`
      : null,
    opts.nextAppointmentLabel
      ? `\nPróxima cita: ${opts.nextAppointmentLabel}${
          opts.nextDentistName ? ` · ${opts.nextDentistName}` : ''
        }`
      : '\nNo se agendó una próxima cita desde esta atención.',
    '',
    'Si tenés dudas, contactá a la clínica.',
    '',
    '— NexusDent',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const procsHtml = opts.procedures
    .map((p) => {
      const tooth =
        p.toothNumber != null
          ? ` <span style="color:#64748b">· pieza ${p.toothNumber}</span>`
          : '';
      return `<li style="margin:0 0 6px;"><strong>${escapeHtml(p.name)}</strong>
        <span style="color:#64748b">(${escapeHtml(p.code)}) ×${p.quantity}</span>${tooth}</li>`;
    })
    .join('');

  const nextHtml = opts.nextAppointmentLabel
    ? `<p style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px 16px;">
        <strong>Próxima cita</strong><br/>
        ${escapeHtml(opts.nextAppointmentLabel)}
        ${
          opts.nextDentistName
            ? `<br/>Odontólogo: ${escapeHtml(opts.nextDentistName)}`
            : ''
        }
      </p>`
    : `<p style="color:#64748b;">No se agendó una próxima cita desde esta atención.</p>`;

  const html = emailLayout(
    'Resumen de tu atención',
    `
      <p>Hola <strong>${escapeHtml(opts.patientName)}</strong>,</p>
      <p>Este es el resumen de tu atención en
        <strong>${escapeHtml(opts.clinicName)}</strong>.</p>
      <p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;line-height:1.6;">
        <strong>Fecha:</strong> ${escapeHtml(opts.attendedAtLabel)}<br/>
        <strong>Odontólogo:</strong> ${escapeHtml(opts.dentistName)}
        ${
          opts.totalAmount != null && opts.totalAmount > 0
            ? `<br/><strong>Total:</strong> USD ${opts.totalAmount.toFixed(2)}`
            : ''
        }
      </p>
      <p style="margin:16px 0 8px;"><strong>Procedimientos</strong></p>
      <ul style="margin:0;padding-left:18px;">${procsHtml}</ul>
      ${
        opts.prescription?.trim()
          ? `<p style="margin:16px 0 8px;"><strong>Indicaciones</strong></p>
             <p style="white-space:pre-wrap;">${escapeHtml(opts.prescription.trim())}</p>`
          : ''
      }
      ${nextHtml}
    `,
  );

  return sendMail({
    to: opts.to,
    subject: `Atención · ${opts.clinicName} · ${opts.attendedAtLabel}`,
    text,
    html,
  });
}

export async function sendPaymentReceiptEmail(opts: {
  to: string;
  patientName: string;
  clinicName: string;
  amountUsd: number;
  amountVes?: number | null;
  exchangeRate?: number | null;
  methodsLabel: string;
  receiptNumbers: string[];
  paidAtLabel: string;
  balanceDue?: number | null;
}) {
  const receipts = opts.receiptNumbers.join(', ');
  const text = [
    `Hola ${opts.patientName},`,
    '',
    `Registramos un abono en ${opts.clinicName}.`,
    '',
    `Fecha: ${opts.paidAtLabel}`,
    `Monto: USD ${opts.amountUsd.toFixed(2)}`,
    opts.amountVes != null
      ? `Equivalente: Bs ${opts.amountVes.toFixed(2)}${
          opts.exchangeRate != null ? ` @ ${opts.exchangeRate}` : ''
        }`
      : null,
    `Método(s): ${opts.methodsLabel}`,
    `Recibo(s): ${receipts}`,
    opts.balanceDue != null
      ? `Saldo pendiente del plan: USD ${opts.balanceDue.toFixed(2)}`
      : null,
    '',
    '— NexusDent',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const html = emailLayout(
    'Comprobante de abono',
    `
      <p>Hola <strong>${escapeHtml(opts.patientName)}</strong>,</p>
      <p>Registramos un abono en <strong>${escapeHtml(opts.clinicName)}</strong>.</p>
      <p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;line-height:1.6;">
        <strong>Fecha:</strong> ${escapeHtml(opts.paidAtLabel)}<br/>
        <strong>Monto:</strong> USD ${opts.amountUsd.toFixed(2)}
        ${
          opts.amountVes != null
            ? `<br/><strong>Equivalente:</strong> Bs ${opts.amountVes.toFixed(2)}`
            : ''
        }
        <br/><strong>Método(s):</strong> ${escapeHtml(opts.methodsLabel)}
        <br/><strong>Recibo(s):</strong> ${escapeHtml(receipts)}
        ${
          opts.balanceDue != null
            ? `<br/><strong>Saldo pendiente:</strong> USD ${opts.balanceDue.toFixed(2)}`
            : ''
        }
      </p>
    `,
  );

  return sendMail({
    to: opts.to,
    subject: `Recibo de abono · ${opts.clinicName} · ${receipts}`,
    text,
    html,
  });
}
