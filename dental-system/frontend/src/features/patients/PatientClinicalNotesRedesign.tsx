import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bookmark,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { toast } from '@/stores/toast.store';
import {
  CLINICAL_NOTE_TAGS,
  CLINICAL_NOTE_TAG_STYLES,
  createClinicalNoteApi,
  deleteClinicalNoteApi,
  listClinicalNoteEventsApi,
  listClinicalNotesApi,
  updateClinicalNoteApi,
  type ClinicalNote,
} from '@/services/patient-notes.api';

type SortMode = 'NEWEST' | 'OLDEST' | 'CRITICAL';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function wasEdited(note: ClinicalNote) {
  return (
    new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() >
    2000
  );
}

interface PatientClinicalNotesRedesignProps {
  patientId: string;
}

export function PatientClinicalNotesRedesign({
  patientId,
}: PatientClinicalNotesRedesignProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('ALL');
  const [sort, setSort] = useState<SortMode>('NEWEST');
  const [historyOpen, setHistoryOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalNote | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isCritical, setIsCritical] = useState(false);

  const notesQ = useQuery({
    queryKey: ['patient-notes', patientId],
    queryFn: () => listClinicalNotesApi(patientId),
    staleTime: 15_000,
  });

  const eventsQ = useQuery({
    queryKey: ['patient-notes-events', patientId],
    queryFn: () => listClinicalNoteEventsApi(patientId),
    staleTime: 15_000,
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['patient-notes', patientId] });
    void qc.invalidateQueries({
      queryKey: ['patient-notes-events', patientId],
    });
  }

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        tags,
        isCritical,
      };
      if (editing) {
        return updateClinicalNoteApi(patientId, editing.id, payload);
      }
      return createClinicalNoteApi(patientId, payload);
    },
    onSuccess: () => {
      invalidate();
      closeEditor();
      toast(editing ? 'Nota actualizada' : 'Nota creada', 'success');
    },
    onError: () => toast('No se pudo guardar la nota', 'error'),
  });

  const deleteM = useMutation({
    mutationFn: (noteId: string) => deleteClinicalNoteApi(patientId, noteId),
    onSuccess: () => {
      invalidate();
      toast('Nota eliminada', 'success');
    },
    onError: () => toast('No se pudo eliminar la nota', 'error'),
  });

  const notes = notesQ.data ?? [];
  const events = eventsQ.data ?? [];

  const filtered = useMemo(() => {
    let rows = [...notes];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (tagFilter !== 'ALL') {
      rows = rows.filter((n) => n.tags.includes(tagFilter));
    }
    rows.sort((a, b) => {
      if (sort === 'CRITICAL') {
        if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
      }
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      return sort === 'OLDEST' ? ta - tb : tb - ta;
    });
    return rows;
  }, [notes, search, tagFilter, sort]);

  function openCreate() {
    setEditing(null);
    setTitle('');
    setBody('');
    setTags([]);
    setIsCritical(false);
    setEditorOpen(true);
  }

  function openEdit(note: ClinicalNote) {
    setEditing(note);
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags);
    setIsCritical(note.isCritical);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditing(null);
  }

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function handleDelete(note: ClinicalNote) {
    const ok = window.confirm(`¿Eliminar la nota "${note.title}"?`);
    if (!ok) return;
    deleteM.mutate(note.id);
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar notas..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-[#2b7a78] focus:ring-2 focus:ring-[#2b7a78]/15"
            />
          </div>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2b7a78]"
            aria-label="Filtrar por etiquetas"
          >
            <option value="ALL">Filtrar por etiquetas</option>
            {CLINICAL_NOTE_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2b7a78]"
            aria-label="Ordenar"
          >
            <option value="NEWEST">Ordenar por fecha</option>
            <option value="OLDEST">Más antiguas</option>
            <option value="CRITICAL">Críticas primero</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Nueva Nota
        </button>
      </div>

      {/* Grid de notas */}
      {notesQ.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 p-8 text-center">
          <Bookmark className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            {notes.length === 0
              ? 'Aún no hay notas clínicas'
              : 'No hay resultados con los filtros actuales'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Creá alertas críticas, preferencias o recordatorios del paciente
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((note) => (
            <article
              key={note.id}
              className={clsx(
                'relative rounded-xl border bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
                note.isCritical
                  ? 'border-red-200'
                  : 'border-slate-200',
              )}
            >
              <div className="absolute right-3 top-3 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => openEdit(note)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#2b7a78]"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(note)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="pr-16">
                <div className="mb-2 flex items-start gap-2">
                  <Bookmark
                    className={clsx(
                      'mt-0.5 h-5 w-5 shrink-0',
                      note.isCritical ? 'text-red-500' : 'text-[#2b7a78]',
                    )}
                    fill="currentColor"
                    fillOpacity={0.2}
                  />
                  <h4
                    className={clsx(
                      'text-[15px] font-bold leading-snug',
                      note.isCritical ? 'text-red-600' : 'text-slate-800',
                    )}
                  >
                    {note.title}
                  </h4>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">
                  {note.body}
                </p>

                {note.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className={clsx(
                          'inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                          CLINICAL_NOTE_TAG_STYLES[tag] ??
                            CLINICAL_NOTE_TAG_STYLES.Otro,
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                  <span>
                    Creado por:{' '}
                    <span className="font-medium text-slate-500">
                      {note.createdByName ?? 'Equipo clínico'}
                    </span>
                  </span>
                  <span className="text-right">
                    {formatDate(note.createdAt)}
                    {wasEdited(note) && (
                      <>
                        {' · '}
                        <span className="text-slate-500">
                          Editado: {formatDate(note.updatedAt)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Historial de modificaciones */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            Historial de Modificaciones
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {events.length} cambio{events.length === 1 ? '' : 's'}
            </span>
          </span>
          <ChevronDown
            className={clsx(
              'h-4 w-4 text-slate-400 transition',
              historyOpen && 'rotate-180',
            )}
          />
        </button>

        {historyOpen && (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Acción</th>
                  <th className="px-3 py-3">Título de nota</th>
                  <th className="px-3 py-3">Realizado por</th>
                  <th className="px-5 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-8 text-center text-sm text-slate-400"
                    >
                      Sin cambios registrados
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-t border-slate-100 hover:bg-slate-50/40"
                    >
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                          <span
                            className={clsx(
                              'h-2 w-2 rounded-full',
                              ev.action === 'UPDATED'
                                ? 'bg-emerald-500'
                                : ev.action === 'CREATED'
                                  ? 'bg-orange-500'
                                  : 'bg-red-500',
                            )}
                          />
                          {ev.action === 'UPDATED'
                            ? 'Editado'
                            : ev.action === 'CREATED'
                              ? 'Creado'
                              : 'Eliminado'}
                        </span>
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-3 text-slate-700">
                        Nota: &apos;{ev.noteTitle}&apos;
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {ev.actorName ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                        {formatDate(ev.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Editor modal */}
      <Modal
        open={editorOpen}
        title={editing ? 'Editar nota clínica' : 'Nueva nota clínica'}
        onClose={closeEditor}
        size="lg"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                saveM.isPending || !title.trim() || !body.trim()
              }
              onClick={() => saveM.mutate()}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saveM.isPending ? 'Guardando…' : 'Guardar nota'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">
              Título
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. ALERTA: No usar epinefrina"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#2b7a78] focus:ring-2 focus:ring-[#2b7a78]/15"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">
              Contenido
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Detalle clínico, preferencia o alerta…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#2b7a78] focus:ring-2 focus:ring-[#2b7a78]/15"
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Etiquetas
            </p>
            <div className="flex flex-wrap gap-2">
              {CLINICAL_NOTE_TAGS.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs font-semibold transition',
                      on
                        ? CLINICAL_NOTE_TAG_STYLES[tag]
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            Marcar como nota crítica / alerta
          </label>
        </div>
      </Modal>
    </div>
  );
}
