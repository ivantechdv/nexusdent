import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { RegisterClinicPage } from './RegisterClinicPage';
import {
  rememberClinicAccess,
  SelectClinicPage,
} from './SelectClinicPage';
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
import { featuresFromUser } from '@/lib/features';

type LoginTab = 'staff' | 'patient' | 'new-patient';

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
    features: user.features,
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

const TABS: { id: LoginTab; label: string }[] = [
  { id: 'staff', label: 'Personal Clínico' },
  { id: 'patient', label: 'Paciente Regular' },
  { id: 'new-patient', label: 'Nuevo Paciente' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { token, setSession, user } = useAuthStore();
  const [tab, setTab] = useState<LoginTab>('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clinics, setClinics] = useState<ClinicOption[] | null>(null);
  const [preauthToken, setPreauthToken] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [changeToken, setChangeToken] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [showRegister, setShowRegister] = useState(false);

  if (showRegister) {
    return <RegisterClinicPage />;
  }

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

  function enterClinicSelection(res: LoginResult) {
    // Evitar que un JWT viejo del store pise el preauth en select-clinic.
    useAuthStore.getState().logout();
    setPreauthToken(res.token);
    setClinics(res.clinics);
    setPendingUser(res.user);
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
        enterClinicSelection(res);
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
        enterClinicSelection(res);
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
      const chosen =
        clinics?.find((c) => c.id === clinicId) ?? res.clinic ?? null;
      if (chosen && res.user.id) {
        rememberClinicAccess(res.user.id, chosen);
      }
      setPreauthToken(null);
      setClinics(null);
      setPendingUser(null);
      setSession(res.token, toStoreUser(res.user));
      navigate(
        homePathForRole(
          res.user.role,
          res.user.clinicId,
          (res.user.permissions ?? null) as Permission[] | null,
        ),
        { replace: true },
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo seleccionar la clínica';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const showTabs = !changeToken && !clinics;
  const clinicUiRedesign = featuresFromUser(pendingUser?.features).uiRedesign;

  if (clinics && clinicUiRedesign) {
    return (
      <SelectClinicPage
        clinics={clinics}
        userName={pendingUser?.fullName ?? ''}
        userId={pendingUser?.id}
        loading={loading}
        error={error}
        onSelect={(id) => void onSelectClinic(id)}
        onBack={() => {
          setClinics(null);
          setPreauthToken(null);
          setPendingUser(null);
          setError('');
        }}
      />
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-end justify-center bg-[#eef1f4] p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-white px-7 pb-8 pt-9 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:rounded-[28px] sm:px-9 sm:pb-9 sm:pt-10">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-clinic-deep text-lg font-bold text-white">
            N
          </div>
          <h1 className="font-display text-[28px] font-bold leading-none tracking-tight text-clinic-deep">
            NexusDent
          </h1>
          <p className="mt-2 text-[13px] text-slate-500">
            {changeToken
              ? 'Cambiá tu contraseña temporal'
              : clinics
                ? 'Seleccione la clínica'
                : 'Acceso al sistema de gestión clínica'}
          </p>
        </div>

        {showTabs && (
          <div className="mb-7 flex items-end justify-between gap-1 border-b border-slate-200">
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setError('');
                  }}
                  className={clsx(
                    '-mb-px flex-1 border-b-2 pb-2.5 text-center text-[12px] font-medium transition sm:text-[13px]',
                    active
                      ? 'border-[#0f766e] text-[#0f766e]'
                      : 'border-transparent text-slate-400 hover:text-slate-600',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}

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
            <Button type="submit" className="w-full rounded-xl py-3" disabled={loading}>
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
                setPendingUser(null);
              }}
            >
              Volver al login
            </button>
          </div>
        ) : tab === 'staff' ? (
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
            <div className="block space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wide text-clinic-slate"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-clinic-ink placeholder:text-slate-400 focus:border-clinic-deep focus:outline-none focus:ring-2 focus:ring-clinic-deep/20"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0f766e] accent-[#0f766e]"
              />
              Recordarme
            </label>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full rounded-xl py-3 text-[15px]"
              disabled={loading}
            >
              {loading ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>

            <p className="flex items-center justify-center gap-1.5 pt-0.5 text-[11px] text-slate-400">
              <Lock className="h-3 w-3" strokeWidth={2.2} />
              Conexión segura SSL
            </p>

            <div className="text-center">
              <Link
                to="/forgot-password"
                className="text-[13px] font-medium text-accent hover:text-accent-hover"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>
        ) : (
          <ComingSoonTab tab={tab} />
        )}

        {showTabs && (
          <p className="mt-5 text-center text-[13px] text-slate-500">
            ¿No tienes clínica?{' '}
            <button
              type="button"
              onClick={() => {
                setShowRegister(true);
                navigate('/register');
              }}
              className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover"
            >
              Crear cuenta
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function ComingSoonTab({ tab }: { tab: Exclude<LoginTab, 'staff'> }) {
  const copy =
    tab === 'patient'
      ? {
          title: 'Acceso de pacientes',
          body: 'En el siguiente paso habilitamos el ingreso del paciente regular a su historial y citas.',
        }
      : {
          title: 'Alta de paciente',
          body: 'En el siguiente paso el paciente nuevo podrá registrarse desde aquí. El alta de clínicas en demo de 20 días va aparte.',
        };

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-clinic-ink">{copy.title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
        {copy.body}
      </p>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-[#0f766e]">
        Próximamente
      </p>
    </div>
  );
}
