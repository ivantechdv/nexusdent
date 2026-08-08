import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import {
  changePasswordApi,
  ClinicOption,
  loginApi,
  selectClinicApi,
  type AuthUser,
  type LoginResult,
} from '@/services/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { homePathForRole, type Permission } from '@/lib/permissions';

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

function finishLogin(
  res: LoginResult,
  setSession: (t: string, u: ReturnType<typeof toStoreUser>) => void,
  navigate: ReturnType<typeof useNavigate>,
) {
  setSession(res.token, toStoreUser(res.user));
  if (res.requiresClinicSelection) return 'select';
  navigate(
    homePathForRole(
      res.user.role,
      res.user.clinicId,
      (res.user.permissions ?? null) as Permission[] | null,
    ),
    { replace: true },
  );
  return 'done';
}

export function LoginPage() {
  const navigate = useNavigate();
  const { token, setSession, user } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clinics, setClinics] = useState<ClinicOption[] | null>(null);
  const [preauthToken, setPreauthToken] = useState<string | null>(null);
  const [changeToken, setChangeToken] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');

  if (token && !preauthToken && !changeToken) {
    return (
      <Navigate
        to={homePathForRole(
          user?.role,
          user?.clinicId,
          (user?.permissions ?? null) as Permission[] | null,
        )}
        replace
      />
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginApi(email.trim(), password);
      if (res.requiresPasswordChange) {
        setChangeToken(res.token);
        setTempPassword(password);
        setNewPassword('');
        setNewPassword2('');
        return;
      }
      if (res.requiresClinicSelection) {
        setPreauthToken(res.token);
        setClinics(res.clinics);
        return;
      }
      finishLogin(res, setSession, navigate);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Credenciales inválidas o servidor no disponible';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!changeToken) return;
    setError('');
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (newPassword !== newPassword2) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      const res = await changePasswordApi(
        tempPassword,
        newPassword,
        changeToken,
      );
      setChangeToken(null);
      setTempPassword('');
      if (res.requiresClinicSelection) {
        setPreauthToken(res.token);
        setClinics(res.clinics);
        return;
      }
      finishLogin(res, setSession, navigate);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo cambiar la contraseña';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onSelectClinic(clinicId: string) {
    if (!preauthToken) return;
    setError('');
    setLoading(true);
    try {
      const res = await selectClinicApi(clinicId, preauthToken);
      setPreauthToken(null);
      setClinics(null);
      setSession(res.token, toStoreUser(res.user));
      navigate(
        homePathForRole(
          res.user.role,
          res.user.clinicId,
          (res.user.permissions ?? null) as Permission[] | null,
        ),
        { replace: true },
      );
    } catch {
      setError('No se pudo seleccionar la clínica');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-end justify-center bg-gradient-to-b from-clinic-deep/10 to-clinic-surface p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl border border-slate-200/80 bg-white p-6 shadow-panel sm:rounded-2xl sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-clinic-deep text-xl font-bold text-white sm:h-12 sm:w-12 sm:rounded-xl sm:text-lg">
            N
          </div>
          <h1 className="font-display text-2xl font-semibold text-clinic-ink">
            NexusDent
          </h1>
          <p className="mt-1 text-sm text-clinic-slate">
            {changeToken
              ? 'Cambiá tu contraseña temporal'
              : clinics
                ? 'Seleccione la clínica'
                : 'Acceso al sistema de gestión clínica'}
          </p>
        </div>

        {changeToken ? (
          <form className="space-y-4" onSubmit={onChangePassword}>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Por seguridad debés definir una contraseña nueva antes de continuar.
            </p>
            <Input
              id="new-pass"
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              id="new-pass2"
              label="Repetir contraseña"
              type="password"
              autoComplete="new-password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              required
            />
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar y continuar'}
            </Button>
          </form>
        ) : clinics ? (
          <div className="space-y-3">
            {clinics.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={loading}
                onClick={() => void onSelectClinic(c.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-clinic-surface/60 px-4 py-3 text-left transition hover:border-clinic-deep/40 hover:bg-white disabled:opacity-60"
              >
                <span>
                  <span className="block font-medium text-clinic-ink">
                    {c.name}
                  </span>
                  <span className="text-xs text-clinic-slate">
                    {c.slug}
                    {c.isDemo ? ' · demo' : ''}
                  </span>
                </span>
                <span className="text-xs uppercase tracking-wide text-clinic-slate">
                  {c.role}
                </span>
              </button>
            ))}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="button"
              className="w-full text-center text-sm text-clinic-slate underline"
              onClick={() => {
                setClinics(null);
                setPreauthToken(null);
              }}
            >
              Volver al login
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              id="email"
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="password"
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-clinic-deep hover:underline"
              >
                Olvidé mi contraseña
              </Link>
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
