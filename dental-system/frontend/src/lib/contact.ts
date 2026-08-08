/** Enlaces de contacto (WhatsApp / email) para Venezuela. */

/** Normaliza a dígitos con código país 58 (VE) cuando aplica. */
export function toWhatsAppDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('58') && digits.length >= 11) return digits;
  // 0412… / 0424… → 58412…
  if (digits.startsWith('0') && digits.length === 11) {
    return `58${digits.slice(1)}`;
  }
  // 412… sin 0
  if (digits.length === 10 && digits.startsWith('4')) {
    return `58${digits}`;
  }
  return digits;
}

/**
 * Máscara amigable al tipar:
 * 0412-1234567  (móvil VE)
 * o +58 412-1234567 si empieza con 58
 */
export function formatWhatsAppPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // Si pegan +58…
  if (digits.startsWith('58')) {
    digits = digits.slice(0, 12); // 58 + 10
    const local = digits.slice(2);
    if (!local) return '+58';
    if (local.length <= 3) return `+58 ${local}`;
    if (local.length <= 10) {
      return `+58 ${local.slice(0, 3)}-${local.slice(3)}`;
    }
    return `+58 ${local.slice(0, 3)}-${local.slice(3, 10)}`;
  }

  // Local con 0: 0412…
  digits = digits.slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/** Valor a guardar (compacto, digitos útiles). */
export function normalizePhoneForStorage(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  // Preferir formato local 0XXXXXXXXXX si es VE
  if (digits.startsWith('58') && digits.length >= 12) {
    return `0${digits.slice(2, 12)}`;
  }
  if (digits.startsWith('0')) return digits.slice(0, 11);
  if (digits.length === 10 && digits.startsWith('4')) return `0${digits}`;
  return digits;
}

export function whatsappHref(
  phone: string,
  message?: string,
): string | null {
  const digits = toWhatsAppDigits(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  const text = message?.trim();
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Mensaje corto para contactar al paciente desde la clínica */
export function patientWhatsAppMessage(
  patientName: string,
  clinicName?: string | null,
): string {
  const who = clinicName?.trim() || 'la clínica';
  return `Hola ${patientName.trim()}, te escribimos de ${who}.`;
}

/** Recordatorio / confirmación de cita vía WhatsApp */
export function appointmentWhatsAppMessage(opts: {
  patientName: string;
  clinicName?: string | null;
  dateLabel: string;
  timeLabel?: string | null;
}): string {
  const who = opts.clinicName?.trim() || 'la clínica';
  const when = opts.timeLabel
    ? `${opts.dateLabel} a las ${opts.timeLabel}`
    : opts.dateLabel;
  return `Hola ${opts.patientName.trim()}, te recordamos tu cita en ${who} el ${when}. ¿Confirmás tu asistencia?`;
}

export function mailtoHref(email: string): string | null {
  const e = email.trim();
  if (!e || !e.includes('@')) return null;
  return `mailto:${e}`;
}
