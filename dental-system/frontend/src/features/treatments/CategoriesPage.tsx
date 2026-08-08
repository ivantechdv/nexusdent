import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderTree, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { Badge } from '@/components/Badge';
import {
  createCategoryApi,
  deleteCategoryApi,
  listCategoriesApi,
  updateCategoryApi,
  type Category,
  type UpsertCategory,
} from '@/services/categories.api';

const emptyForm: UpsertCategory = {
  code: '',
  name: '',
  sortOrder: 99,
  isActive: true,
};

export function CategoriesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<UpsertCategory>(emptyForm);
  const [error, setError] = useState('');

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => listCategoriesApi(true),
  });

  const createMut = useMutation({
    mutationFn: createCategoryApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      closeModal();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      setError(err.response?.data?.message ?? 'No se pudo crear'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpsertCategory }) =>
      updateCategoryApi(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['treatments'] });
      closeModal();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      setError(err.response?.data?.message ?? 'No se pudo actualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteCategoryApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      closeModal();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      setError(err.response?.data?.message ?? 'No se pudo eliminar'),
  });

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setError('');
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setForm({
      code: cat.code,
      name: cat.name,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
    });
    setError('');
    setOpen(true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (editing) {
      updateMut.mutate({ id: editing.id, payload: form });
    } else {
      createMut.mutate(form);
    }
  }

  const saving =
    createMut.isPending || updateMut.isPending || deleteMut.isPending;
  const isEdit = editing != null;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-3 sm:p-6">
      <Link
        to="/more"
        className="inline-flex items-center gap-1 text-sm font-medium text-clinic-slate md:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Configuración
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
            Categorías
          </h1>
          <p className="text-sm text-clinic-slate">
            Toque una categoría para editarla
          </p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Nueva categoría
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-clinic-slate">Cargando…</p>
      ) : (
        <ul className="panel overflow-hidden divide-y divide-slate-100">
          {categories.map((cat) => (
            <li key={cat.id}>
              <button
                type="button"
                onClick={() => openEdit(cat)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-slate-50 hover:bg-slate-50/80"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-clinic-deep/10 text-clinic-deep">
                  <FolderTree className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-clinic-ink">{cat.name}</span>
                    {!cat.isActive && (
                      <Badge tone="neutral">Inactiva</Badge>
                    )}
                  </span>
                  <span className="block text-xs text-clinic-slate">
                    {cat.treatmentCount} prestación
                    {cat.treatmentCount === 1 ? '' : 'es'} · {cat.code}
                  </span>
                </span>
                <Pencil className="h-4 w-4 shrink-0 text-clinic-slate" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={closeModal}
        title={isEdit ? 'Editar categoría' : 'Nueva categoría'}
        footer={
          <>
            {isEdit && editing && editing.treatmentCount === 0 && (
              <Button
                type="button"
                variant="secondary"
                className="text-red-600"
                disabled={saving}
                onClick={() => {
                  if (confirm('¿Eliminar esta categoría?')) {
                    deleteMut.mutate(editing.id);
                  }
                }}
              >
                Eliminar
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="submit" form="category-form" disabled={saving}>
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="category-form" className="space-y-3" onSubmit={onSubmit}>
          <Input
            id="cat-name"
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej. Cirugía"
            required
          />
          <Input
            id="cat-code"
            label="Código"
            value={form.code}
            onChange={(e) =>
              setForm({
                ...form,
                code: e.target.value.toUpperCase().replace(/\s+/g, '_'),
              })
            }
            placeholder="Ej. CIRUGIA"
            required
          />

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive !== false}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
              />
              Categoría activa
            </label>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {isEdit && editing && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                closeModal();
                navigate(
                  `/treatments?category=${encodeURIComponent(editing.code)}`,
                );
              }}
            >
              Ver prestaciones ({editing.treatmentCount})
            </Button>
          )}
        </form>
      </Modal>
    </div>
  );
}
