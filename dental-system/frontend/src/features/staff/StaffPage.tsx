import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Users } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import {
  createStaffApi,
  listStaffApi,
  updateStaffApi,
  type StaffUser,
} from '@/services/staff.api';
import { meApi } from '@/services/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import {
  optionalTempPasswordError,
  optionalTempPasswordHint,
} from '@/lib/password';
import {
  moduleEnabled,
  permissionsFor,
  PERMISSION_MODULES,
  toggleModule,
  type Permission,
} from '@/lib/permissions';

type StaffRole = 'ADMIN' | 'DENTIST' | 'RECEPTIONIST';

type FormState = {
  fullName: string;
  email: string;
  password: string;
  role: StaffRole;
  isDentist: boolean;
  permissions: Permission[];
};

const emptyForm = (): FormState => ({
  fullName: '',
  email: '',
  password: '',
  role: 'RECEPTIONIST',
  isDentist: false,
  permissions: permissionsFor('RECEPTIONIST'),
});

function samePermissionSet(a: Permission[], b: Permission[]) {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((p) => sa.has(p));
}

function PermissionModulesEditor({
  role,
  permissions,
  onPermissionsChange,
}: {
  role: StaffRole;
  permissions: Permission[];
  onPermissionsChange: (p: Permission[]) => void;
}) {
  const active = useMemo(() => new Set(permissions), [permissions]);
  const isDefault = samePermissionSet(permissions, permissionsFor(role));

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-clinic-ink">Permisos por módulo</p>
        {!isDefault && (
          <button
            type="button"
            className="text-xs font-medium text-clinic-deep underline"
            onClick={() => onPermissionsChange(permissionsFor(role))}
          >
            Restaurar rol
          </button>
        )}
      </div>
      <p className="text-xs text-clinic-slate">
        Marcá o desmarcá lo que este usuario puede usar. Si no tocás nada, se
        mantiene la plantilla del rol.
      </p>
      <ul className="max-h-[40vh] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
        {PERMISSION_MODULES.map((mod) => {
          const checked = moduleEnabled(mod.permissions, active);
          return (
            <li key={mod.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm active:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--clinic-deep,#1e3a8a)]"
                  checked={checked}
                  onChange={() =>
                    onPermissionsChange(toggleModule(mod.permissions, permissions))
                  }
                />
                <span>
                  <span className="font-medium text-clinic-ink">{mod.label}</span>
                  <span className="block text-xs text-clinic-slate">
                    {mod.description}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {!isDefault && (
        <p className="text-[11px] font-medium text-amber-700">
          Se guardarán permisos personalizados (distintos al rol)
        </p>
      )}
    </div>
  );
}

export function StaffPage() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  const clinicId = useAuthStore((s) => s.user?.clinicId);
  const clinicName = useAuthStore((s) => s.user?.clinicName);
  const role = useAuthStore((s) => s.user?.role);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const staffQ = useQuery({
    queryKey: ['staff', clinicId],
    queryFn: listStaffApi,
    enabled: Boolean(clinicId),
  });

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function refreshMeIfSelf(userId: string) {
    if (!token || userId !== currentUserId) return;
    try {
      const me = await meApi();
      setSession(token, {
        id: me.id,
        email: me.email,
        fullName: me.fullName,
        role: me.role,
        phone: me.phone ?? null,
        specialty: me.specialty ?? null,
        clinicId: me.clinicId ?? null,
        clinicName: me.clinicName ?? null,
        clinicSlug: me.clinicSlug ?? null,
        permissions: me.permissions,
        hasCustomPermissions: me.hasCustomPermissions,
      });
    } catch {
      /* ignore */
    }
  }

  const isEdit = Boolean(editingId);
  const usesRoleDefaults = samePermissionSet(
    form.permissions,
    permissionsFor(form.role),
  );

  const createM = useMutation({
    mutationFn: () =>
      createStaffApi({
        fullName: form.fullName,
        email: form.email,
        password: form.password.trim() || undefined,
        role: form.role,
        isDentist: form.role === 'ADMIN' ? form.isDentist : undefined,
        customPermissions: usesRoleDefaults ? null : form.permissions,
      }),
    onSuccess: (data) => {
      if (data.temporaryPassword) {
        toast(
          `Usuario registrado · clave temporal: ${data.temporaryPassword}`,
          'info',
        );
      } else if (data.inviteEmailSent) {
        toast('Usuario registrado · correo con la clave enviado', 'success');
      } else if (data.inviteEmailLogged) {
        toast(
          'Usuario registrado · clave en consola del backend (sin Resend)',
          'info',
        );
      } else {
        toast('Usuario registrado / agregado a la clínica', 'success');
      }
      closeModal();
      void qc.invalidateQueries({ queryKey: ['staff', clinicId] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo registrar el usuario';
      toast(msg, 'error');
    },
  });

  const updateM = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('Sin usuario');
      return updateStaffApi(editingId, {
        fullName: form.fullName,
        role: form.role,
        isDentist:
          form.role === 'ADMIN'
            ? form.isDentist
            : form.role === 'DENTIST',
        useRoleDefaults: usesRoleDefaults,
        customPermissions: usesRoleDefaults ? null : form.permissions,
      });
    },
    onSuccess: async (data) => {
      toast('Usuario actualizado', 'success');
      closeModal();
      void qc.invalidateQueries({ queryKey: ['staff', clinicId] });
      await refreshMeIfSelf(data.id);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo actualizar el usuario';
      toast(msg, 'error');
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(u: StaffUser) {
    const staffRole = (
      ['ADMIN', 'DENTIST', 'RECEPTIONIST'].includes(u.role)
        ? u.role
        : 'RECEPTIONIST'
    ) as StaffRole;
    const perms =
      u.customPermissions != null
        ? [...(u.customPermissions as Permission[])]
        : u.permissions?.length
          ? [...(u.permissions as Permission[])]
          : permissionsFor(staffRole);
    setEditingId(u.id);
    setForm({
      fullName: u.fullName,
      email: u.email,
      password: '',
      role: staffRole,
      isDentist: Boolean(u.isDentist),
      permissions: perms,
    });
    setOpen(true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isEdit) {
      updateM.mutate();
      return;
    }
    const passErr = optionalTempPasswordError(form.password);
    if (passErr) {
      toast(passErr, 'error');
      return;
    }
    createM.mutate();
  }

  const saving = createM.isPending || updateM.isPending;

  useEffect(() => {
    if (!open) return;
    // foco inicial en el primer input del modal
    const t = window.setTimeout(() => {
      document.getElementById('staff-name')?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!clinicId) {
    return (
      <Navigate
        to={role === 'SUPERADMIN' ? '/platform' : '/more'}
        replace
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-3 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/more"
            className="mb-2 inline-flex items-center gap-1 text-sm text-clinic-slate"
          >
            <ArrowLeft className="h-4 w-4" />
            Configuración
          </Link>
          <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
            Usuarios
          </h1>
          <p className="text-sm text-clinic-slate">
            Personal de <strong className="text-clinic-ink">{clinicName}</strong>
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Users className="h-4 w-4 text-clinic-deep" />
          <span className="text-sm font-semibold text-clinic-ink">
            {(staffQ.data ?? []).length} usuarios
          </span>
        </div>
        <ul className="divide-y divide-slate-100">
          {(staffQ.data ?? []).map((u) => (
            <li key={u.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-clinic-ink">{u.fullName}</p>
                  <p className="truncate text-xs text-clinic-slate">{u.email}</p>
                  {u.customPermissions != null && (
                    <p className="mt-1 text-[11px] font-medium text-amber-700">
                      Permisos personalizados
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="info">{u.role}</Badge>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 p-1.5 text-clinic-deep hover:bg-slate-50"
                    title="Editar"
                    onClick={() => openEdit(u)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
          {!staffQ.isLoading && !(staffQ.data?.length) && (
            <li className="px-4 py-8 text-center text-sm text-clinic-slate">
              Aún no hay usuarios en esta clínica
            </li>
          )}
        </ul>
      </div>

      <Modal
        open={open}
        title={isEdit ? 'Editar usuario' : 'Nuevo usuario'}
        onClose={closeModal}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="staff-user-form"
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <form
          id="staff-user-form"
          className="space-y-3"
          onSubmit={onSubmit}
        >
          {!isEdit && (
            <p className="text-xs text-clinic-slate">
              Queda asociado a <strong>{clinicName}</strong>. Se envía un correo
              con la clave temporal. Si el email ya existe, se agrega a esta
              clínica.
            </p>
          )}
          <Input
            id="staff-name"
            label="Nombre completo"
            value={form.fullName}
            onChange={(e) =>
              setForm((f) => ({ ...f, fullName: e.target.value }))
            }
            required
          />
          <Input
            id="staff-email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            disabled={isEdit}
          />
          {!isEdit && (
            <>
              <Input
                id="staff-pass"
                label="Contraseña temporal (mín. 6, opcional)"
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                error={optionalTempPasswordError(form.password) ?? undefined}
              />
              {!optionalTempPasswordError(form.password) && (
                <p
                  className={`text-xs ${
                    form.password.trim().length >= 6
                      ? 'text-emerald-700'
                      : 'text-clinic-slate'
                  }`}
                >
                  {optionalTempPasswordHint(form.password)}
                </p>
              )}
            </>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-clinic-slate">Rol</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.role}
              onChange={(e) => {
                const next = e.target.value as StaffRole;
                setForm((f) => {
                  const wasDefault = samePermissionSet(
                    f.permissions,
                    permissionsFor(f.role),
                  );
                  return {
                    ...f,
                    role: next,
                    isDentist: next === 'DENTIST' ? true : f.isDentist,
                    // Si seguía la plantilla, al cambiar rol actualizamos permisos
                    permissions: wasDefault
                      ? permissionsFor(next)
                      : f.permissions,
                  };
                });
              }}
            >
              <option value="RECEPTIONIST">Recepcionista / Asistente</option>
              <option value="DENTIST">Odontólogo</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          {form.role === 'ADMIN' && (
            <label className="flex items-center gap-2 text-sm text-clinic-ink">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.isDentist}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isDentist: e.target.checked }))
                }
              />
              También es odontólogo (aparece en agenda / atención)
            </label>
          )}

          <PermissionModulesEditor
            role={form.role}
            permissions={form.permissions}
            onPermissionsChange={(p) =>
              setForm((f) => ({ ...f, permissions: p }))
            }
          />
        </form>
      </Modal>
    </div>
  );
}
