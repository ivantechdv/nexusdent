import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Stethoscope } from 'lucide-react';
import { Button } from '@/components/Button';
import { PatientFile } from '@/features/patients/PatientFile';
import { PatientFileRedesign } from '@/features/patients/PatientFileRedesign';
import { useFeatureFlag } from '@/lib/features';
import {
  deleteEvolutionApi,
  getOdontogramApi,
  listEvolutionsApi,
  upsertOdontogramApi,
} from '@/services/clinical.api';
import type { OdontogramStateItem } from '@/features/clinical-history/odontogram.types';
import {
  getPatientApi,
  getPatientBalanceApi,
  getPatientByDocumentApi,
} from '@/services/patients.api';
import { registerPaymentApi } from '@/services/billing.api';
import type { PatientFileProps } from '@/features/patients/PatientFile';
import { toast } from '@/stores/toast.store';

export function PatientFilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const uiRedesign = useFeatureFlag('uiRedesign');

  const patientQ = useQuery({
    queryKey: ['patient', id],
    queryFn: () => getPatientApi(id),
    enabled: Boolean(id),
  });

  const balanceQ = useQuery({
    queryKey: ['balance', id],
    queryFn: () => getPatientBalanceApi(id),
    enabled: Boolean(id),
  });

  const odontogramQ = useQuery({
    queryKey: ['odontogram', id],
    queryFn: () => getOdontogramApi(id),
    enabled: Boolean(id),
  });

  const evolutionsQ = useQuery({
    queryKey: ['evolutions', id],
    queryFn: () => listEvolutionsApi(id),
    enabled: Boolean(id),
  });

  const odontogramMut = useMutation({
    mutationFn: upsertOdontogramApi,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odontogram', id] }),
  });

  const paymentMut = useMutation({
    mutationFn: registerPaymentApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance', id] });
      qc.invalidateQueries({ queryKey: ['open-plan', id] });
      qc.invalidateQueries({ queryKey: ['plans', id] });
      qc.invalidateQueries({ queryKey: ['payments', id] });
      qc.invalidateQueries({ queryKey: ['evolutions', id] });
    },
  });

  const deleteEvoMut = useMutation({
    mutationFn: deleteEvolutionApi,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['evolutions', id] });
      void qc.invalidateQueries({ queryKey: ['balance', id] });
      void qc.invalidateQueries({ queryKey: ['open-plan', id] });
      void qc.invalidateQueries({ queryKey: ['plans', id] });
    },
  });

  if (patientQ.isLoading) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-sm text-clinic-slate">
        Cargando ficha…
      </div>
    );
  }

  if (patientQ.isError || !patientQ.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-6">
        <p className="text-sm text-red-600">Paciente no encontrado</p>
        <Button variant="secondary" onClick={() => navigate('/patients')}>
          Volver
        </Button>
      </div>
    );
  }

  const patient = patientQ.data;
  const balance = balanceQ.data ?? {
    totalBudgeted: 0,
    totalPaid: 0,
    balanceDue: 0,
  };

  const fileProps: PatientFileProps = {
    patient,
    balance,
    odontogramStates: odontogramQ.data ?? [],
    evolutions: evolutionsQ.data ?? [],
    onOpenVisitSession: () => navigate(`/atencion?patientId=${id}`),
    onOpenEvolutionSoap: () => navigate(`/evolucion?patientId=${id}`),
    onEditEvolution: (evolutionId) =>
      navigate(`/evolucion?patientId=${id}&evolutionId=${evolutionId}`),
    onOdontogramChange: (next: OdontogramStateItem) => {
      odontogramMut.mutate({
        patientId: id,
        toothNumber: next.toothNumber,
        surface: next.surface,
        condition: next.condition,
        status: next.status,
      });
    },
    onRegisterPayment: async ({
      treatmentPlanId,
      currencyPaid,
      exchangeRate,
      rateSource,
      notes,
      splits,
    }) => {
      await paymentMut.mutateAsync({
        patientId: id,
        treatmentPlanId,
        currencyPaid,
        exchangeRate,
        rateSource,
        notes,
        splits,
      });
      toast('Abono registrado', 'success');
    },
    onDeleteEvolution: async (evoId) => {
      await deleteEvoMut.mutateAsync(evoId);
    },
  };

  if (uiRedesign) {
    return <PatientFileRedesign {...fileProps} />;
  }

  return (
    <div>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6 sm:pt-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/patients')}
          className="self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Pacientes
        </Button>
        <Button
          onClick={() => navigate(`/atencion?patientId=${id}`)}
          className="w-full sm:w-auto"
        >
          <Stethoscope className="h-4 w-4" />
          Atención de hoy
        </Button>
      </div>

      <PatientFile
        {...fileProps}
        onSearchDocument={async (documentId) => {
          try {
            const found = await getPatientByDocumentApi(documentId);
            navigate(`/patients/${found.id}`);
          } catch {
            toast('No se encontró paciente con ese documento', 'error');
          }
        }}
      />
    </div>
  );
}
