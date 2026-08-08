import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, LogIn, Plus, Trash2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import {
  createClinicApi,
  createClinicUserApi,
  deleteClinicApi,
  ensureClinicCatalogApi,
  listClinicUsersApi,
  listClinicsAdminApi,
  purgeClinicApi,
  restoreClinicApi,
} from '@/services/clinics.api';
import { leaveClinicApi, selectClinicApi, type AuthUser } from '@/services/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import { homePathForRole } from '@/lib/permissions';
import {
  optionalTempPasswordError,
  optionalTempPasswordHint,
} from '@/lib/password';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function toStoreUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    phone: user.phone ?? null,
    specialty: user.specialty ?? null,
    clinicId: user.clinicId ?? null,
    clinicName: user.clinicName ?? null,
    clinicSlug: user.clinicSlug ?? null,
    permissions: user.permissions,
    hasCustomPermissions: user.hasCustomPermissions,
  };
}

export function PlatformPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setSession, user } = useAuthStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateClinic, setShowCreateClinic] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [clinicForm, setClinicForm] = useState({
    name: '',
    slug: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
    adminIsDentist: true,
  });
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'RECEPTIONIST' as 'ADMIN' | 'DENTIST' | 'RECEPTIONIST',
  });

  const clinicsQ = useQuery({
    queryKey: ['platform', 'clinics'],
    queryFn: listClinicsAdminApi,
  });

  const usersQ = useQuery({
    queryKey: ['platform', 'clinic-users', selectedId],
    queryFn: () => listClinicUsersApi(selectedId!),
    enabled: Boolean(selectedId),
  });

  const createClinicM = useMutation({
    mutationFn: () =>
      createClinicApi({
        name: clinicForm.name.trim(),
        slug: clinicForm.slug.trim() || clinicForm.name.trim(),
        adminFullName: clinicForm.adminFullName.trim(),
        adminEmail: clinicForm.adminEmail.trim(),
        adminPassword: clinicForm.adminPassword.trim() || undefined,
        adminIsDentist: clinicForm.adminIsDentist,
      }),
    onSuccess: (data) => {
      if (data.temporaryPassword) {
        toast(
          `Clínica creada · clave temporal del admin: ${data.temporaryPassword}`,
          'info',
        );
      } else if (data.inviteEmailSent) {
        toast('Clínica creada · correo al admin con la clave', 'success');
      } else if (data.inviteEmailLogged) {
        toast(
          'Clínica creada · clave del admin en consola del backend (sin Resend)',
          'info',
        );
      } else {
        toast('Clínica y administrador creados', 'success');
      }
      setShowCreateClinic(false);
      setClinicForm({
        name: '',
        slug: '',
        adminFullName: '',
        adminEmail: '',
        adminPassword: '',
        adminIsDentist: true,
      });
      setSelectedId(data.id);
      void qc.invalidateQueries({ queryKey: ['platform', 'clinics'] });
      void qc.invalidateQueries({
        queryKey: ['platform', 'clinic-users', data.id],
      });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo crear la clínica';
      toast(msg, 'error');
    },
  });

  const createUserM = useMutation({
    mutationFn: () =>
      createClinicUserApi(selectedId!, {
        ...userForm,
        password: userForm.password.trim() || undefined,
      }),
    onSuccess: (data) => {
      if (data.temporaryPassword) {
        toast(
          `Cuenta creada · clave temporal: ${data.temporaryPassword}`,
          'info',
        );
      } else if (data.inviteEmailSent) {
        toast('Cuenta creada · correo enviado con la clave', 'success');
      } else if (data.inviteEmailLogged) {
        toast(
          'Cuenta creada · clave temporal en consola del backend (Resend no configurado)',
          'info',
        );
      } else {
        toast('Cuenta creada', 'success');
      }
      setShowCreateUser(false);
      setUserForm({
        email: '',
        password: '',
        fullName: '',
        role: 'RECEPTIONIST',
      });
      void qc.invalidateQueries({
        queryKey: ['platform', 'clinic-users', selectedId],
      });
      void qc.invalidateQueries({ queryKey: ['platform', 'clinics'] });
    },
    onError: () => toast('No se pudo crear la cuenta', 'error'),
  });

  async function enterClinic(clinicId: string) {
    try {
      const res = await selectClinicApi(clinicId);
      setSession(res.token, toStoreUser(res.user));
      qc.clear();
      toast(`Entrando a ${res.clinic?.name ?? 'clínica'}`, 'success');
      navigate(
        homePathForRole(
          res.user.role,
          res.user.clinicId,
          (res.user.permissions ?? null) as import('@/lib/permissions').Permission[] | null,
        ),
        { replace: true },
      );
    } catch {
      toast('No se pudo entrar a la clínica', 'error');
    }
  }

  const deleteClinicM = useMutation({
    mutationFn: (clinicId: string) => deleteClinicApi(clinicId),
    onSuccess: () => {
      toast(
        'Clínica enviada a papelera · podés restaurarla durante 20 días',
        'success',
      );
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ['platform', 'clinics'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo eliminar la clínica';
      toast(msg, 'error');
    },
  });

  const restoreClinicM = useMutation({
    mutationFn: (clinicId: string) => restoreClinicApi(clinicId),
    onSuccess: (clinic) => {
      toast(`«${clinic.name}» restaurada`, 'success');
      void qc.invalidateQueries({ queryKey: ['platform', 'clinics'] });
    },
    onError: () => toast('No se pudo restaurar la clínica', 'error'),
  });

  const purgeClinicM = useMutation({
    mutationFn: (clinicId: string) => purgeClinicApi(clinicId),
    onSuccess: (_data, clinicId) => {
      toast('Clínica eliminada definitivamente', 'success');
      setPurgeTarget(null);
      if (selectedId === clinicId) setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ['platform', 'clinics'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo eliminar definitivamente';
      toast(msg, 'error');
    },
  });

  const ensureCatalogM = useMutation({
    mutationFn: (clinicId: string) => ensureClinicCatalogApi(clinicId),
    onSuccess: (data) => {
      if (data.source === 'existing') {
        toast(
          `Ya tenía catálogo (${data.categories} categorías · ${data.treatments} prestaciones)`,
          'info',
        );
      } else if (data.source === 'copy') {
        toast(
          `Catálogo copiado: ${data.categories} categorías · ${data.treatments} prestaciones`,
          'success',
        );
      } else {
        toast(
          `Catálogo base cargado: ${data.categories} categorías · ${data.treatments} prestaciones`,
          'success',
        );
      }
    },
    onError: () => toast('No se pudo cargar el catálogo', 'error'),
  });

  function daysLeftInTrash(deletedAt: string | null | undefined): number | null {
    if (!deletedAt) return null;
    const end = new Date(deletedAt).getTime() + 20 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  async function backToPlatform() {
    try {
      const res = await leaveClinicApi();
      setSession(res.token, toStoreUser(res.user));
      qc.clear();
      toast('Modo plataforma', 'info');
      navigate('/platform', { replace: true });
    } catch {
      toast('No se pudo volver a plataforma', 'error');
    }
  }

  const clinics = clinicsQ.data ?? [];
  const selected = clinics.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-clinic-ink">
            Plataforma NexusDent
          </h1>
          <p className="text-sm text-clinic-slate">
            Superadmin · clínicas, cuentas y acceso de soporte
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user?.clinicId && (
            <Button type="button" variant="secondary" onClick={() => void backToPlatform()}>
              Salir de clínica
            </Button>
          )}
          <Button type="button" onClick={() => setShowCreateClinic((v) => !v)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nueva clínica
          </Button>
        </div>
      </div>

      {showCreateClinic && (
        <form
          className="panel space-y-4 p-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const passErr = optionalTempPasswordError(clinicForm.adminPassword);
            if (passErr) {
              toast(passErr, 'error');
              return;
            }
            createClinicM.mutate();
          }}
        >
          <div>
            <p className="text-sm font-medium text-clinic-ink">
              Nueva clínica + administrador
            </p>
            <p className="text-xs text-clinic-slate">
              Se cargan categorías y catálogo de prestaciones automáticamente
              (desde otra clínica con datos, o el catálogo base de NexusDent).
            </p>
            <p className="mt-1 text-xs text-clinic-slate">
              Se crea la clínica y su usuario principal (ADMIN). El resto del
              personal lo carga ese admin desde Usuarios, o vos desde esta
              clínica abajo.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="clinic-name"
              label="Nombre de la clínica"
              value={clinicForm.name}
              onChange={(e) => {
                const name = e.target.value;
                setClinicForm((f) => ({
                  ...f,
                  name,
                  slug:
                    f.slug && f.slug !== slugify(f.name)
                      ? f.slug
                      : slugify(name),
                }));
              }}
              required
            />
            <Input
              id="clinic-slug"
              label="Slug (URL)"
              value={clinicForm.slug}
              onChange={(e) =>
                setClinicForm((f) => ({ ...f, slug: e.target.value }))
              }
              required
            />
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              Usuario principal · Administrador
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="admin-name"
                label="Nombre completo"
                value={clinicForm.adminFullName}
                onChange={(e) =>
                  setClinicForm((f) => ({
                    ...f,
                    adminFullName: e.target.value,
                  }))
                }
                required
              />
              <Input
                id="admin-email"
                label="Email"
                type="email"
                value={clinicForm.adminEmail}
                onChange={(e) =>
                  setClinicForm((f) => ({ ...f, adminEmail: e.target.value }))
                }
                required
              />
            </div>
            <div className="mt-3">
              <Input
                id="admin-pass"
                label="Contraseña temporal (mín. 6, opcional)"
                type="password"
                value={clinicForm.adminPassword}
                onChange={(e) =>
                  setClinicForm((f) => ({
                    ...f,
                    adminPassword: e.target.value,
                  }))
                }
                error={
                  optionalTempPasswordError(clinicForm.adminPassword) ??
                  undefined
                }
              />
              {!optionalTempPasswordError(clinicForm.adminPassword) && (
                <p
                  className={`mt-1 text-xs ${
                    clinicForm.adminPassword.trim().length >= 6
                      ? 'text-emerald-700'
                      : 'text-clinic-slate'
                  }`}
                >
                  {optionalTempPasswordHint(clinicForm.adminPassword)}
                </p>
              )}
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={clinicForm.adminIsDentist}
                onChange={(e) =>
                  setClinicForm((f) => ({
                    ...f,
                    adminIsDentist: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium text-clinic-ink">
                  También es odontólogo
                </span>
                <span className="mt-0.5 block text-xs text-clinic-slate">
                  Aparece en agenda y atenciones (recomendado si el dueño
                  atiende pacientes).
                </span>
              </span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={createClinicM.isPending}>
              {createClinicM.isPending ? 'Creando…' : 'Crear clínica'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreateClinic(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-clinic-slate">
            Clínicas
          </h2>
          {clinicsQ.isLoading && (
            <p className="text-sm text-clinic-slate">Cargando…</p>
          )}
          <div className="space-y-2">
            {clinics.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  selectedId === c.id
                    ? 'border-clinic-deep bg-clinic-deep/5'
                    : 'border-slate-200 bg-white hover:border-clinic-deep/30'
                }`}
              >
                <span className="flex items-start gap-3">
                  <Building2 className="mt-0.5 h-4 w-4 text-clinic-deep" />
                  <span>
                    <span className="block font-medium text-clinic-ink">
                      {c.name}
                      {c.isDemo ? ' · demo' : ''}
                      {c.deletedAt
                        ? ` · papelera (${daysLeftInTrash(c.deletedAt) ?? 0}d)`
                        : !c.isActive
                          ? ' · inactiva'
                          : ''}
                    </span>
                    <span className="text-xs text-clinic-slate">
                      {c.slug} · {c.patientCount ?? 0} pacientes ·{' '}
                      {c.userCount ?? 0} usuarios
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-clinic-slate">
                  {selected.name}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {selected.deletedAt ? (
                    <>
                      <Button
                        type="button"
                        disabled={restoreClinicM.isPending}
                        onClick={() => restoreClinicM.mutate(selected.id)}
                      >
                        Restaurar
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={purgeClinicM.isPending}
                        onClick={() =>
                          setPurgeTarget({
                            id: selected.id,
                            name: selected.name,
                          })
                        }
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Eliminar definitivo
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={ensureCatalogM.isPending}
                        onClick={() => ensureCatalogM.mutate(selected.id)}
                      >
                        {ensureCatalogM.isPending
                          ? 'Catálogo…'
                          : 'Cargar catálogo'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={deleteClinicM.isPending}
                        onClick={() =>
                          setDeleteTarget({
                            id: selected.id,
                            name: selected.name,
                          })
                        }
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Eliminar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void enterClinic(selected.id)}
                      >
                        <LogIn className="mr-1.5 h-4 w-4" />
                        Entrar
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-clinic-ink">
                    <Users className="h-4 w-4" />
                    Cuentas
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreateUser((v) => !v)}
                  >
                    Nueva cuenta
                  </Button>
                </div>

                {showCreateUser && (
                  <form
                    className="mb-4 space-y-2 border-b border-slate-100 pb-4"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      const passErr = optionalTempPasswordError(
                        userForm.password,
                      );
                      if (passErr) {
                        toast(passErr, 'error');
                        return;
                      }
                      createUserM.mutate();
                    }}
                  >
                    <p className="text-xs text-clinic-slate">
                      Se agrega a <strong>{selected.name}</strong>
                    </p>
                    <Input
                      id="u-name"
                      label="Nombre"
                      value={userForm.fullName}
                      onChange={(e) =>
                        setUserForm((f) => ({ ...f, fullName: e.target.value }))
                      }
                      required
                    />
                    <Input
                      id="u-email"
                      label="Email"
                      type="email"
                      value={userForm.email}
                      onChange={(e) =>
                        setUserForm((f) => ({ ...f, email: e.target.value }))
                      }
                      required
                    />
                    <Input
                      id="u-pass"
                      label="Contraseña temporal (mín. 6, opcional)"
                      type="password"
                      value={userForm.password}
                      onChange={(e) =>
                        setUserForm((f) => ({ ...f, password: e.target.value }))
                      }
                      error={
                        optionalTempPasswordError(userForm.password) ??
                        undefined
                      }
                    />
                    {!optionalTempPasswordError(userForm.password) && (
                      <p
                        className={`text-xs ${
                          userForm.password.trim().length >= 6
                            ? 'text-emerald-700'
                            : 'text-clinic-slate'
                        }`}
                      >
                        {optionalTempPasswordHint(userForm.password)}
                      </p>
                    )}
                    <label className="block text-sm">                      <span className="mb-1 block text-clinic-slate">Rol</span>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                        value={userForm.role}
                        onChange={(e) =>
                          setUserForm((f) => ({
                            ...f,
                            role: e.target.value as typeof f.role,
                          }))
                        }
                      >
                        <option value="ADMIN">Administrador</option>
                        <option value="DENTIST">Odontólogo</option>
                        <option value="RECEPTIONIST">
                          Recepcionista / Asistente
                        </option>
                      </select>
                    </label>
                    <Button type="submit" disabled={createUserM.isPending}>
                      {createUserM.isPending ? 'Creando…' : 'Crear cuenta'}
                    </Button>
                  </form>
                )}
                <ul className="space-y-2">
                  {(usersQ.data ?? []).map((u) => (
                    <li
                      key={u.id}
                      className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-clinic-ink">
                        {u.fullName}
                      </span>
                      <span className="mt-0.5 block text-xs text-clinic-slate">
                        {u.email} · {u.role}
                      </span>
                    </li>
                  ))}
                  {!usersQ.isLoading && (usersQ.data?.length ?? 0) === 0 && (
                    <li className="text-sm text-clinic-slate">
                      Sin usuarios en esta clínica
                    </li>
                  )}
                </ul>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-clinic-slate">
              Selecciona una clínica para ver cuentas, crear usuarios o entrar
              como soporte.
            </p>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        title="Eliminar clínica"
        onClose={() => {
          if (!deleteClinicM.isPending) setDeleteTarget(null);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={deleteClinicM.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={deleteClinicM.isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                deleteClinicM.mutate(deleteTarget.id);
              }}
            >
              {deleteClinicM.isPending ? 'Eliminando…' : 'Sí, enviar a papelera'}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-3 text-sm text-clinic-ink">
            <p>
              ¿Seguro que querés eliminar{' '}
              <strong>«{deleteTarget.name}»</strong>?
            </p>
            <p className="text-clinic-slate">
              No se borra al instante: queda en <strong>papelera 20 días</strong>{' '}
              y después se elimina de forma definitiva. Mientras tanto podés
              restaurarla desde Plataforma.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(purgeTarget)}
        title="Eliminar definitivamente"
        onClose={() => {
          if (!purgeClinicM.isPending) setPurgeTarget(null);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={purgeClinicM.isPending}
              onClick={() => setPurgeTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={purgeClinicM.isPending || !purgeTarget}
              onClick={() => {
                if (!purgeTarget) return;
                purgeClinicM.mutate(purgeTarget.id);
              }}
            >
              {purgeClinicM.isPending
                ? 'Borrando…'
                : 'Sí, borrar para siempre'}
            </Button>
          </>
        }
      >
        {purgeTarget && (
          <div className="space-y-3 text-sm text-clinic-ink">
            <p>
              ¿Eliminar <strong>«{purgeTarget.name}»</strong> de forma
              definitiva?
            </p>
            <p className="text-clinic-slate">
              Esta acción <strong>no se puede deshacer</strong>. Se borran
              pacientes, citas, planes, cobros, catálogo y la clínica. Solo
              está disponible porque ya está en papelera.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
