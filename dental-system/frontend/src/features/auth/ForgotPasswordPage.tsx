import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { forgotPasswordApi } from '@/services/auth.api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPasswordApi(email.trim());
      setDone(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo enviar el correo';
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
            Olvidé mi contraseña
          </h1>
          <p className="mt-1 text-sm text-clinic-slate">
            Te enviamos un enlace si el email está registrado
          </p>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Si el email está en el sistema, vas a recibir un correo con el
              enlace (válido 1 hora). Revisá spam si no aparece.
            </p>
            <Link
              to="/login"
              className="block text-center text-sm font-medium text-clinic-deep hover:underline"
            >
              Volver al login
            </Link>
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
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </Button>
            <Link
              to="/login"
              className="block text-center text-sm text-clinic-slate hover:underline"
            >
              Volver al login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
