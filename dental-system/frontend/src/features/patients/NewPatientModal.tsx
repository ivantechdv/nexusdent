import { FormEvent, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { BirthDateInput } from '@/components/BirthDateInput';
import { WhatsAppPhoneInput } from '@/components/WhatsAppPhoneInput';
import { Modal } from '@/components/Modal';
import { normalizePhoneForStorage } from '@/lib/contact';
import type { UpsertPatient } from '@/services/patients.api';

interface NewPatientModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: UpsertPatient) => Promise<void> | void;
  submitting?: boolean;
  initialDocument?: string;
}

export function NewPatientModal({
  open,
  onClose,
  onCreate,
  submitting,
  initialDocument = '',
}: NewPatientModalProps) {
  const [documentId, setDocumentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [hasConditions, setHasConditions] = useState(false);
  const [medicalConditions, setMedicalConditions] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDocumentId(initialDocument);
    setFullName('');
    setBirthDate('');
    setPhone('');
    setEmail('');
    setHasConditions(false);
    setMedicalConditions('');
    setError('');
  }, [open, initialDocument]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!documentId.trim() || !fullName.trim() || !birthDate) {
      setError('Documento, nombre y fecha de nacimiento son obligatorios');
      return;
    }
    await onCreate({
      documentId: documentId.trim(),
      fullName: fullName.trim(),
      birthDate,
      phone: normalizePhoneForStorage(phone),
      email: email.trim() || null,
      medicalConditions: hasConditions ? medicalConditions.trim() || null : null,
    });
  }

  return (
    <Modal
      open={open}
      size="lg"
      title="Nuevo paciente"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-patient-form"
            disabled={submitting}
          >
            {submitting ? 'Creando…' : 'Crear y atender'}
          </Button>
        </>
      }
    >
      <form id="new-patient-form" className="space-y-5" onSubmit={submit}>
        <div className="flex items-start gap-3 rounded-xl bg-gradient-to-r from-clinic-deep to-clinic-ink px-4 py-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">Alta rápida</p>
            <p className="text-sm text-blue-100">
              Lo mínimo para atender ahora. Puede completar la ficha después.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            id="np-doc"
            label="Documento"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="Cédula / DNI"
            required
            autoFocus
          />
          <Input
            id="np-name"
            label="Nombre completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <BirthDateInput
            id="np-birth"
            value={birthDate}
            onChange={setBirthDate}
            required
          />
          <WhatsAppPhoneInput
            id="np-phone"
            value={phone}
            onChange={setPhone}
          />
          <div className="sm:col-span-2">
            <Input
              id="np-email"
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="paciente@correo.com"
              tip="Servirá para enviar notificaciones por correo (citas, recordatorios, etc.)."
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-clinic-ink">
            <input
              type="checkbox"
              checked={hasConditions}
              onChange={(e) => {
                setHasConditions(e.target.checked);
                if (!e.target.checked) setMedicalConditions('');
              }}
            />
            ¿Padece alguna enfermedad o alergia?
          </label>
          {hasConditions && (
            <div>
              <Input
                id="np-conditions"
                label="Detalle (separado por comas)"
                value={medicalConditions}
                onChange={(e) => setMedicalConditions(e.target.value)}
                placeholder="Ej: hipertensión, polvo, claustrofobia, penicilina"
                autoFocus
              />
              <p className="mt-1 text-xs text-clinic-slate">
                Escribí cada una separada por coma.
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
