/**
 * Cabecera tipográfica estilo ficha Ortodent (editable en Impresión).
 * El marcador {{LOGO}} se sustituye por el logo de la clínica al imprimir
 * (si existe). También podés subir el logo como imagen en el editor.
 */
export const MEDICAL_HISTORY_HEADER_HTML = `
<div style="display:flex;align-items:center;gap:14px;width:100%;border-bottom:2.5px solid #1e3a5f;padding:2px 0 10px;">
  <div style="flex:0 0 80px;text-align:center;">{{LOGO}}</div>
  <div style="flex:1;text-align:center;">
    <p style="margin:0;font-family:Georgia,'Times New Roman',Times,serif;font-size:19px;font-weight:700;letter-spacing:0.1em;color:#111;text-transform:uppercase;">
      Historia Médico Odontológica
    </p>
  </div>
  <div style="flex:0 0 80px;"></div>
</div>
`.trim();

export const MEDICAL_HISTORY_HEADER_NAME = 'Historia médico-odontológica';
export const MEDICAL_HISTORY_FORMAT_NAME = 'Historia clínica Ortodent';
