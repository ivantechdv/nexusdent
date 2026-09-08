import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';

const SPECIALTIES = [
  'Odontología general',
  'Ortodoncia',
  'Endodoncia',
  'Periodoncia',
  'Cirugía oral',
  'Odontopediatría',
  'Implantología',
  'Prótesis',
  'Estética dental',
];

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-clinic-ink placeholder:text-slate-400 focus:border-clinic-deep focus:outline-none focus:ring-2 focus:ring-clinic-deep/20';

export function RegisterClinicPage() {
  const [clinicName, setClinicName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!specialty) {
      setError('Seleccioná una especialidad');
      return;
    }
    setNotice(
      'El alta de clínica (demo 20 días) se conecta en el siguiente paso.',
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-end justify-center bg-[#eef1f4] p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-[440px] rounded-t-3xl bg-white px-7 pb-7 pt-9 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:rounded-[28px] sm:px-9 sm:pb-8 sm:pt-10">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-clinic-deep text-lg font-bold text-white">
            N
          </div>
          <h1 className="font-display text-[28px] font-bold leading-none tracking-tight text-clinic-deep">
            NexusDent
          </h1>
          <p className="mt-2 text-[13px] text-slate-500">
            Crear cuenta de clínica
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="clinic-name"
            label="Nombre de la clínica"
            placeholder="Clínica Dental DentalCare"
            autoComplete="organization"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            required
          />
          <Input
            id="admin-name"
            label="Nombre del doctor / admin"
            placeholder="Dr. Alejandro Martínez"
            autoComplete="name"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            required
          />
          <Input
            id="register-email"
            label="Email"
            type="email"
            placeholder="ejemplo@nexusdent.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="register-password"
              label="Contraseña"
              type="password"
              placeholder="Mín. 8 caracteres"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              id="register-password2"
              label="Confirmar contraseña"
              type="password"
              placeholder="Repite la contraseña"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
            />
          </div>

          <div className="block space-y-1.5">
            <label
              htmlFor="specialty"
              className="text-xs font-semibold uppercase tracking-wide text-clinic-slate"
            >
              Especialidad principal
            </label>
            <select
              id="specialty"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              required
              className={fieldClass}
            >
              <option value="" disabled>
                Selecciona una especialidad
              </option>
              {SPECIALTIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {notice}
            </p>
          )}

          <Button type="submit" className="w-full rounded-xl py-3 text-[15px]">
            Crear Cuenta
          </Button>
        </form>

        <p className="mt-5 text-center text-[13px] text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link
            to="/login"
            className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover"
          >
            Iniciar sesión
          </Link>
        </p>

        <p className="mt-6 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-400">
          NexusDent v2.4 · Gestión Dental Avanzada
        </p>
      </div>
    </div>
  );
}
