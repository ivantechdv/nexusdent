import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileStack,
  LayoutTemplate,
  PanelBottom,
  PanelTop,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import {
  isRichTextEmpty,
  RichTextEditor,
} from '@/components/RichTextEditor';
import { hydratePrintHtmlMedia, persistPrintHtmlMedia } from '@/lib/printHtml';
import { authenticatedMediaUrl } from '@/lib/clinicTheme';
import { uploadClinicLogoApi } from '@/services/clinic-settings.api';
import {
  createPrintFooterApi,
  createPrintFormatApi,
  createPrintHeaderApi,
  deletePrintFooterApi,
  deletePrintFormatApi,
  deletePrintHeaderApi,
  getPrintBundleApi,
  updatePrintFooterApi,
  updatePrintFormatApi,
  updatePrintHeaderApi,
  type PrintFooter,
  type PrintFormat,
  type PrintHeader,
} from '@/services/print-templates.api';
import { toast } from '@/stores/toast.store';

type Tab = 'formats' | 'headers' | 'footers';

const softLabel = 'text-sm font-medium text-clinic-ink';

export function PrintSettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('formats');
  const bundleQ = useQuery({
    queryKey: ['print-bundle'],
    queryFn: getPrintBundleApi,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['print-bundle'] });
    void qc.invalidateQueries({ queryKey: ['print-formats'] });
  };

  const headers = bundleQ.data?.headers ?? [];
  const footers = bundleQ.data?.footers ?? [];
  const formats = bundleQ.data?.formats ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-3 sm:p-6">
      <Link
        to="/more"
        className="inline-flex items-center gap-1 text-sm font-medium text-clinic-slate md:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Configuración
      </Link>

      <div>
        <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
          Impresión
        </h1>
        <p className="text-sm text-clinic-slate">
          Armá formatos, encabezados y pies. Incluye la cabecera de{' '}
          <strong>Historia médico-odontológica</strong> (estilo ficha Ortodent)
          y los formatos de bitácora.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            { id: 'formats', label: 'Formatos', icon: LayoutTemplate },
            { id: 'headers', label: 'Encabezados', icon: PanelTop },
            { id: 'footers', label: 'Pies', icon: PanelBottom },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
              tab === id
                ? 'bg-white text-clinic-ink shadow-sm'
                : 'text-clinic-slate hover:text-clinic-ink',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {bundleQ.isLoading ? (
        <p className="text-sm text-clinic-slate">Cargando plantillas…</p>
      ) : tab === 'formats' ? (
        <FormatsSection
          formats={formats}
          headers={headers}
          footers={footers}
          onChanged={invalidate}
        />
      ) : tab === 'headers' ? (
        <HeadersSection headers={headers} onChanged={invalidate} />
      ) : (
        <FootersSection footers={footers} onChanged={invalidate} />
      )}
    </div>
  );
}

function FormatsSection({
  formats,
  headers,
  footers,
  onChanged,
}: {
  formats: PrintFormat[];
  headers: PrintHeader[];
  footers: PrintFooter[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PrintFormat | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-clinic-slate">
          Lo que eligen los odontólogos al imprimir.
        </p>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo formato
        </Button>
      </div>

      <ul className="space-y-2">
        {formats.map((f) => (
          <li key={f.id} className="panel flex items-start gap-3 p-4">
            <FileStack className="mt-0.5 h-5 w-5 shrink-0 text-clinic-deep" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-clinic-ink">{f.name}</p>
                {f.docType === 'MEDICAL_HISTORY' && (
                  <Badge tone="success">Historia clínica</Badge>
                )}
                {f.isDefault && <Badge tone="info">Predeterminado</Badge>}
                {!f.isActive && <Badge tone="neutral">Inactivo</Badge>}
              </div>
              {f.description && (
                <p className="mt-0.5 text-xs text-clinic-slate">{f.description}</p>
              )}
              <p className="mt-2 text-xs text-clinic-slate">
                {[
                  f.showPrices ? 'Precios' : null,
                  f.showClinicalNotes ? 'Notas' : null,
                  f.showSignatures ? 'Firmas' : null,
                  f.header?.name ? `Enc: ${f.header.name}` : 'Sin encabezado',
                  f.footer?.name ? `Pie: ${f.footer.name}` : 'Sin pie',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-clinic-slate hover:bg-slate-100"
              onClick={() => {
                setEditing(f);
                setOpen(true);
              }}
              aria-label="Editar"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <FormatModal
        open={open}
        onClose={() => setOpen(false)}
        initial={editing}
        headers={headers}
        footers={footers}
        onChanged={onChanged}
      />
    </section>
  );
}

function FormatModal({
  open,
  onClose,
  initial,
  headers,
  footers,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  initial: PrintFormat | null;
  headers: PrintHeader[];
  footers: PrintFooter[];
  onChanged: () => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    name: '',
    description: '',
    headerId: '' as string,
    footerId: '' as string,
    showPrices: true,
    showClinicalNotes: true,
    showSignatures: false,
    signatureLeftLabel: 'Odontólogo',
    signatureRightLabel: 'Paciente / Responsable',
    isDefault: false,
    isActive: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      headerId: initial?.headerId ?? headers.find((h) => h.isDefault)?.id ?? '',
      footerId: initial?.footerId ?? footers.find((f) => f.isDefault)?.id ?? '',
      showPrices: initial?.showPrices ?? true,
      showClinicalNotes: initial?.showClinicalNotes ?? true,
      showSignatures: initial?.showSignatures ?? false,
      signatureLeftLabel: initial?.signatureLeftLabel ?? 'Odontólogo',
      signatureRightLabel:
        initial?.signatureRightLabel ?? 'Paciente / Responsable',
      isDefault: initial?.isDefault ?? false,
      isActive: initial?.isActive ?? true,
    });
  }, [open, initial, headers, footers]);

  const saveM = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        headerId: form.headerId || null,
        footerId: form.footerId || null,
        showPrices: form.showPrices,
        showClinicalNotes: form.showClinicalNotes,
        showSignatures: form.showSignatures,
        signatureLeftLabel: form.signatureLeftLabel,
        signatureRightLabel: form.signatureRightLabel,
        isDefault: form.isDefault,
        isActive: form.isActive,
        docType: (initial?.docType ?? 'ATTENTION_LOG') as
          | 'ATTENTION_LOG'
          | 'MEDICAL_HISTORY',
      };
      return isEdit && initial
        ? updatePrintFormatApi(initial.id, body)
        : createPrintFormatApi(body);
    },
    onSuccess: () => {
      toast(isEdit ? 'Formato actualizado' : 'Formato creado', 'success');
      onChanged();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo guardar';
      toast(msg, 'error');
    },
  });

  const deleteM = useMutation({
    mutationFn: () => deletePrintFormatApi(initial!.id),
    onSuccess: () => {
      toast('Formato eliminado', 'info');
      onChanged();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo eliminar';
      toast(msg, 'error');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('El nombre es obligatorio', 'error');
      return;
    }
    saveM.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar formato' : 'Nuevo formato'}
      size="lg"
    >
      <form className="space-y-3" onSubmit={onSubmit}>
        <Input
          id="fmt-name"
          label="Nombre"
          labelClassName={softLabel}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Input
          id="fmt-desc"
          label="Descripción corta"
          labelClassName={softLabel}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Qué incluye este formato"
        />

        <label className="block space-y-1.5">
          <span className={softLabel}>Encabezado</span>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            value={form.headerId}
            onChange={(e) => setForm({ ...form, headerId: e.target.value })}
          >
            <option value="">Sin encabezado</option>
            {headers
              .filter((h) => h.isActive || h.id === form.headerId)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className={softLabel}>Pie de página</span>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            value={form.footerId}
            onChange={(e) => setForm({ ...form, footerId: e.target.value })}
          >
            <option value="">Sin pie</option>
            {footers
              .filter((f) => f.isActive || f.id === form.footerId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>

        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <CheckRow
            label="Mostrar precios y totales"
            checked={form.showPrices}
            onChange={(v) => setForm({ ...form, showPrices: v })}
          />
          <CheckRow
            label="Incluir notas clínicas"
            checked={form.showClinicalNotes}
            onChange={(v) => setForm({ ...form, showClinicalNotes: v })}
          />
          <CheckRow
            label="Espacios para firmas"
            checked={form.showSignatures}
            onChange={(v) => setForm({ ...form, showSignatures: v })}
          />
          <CheckRow
            label="Usar como predeterminado"
            checked={form.isDefault}
            onChange={(v) => setForm({ ...form, isDefault: v })}
          />
          <CheckRow
            label="Activo"
            checked={form.isActive}
            onChange={(v) => setForm({ ...form, isActive: v })}
          />
        </div>

        {form.showSignatures && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="sig-l"
              label="Firma izquierda"
              labelClassName={softLabel}
              value={form.signatureLeftLabel}
              onChange={(e) =>
                setForm({ ...form, signatureLeftLabel: e.target.value })
              }
            />
            <Input
              id="sig-r"
              label="Firma derecha"
              labelClassName={softLabel}
              value={form.signatureRightLabel}
              onChange={(e) =>
                setForm({ ...form, signatureRightLabel: e.target.value })
              }
            />
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          {isEdit && !initial?.isDefault ? (
            <Button
              type="button"
              variant="secondary"
              className="text-red-600"
              disabled={deleteM.isPending}
              onClick={() => {
                if (confirm('¿Eliminar este formato?')) deleteM.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveM.isPending}>
              {saveM.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function HeadersSection({
  headers,
  onChanged,
}: {
  headers: PrintHeader[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PrintHeader | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-clinic-slate">
          Diseñá el tope de la hoja como en Word: texto, logo, tablas…
        </p>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo
        </Button>
      </div>
      <ul className="space-y-2">
        {headers.map((h) => (
          <li key={h.id} className="panel flex items-start gap-3 p-4">
            <PanelTop className="mt-0.5 h-5 w-5 shrink-0 text-clinic-deep" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-clinic-ink">{h.name}</p>
                {h.isDefault && <Badge tone="info">Predeterminado</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-clinic-slate">
                {h.bodyHtml
                  ? h.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ||
                    'Diseño enriquecido'
                  : [h.showLogo ? 'Logo' : null, h.title || 'Sin contenido']
                      .filter(Boolean)
                      .join(' · ')}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-clinic-slate hover:bg-slate-100"
              onClick={() => {
                setEditing(h);
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <HeaderModal
        open={open}
        onClose={() => setOpen(false)}
        initial={editing}
        onChanged={onChanged}
      />
    </section>
  );
}

function HeaderModal({
  open,
  onClose,
  initial,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  initial: PrintHeader | null;
  onChanged: () => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    name: '',
    bodyHtml: '',
    isDefault: false,
    isActive: true,
  });

  useEffect(() => {
    if (!open) return;
    const legacy =
      !initial?.bodyHtml &&
      (initial?.title || initial?.subtitle || initial?.extraText)
        ? `<h2>${initial?.title ?? 'Clínica'}</h2>${
            initial?.subtitle ? `<p>${initial.subtitle}</p>` : ''
          }${initial?.extraText ? `<p>${initial.extraText}</p>` : ''}`
        : '';
    setForm({
      name: initial?.name ?? '',
      bodyHtml: hydratePrintHtmlMedia(initial?.bodyHtml || legacy || ''),
      isDefault: initial?.isDefault ?? false,
      isActive: initial?.isActive ?? true,
    });
  }, [open, initial]);

  const saveM = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        bodyHtml: persistPrintHtmlMedia(form.bodyHtml),
        title: null,
        subtitle: null,
        extraText: null,
        showLogo: false,
        showContact: false,
        isDefault: form.isDefault,
        isActive: form.isActive,
      };
      return isEdit && initial
        ? updatePrintHeaderApi(initial.id, body)
        : createPrintHeaderApi(body);
    },
    onSuccess: () => {
      toast(isEdit ? 'Encabezado actualizado' : 'Encabezado creado', 'success');
      onChanged();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo guardar';
      toast(msg, 'error');
    },
  });

  const deleteM = useMutation({
    mutationFn: () => deletePrintHeaderApi(initial!.id),
    onSuccess: () => {
      toast('Encabezado eliminado', 'info');
      onChanged();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo eliminar';
      toast(msg, 'error');
    },
  });

  async function uploadImage(file: File) {
    try {
      const url = await uploadClinicLogoApi(file);
      if (!url) throw new Error('sin url');
      return authenticatedMediaUrl(url) ?? url;
    } catch {
      toast('No se pudo subir la imagen', 'error');
      throw new Error('upload failed');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar encabezado' : 'Nuevo encabezado'}
      size="lg"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim()) return toast('Nombre obligatorio', 'error');
          if (isRichTextEmpty(form.bodyHtml)) {
            return toast('Diseñá el contenido del encabezado', 'error');
          }
          saveM.mutate();
        }}
      >
        <Input
          id="hdr-name"
          label="Nombre interno"
          labelClassName={softLabel}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ej. Oficial con logo"
          required
        />
        <RichTextEditor
          id="hdr-body"
          mode="document"
          label="Diseño del encabezado"
          labelClassName={softLabel}
          minHeight="180px"
          placeholder="Escribí como en Word: título, datos, insertá logo o tabla…"
          value={form.bodyHtml}
          onChange={(html) => setForm({ ...form, bodyHtml: html })}
          onUploadImage={uploadImage}
        />
        <p className="text-xs text-clinic-slate">
          Tip: subí el logo con el ícono de imagen. Si ves el texto
          {' '}
          <code className="text-[11px]">{'{{LOGO}}'}</code>
          , borrálo — solo sirve si el logo está en Datos de la clínica.
          Tabla 2 columnas (logo | título) queda bien para Ortodent.
        </p>
        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <CheckRow
            label="Predeterminado"
            checked={form.isDefault}
            onChange={(v) => setForm({ ...form, isDefault: v })}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          {isEdit && !initial?.isDefault ? (
            <Button
              type="button"
              variant="secondary"
              className="text-red-600"
              onClick={() => {
                if (confirm('¿Eliminar encabezado?')) deleteM.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveM.isPending}>
              Guardar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function FootersSection({
  footers,
  onChanged,
}: {
  footers: PrintFooter[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PrintFooter | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-clinic-slate">
          Texto libre al final de la hoja (opcional), también enriquecido.
        </p>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo
        </Button>
      </div>
      <ul className="space-y-2">
        {footers.map((f) => (
          <li key={f.id} className="panel flex items-start gap-3 p-4">
            <PanelBottom className="mt-0.5 h-5 w-5 shrink-0 text-clinic-deep" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-clinic-ink">{f.name}</p>
                {f.isDefault && <Badge tone="info">Predeterminado</Badge>}
              </div>
              {f.bodyHtml || f.bodyText ? (
                <p className="mt-1 line-clamp-2 text-xs text-clinic-slate">
                  {(f.bodyHtml || f.bodyText || '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-clinic-slate hover:bg-slate-100"
              onClick={() => {
                setEditing(f);
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <FooterModal
        open={open}
        onClose={() => setOpen(false)}
        initial={editing}
        onChanged={onChanged}
      />
    </section>
  );
}

function FooterModal({
  open,
  onClose,
  initial,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  initial: PrintFooter | null;
  onChanged: () => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    name: '',
    bodyHtml: '',
    showStamp: true,
    isDefault: false,
    isActive: true,
  });

  useEffect(() => {
    if (!open) return;
    const legacy =
      !initial?.bodyHtml && initial?.bodyText
        ? `<p>${initial.bodyText}</p>`
        : '';
    setForm({
      name: initial?.name ?? '',
      bodyHtml: hydratePrintHtmlMedia(initial?.bodyHtml || legacy || ''),
      showStamp: initial?.showStamp ?? true,
      isDefault: initial?.isDefault ?? false,
      isActive: initial?.isActive ?? true,
    });
  }, [open, initial]);

  const saveM = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        bodyHtml: persistPrintHtmlMedia(form.bodyHtml),
        bodyText: null,
        showStamp: form.showStamp,
        isDefault: form.isDefault,
        isActive: form.isActive,
      };
      return isEdit && initial
        ? updatePrintFooterApi(initial.id, body)
        : createPrintFooterApi(body);
    },
    onSuccess: () => {
      toast(isEdit ? 'Pie actualizado' : 'Pie creado', 'success');
      onChanged();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo guardar';
      toast(msg, 'error');
    },
  });

  const deleteM = useMutation({
    mutationFn: () => deletePrintFooterApi(initial!.id),
    onSuccess: () => {
      toast('Pie eliminado', 'info');
      onChanged();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo eliminar';
      toast(msg, 'error');
    },
  });

  async function uploadImage(file: File) {
    try {
      const url = await uploadClinicLogoApi(file);
      if (!url) throw new Error('sin url');
      return authenticatedMediaUrl(url) ?? url;
    } catch {
      toast('No se pudo subir la imagen', 'error');
      throw new Error('upload failed');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar pie de página' : 'Nuevo pie de página'}
      size="lg"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim()) return toast('Nombre obligatorio', 'error');
          saveM.mutate();
        }}
      >
        <Input
          id="ft-name"
          label="Nombre interno"
          labelClassName={softLabel}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <RichTextEditor
          id="ft-body"
          mode="document"
          label="Diseño del pie"
          labelClassName={softLabel}
          minHeight="120px"
          placeholder="Aviso legal, firmas fijas, datos…"
          value={form.bodyHtml}
          onChange={(html) => setForm({ ...form, bodyHtml: html })}
          onUploadImage={uploadImage}
        />
        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <CheckRow
            label="Mostrar fecha/hora de impresión"
            checked={form.showStamp}
            onChange={(v) => setForm({ ...form, showStamp: v })}
          />
          <CheckRow
            label="Predeterminado"
            checked={form.isDefault}
            onChange={(v) => setForm({ ...form, isDefault: v })}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          {isEdit && !initial?.isDefault ? (
            <Button
              type="button"
              variant="secondary"
              className="text-red-600"
              onClick={() => {
                if (confirm('¿Eliminar pie?')) deleteM.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveM.isPending}>
              Guardar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-clinic-ink">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-clinic-deep"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
