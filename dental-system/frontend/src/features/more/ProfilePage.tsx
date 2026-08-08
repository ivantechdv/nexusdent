import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  KeyRound,
  MessageCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { whatsappHref } from '@/lib/contact';
import { meApi, updateProfileApi } from '@/services/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Administrador',
  DENTIST: 'Odontólogo',
  RECEPTIONIST: 'Recepción',
};

const softLabel = 'text-sm font-medium text-clinic-ink';

export function ProfilePage() {
  const qc = useQueryClient();
  const { user, token, setSession } = useAuthStore();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    specialty: user?.specialty ?? '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const meQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: meApi,
  });

  useEffect(() => {
    const me = meQ.data;
    if (!me) return;
    setForm((f) => ({
      ...f,
      fullName: me.fullName ?? '',
      email: me.email ?? '',
      phone: me.phone ?? '',
      specialty: me.specialty ?? '',
    }));
    if (token) {
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
      });
    }
  }, [meQ.data, token, setSession]);

  const saveM = useMutation({
    mutationFn: () => {
      const payload: {
        fullName: string;
        email: string;
        phone: string | null;
        specialty: string | null;
        currentPassword?: string;
        newPassword?: string;
      } = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        specialty: form.specialty.trim() || null,
      };
      if (form.newPassword.trim()) {
        payload.currentPassword = form.currentPassword;
        payload.newPassword = form.newPassword.trim();
      }
      return updateProfileApi(payload);
    },
    onSuccess: (data) => {
      setSession(data.token, {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.fullName,
        role: data.user.role,
        phone: data.user.phone ?? null,
        specialty: data.user.specialty ?? null,
        clinicId: data.user.clinicId,
        clinicName: data.user.clinicName,
        clinicSlug: data.user.clinicSlug,
      });
      setForm((f) => ({
        ...f,
        fullName: data.user.fullName,
        email: data.user.email,
        phone: data.user.phone ?? '',
        specialty: data.user.specialty ?? '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
      setPasswordOpen(false);
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast('Perfil actualizado', 'success');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo guardar el perfil';
      toast(msg, 'error');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) {
      toast('Nombre y correo son obligatorios', 'error');
      return;
    }
    if (form.newPassword.trim()) {
      if (form.newPassword.trim().length < 8) {
        toast('La nueva contraseña debe tener al menos 8 caracteres', 'error');
        return;
      }
      if (!form.currentPassword) {
        toast('Indicá la contraseña actual', 'error');
        return;
      }
      if (form.newPassword !== form.confirmPassword) {
        toast('La confirmación no coincide', 'error');
        return;
      }
    }
    saveM.mutate();
  }

  const roleLabel = ROLE_LABEL[user?.role ?? ''] ?? user?.role;
  const wa = whatsappHref(form.phone);
  const initial = (form.fullName?.[0] ?? user?.fullName?.[0] ?? 'U').toUpperCase();

  return (
    <div className="mx-auto max-w-xl space-y-5 p-3 sm:p-6">
      <Link
        to="/more"
        className="inline-flex items-center gap-1 text-sm font-medium text-clinic-slate md:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Configuración
      </Link>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-clinic-deep text-lg font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
                Mi perfil
              </h1>
              <p className="truncate text-sm text-clinic-slate">
                {roleLabel}
                {user?.clinicName ? ` · ${user.clinicName}` : ''}
              </p>
            </div>
          </div>
          <Button
            type="submit"
            disabled={saveM.isPending}
            className="shrink-0"
          >
            {saveM.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>

        <div className="space-y-4 border-t border-slate-200/80 pt-5">
          <Input
            id="profile-name"
            label="Nombre completo"
            labelClassName={softLabel}
            value={form.fullName}
            onChange={(e) =>
              setForm((f) => ({ ...f, fullName: e.target.value }))
            }
            required
          />
          <Input
            id="profile-email"
            label="Email"
            labelClassName={softLabel}
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />

          <div className="space-y-1.5">
            <Input
              id="profile-phone"
              label="WhatsApp"
              labelClassName={softLabel}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Ej. 04121234567"
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs text-clinic-slate">
                Con código de área (Venezuela).
              </p>
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Probar enlace
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <Input
            id="profile-specialty"
            label="Especialidad"
            labelClassName={softLabel}
            placeholder="Ej. Ortodoncia, Endodoncia…"
            value={form.specialty}
            onChange={(e) =>
              setForm((f) => ({ ...f, specialty: e.target.value }))
            }
          />
        </div>

        <div className="border-t border-slate-200/80 pt-2">
          <button
            type="button"
            onClick={() => setPasswordOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-xl px-1 py-2.5 text-left transition hover:bg-slate-50"
          >
            <KeyRound className="h-4 w-4 shrink-0 text-clinic-slate" />
            <span className="flex-1 text-sm font-medium text-clinic-ink">
              Cambiar contraseña
            </span>
            <span className="text-xs text-clinic-slate">Opcional</span>
            <ChevronDown
              className={clsx(
                'h-4 w-4 text-clinic-slate transition-transform',
                passwordOpen && 'rotate-180',
              )}
            />
          </button>

          {passwordOpen && (
            <div className="mt-2 space-y-3 pb-1 pl-1">
              <Input
                id="profile-current-pass"
                label="Contraseña actual"
                labelClassName={softLabel}
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currentPassword: e.target.value }))
                }
              />
              <Input
                id="profile-new-pass"
                label="Nueva (mín. 8 caracteres)"
                labelClassName={softLabel}
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, newPassword: e.target.value }))
                }
              />
              <Input
                id="profile-confirm-pass"
                label="Confirmar nueva"
                labelClassName={softLabel}
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, confirmPassword: e.target.value }))
                }
              />
            </div>
          )}
        </div>

        <div className="border-t border-slate-200/80 pt-4 md:hidden">
          <Button
            type="submit"
            disabled={saveM.isPending}
            className="w-full"
          >
            {saveM.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </div>
  );
}
