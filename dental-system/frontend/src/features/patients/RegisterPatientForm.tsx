import { FormEvent, useEffect, useState } from 'react';
import {
  Check,
  FolderOpen,
  Mail,
  ShieldAlert,
  Users,
  UserRound,
} from 'lucide-react';
import clsx from 'clsx';
import { Input } from '@/components/Input';
import { BirthDateInput } from '@/components/BirthDateInput';
import { WhatsAppPhoneInput } from '@/components/WhatsAppPhoneInput';
import { normalizePhoneForStorage } from '@/lib/contact';
import type { UpsertPatient } from '@/services/patients.api';

const BLOOD_TYPES = [
  { value: 'O+', label: 'O Positivo' },
  { value: 'O-', label: 'O Negativo' },
  { value: 'A+', label: 'A Positivo' },
  { value: 'A-', label: 'A Negativo' },
  { value: 'B+', label: 'B Positivo' },
  { value: 'B-', label: 'B Negativo' },
  { value: 'AB+', label: 'AB Positivo' },
  { value: 'AB-', label: 'AB Negativo' },
  { value: 'Desconocido', label: 'Desconocido' },
];

const ALERT_OPTIONS = [
  { id: 'penicillin', label: 'Alergia a penicilina' },
  { id: 'latex', label: 'Sensibilidad al látex' },
  { id: 'hypertension', label: 'Hipertensión' },
  { id: 'asthma', label: 'Asma' },
] as const;

const CONDITION_OPTIONS = [
  { id: 'diabetes', label: 'Diabetes' },
  { id: 'coagulation', label: 'Trastornos de coagulación' },
  { id: 'cardio', label: 'Enfermedad cardiovascular' },
  { id: 'pregnant', label: 'Embarazo actual' },
] as const;

type AlertId = (typeof ALERT_OPTIONS)[number]['id'];
type ConditionId = (typeof CONDITION_OPTIONS)[number]['id'];

export type RegisterPatientFormState = {
  fullName: string;
  documentId: string;
  birthDate: string;
  gender: string;
  bloodType: string;
  occupation: string;
  alerts: Record<AlertId, boolean>;
  conditions: Record<ConditionId, boolean>;
  otherAllergies: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  insurer: string;
  policyNumber: string;
  groupNumber: string;
  policyHolder: string;
  emergencyContact: string;
  emergencyRelation: string;
  emergencyPhone: string;
};

const emptyAlerts = (): Record<AlertId, boolean> => ({
  penicillin: false,
  latex: false,
  hypertension: false,
  asthma: false,
});

const emptyConditions = (): Record<ConditionId, boolean> => ({
  diabetes: false,
  coagulation: false,
  cardio: false,
  pregnant: false,
});

export function emptyRegisterPatientForm(
  initialDocument = '',
): RegisterPatientFormState {
  return {
    fullName: '',
    documentId: initialDocument,
    birthDate: '',
    gender: '',
    bloodType: '',
    occupation: '',
    alerts: emptyAlerts(),
    conditions: emptyConditions(),
    otherAllergies: '',
    phone: '',
    email: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    insurer: '',
    policyNumber: '',
    groupNumber: '',
    policyHolder: '',
    emergencyContact: '',
    emergencyRelation: '',
    emergencyPhone: '',
  };
}

export function registerFormToUpsert(
  form: RegisterPatientFormState,
): UpsertPatient {
  const addressParts = [
    form.street.trim(),
    form.city.trim(),
    form.state.trim(),
    form.postalCode.trim(),
  ].filter(Boolean);
  const address = addressParts.length ? addressParts.join(', ') : null;

  const conditionTags: string[] = [];
  if (form.alerts.latex) conditionTags.push('Sensibilidad al látex');
  if (form.alerts.asthma) conditionTags.push('Asma');
  if (form.conditions.cardio) conditionTags.push('Enfermedad cardiovascular');
  if (form.otherAllergies.trim()) conditionTags.push(form.otherAllergies.trim());

  const noteLines: string[] = [];
  if (form.bloodType) noteLines.push(`Tipo de sangre: ${form.bloodType}`);
  if (form.occupation.trim()) {
    noteLines.push(`Ocupación: ${form.occupation.trim()}`);
  }
  if (form.insurer.trim() || form.policyNumber.trim() || form.groupNumber.trim()) {
    noteLines.push(
      [
        form.insurer.trim() && `Aseguradora: ${form.insurer.trim()}`,
        form.policyNumber.trim() && `Póliza: ${form.policyNumber.trim()}`,
        form.groupNumber.trim() && `Grupo: ${form.groupNumber.trim()}`,
        form.policyHolder.trim() && `Titular: ${form.policyHolder.trim()}`,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  }

  const emergencyName = form.emergencyContact.trim();
  const relation = form.emergencyRelation.trim();
  const emergencyContact = emergencyName
    ? relation
      ? `${emergencyName} (${relation})`
      : emergencyName
    : null;

  return {
    documentId: form.documentId.trim(),
    fullName: form.fullName.trim(),
    birthDate: form.birthDate,
    gender: form.gender || 'UNSPECIFIED',
    phone: normalizePhoneForStorage(form.phone),
    email: form.email.trim() || null,
    address,
    emergencyContact,
    emergencyPhone: normalizePhoneForStorage(form.emergencyPhone),
    allergyPenicillin: form.alerts.penicillin,
    allergyAnesthesia: false,
    hasHypertension: form.alerts.hypertension,
    hasDiabetes: form.conditions.diabetes,
    coagulationIssues: form.conditions.coagulation,
    isPregnant: form.conditions.pregnant,
    medicalConditions: conditionTags.length ? conditionTags.join(', ') : null,
    anamnesisNotes: noteLines.length ? noteLines.join('\n') : null,
  };
}

const fieldSelect =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-clinic-ink focus:border-clinic-deep focus:outline-none focus:ring-2 focus:ring-clinic-deep/20';

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-clinic-ink">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

interface RegisterPatientFormProps {
  formId: string;
  initialDocument?: string;
  onSubmit: (payload: UpsertPatient) => Promise<void> | void;
  submitting?: boolean;
}

export function RegisterPatientForm({
  formId,
  initialDocument = '',
  onSubmit,
}: RegisterPatientFormProps) {
  const [form, setForm] = useState(() =>
    emptyRegisterPatientForm(initialDocument),
  );
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(emptyRegisterPatientForm(initialDocument));
    setError('');
  }, [initialDocument, formId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim() || !form.documentId.trim() || !form.birthDate) {
      setError('Nombre, cédula y fecha de nacimiento son obligatorios');
      return;
    }
    if (!form.gender) {
      setError('Seleccioná el sexo');
      return;
    }
    if (!form.phone.trim()) {
      setError('El teléfono es obligatorio');
      return;
    }
    if (!form.email.trim()) {
      setError('El correo electrónico es obligatorio');
      return;
    }
    if (!form.emergencyContact.trim() || !form.emergencyPhone.trim()) {
      setError('Completá el contacto de emergencia (nombre y teléfono)');
      return;
    }
    if (!form.emergencyRelation.trim()) {
      setError('Indicá el parentesco del contacto de emergencia');
      return;
    }
    await onSubmit(registerFormToUpsert(form));
  }

  return (
    <form
      id={formId}
      className="space-y-4"
      onSubmit={(e) => void handleSubmit(e)}
    >
      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        {/* Columna izquierda ~65% */}
        <div className="space-y-4 xl:col-span-7 2xl:col-span-8">
          <SectionCard icon={UserRound} title="Datos personales">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id={`${formId}-name`}
                label="Nombre completo"
                placeholder="Ej. Juan Pérez"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                autoFocus
              />
              <Input
                id={`${formId}-doc`}
                label="Cédula de identidad"
                placeholder="Ej. V-12345678"
                value={form.documentId}
                onChange={(e) =>
                  setForm({ ...form, documentId: e.target.value })
                }
                required
              />
              <BirthDateInput
                id={`${formId}-birth`}
                label="Fecha de nacimiento"
                value={form.birthDate}
                onChange={(birthDate) => setForm({ ...form, birthDate })}
                required
              />
              <div className="block space-y-1.5">
                <label
                  htmlFor={`${formId}-gender`}
                  className="text-xs font-semibold uppercase tracking-wide text-clinic-slate"
                >
                  Sexo *
                </label>
                <select
                  id={`${formId}-gender`}
                  className={fieldSelect}
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  required
                >
                  <option value="">Seleccionar</option>
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
              <div className="block space-y-1.5">
                <label
                  htmlFor={`${formId}-blood`}
                  className="text-xs font-semibold uppercase tracking-wide text-clinic-slate"
                >
                  Tipo de sangre
                </label>
                <select
                  id={`${formId}-blood`}
                  className={fieldSelect}
                  value={form.bloodType}
                  onChange={(e) =>
                    setForm({ ...form, bloodType: e.target.value })
                  }
                >
                  <option value="">Seleccionar</option>
                  {BLOOD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                id={`${formId}-occupation`}
                label="Ocupación"
                placeholder="Ej. Ingeniero, comerciante…"
                value={form.occupation}
                onChange={(e) =>
                  setForm({ ...form, occupation: e.target.value })
                }
              />
            </div>
          </SectionCard>

          <SectionCard icon={Mail} title="Información de contacto">
            <div className="grid gap-3 sm:grid-cols-2">
              <WhatsAppPhoneInput
                id={`${formId}-phone`}
                label="Teléfono *"
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
              />
              <Input
                id={`${formId}-email`}
                label="Correo electrónico"
                type="email"
                placeholder="nombre@ejemplo.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
              <div className="sm:col-span-2">
                <Input
                  id={`${formId}-street`}
                  label="Dirección"
                  placeholder="Calle, apartamento, suite…"
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                />
              </div>
              <Input
                id={`${formId}-city`}
                label="Ciudad"
                placeholder="Caracas"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Input
                id={`${formId}-state`}
                label="Estado / provincia"
                placeholder="Miranda"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
              <Input
                id={`${formId}-zip`}
                label="Código postal"
                value={form.postalCode}
                onChange={(e) =>
                  setForm({ ...form, postalCode: e.target.value })
                }
                className="sm:col-span-2 lg:col-span-1"
              />
            </div>
          </SectionCard>

          <SectionCard icon={Users} title="Contacto de emergencia">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id={`${formId}-em-name`}
                label="Nombre de contacto"
                placeholder="Ej. María García"
                value={form.emergencyContact}
                onChange={(e) =>
                  setForm({ ...form, emergencyContact: e.target.value })
                }
                required
              />
              <Input
                id={`${formId}-em-rel`}
                label="Parentesco"
                placeholder="Ej. Cónyuge, padre/madre"
                value={form.emergencyRelation}
                onChange={(e) =>
                  setForm({ ...form, emergencyRelation: e.target.value })
                }
                required
              />
              <div className="sm:col-span-2">
                <WhatsAppPhoneInput
                  id={`${formId}-em-phone`}
                  label="Teléfono de emergencia *"
                  value={form.emergencyPhone}
                  onChange={(emergencyPhone) =>
                    setForm({ ...form, emergencyPhone })
                  }
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Columna derecha ~35% */}
        <div className="space-y-4 xl:col-span-5 2xl:col-span-4">
          <SectionCard icon={ShieldAlert} title="Alertas médicas y condiciones">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                  Alertas activas
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALERT_OPTIONS.map((opt) => {
                    const on = form.alerts[opt.id];
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            alerts: { ...form.alerts, [opt.id]: !on },
                          })
                        }
                        className={clsx(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                          on
                            ? 'bg-red-100 text-red-800 ring-1 ring-red-200'
                            : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-150',
                        )}
                      >
                        {opt.label}
                        {on && <span className="text-red-500">×</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                  Condiciones preexistentes
                </p>
                <ul className="space-y-2">
                  {CONDITION_OPTIONS.map((opt) => {
                    const on = form.conditions[opt.id];
                    return (
                      <li key={opt.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-clinic-ink">
                          <span
                            className={clsx(
                              'flex h-4 w-4 items-center justify-center rounded border',
                              on
                                ? 'border-teal-600 bg-teal-600 text-white'
                                : 'border-slate-300 bg-white',
                            )}
                          >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                conditions: {
                                  ...form.conditions,
                                  [opt.id]: e.target.checked,
                                },
                              })
                            }
                          />
                          {opt.label}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <Input
                id={`${formId}-other-allergies`}
                label="Otras alergias / notas"
                placeholder="Ej. Maní, medicamentos de sulfas"
                value={form.otherAllergies}
                onChange={(e) =>
                  setForm({ ...form, otherAllergies: e.target.value })
                }
              />
            </div>
          </SectionCard>

          <SectionCard icon={FolderOpen} title="Seguro médico">
            <div className="space-y-3">
              <Input
                id={`${formId}-insurer`}
                label="Aseguradora"
                placeholder="Ej. Seguros Caracas"
                value={form.insurer}
                onChange={(e) => setForm({ ...form, insurer: e.target.value })}
              />
              <Input
                id={`${formId}-policy`}
                label="Número de póliza"
                placeholder="Ej. POL-90823901"
                value={form.policyNumber}
                onChange={(e) =>
                  setForm({ ...form, policyNumber: e.target.value })
                }
              />
              <Input
                id={`${formId}-group`}
                label="Número de grupo"
                placeholder="Ej. GR-20391-B"
                value={form.groupNumber}
                onChange={(e) =>
                  setForm({ ...form, groupNumber: e.target.value })
                }
              />
              <Input
                id={`${formId}-holder`}
                label="Nombre del titular"
                placeholder="Dejar en blanco si es el mismo"
                value={form.policyHolder}
                onChange={(e) =>
                  setForm({ ...form, policyHolder: e.target.value })
                }
              />
            </div>
          </SectionCard>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
