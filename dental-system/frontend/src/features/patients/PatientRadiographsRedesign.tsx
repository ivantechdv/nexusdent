import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Calendar,
  CloudUpload,
  Download,
  Expand,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import {
  createPatientGalleryPhotoApi,
  deletePatientGalleryPhotoApi,
  listPatientRadiographsApi,
  RADIOGRAPH_STUDY_LABELS,
  RADIOGRAPH_STUDY_STYLES,
  radiographAccession,
  type PatientGalleryPhoto,
  type RadiographStudyType,
} from '@/services/patient-gallery.api';
import { uploadFilesApi } from '@/services/uploads.api';

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const VISIBLE_LIMIT = 5;

type StudyFilter = 'ALL' | RadiographStudyType;
type DateFilter = 'THIS_YEAR' | 'ALL' | 'RECENT';

function authenticatedUrl(url: string, token: string | null) {
  if (!token || !url.includes('/api/uploads/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function studyMeta(study: PatientGalleryPhoto) {
  const type = study.studyType ?? 'OTHER';
  return {
    type,
    label: RADIOGRAPH_STUDY_LABELS[type],
    style: RADIOGRAPH_STUDY_STYLES[type],
  };
}

function isAcceptedRadiograph(file: File) {
  if (/^image\//.test(file.type) || file.type === 'application/pdf') return true;
  return /\.(jpe?g|png|heic|heif|pdf|dcm|dicom)$/i.test(file.name);
}

function defaultStudyTitle(type: RadiographStudyType, fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const label = RADIOGRAPH_STUDY_LABELS[type];
  return base && !base.toLowerCase().includes(label.toLowerCase().slice(0, 4))
    ? `${label} - ${base}`
    : label;
}

interface PatientRadiographsRedesignProps {
  patientId: string;
}

export function PatientRadiographsRedesign({
  patientId,
}: PatientRadiographsRedesignProps) {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<StudyFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('THIS_YEAR');
  const [showAll, setShowAll] = useState(false);
  const [preview, setPreview] = useState<PatientGalleryPhoto | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStudyType, setUploadStudyType] =
    useState<RadiographStudyType>('PANORAMIC');

  const radiographsQ = useQuery({
    queryKey: ['patient-radiographs', patientId],
    queryFn: () => listPatientRadiographsApi(patientId),
    staleTime: 30_000,
  });

  const deleteM = useMutation({
    mutationFn: (photoId: string) =>
      deletePatientGalleryPhotoApi(patientId, photoId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['patient-radiographs', patientId],
      });
      toast('Estudio eliminado', 'success');
    },
    onError: () => toast('No se pudo eliminar el estudio', 'error'),
  });

  const studies = radiographsQ.data ?? [];

  const filtered = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    let rows = [...studies];
    const q = search.trim().toLowerCase();

    if (q) {
      rows = rows.filter((s) => {
        const meta = studyMeta(s);
        return (
          s.title.toLowerCase().includes(q) ||
          (s.notes ?? '').toLowerCase().includes(q) ||
          meta.label.toLowerCase().includes(q) ||
          (s.uploadedByName ?? '').toLowerCase().includes(q) ||
          radiographAccession(s.id).includes(q)
        );
      });
    }

    if (typeFilter !== 'ALL') {
      rows = rows.filter((s) => (s.studyType ?? 'OTHER') === typeFilter);
    }

    if (dateFilter === 'THIS_YEAR') {
      rows = rows.filter((s) => new Date(s.createdAt).getFullYear() === year);
    } else if (dateFilter === 'RECENT') {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      rows = rows.filter((s) => new Date(s.createdAt) >= cutoff);
    }

    return rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [studies, search, typeFilter, dateFilter]);

  const visible = showAll ? filtered : filtered.slice(0, VISIBLE_LIMIT);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(isAcceptedRadiograph);
      if (!list.length) {
        toast('Formatos admitidos: JPG, PNG, PDF (máx. 12 MB)', 'error');
        return;
      }
      const tooBig = list.find((f) => f.size > MAX_FILE_BYTES);
      if (tooBig) {
        toast(`${tooBig.name} supera el límite de 12 MB`, 'error');
        return;
      }

      setUploading(true);
      try {
        const uploaded = await uploadFilesApi(list);
        for (let i = 0; i < uploaded.length; i++) {
          const up = uploaded[i];
          const file = list[i];
          await createPatientGalleryPhotoApi(patientId, {
            kind: 'RADIOGRAPH',
            studyType: uploadStudyType,
            title: defaultStudyTitle(uploadStudyType, file.name),
            fileUrl: up.url,
            originalName: up.originalName,
            mimeType: up.mimeType,
            fileSize: up.size,
          });
        }
        await queryClient.invalidateQueries({
          queryKey: ['patient-radiographs', patientId],
        });
        toast(
          uploaded.length === 1
            ? 'Estudio radiográfico subido'
            : `${uploaded.length} estudios subidos`,
          'success',
        );
      } catch {
        toast('Error al subir estudios', 'error');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (dropInputRef.current) dropInputRef.current.value = '';
      }
    },
    [patientId, queryClient, uploadStudyType],
  );

  function handleDownload(study: PatientGalleryPhoto) {
    const href = authenticatedUrl(study.fileUrl, token);
    const a = document.createElement('a');
    a.href = href;
    a.download = study.originalName ?? study.title;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }

  function handlePrint(study: PatientGalleryPhoto) {
    const href = authenticatedUrl(study.fileUrl, token);
    const w = window.open(href, '_blank', 'noopener,noreferrer');
    if (w) w.addEventListener('load', () => w.print());
  }

  function handleDelete(study: PatientGalleryPhoto) {
    const ok = window.confirm(`¿Eliminar "${study.title}"?`);
    if (!ok) return;
    deleteM.mutate(study.id);
    if (preview?.id === study.id) setPreview(null);
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
              placeholder="Buscar estudio..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-[#2b7a78] focus:ring-2 focus:ring-[#2b7a78]/15"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap font-medium">Tipo:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as StudyFilter)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2b7a78]"
            >
              <option value="ALL">Todos los tipos</option>
              {(Object.keys(RADIOGRAPH_STUDY_LABELS) as RadiographStudyType[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {RADIOGRAPH_STUDY_LABELS[key]}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="whitespace-nowrap font-medium">Fecha:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2b7a78]"
            >
              <option value="THIS_YEAR">Este año</option>
              <option value="RECENT">Últimos 12 meses</option>
              <option value="ALL">Todas</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={uploadStudyType}
            onChange={(e) =>
              setUploadStudyType(e.target.value as RadiographStudyType)
            }
            className="hidden h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2b7a78] sm:block"
            aria-label="Tipo de estudio al subir"
          >
            {(Object.keys(RADIOGRAPH_STUDY_LABELS) as RadiographStudyType[]).map(
              (key) => (
                <option key={key} value={key}>
                  {RADIOGRAPH_STUDY_LABELS[key]}
                </option>
              ),
            )}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,application/pdf,.dcm,.dicom"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void processFiles(e.target.files);
            }}
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {uploading ? 'Subiendo…' : 'Subir Estudio'}
          </button>
        </div>
      </div>

      {/* Grid */}
      {radiographsQ.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[340px] animate-pulse rounded-xl border border-slate-200 bg-slate-100"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {visible.map((study) => {
            const meta = studyMeta(study);
            return (
              <article
                key={study.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative aspect-[16/10] bg-slate-900">
                  {study.mimeType === 'application/pdf' ||
                  study.fileUrl.toLowerCase().includes('.pdf') ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
                      <span className="text-4xl font-bold">PDF</span>
                      <span className="text-xs">Documento radiográfico</span>
                    </div>
                  ) : (
                    <img
                      src={authenticatedUrl(study.fileUrl, token)}
                      alt={study.title}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  )}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-base font-bold text-slate-900">
                      {study.title}
                    </h4>
                    <span
                      className={clsx(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                        meta.style.badge,
                      )}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: meta.style.hex }}
                      />
                      {meta.label}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500">
                    {formatDate(study.createdAt)}
                    {study.uploadedByName ? ` · ${study.uploadedByName}` : ''}
                  </p>

                  <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-600">
                    {study.notes?.trim() ||
                      'Sin hallazgos registrados en este estudio.'}
                  </p>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="font-mono text-[11px] font-medium text-slate-400">
                      DICOM_ACC: {radiographAccession(study.id)}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setPreview(study)}
                        title="Ampliar"
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#2b7a78]"
                      >
                        <Expand className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(study)}
                        title="Descargar"
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#2b7a78]"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrint(study)}
                        title="Imprimir"
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#2b7a78]"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(study)}
                        disabled={deleteM.isPending}
                        title="Eliminar"
                        className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Upload card */}
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') dropInputRef.current?.click();
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
            }}
            onClick={() => dropInputRef.current?.click()}
            className={clsx(
              'flex min-h-[340px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
              dragOver
                ? 'border-[#2b7a78] bg-teal-50/60'
                : 'border-[#2b7a78]/40 bg-teal-50/30 hover:border-[#2b7a78] hover:bg-teal-50/50',
            )}
          >
            <input
              ref={dropInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf,.dcm,.dicom"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void processFiles(e.target.files);
              }}
            />
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#2b7a78] shadow-sm">
              <CloudUpload className="h-7 w-7" />
            </span>
            <p className="text-base font-semibold text-slate-800">
              Subir estudios radiográficos
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Arrastra archivos aquí o haz clic para buscar
            </p>
            <p className="mt-3 max-w-sm text-xs text-slate-400">
              Formatos admitidos: DICOM, JPG, PNG, PDF. Tamaño máximo: 12 MB.
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      {!radiographsQ.isLoading && studies.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
          <p className="text-slate-500">
            Mostrando {Math.min(visible.length, filtered.length)} de{' '}
            {filtered.length} estudios radiográficos
            {filtered.length !== studies.length && (
              <span className="text-slate-400">
                {' '}
                ({studies.length} en total)
              </span>
            )}
          </p>
          {filtered.length > VISIBLE_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="font-semibold text-[#2b7a78] transition hover:underline"
            >
              {showAll
                ? 'Mostrar menos ←'
                : 'Ver todos los estudios antiguos →'}
            </button>
          )}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        title={preview?.title ?? 'Estudio radiográfico'}
        onClose={() => setPreview(null)}
        size="lg"
        footer={
          preview ? (
            <div className="flex w-full flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDownload(preview)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Descargar
              </button>
              <button
                type="button"
                onClick={() => handlePrint(preview)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
            </div>
          ) : undefined
        }
      >
        {preview && (
          <div className="flex justify-center bg-slate-900">
            <img
              src={authenticatedUrl(preview.fileUrl, token)}
              alt={preview.title}
              className="max-h-[60vh] w-full object-contain"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
