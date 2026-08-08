/** WhatsApp de soporte (desarrollador). Formato internacional sin + ni espacios. */
export const SUPPORT_WHATSAPP =
  import.meta.env.VITE_SUPPORT_WHATSAPP?.toString().replace(/\D/g, '') ||
  '584121809294';

export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
  'Hola, necesito soporte con NexusDent.',
)}`;
