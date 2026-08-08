import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { Badge } from '@/components/Badge';
import { MoneyAmount } from '@/components/MoneyAmount';
import { BcvRatePill } from '@/components/BcvRateCard';
import {
  createTreatmentApi,
  listTreatmentsApi,
  updateTreatmentApi,
  type Treatment,
  type UpsertTreatment,
} from '@/services/treatments.api';
import { listCategoriesApi } from '@/services/categories.api';
import { categoryBadgeClass } from '@/lib/categoryBadge';

const emptyForm: UpsertTreatment = {
  code: '',
  name: '',
  category: 'GENERAL',
  basePrice: 0,
  description: '',
  isActive: true,
};

type StatusFilter = 'all' | 'active' | 'inactive';

const selectClass =
  'h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-clinic-ink focus:border-clinic-deep focus:outline-none focus:ring-2 focus:ring-clinic-deep/20';

export function TreatmentsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category') ?? '';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UpsertTreatment>(emptyForm);
  const [error, setError] = useState('');

  const { data: treatments = [], isLoading } = useQuery({
    queryKey: ['treatments', 'all'],
    queryFn: () => listTreatmentsApi({ all: true }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => listCategoriesApi(true),
  });

  const categoryLabel = useMemo(() => {
    const map = new Map(categories.map((c) => [c.code, c.name]));
    return (code: string) => map.get(code) ?? code;
  }, [categories]);

  const categoryName = useMemo(() => {
    if (!categoryFilter) return '';
    return categoryLabel(categoryFilter);
  }, [categoryFilter, categoryLabel]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return treatments.filter((t) => {
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (statusFilter === 'active' && !t.isActive) return false;
      if (statusFilter === 'inactive' && t.isActive) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [treatments, categoryFilter, statusFilter, query]);

  const hasFilters =
    Boolean(query.trim()) ||
    Boolean(categoryFilter) ||
    statusFilter !== 'all';

  function setCategory(code: string) {
    const next = new URLSearchParams(searchParams);
    if (code) next.set('category', code);
    else next.delete('category');
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setQuery('');
    setStatusFilter('all');
    setCategory('');
  }

  const createMut = useMutation({
    mutationFn: createTreatmentApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatments'] });
      closeModal();
    },
    onError: () => setError('No se pudo crear (¿código duplicado?)'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpsertTreatment }) =>
      updateTreatmentApi(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatments'] });
      closeModal();
    },
    onError: () => setError('No se pudo actualizar'),
  });

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      category: categoryFilter || emptyForm.category,
    });
    setError('');
    setOpen(true);
  }

  function openEdit(t: Treatment) {
    setEditingId(t.id);
    setForm({
      code: t.code,
      name: t.name,
      category: t.category,
      basePrice: t.basePrice,
      description: t.description ?? '',
      isActive: t.isActive,
    });
    setError('');
    setOpen(true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (editingId != null) {
      updateMut.mutate({ id: editingId, payload: form });
    } else {
      createMut.mutate(form);
    }
  }

  const saving = createMut.isPending || updateMut.isPending;
  const isEdit = editingId != null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:space-y-5 sm:p-6">
      {categoryFilter && (
        <Link
          to="/categories"
          className="inline-flex items-center gap-1 text-sm font-medium text-clinic-slate md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          Categorías
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
            Catálogo
          </h1>
          <p className="text-sm text-clinic-slate">
            {categoryFilter
              ? categoryName
              : 'Prestaciones y tarifas · toque para editar'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BcvRatePill />
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Nueva prestación
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-slate" />
          <input
            id="catalog-search"
            type="search"
            placeholder="Buscar por nombre o código…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-[42px] w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-clinic-ink placeholder:text-slate-400 focus:border-clinic-deep focus:outline-none focus:ring-2 focus:ring-clinic-deep/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-clinic-slate hover:bg-slate-100"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          aria-label="Categoría"
          className={`${selectClass} sm:w-48`}
          value={categoryFilter}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categories
            .filter((c) => c.isActive)
            .map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
              </option>
            ))}
        </select>

        <select
          aria-label="Estado"
          className={`${selectClass} sm:w-36`}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-clinic-slate">
          {isLoading
            ? 'Cargando…'
            : `${visible.length} de ${treatments.length} prestaciones`}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-sm font-medium text-clinic-deep hover:underline"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </button>
        )}
      </div>

      {isLoading ? null : visible.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <Search className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-clinic-ink">
            Sin resultados
          </p>
          <p className="mt-1 text-sm text-clinic-slate">
            Probá otra búsqueda o limpiá los filtros.
          </p>
          {hasFilters && (
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              onClick={clearFilters}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="panel w-full p-3.5 text-left active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-snug text-clinic-ink">
                        {t.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-clinic-slate">
                        {t.code}
                      </p>
                    </div>
                    <Badge tone={t.isActive ? 'success' : 'neutral'}>
                      {t.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-sm">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${categoryBadgeClass(t.category)}`}
                    >
                      {categoryLabel(t.category)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-clinic-ink">
                      <MoneyAmount
                        usd={t.basePrice}
                        usdClassName="font-semibold text-clinic-ink"
                        className="items-end"
                      />
                      <Pencil className="h-3.5 w-3.5 text-clinic-slate" />
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="panel hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-clinic-slate">
                <tr>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold">Precio</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/80"
                    onClick={() => openEdit(t)}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{t.code}</td>
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${categoryBadgeClass(t.category)}`}
                      >
                        {categoryLabel(t.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <MoneyAmount usd={t.basePrice} layout="inline" />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={t.isActive ? 'success' : 'neutral'}>
                        {t.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={open}
        onClose={closeModal}
        title={isEdit ? 'Editar prestación' : 'Nueva prestación'}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="treatment-form"
              disabled={saving}
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="treatment-form" className="space-y-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="code"
              label="Código"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
            <Input
              id="name"
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Categoría
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {categories
                  .filter((c) => c.isActive || c.code === form.category)
                  .map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <Input
              id="price"
              label="Precio base"
              type="number"
              min={0}
              step="0.01"
              value={form.basePrice}
              onChange={(e) =>
                setForm({ ...form, basePrice: Number(e.target.value) })
              }
              required
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive !== false}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
              />
              Prestación activa
            </label>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}
