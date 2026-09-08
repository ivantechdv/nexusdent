import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { dbPool } from '../../config';
import { httpError } from '../../utils/http';
import {
  PrintBundleDto,
  PrintDocType,
  PrintFooterDto,
  PrintFormatDto,
  PrintHeaderDto,
  UpsertPrintFooterDto,
  UpsertPrintFormatDto,
  UpsertPrintHeaderDto,
} from './print-templates.types';
import {
  MEDICAL_HISTORY_FORMAT_NAME,
  MEDICAL_HISTORY_HEADER_HTML,
  MEDICAL_HISTORY_HEADER_NAME,
} from './medical-history-defaults';

type HeaderRow = RowDataPacket & {
  id: string;
  name: string;
  title: string | null;
  subtitle: string | null;
  show_logo: number;
  show_contact: number;
  extra_text: string | null;
  body_html: string | null;
  is_default: number;
  is_active: number;
};

type FooterRow = RowDataPacket & {
  id: string;
  name: string;
  body_text: string | null;
  body_html: string | null;
  show_stamp: number;
  is_default: number;
  is_active: number;
};

type FormatRow = RowDataPacket & {
  id: string;
  name: string;
  description: string | null;
  doc_type: PrintDocType;
  header_id: string | null;
  footer_id: string | null;
  show_prices: number;
  show_clinical_notes: number;
  show_signatures: number;
  signature_left_label: string | null;
  signature_right_label: string | null;
  is_default: number;
  is_active: number;
  sort_order: number;
};

function mapHeader(row: HeaderRow): PrintHeaderDto {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    subtitle: row.subtitle,
    showLogo: Boolean(row.show_logo),
    showContact: Boolean(row.show_contact),
    extraText: row.extra_text,
    bodyHtml: row.body_html,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
  };
}

function mapFooter(row: FooterRow): PrintFooterDto {
  return {
    id: row.id,
    name: row.name,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    showStamp: Boolean(row.show_stamp),
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
  };
}

function mapFormat(row: FormatRow): PrintFormatDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    docType: row.doc_type,
    headerId: row.header_id,
    footerId: row.footer_id,
    showPrices: Boolean(row.show_prices),
    showClinicalNotes: Boolean(row.show_clinical_notes),
    showSignatures: Boolean(row.show_signatures),
    signatureLeftLabel: row.signature_left_label,
    signatureRightLabel: row.signature_right_label,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
  };
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

export class PrintTemplatesService {
  async listBundle(clinicId: string): Promise<PrintBundleDto> {
    await this.ensureDefaults(clinicId);
    await this.ensureMedicalHistoryTemplate(clinicId);
    await this.dedupePrintTemplates(clinicId);
    const [headers, footers, formats] = await Promise.all([
      this.listHeaders(clinicId, true),
      this.listFooters(clinicId, true),
      this.listFormats(clinicId, true),
    ]);
    const headerMap = new Map(headers.map((h) => [h.id, h]));
    const footerMap = new Map(footers.map((f) => [f.id, f]));
    return {
      headers,
      footers,
      formats: formats.map((f) => ({
        ...f,
        header: f.headerId ? headerMap.get(f.headerId) ?? null : null,
        footer: f.footerId ? footerMap.get(f.footerId) ?? null : null,
      })),
    };
  }

  async listFormatsForPrint(
    clinicId: string,
    docType: PrintDocType = 'ATTENTION_LOG',
  ): Promise<PrintFormatDto[]> {
    await this.ensureDefaults(clinicId);
    if (docType === 'MEDICAL_HISTORY') {
      await this.ensureMedicalHistoryTemplate(clinicId);
    }
    const formats = (await this.listFormats(clinicId, false)).filter(
      (f) => f.docType === docType,
    );
    const [headers, footers] = await Promise.all([
      this.listHeaders(clinicId, false),
      this.listFooters(clinicId, false),
    ]);
    const headerMap = new Map(headers.map((h) => [h.id, h]));
    const footerMap = new Map(footers.map((f) => [f.id, f]));
    return formats.map((f) => ({
      ...f,
      header: f.headerId ? headerMap.get(f.headerId) ?? null : null,
      footer: f.footerId ? footerMap.get(f.footerId) ?? null : null,
    }));
  }

  async listHeaders(clinicId: string, all = false): Promise<PrintHeaderDto[]> {
    const [rows] = await dbPool.query<HeaderRow[]>(
      `SELECT * FROM print_headers
       WHERE clinic_id = :clinicId
         ${all ? '' : 'AND is_active = 1'}
       ORDER BY is_default DESC, name ASC`,
      { clinicId },
    );
    return rows.map(mapHeader);
  }

  async listFooters(clinicId: string, all = false): Promise<PrintFooterDto[]> {
    const [rows] = await dbPool.query<FooterRow[]>(
      `SELECT * FROM print_footers
       WHERE clinic_id = :clinicId
         ${all ? '' : 'AND is_active = 1'}
       ORDER BY is_default DESC, name ASC`,
      { clinicId },
    );
    return rows.map(mapFooter);
  }

  async listFormats(clinicId: string, all = false): Promise<PrintFormatDto[]> {
    const [rows] = await dbPool.query<FormatRow[]>(
      `SELECT * FROM print_formats
       WHERE clinic_id = :clinicId
         ${all ? '' : 'AND is_active = 1'}
       ORDER BY sort_order ASC, is_default DESC, name ASC`,
      { clinicId },
    );
    return rows.map(mapFormat);
  }

  async createHeader(
    clinicId: string,
    dto: UpsertPrintHeaderDto,
  ): Promise<PrintHeaderDto> {
    const name = dto.name?.trim();
    if (!name) throw httpError('El nombre es obligatorio', 400);
    const id = uuidv4();
    if (dto.isDefault) await this.clearDefaultHeader(clinicId);
    await dbPool.query(
      `INSERT INTO print_headers
         (id, clinic_id, name, title, subtitle, show_logo, show_contact, extra_text, body_html, is_default, is_active)
       VALUES
         (:id, :clinicId, :name, :title, :subtitle, :showLogo, :showContact, :extraText, :bodyHtml, :isDefault, :isActive)`,
      {
        id,
        clinicId,
        name,
        title: emptyToNull(dto.title),
        subtitle: emptyToNull(dto.subtitle),
        showLogo: dto.showLogo === false ? 0 : 1,
        showContact: dto.showContact === false ? 0 : 1,
        extraText: emptyToNull(dto.extraText),
        bodyHtml: emptyToNull(dto.bodyHtml),
        isDefault: dto.isDefault ? 1 : 0,
        isActive: dto.isActive === false ? 0 : 1,
      },
    );
    return this.getHeader(clinicId, id);
  }

  async updateHeader(
    clinicId: string,
    id: string,
    dto: UpsertPrintHeaderDto,
  ): Promise<PrintHeaderDto> {
    await this.getHeader(clinicId, id);
    const name = dto.name?.trim();
    if (!name) throw httpError('El nombre es obligatorio', 400);
    if (dto.isDefault) await this.clearDefaultHeader(clinicId);
    await dbPool.query(
      `UPDATE print_headers SET
         name = :name,
         title = :title,
         subtitle = :subtitle,
         show_logo = :showLogo,
         show_contact = :showContact,
         extra_text = :extraText,
         body_html = :bodyHtml,
         is_default = :isDefault,
         is_active = :isActive
       WHERE id = :id AND clinic_id = :clinicId`,
      {
        id,
        clinicId,
        name,
        title: emptyToNull(dto.title),
        subtitle: emptyToNull(dto.subtitle),
        showLogo: dto.showLogo === false ? 0 : 1,
        showContact: dto.showContact === false ? 0 : 1,
        extraText: emptyToNull(dto.extraText),
        bodyHtml: emptyToNull(dto.bodyHtml),
        isDefault: dto.isDefault ? 1 : 0,
        isActive: dto.isActive === false ? 0 : 1,
      },
    );
    return this.getHeader(clinicId, id);
  }

  async deleteHeader(clinicId: string, id: string): Promise<void> {
    const h = await this.getHeader(clinicId, id);
    if (h.isDefault) throw httpError('No se puede eliminar el encabezado por defecto', 400);
    await dbPool.query(
      `DELETE FROM print_headers WHERE id = :id AND clinic_id = :clinicId`,
      { id, clinicId },
    );
  }

  async createFooter(
    clinicId: string,
    dto: UpsertPrintFooterDto,
  ): Promise<PrintFooterDto> {
    const name = dto.name?.trim();
    if (!name) throw httpError('El nombre es obligatorio', 400);
    const id = uuidv4();
    if (dto.isDefault) await this.clearDefaultFooter(clinicId);
    await dbPool.query(
      `INSERT INTO print_footers
         (id, clinic_id, name, body_text, body_html, show_stamp, is_default, is_active)
       VALUES
         (:id, :clinicId, :name, :bodyText, :bodyHtml, :showStamp, :isDefault, :isActive)`,
      {
        id,
        clinicId,
        name,
        bodyText: emptyToNull(dto.bodyText),
        bodyHtml: emptyToNull(dto.bodyHtml),
        showStamp: dto.showStamp === false ? 0 : 1,
        isDefault: dto.isDefault ? 1 : 0,
        isActive: dto.isActive === false ? 0 : 1,
      },
    );
    return this.getFooter(clinicId, id);
  }

  async updateFooter(
    clinicId: string,
    id: string,
    dto: UpsertPrintFooterDto,
  ): Promise<PrintFooterDto> {
    await this.getFooter(clinicId, id);
    const name = dto.name?.trim();
    if (!name) throw httpError('El nombre es obligatorio', 400);
    if (dto.isDefault) await this.clearDefaultFooter(clinicId);
    await dbPool.query(
      `UPDATE print_footers SET
         name = :name,
         body_text = :bodyText,
         body_html = :bodyHtml,
         show_stamp = :showStamp,
         is_default = :isDefault,
         is_active = :isActive
       WHERE id = :id AND clinic_id = :clinicId`,
      {
        id,
        clinicId,
        name,
        bodyText: emptyToNull(dto.bodyText),
        bodyHtml: emptyToNull(dto.bodyHtml),
        showStamp: dto.showStamp === false ? 0 : 1,
        isDefault: dto.isDefault ? 1 : 0,
        isActive: dto.isActive === false ? 0 : 1,
      },
    );
    return this.getFooter(clinicId, id);
  }

  async deleteFooter(clinicId: string, id: string): Promise<void> {
    const f = await this.getFooter(clinicId, id);
    if (f.isDefault) throw httpError('No se puede eliminar el pie por defecto', 400);
    await dbPool.query(
      `DELETE FROM print_footers WHERE id = :id AND clinic_id = :clinicId`,
      { id, clinicId },
    );
  }

  async createFormat(
    clinicId: string,
    dto: UpsertPrintFormatDto,
  ): Promise<PrintFormatDto> {
    const name = dto.name?.trim();
    if (!name) throw httpError('El nombre es obligatorio', 400);
    const id = uuidv4();
    if (dto.isDefault) await this.clearDefaultFormat(clinicId, dto.docType ?? 'ATTENTION_LOG');
    await this.assertHeaderFooter(clinicId, dto.headerId, dto.footerId);
    await dbPool.query(
      `INSERT INTO print_formats
         (id, clinic_id, name, description, doc_type, header_id, footer_id,
          show_prices, show_clinical_notes, show_signatures,
          signature_left_label, signature_right_label,
          is_default, is_active, sort_order)
       VALUES
         (:id, :clinicId, :name, :description, :docType, :headerId, :footerId,
          :showPrices, :showClinicalNotes, :showSignatures,
          :sigLeft, :sigRight,
          :isDefault, :isActive, :sortOrder)`,
      {
        id,
        clinicId,
        name,
        description: emptyToNull(dto.description),
        docType: dto.docType ?? 'ATTENTION_LOG',
        headerId: dto.headerId ?? null,
        footerId: dto.footerId ?? null,
        showPrices: dto.showPrices === false ? 0 : 1,
        showClinicalNotes: dto.showClinicalNotes === false ? 0 : 1,
        showSignatures: dto.showSignatures ? 1 : 0,
        sigLeft: emptyToNull(dto.signatureLeftLabel) ?? 'Odontólogo',
        sigRight: emptyToNull(dto.signatureRightLabel) ?? 'Paciente / Responsable',
        isDefault: dto.isDefault ? 1 : 0,
        isActive: dto.isActive === false ? 0 : 1,
        sortOrder: dto.sortOrder ?? 0,
      },
    );
    return this.getFormat(clinicId, id);
  }

  async updateFormat(
    clinicId: string,
    id: string,
    dto: UpsertPrintFormatDto,
  ): Promise<PrintFormatDto> {
    const current = await this.getFormat(clinicId, id);
    const name = dto.name?.trim();
    if (!name) throw httpError('El nombre es obligatorio', 400);
    const docType = dto.docType ?? current.docType;
    if (dto.isDefault) await this.clearDefaultFormat(clinicId, docType);
    await this.assertHeaderFooter(clinicId, dto.headerId, dto.footerId);
    await dbPool.query(
      `UPDATE print_formats SET
         name = :name,
         description = :description,
         doc_type = :docType,
         header_id = :headerId,
         footer_id = :footerId,
         show_prices = :showPrices,
         show_clinical_notes = :showClinicalNotes,
         show_signatures = :showSignatures,
         signature_left_label = :sigLeft,
         signature_right_label = :sigRight,
         is_default = :isDefault,
         is_active = :isActive,
         sort_order = :sortOrder
       WHERE id = :id AND clinic_id = :clinicId`,
      {
        id,
        clinicId,
        name,
        description: emptyToNull(dto.description),
        docType,
        headerId: dto.headerId === undefined ? current.headerId : dto.headerId,
        footerId: dto.footerId === undefined ? current.footerId : dto.footerId,
        showPrices: dto.showPrices === false ? 0 : 1,
        showClinicalNotes: dto.showClinicalNotes === false ? 0 : 1,
        showSignatures: dto.showSignatures ? 1 : 0,
        sigLeft: emptyToNull(dto.signatureLeftLabel) ?? 'Odontólogo',
        sigRight: emptyToNull(dto.signatureRightLabel) ?? 'Paciente / Responsable',
        isDefault: dto.isDefault ? 1 : 0,
        isActive: dto.isActive === false ? 0 : 1,
        sortOrder: dto.sortOrder ?? current.sortOrder,
      },
    );
    return this.getFormat(clinicId, id);
  }

  async deleteFormat(clinicId: string, id: string): Promise<void> {
    const f = await this.getFormat(clinicId, id);
    if (f.isDefault) throw httpError('No se puede eliminar el formato por defecto', 400);
    await dbPool.query(
      `DELETE FROM print_formats WHERE id = :id AND clinic_id = :clinicId`,
      { id, clinicId },
    );
  }

  private async getHeader(clinicId: string, id: string): Promise<PrintHeaderDto> {
    const [rows] = await dbPool.query<HeaderRow[]>(
      `SELECT * FROM print_headers WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('Encabezado no encontrado', 404);
    return mapHeader(rows[0]);
  }

  private async getFooter(clinicId: string, id: string): Promise<PrintFooterDto> {
    const [rows] = await dbPool.query<FooterRow[]>(
      `SELECT * FROM print_footers WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('Pie de página no encontrado', 404);
    return mapFooter(rows[0]);
  }

  private async getFormat(clinicId: string, id: string): Promise<PrintFormatDto> {
    const [rows] = await dbPool.query<FormatRow[]>(
      `SELECT * FROM print_formats WHERE id = :id AND clinic_id = :clinicId LIMIT 1`,
      { id, clinicId },
    );
    if (!rows[0]) throw httpError('Formato no encontrado', 404);
    return mapFormat(rows[0]);
  }

  private async clearDefaultHeader(clinicId: string) {
    await dbPool.query(
      `UPDATE print_headers SET is_default = 0 WHERE clinic_id = :clinicId`,
      { clinicId },
    );
  }

  private async clearDefaultFooter(clinicId: string) {
    await dbPool.query(
      `UPDATE print_footers SET is_default = 0 WHERE clinic_id = :clinicId`,
      { clinicId },
    );
  }

  private async clearDefaultFormat(clinicId: string, docType: PrintDocType) {
    await dbPool.query(
      `UPDATE print_formats SET is_default = 0
       WHERE clinic_id = :clinicId AND doc_type = :docType`,
      { clinicId, docType },
    );
  }

  private async assertHeaderFooter(
    clinicId: string,
    headerId?: string | null,
    footerId?: string | null,
  ) {
    if (headerId) await this.getHeader(clinicId, headerId);
    if (footerId) await this.getFooter(clinicId, footerId);
  }

  /**
   * Elimina encabezados/pies/formatos duplicados por nombre (misma clínica).
   * Conserva el más antiguo; remapea referencias de formatos.
   */
  async dedupePrintTemplates(clinicId: string): Promise<void> {
    const [headers] = await dbPool.query<RowDataPacket[]>(
      `SELECT id, name, body_html, is_default, created_at
       FROM print_headers
       WHERE clinic_id = :clinicId
       ORDER BY created_at ASC`,
      { clinicId },
    );
    const headerGroups = new Map<string, RowDataPacket[]>();
    for (const row of headers) {
      const key = String(row.name ?? '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      const list = headerGroups.get(key) ?? [];
      list.push(row);
      headerGroups.set(key, list);
    }
    for (const group of headerGroups.values()) {
      if (group.length < 2) continue;
      const keep =
        group.find((r) => Number(r.is_default) === 1) ??
        group.find((r) =>
          String(r.body_html ?? '').includes('{{LOGO}}'),
        ) ??
        group[0];
      for (const dup of group) {
        if (dup.id === keep.id) continue;
        await dbPool.query(
          `UPDATE print_formats
           SET header_id = :keepId
           WHERE clinic_id = :clinicId AND header_id = :dupId`,
          { clinicId, keepId: keep.id, dupId: dup.id },
        );
        await dbPool.query(
          `DELETE FROM print_headers WHERE id = :id AND clinic_id = :clinicId`,
          { id: dup.id, clinicId },
        );
      }
    }

    const [footers] = await dbPool.query<RowDataPacket[]>(
      `SELECT id, name, is_default, created_at
       FROM print_footers
       WHERE clinic_id = :clinicId
       ORDER BY created_at ASC`,
      { clinicId },
    );
    const footerGroups = new Map<string, RowDataPacket[]>();
    for (const row of footers) {
      const key = String(row.name ?? '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      const list = footerGroups.get(key) ?? [];
      list.push(row);
      footerGroups.set(key, list);
    }
    for (const group of footerGroups.values()) {
      if (group.length < 2) continue;
      const keep = group.find((r) => Number(r.is_default) === 1) ?? group[0];
      for (const dup of group) {
        if (dup.id === keep.id) continue;
        await dbPool.query(
          `UPDATE print_formats
           SET footer_id = :keepId
           WHERE clinic_id = :clinicId AND footer_id = :dupId`,
          { clinicId, keepId: keep.id, dupId: dup.id },
        );
        await dbPool.query(
          `DELETE FROM print_footers WHERE id = :id AND clinic_id = :clinicId`,
          { id: dup.id, clinicId },
        );
      }
    }

    const [formats] = await dbPool.query<RowDataPacket[]>(
      `SELECT id, name, doc_type, is_default, created_at
       FROM print_formats
       WHERE clinic_id = :clinicId
       ORDER BY created_at ASC`,
      { clinicId },
    );
    const formatGroups = new Map<string, RowDataPacket[]>();
    for (const row of formats) {
      const key = `${String(row.doc_type ?? '')}|${String(row.name ?? '')
        .trim()
        .toLowerCase()}`;
      const list = formatGroups.get(key) ?? [];
      list.push(row);
      formatGroups.set(key, list);
    }
    for (const group of formatGroups.values()) {
      if (group.length < 2) continue;
      const keep = group.find((r) => Number(r.is_default) === 1) ?? group[0];
      for (const dup of group) {
        if (dup.id === keep.id) continue;
        await dbPool.query(
          `DELETE FROM print_formats WHERE id = :id AND clinic_id = :clinicId`,
          { id: dup.id, clinicId },
        );
      }
    }

    // Un solo predeterminado por tipo (si quedaron varios)
    await dbPool.query(
      `UPDATE print_headers
       SET is_default = 0
       WHERE clinic_id = :clinicId
         AND is_default = 1
         AND id NOT IN (
           SELECT keep_id FROM (
             SELECT MIN(id) AS keep_id
             FROM print_headers
             WHERE clinic_id = :clinicId AND is_default = 1
           ) t
         )`,
      { clinicId },
    );
    await dbPool.query(
      `UPDATE print_footers
       SET is_default = 0
       WHERE clinic_id = :clinicId
         AND is_default = 1
         AND id NOT IN (
           SELECT keep_id FROM (
             SELECT MIN(id) AS keep_id
             FROM print_footers
             WHERE clinic_id = :clinicId AND is_default = 1
           ) t
         )`,
      { clinicId },
    );
  }

  /** Crea plantillas iniciales si la clínica aún no tiene. */
  async ensureDefaults(clinicId: string): Promise<void> {
    const [countRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM print_formats WHERE clinic_id = :clinicId) AS formats,
         (SELECT COUNT(*) FROM print_headers WHERE clinic_id = :clinicId) AS headers`,
      { clinicId },
    );
    const formats = Number(countRows[0]?.formats ?? 0);
    const headers = Number(countRows[0]?.headers ?? 0);
    if (formats > 0 || headers > 0) {
      await this.ensureMedicalHistoryTemplate(clinicId);
      return;
    }

    const headerId = uuidv4();
    const footerId = uuidv4();
    const formatFullId = uuidv4();
    const formatClinicalId = uuidv4();
    const formatSignId = uuidv4();

    await dbPool.query(
      `INSERT INTO print_headers
         (id, clinic_id, name, title, subtitle, show_logo, show_contact, extra_text, body_html, is_default, is_active)
       VALUES
         (:id, :clinicId, 'Encabezado oficial', NULL, NULL, 1, 1, NULL,
          '<h2>Encabezado de la clínica</h2><p>Editá este bloque: logo, datos, tabla…</p>',
          1, 1)`,
      { id: headerId, clinicId },
    );

    await dbPool.query(
      `INSERT INTO print_footers
         (id, clinic_id, name, body_text, body_html, show_stamp, is_default, is_active)
       VALUES
         (:id, :clinicId,
          'Pie estándar',
          NULL,
          '<p>Documento generado por NexusDent. Sin valor fiscal.</p>',
          1, 1, 1)`,
      { id: footerId, clinicId },
    );

    await dbPool.query(
      `INSERT INTO print_formats
         (id, clinic_id, name, description, doc_type, header_id, footer_id,
          show_prices, show_clinical_notes, show_signatures,
          signature_left_label, signature_right_label,
          is_default, is_active, sort_order)
       VALUES
         (:fullId, :clinicId, 'Bitácora completa',
          'Procedimientos, precios, notas y pie de página',
          'ATTENTION_LOG', :headerId, :footerId, 1, 1, 0,
          'Odontólogo', 'Paciente / Responsable', 1, 1, 0),
         (:clinId, :clinicId, 'Solo clínico',
          'Sin precios · ideal para historia clínica',
          'ATTENTION_LOG', :headerId, :footerId, 0, 1, 0,
          'Odontólogo', 'Paciente / Responsable', 0, 1, 1),
         (:signId, :clinicId, 'Con firmas',
          'Incluye espacios para firma del odontólogo y del paciente',
          'ATTENTION_LOG', :headerId, :footerId, 1, 1, 1,
          'Odontólogo', 'Paciente / Responsable', 0, 1, 2)`,
      {
        clinicId,
        headerId,
        footerId,
        fullId: formatFullId,
        clinId: formatClinicalId,
        signId: formatSignId,
      },
    );

    await this.ensureMedicalHistoryTemplate(clinicId);
  }

  /**
   * Cabecera + formato "Historia médico-odontológica" (estilo ficha Ortodent).
   * Idempotente: no duplica si ya existe por nombre.
   */
  async ensureMedicalHistoryTemplate(clinicId: string): Promise<void> {
    const [hdrRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id FROM print_headers
       WHERE clinic_id = :clinicId
         AND LOWER(TRIM(name)) = LOWER(:name)
       ORDER BY created_at ASC
       LIMIT 1`,
      { clinicId, name: MEDICAL_HISTORY_HEADER_NAME },
    );

    let headerId = hdrRows[0]?.id as string | undefined;
    if (!headerId) {
      headerId = uuidv4();
      await dbPool.query(
        `INSERT INTO print_headers
           (id, clinic_id, name, title, subtitle, show_logo, show_contact,
            extra_text, body_html, is_default, is_active)
         VALUES
           (:id, :clinicId, :name, 'HISTORIA MÉDICO ODONTOLÓGICA', NULL,
            1, 0, NULL, :bodyHtml, 0, 1)`,
        {
          id: headerId,
          clinicId,
          name: MEDICAL_HISTORY_HEADER_NAME,
          bodyHtml: MEDICAL_HISTORY_HEADER_HTML,
        },
      );
    }
    // No sobrescribir body_html si el usuario ya personalizó el encabezado

    const [fmtRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id FROM print_formats
       WHERE clinic_id = :clinicId
         AND LOWER(TRIM(name)) = LOWER(:name)
       LIMIT 1`,
      { clinicId, name: MEDICAL_HISTORY_FORMAT_NAME },
    );
    if (fmtRows[0]) return;

    const [footerRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id FROM print_footers
       WHERE clinic_id = :clinicId AND is_active = 1
       ORDER BY is_default DESC, created_at ASC
       LIMIT 1`,
      { clinicId },
    );
    const footerId = (footerRows[0]?.id as string | undefined) ?? null;

    await dbPool.query(
      `INSERT INTO print_formats
         (id, clinic_id, name, description, doc_type, header_id, footer_id,
          show_prices, show_clinical_notes, show_signatures,
          signature_left_label, signature_right_label,
          is_default, is_active, sort_order)
       VALUES
         (:id, :clinicId, :name,
          'Ficha estilo historia: datos, odontograma y tabla de tratamientos',
          'MEDICAL_HISTORY', :headerId, :footerId, 1, 1, 1,
          'Odontólogo', 'Paciente / Responsable', 0, 1, 10)`,
      {
        id: uuidv4(),
        clinicId,
        name: MEDICAL_HISTORY_FORMAT_NAME,
        headerId,
        footerId,
      },
    );
  }
}

export const printTemplatesService = new PrintTemplatesService();
