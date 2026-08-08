/** Contraseña temporal opcional: vacía OK; si hay valor, mín. 6. */
export function optionalTempPasswordError(password: string): string | null {
  const value = password.trim();
  if (!value) return null;
  if (value.length < 6) {
    return `Muy corta (${value.length}/6). Usá al menos 6 caracteres o dejá vacío para generar una.`;
  }
  return null;
}

export function optionalTempPasswordHint(password: string): string | null {
  const value = password.trim();
  if (!value) return 'Vacío: se generará una clave temporal automáticamente.';
  if (value.length < 6) return null;
  return 'Clave válida · se usará esta (deberá cambiarla al primer acceso).';
}
