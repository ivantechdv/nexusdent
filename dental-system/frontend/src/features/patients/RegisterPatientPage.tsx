import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Button } from '@/components/Button';
import { RegisterPatientForm } from '@/features/patients/RegisterPatientForm';
import { createPatientApi, type UpsertPatient } from '@/services/patients.api';
import { useFeatureFlag } from '@/lib/features';
import { toast } from '@/stores/toast.store';

export function RegisterPatientPage() {
  const uiRedesign = useFeatureFlag('uiRedesign');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search] = useSearchParams();
  const returnTo = search.get('return') || '/patients';
  const initialDocument = search.get('doc') || '';
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: createPatientApi,
    onSuccess: (patient) => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
      toast('Paciente registrado', 'success');
      if (returnTo === '/atencion') {
        navigate(`/atencion?patientId=${patient.id}`, { replace: true });
        return;
      }
      navigate(`/patients/${patient.id}`, { replace: true });
    },
    onError: () => {
      setError('No se pudo crear el paciente (¿documento duplicado?)');
    },
  });

  if (!uiRedesign) {
    return <Navigate to="/patients" replace />;
  }

  async function onSubmit(payload: UpsertPatient) {
    setError('');
    await createMut.mutateAsync(payload);
  }

  const backPath = returnTo.startsWith('/')
    ? returnTo.split('?')[0]
    : '/patients';

  return (
    <div className="w-full space-y-5 p-3 sm:p-5 lg:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="mb-1.5 flex items-center gap-1.5 text-xs text-clinic-slate">
            <Link to="/patients" className="hover:text-clinic-ink">
              Pacientes
            </Link>
            <span aria-hidden>›</span>
            <span className="font-medium text-clinic-ink">Registro</span>
          </nav>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-clinic-ink sm:text-[1.75rem]">
            Registrar nuevo paciente
          </h1>
        </div>
        <span className="inline-flex w-fit items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Sistema en línea
        </span>
      </header>

      <RegisterPatientForm
        formId="register-patient-page"
        initialDocument={initialDocument}
        submitting={createMut.isPending}
        onSubmit={onSubmit}
      />

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-clinic-slate">
          * Indica campo obligatorio para el registro clínico.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(backPath)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="register-patient-page"
            disabled={createMut.isPending}
            className="gap-2"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
            {createMut.isPending ? 'Guardando…' : 'Guardar paciente'}
          </Button>
        </div>
      </div>
    </div>
  );
}
