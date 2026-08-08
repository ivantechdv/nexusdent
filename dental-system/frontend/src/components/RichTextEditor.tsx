import { Extension } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontSize } from '@tiptap/extension-text-style/font-size';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useRef } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  labelClassName?: string;
  minHeight?: string;
  id?: string;
  /** simple = notas clínicas · document = encabezados/pies con imagen y tabla */
  mode?: 'simple' | 'document';
  /** Sube imagen y devuelve URL (p. ej. /api/uploads/file/…) */
  onUploadImage?: (file: File) => Promise<string>;
}

const IMAGE_SIZES = [
  { label: 'XS', width: 40 },
  { label: 'S', width: 56 },
  { label: 'M', width: 72 },
  { label: 'L', width: 96 },
  { label: 'XL', width: 128 },
] as const;

const FONT_SIZES = [
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
] as const;

type CellVAlign = 'top' | 'middle' | 'bottom';

/** Alineación vertical de celdas (arriba / medio / abajo). */
const CellVerticalAlign = Extension.create({
  name: 'cellVerticalAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          verticalAlign: {
            default: 'top',
            parseHTML: (element) => {
              const fromData = element.getAttribute('data-valign');
              const fromStyle = (element.style.verticalAlign || '').toLowerCase();
              const raw = (fromData || fromStyle || 'top').toLowerCase();
              if (raw === 'middle' || raw === 'center') return 'middle';
              if (raw === 'bottom') return 'bottom';
              return 'top';
            },
            renderHTML: (attributes) => {
              const v = (attributes.verticalAlign as CellVAlign) || 'top';
              return { 'data-valign': v };
            },
          },
        },
      },
    ];
  },
});

/** Imagen con ancho y alineación editables (para encabezados/pies). */
const PrintImage = Image.extend({
  name: 'image',
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const raw =
            element.getAttribute('width') ||
            element.style.width ||
            null;
          if (!raw) return null;
          const n = parseInt(String(raw), 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return {
            width: attributes.width,
            style: `width: ${attributes.width}px; height: auto; max-height: none;`,
          };
        },
      },
      align: {
        default: 'left',
        parseHTML: (element) =>
          element.getAttribute('data-align') || 'left',
        renderHTML: (attributes) => {
          const align = attributes.align || 'left';
          return { 'data-align': align };
        },
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute('alt'),
        renderHTML: (attributes) => {
          if (!attributes.alt) return {};
          return { alt: attributes.alt };
        },
      },
    };
  },
}).configure({
  inline: true,
  allowBase64: false,
  HTMLAttributes: { class: 'print-rte-img' },
});

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
  wide,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 items-center justify-center rounded-md text-clinic-slate transition',
        wide ? 'gap-1 px-2 text-[11px] font-medium' : 'w-8',
        active && 'bg-clinic-deep/10 text-clinic-deep',
        !active && 'hover:bg-slate-100 hover:text-clinic-ink',
        disabled && 'opacity-40',
      )}
    >
      {children}
    </button>
  );
}

export function isRichTextEmpty(html: string) {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
  const hasImg = /<img\b/i.test(html);
  const hasTable = /<table\b/i.test(html);
  return !text && !hasImg && !hasTable;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Escriba aquí…',
  label,
  labelClassName,
  minHeight = '96px',
  id,
  mode = 'simple',
  onUploadImage,
}: RichTextEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isDocument = mode === 'document';

  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: isDocument ? { levels: [1, 2, 3] } : false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: isDocument ? {} : false,
      }),
      Placeholder.configure({ placeholder }),
      ...(isDocument
        ? [
            Underline,
            TextStyle,
            FontSize,
            TextAlign.configure({
              types: ['heading', 'paragraph'],
              alignments: ['left', 'center', 'right'],
            }),
            PrintImage,
            TableKit.configure({
              table: {
                resizable: true,
                HTMLAttributes: { class: 'print-rte-table' },
              },
            }),
            CellVerticalAlign,
          ]
        : []),
    ],
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none px-3 py-2 text-sm text-clinic-ink focus:outline-none min-h-[inherit]',
        ...(id ? { id } : {}),
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      const empty = isRichTextEmpty(value);
      const curEmpty = isRichTextEmpty(current);
      if (empty && curEmpty) return;
      if (value !== current) {
        editor.commands.setContent(value || '', { emitUpdate: false });
      }
    }
  }, [value, editor]);

  async function insertImage(file: File | undefined) {
    if (!file || !editor || !onUploadImage) return;
    if (!file.type.startsWith('image/')) return;
    try {
      const url = await onUploadImage(file);
      if (url) {
        editor.chain().focus().setImage({ src: url, width: 72 }).run();
      }
    } catch {
      // caller muestra toast
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function insertTable() {
    if (!editor) return;
    const ok = editor
      .chain()
      .focus()
      .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
      .run();
    if (!ok) {
      editor
        .chain()
        .focus()
        .insertContent(
          `<table class="print-rte-table"><tbody>
            <tr><th></th><th></th></tr>
            <tr><td></td><td></td></tr>
          </tbody></table><p></p>`,
        )
        .run();
    }
  }

  function setImageWidth(width: number | null) {
    if (!editor) return;
    editor.chain().focus().updateAttributes('image', { width }).run();
  }

  function setImageAlign(align: 'left' | 'center' | 'right') {
    if (!editor) return;
    editor.chain().focus().updateAttributes('image', { align }).run();
  }

  function deleteImage() {
    if (!editor) return;
    editor.chain().focus().deleteSelection().run();
  }

  if (!editor) return null;

  const inImage = isDocument && editor.isActive('image');
  const inTable = isDocument && editor.isActive('table');
  const imageAttrs = inImage
    ? (editor.getAttributes('image') as {
        width?: number | null;
        align?: string | null;
        alt?: string | null;
        src?: string | null;
      })
    : null;
  const currentWidth = imageAttrs?.width ?? null;
  const currentAlign = (imageAttrs?.align as 'left' | 'center' | 'right') || 'left';
  const currentFontSize =
    (editor.getAttributes('textStyle')?.fontSize as string | null) ?? null;
  const textAlignCenter = editor.isActive({ textAlign: 'center' });
  const textAlignRight = editor.isActive({ textAlign: 'right' });
  const textAlignLeft =
    editor.isActive({ textAlign: 'left' }) ||
    (!textAlignCenter && !textAlignRight);
  const showTableBar = inTable && !inImage;
  const cellType = editor.isActive('tableHeader')
    ? 'tableHeader'
    : editor.isActive('tableCell')
      ? 'tableCell'
      : null;
  const cellVAlign =
    (cellType
      ? (editor.getAttributes(cellType).verticalAlign as CellVAlign | undefined)
      : undefined) || 'top';

  function setCellVerticalAlign(align: CellVAlign) {
    if (!editor) return;
    const { state, view } = editor;
    const $from = state.selection.$from;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') {
        continue;
      }
      const pos = $from.before(depth);
      view.dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          verticalAlign: align,
        }),
      );
      return;
    }

    // Fallback: selección de celdas / comando tip tap
    editor.chain().focus().setCellAttribute('verticalAlign', align).run();
  }

  return (
    <div className="block space-y-1.5">
      {label && (
        <span
          className={
            labelClassName ??
            'text-xs font-semibold uppercase tracking-wide text-clinic-slate'
          }
        >
          {label}
        </span>
      )}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-clinic-deep focus-within:ring-2 focus-within:ring-clinic-deep/20">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/80 px-1.5 py-1">
          {isDocument && (
            <>
              <ToolbarButton
                title="Título"
                active={editor.isActive('heading', { level: 2 })}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
              >
                <span className="text-[10px] font-bold">H</span>
              </ToolbarButton>
              <ToolbarButton
                wide
                title="Párrafo normal"
                active={editor.isActive('paragraph')}
                onClick={() => editor.chain().focus().setParagraph().run()}
              >
                P
              </ToolbarButton>
              <span className="mx-1 h-4 w-px bg-slate-200" />
            </>
          )}
          <ToolbarButton
            title="Negrita"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            title="Cursiva"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          {isDocument && (
            <ToolbarButton
              title="Subrayado"
              active={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
          )}
          {isDocument && (
            <>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <ToolbarButton
                title="Alinear a la izquierda"
                active={textAlignLeft}
                onClick={() =>
                  editor.chain().focus().setTextAlign('left').run()
                }
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Centrar texto"
                active={textAlignCenter}
                onClick={() =>
                  editor.chain().focus().setTextAlign('center').run()
                }
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Alinear a la derecha"
                active={textAlignRight}
                onClick={() =>
                  editor.chain().focus().setTextAlign('right').run()
                }
              >
                <AlignRight className="h-3.5 w-3.5" />
              </ToolbarButton>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <select
                title="Tamaño de texto"
                aria-label="Tamaño de texto"
                className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-clinic-ink focus:border-clinic-deep focus:outline-none focus:ring-1 focus:ring-clinic-deep/30"
                value={currentFontSize ?? ''}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    editor.chain().focus().unsetFontSize().run();
                    return;
                  }
                  editor.chain().focus().setFontSize(v).run();
                }}
              >
                <option value="">Auto</option>
                {FONT_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}px
                  </option>
                ))}
              </select>
            </>
          )}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <ToolbarButton
            title="Lista"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            title="Lista numerada"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          {isDocument && (
            <>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <ToolbarButton
                title="Insertar tabla 2×2"
                active={editor.isActive('table')}
                onClick={insertTable}
              >
                <TableIcon className="h-3.5 w-3.5" />
              </ToolbarButton>
              {onUploadImage && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void insertImage(e.target.files?.[0])}
                  />
                  <ToolbarButton
                    title="Insertar imagen"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                  </ToolbarButton>
                </>
              )}
            </>
          )}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <ToolbarButton
            title="Deshacer"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            title="Rehacer"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        {inImage && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-emerald-700/15 bg-emerald-50/60 px-1.5 py-1">
            <span className="mr-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
              Imagen
            </span>
            {IMAGE_SIZES.map((s) => (
              <ToolbarButton
                key={s.label}
                wide
                title={`Ancho ${s.width}px`}
                active={currentWidth === s.width}
                onClick={() => setImageWidth(s.width)}
              >
                {s.label}
              </ToolbarButton>
            ))}
            <ToolbarButton
              wide
              title="Tamaño original / automático"
              active={currentWidth == null}
              onClick={() => setImageWidth(null)}
            >
              Auto
            </ToolbarButton>
            <label className="ml-1 inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-[11px] text-clinic-slate">
              px
              <input
                type="number"
                min={24}
                max={400}
                value={currentWidth ?? ''}
                placeholder="—"
                className="h-7 w-14 rounded border border-slate-200 bg-white px-1.5 text-xs text-clinic-ink focus:border-clinic-deep focus:outline-none focus:ring-1 focus:ring-clinic-deep/30"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (!v) {
                    setImageWidth(null);
                    return;
                  }
                  const n = Number(v);
                  if (Number.isFinite(n) && n >= 24) setImageWidth(Math.round(n));
                }}
              />
            </label>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <ToolbarButton
              title="Alinear a la izquierda"
              active={currentAlign === 'left'}
              onClick={() => setImageAlign('left')}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Centrar"
              active={currentAlign === 'center'}
              onClick={() => setImageAlign('center')}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Alinear a la derecha"
              active={currentAlign === 'right'}
              onClick={() => setImageAlign('right')}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </ToolbarButton>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <label className="inline-flex h-8 max-w-[10rem] items-center gap-1 rounded-md px-1 text-[11px] text-clinic-slate">
              Alt
              <input
                type="text"
                value={imageAttrs?.alt ?? ''}
                placeholder="descripción"
                className="h-7 min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 text-xs text-clinic-ink focus:border-clinic-deep focus:outline-none focus:ring-1 focus:ring-clinic-deep/30"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', {
                      alt: e.target.value || null,
                    })
                    .run();
                }}
              />
            </label>
            <ToolbarButton title="Eliminar imagen" onClick={deleteImage}>
              <Trash2 className="h-3.5 w-3.5 text-red-600" />
            </ToolbarButton>
          </div>
        )}

        {showTableBar && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-clinic-deep/15 bg-clinic-deep/[0.04] px-1.5 py-1">
            <span className="mr-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-clinic-deep">
              Tabla
            </span>
            <ToolbarButton
              wide
              title="Agregar columna a la izquierda"
              disabled={!editor.can().addColumnBefore()}
              onClick={() => editor.chain().focus().addColumnBefore().run()}
            >
              + Col
            </ToolbarButton>
            <ToolbarButton
              wide
              title="Agregar columna a la derecha"
              disabled={!editor.can().addColumnAfter()}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              Col +
            </ToolbarButton>
            <ToolbarButton
              wide
              title="Eliminar columna actual"
              disabled={!editor.can().deleteColumn()}
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              − Col
            </ToolbarButton>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <ToolbarButton
              wide
              title="Agregar fila arriba"
              disabled={!editor.can().addRowBefore()}
              onClick={() => editor.chain().focus().addRowBefore().run()}
            >
              + Fila
            </ToolbarButton>
            <ToolbarButton
              wide
              title="Agregar fila abajo"
              disabled={!editor.can().addRowAfter()}
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              Fila +
            </ToolbarButton>
            <ToolbarButton
              wide
              title="Eliminar fila actual"
              disabled={!editor.can().deleteRow()}
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              − Fila
            </ToolbarButton>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <ToolbarButton
              wide
              title="Activar/desactivar fila de encabezado"
              active={editor.isActive('tableHeader')}
              disabled={!editor.can().toggleHeaderRow()}
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            >
              Encabezado
            </ToolbarButton>
            <ToolbarButton
              wide
              title="Fusionar celdas seleccionadas"
              disabled={!editor.can().mergeCells()}
              onClick={() => editor.chain().focus().mergeCells().run()}
            >
              Fusionar
            </ToolbarButton>
            <ToolbarButton
              wide
              title="Dividir celda fusionada"
              disabled={!editor.can().splitCell()}
              onClick={() => editor.chain().focus().splitCell().run()}
            >
              Dividir
            </ToolbarButton>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <span className="px-1 text-[10px] font-medium text-clinic-slate">
              Vertical
            </span>
            <ToolbarButton
              title="Arriba en la celda"
              active={cellVAlign === 'top'}
              onClick={() => setCellVerticalAlign('top')}
            >
              <AlignVerticalJustifyStart className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Centro vertical de la celda"
              active={cellVAlign === 'middle'}
              onClick={() => setCellVerticalAlign('middle')}
            >
              <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Abajo en la celda"
              active={cellVAlign === 'bottom'}
              onClick={() => setCellVerticalAlign('bottom')}
            >
              <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />
            </ToolbarButton>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <ToolbarButton
              title="Eliminar tabla completa"
              disabled={!editor.can().deleteTable()}
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-600" />
            </ToolbarButton>
            <span className="ml-auto hidden max-w-[14rem] px-1 text-[10px] leading-tight text-clinic-slate sm:inline">
              Ancho: arrastrá el borde entre columnas
            </span>
          </div>
        )}

        <div style={{ minHeight }} className="rich-editor-body">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
