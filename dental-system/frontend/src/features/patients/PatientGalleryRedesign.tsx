import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Calendar,
  CloudUpload,
  Download,
  Expand,
  Search,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import {
  createPatientGalleryPhotoApi,
  deletePatientGalleryPhotoApi,
  GALLERY_CATEGORY_LABELS,
  GALLERY_CATEGORY_STYLES,
  listPatientGalleryApi,
  type GalleryCategory,
  type PatientGalleryPhoto,
} from '@/services/patient-gallery.api';
import { uploadFilesApi } from '@/services/uploads.api';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

type TypeFilter = 'ALL' | GalleryCategory;
type DateFilter = 'RECENT' | 'OLDEST';

function authenticatedUrl(url: string, token: string | null) {
  if (!token || !url.includes('/api/uploads/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

function formatGalleryDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function defaultTitle(fileName: string, category: GalleryCategory) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const label = GALLERY_CATEGORY_LABELS[category];
  return base ? `${label} - ${base}` : label;
}

function isAcceptedImage(file: File) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return /\.(jpe?g|png|heic|heif)$/i.test(file.name);
}

interface PatientGalleryRedesignProps {
  patientId: string;
}

export function PatientGalleryRedesign({ patientId }: PatientGalleryRedesignProps) {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('RECENT');
  const [uploadCategory, setUploadCategory] = useState<GalleryCategory>('INTRAORAL');
  const [preview, setPreview] = useState<PatientGalleryPhoto | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const galleryQ = useQuery({
    queryKey: ['patient-gallery', patientId],
    queryFn: () => listPatientGalleryApi(patientId),
    staleTime: 30_000,
  });

  const deleteM = useMutation({
    mutationFn: (photoId: string) =>
      deletePatientGalleryPhotoApi(patientId, photoId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patient-gallery', patientId] });
      toast('Fotografía eliminada', 'success');
    },
    onError: () => toast('No se pudo eliminar la fotografía', 'error'),
  });

  const photos = galleryQ.data ?? [];

  const filtered = useMemo(() => {
    let rows = [...photos];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.uploadedByName ?? '').toLowerCase().includes(q) ||
          GALLERY_CATEGORY_LABELS[p.category].toLowerCase().includes(q),
      );
    }
    if (typeFilter !== 'ALL') {
      rows = rows.filter((p) => p.category === typeFilter);
    }
    rows.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return dateFilter === 'RECENT' ? tb - ta : ta - tb;
    });
    return rows;
  }, [photos, search, typeFilter, dateFilter]);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(isAcceptedImage);
      if (!list.length) {
        toast('Seleccione imágenes JPG, PNG o HEIC (máx. 10 MB)', 'error');
        return;
      }
      const tooBig = list.find((f) => f.size > MAX_FILE_BYTES);
      if (tooBig) {
        toast(`${tooBig.name} supera el límite de 10 MB`, 'error');
        return;
      }

      setUploading(true);
      try {
        const uploaded = await uploadFilesApi(list);
        for (let i = 0; i < uploaded.length; i++) {
          const up = uploaded[i];
          const file = list[i];
          await createPatientGalleryPhotoApi(patientId, {
            category: uploadCategory,
            title: defaultTitle(file.name, uploadCategory),
            fileUrl: up.url,
            originalName: up.originalName,
            mimeType: up.mimeType,
            fileSize: up.size,
          });
        }
        await queryClient.invalidateQueries({
          queryKey: ['patient-gallery', patientId],
        });
        toast(
          uploaded.length === 1
            ? 'Fotografía subida correctamente'
            : `${uploaded.length} fotografías subidas`,
          'success',
        );
      } catch {
        toast('Error al subir fotografías', 'error');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (dropInputRef.current) dropInputRef.current.value = '';
      }
    },
    [patientId, queryClient, uploadCategory],
  );

  function handleDownload(photo: PatientGalleryPhoto) {
    const href = authenticatedUrl(photo.fileUrl, token);
    const a = document.createElement('a');
    a.href = href;
    a.download = photo.originalName ?? photo.title;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }

  function handleDelete(photo: PatientGalleryPhoto) {
    const ok = window.confirm(`¿Eliminar "${photo.title}"?`);
    if (!ok) return;
    deleteM.mutate(photo.id);
    if (preview?.id === photo.id) setPreview(null);
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
              placeholder="Buscar fotografía..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-[#2b7a78] focus:ring-2 focus:ring-[#2b7a78]/15"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap font-medium">Tipo:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2b7a78]"
            >
              <option value="ALL">Todos</option>
              {(Object.keys(GALLERY_CATEGORY_LABELS) as GalleryCategory[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {GALLERY_CATEGORY_LABELS[key]}
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
              <option value="RECENT">Recientes</option>
              <option value="OLDEST">Antiguas</option>
            </select>
          </label>

          <span className="inline-flex h-8 items-center rounded-full bg-teal-50 px-3 text-xs font-semibold text-[#2b7a78]">
            {filtered.length} fotograf{filtered.length === 1 ? 'ía' : 'ías'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="hidden items-center gap-2 text-sm text-slate-600 sm:flex">
            <span className="font-medium">Categoría:</span>
            <select
              value={uploadCategory}
              onChange={(e) =>
                setUploadCategory(e.target.value as GalleryCategory)
              }
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2b7a78]"
            >
              {(Object.keys(GALLERY_CATEGORY_LABELS) as GalleryCategory[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {GALLERY_CATEGORY_LABELS[key]}
                  </option>
                ),
              )}
            </select>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif"
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
            <Upload className="h-4 w-4" />
            {uploading ? 'Subiendo…' : 'Subir Fotografías'}
          </button>
        </div>
      </div>

      {/* Grid */}
      {galleryQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
            />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((photo) => (
            <GalleryCard
              key={photo.id}
              photo={photo}
              token={token}
              onExpand={() => setPreview(photo)}
              onDownload={() => handleDownload(photo)}
              onDelete={() => handleDelete(photo)}
              deleting={deleteM.isPending && deleteM.variables === photo.id}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 p-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            {photos.length === 0
              ? 'Aún no hay fotografías en la galería clínica'
              : 'No hay resultados con los filtros actuales'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Suba imágenes con el botón naranja o arrástrelas abajo
          </p>
        </div>
      )}

      {/* Dropzone */}
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
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
          dragOver
            ? 'border-[#2b7a78] bg-teal-50/60'
            : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-50',
        )}
      >
        <input
          ref={dropInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void processFiles(e.target.files);
          }}
        />
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-[#2b7a78]">
          <CloudUpload className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold text-slate-700">
          Arrastra fotografías aquí o haz clic para seleccionar
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Formatos aceptados: JPG, PNG, HEIC (Máx. 10MB)
        </p>
      </div>

      {/* Preview modal */}
      <Modal
        open={Boolean(preview)}
        title={preview?.title ?? 'Fotografía'}
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
                onClick={() => handleDelete(preview)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </div>
          ) : undefined
        }
      >
        {preview && (
          <div className="flex justify-center">
            <img
              src={authenticatedUrl(preview.fileUrl, token)}
              alt={preview.title}
              className="max-h-[60vh] w-full rounded-lg object-contain"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function GalleryCard({
  photo,
  token,
  onExpand,
  onDownload,
  onDelete,
  deleting,
}: {
  photo: PatientGalleryPhoto;
  token: string | null;
  onExpand: () => void;
  onDownload: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const style = GALLERY_CATEGORY_STYLES[photo.category];
  const imgSrc = authenticatedUrl(photo.fileUrl, token);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] bg-slate-100">
        <img
          src={imgSrc}
          alt={photo.title}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span
          className={clsx(
            'absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            style.badge,
          )}
        >
          {GALLERY_CATEGORY_LABELS[photo.category]}
        </span>
      </div>

      <div className="space-y-2 p-4">
        <h4 className="line-clamp-2 text-sm font-bold text-slate-800">
          {photo.title}
        </h4>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            {formatGalleryDate(photo.createdAt)}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">
              {photo.uploadedByName ?? 'Equipo clínico'}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExpand}
            title="Ampliar"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#2b7a78]"
          >
            <Expand className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDownload}
            title="Descargar"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#2b7a78]"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          title="Eliminar"
          className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
