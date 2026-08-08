import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { resetPasswordApi } from '@/services/auth.api';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get('token')?.trim() ?? '', [params]);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Enlace inválido. Pedí uno nuevo desde el login.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      await resetPasswordApi(token, password);
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo restablecer la contraseña';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-end justify-center bg-gradient-to-b from-clinic-deep/10 to-clinic-surface p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl border border-slate-200/80 bg-white p-6 shadow-panel sm:rounded-2xl sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-clinic-ink">
            Nueva contraseña
          </h1>
          <p className="mt-1 text-sm text-clinic-slate">
            Definí una clave nueva para tu cuenta
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="pass"
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            id="pass2"
            label="Repetir contraseña"
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
          />
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading || !token}>
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
          <Link
            to="/forgot-password"
            className="block text-center text-sm text-clinic-slate hover:underline"
          >
            Pedir otro enlace
          </Link>
        </form>
      </div>
    </div>
  );
}
