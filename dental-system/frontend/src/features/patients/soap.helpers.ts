/** Helpers SOAP para evoluciones clínicas */

export type SoapFields = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export function emptySoap(): SoapFields {
  return { subjective: '', objective: '', assessment: '', plan: '' };
}

export function formatSoapNotes(soap: SoapFields): string {
  const blocks = [
    ['S - Subjetivo (Motivo de Consulta)', soap.subjective],
    ['O - Objetivo (Hallazgos Clínicos)', soap.objective],
    ['A - Análisis (Diagnóstico Clínico)', soap.assessment],
    ['P - Plan de Tratamiento', soap.plan],
  ] as const;

  return blocks
    .map(([label, text]) => `${label}:\n${text.trim() || '—'}`)
    .join('\n\n');
}

export function parseSoapNotes(raw?: string | null): SoapFields {
  const soap = emptySoap();
  if (!raw?.trim()) return soap;

  const plain = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ');

  const extract = (letter: string) => {
    const re = new RegExp(
      `${letter}\\s*[-–—]?\\s*[^:\\n]*:\\s*([\\s\\S]*?)(?=\\n\\s*[SOAP]\\s*[-–—]|\\n\\s*Procedimientos|\\n\\s*Piezas|\\n\\s*Adjuntos|$)`,
      'i',
    );
    const m = plain.match(re);
    return (m?.[1] ?? '').trim().replace(/^—$/, '');
  };

  soap.subjective = extract('S');
  soap.objective = extract('O');
  soap.assessment = extract('A');
  soap.plan = extract('P');

  // Fallback: si no hay estructura SOAP, todo va a subjetivo
  if (
    !soap.subjective &&
    !soap.objective &&
    !soap.assessment &&
    !soap.plan
  ) {
    const cut = plain.search(/\n\s*Procedimientos/i);
    soap.subjective = (cut >= 0 ? plain.slice(0, cut) : plain).trim();
  }

  return soap;
}

export function soapSummary(soap: SoapFields, max = 120): string {
  const parts = [
    soap.subjective && `S: ${soap.subjective}`,
    soap.objective && `O: ${soap.objective}`,
    soap.assessment && `A: ${soap.assessment}`,
    soap.plan && `P: ${soap.plan}`,
  ].filter(Boolean);
  const text = parts.join(' · ');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
