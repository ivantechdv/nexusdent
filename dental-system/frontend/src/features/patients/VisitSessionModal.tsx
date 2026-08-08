import { useRef } from 'react';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import type { CompleteVisitPayload } from '@/services/visits.api';
import { VisitSessionForm } from './VisitSessionForm';

interface VisitSessionModalProps {
  open: boolean;
  patientId: string;
  patientName: string;
  onClose: () => void;
  onSubmit: (payload: CompleteVisitPayload) => Promise<void> | void;
  submitting?: boolean;
}

export function VisitSessionModal({
  open,
  patientId,
  patientName,
  onClose,
  onSubmit,
  submitting,
}: VisitSessionModalProps) {
  const saveActionRef = useRef<(() => void) | null>(null);

  return (
    <Modal
      open={open}
      size="lg"
      title="Registrar atención de hoy"
      onClose={onClose}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => saveActionRef.current?.()}
          >
            {submitting ? 'Guardando…' : 'Cerrar atención'}
          </Button>
        </>
      }
    >
      {open && (
        <VisitSessionForm
          patientId={patientId}
          patientName={patientName}
          submitting={submitting}
          resetKey={String(open)}
          hideActions
          saveActionRef={saveActionRef}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Modal>
  );
}
