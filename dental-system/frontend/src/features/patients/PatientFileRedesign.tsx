import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ChevronRight,
  ClipboardList,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  Shield,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/Button';
import { MoneyAmount } from '@/components/MoneyAmount';
import { useAuthStore } from '@/stores/auth.store';
import { mailtoHref, patientWhatsAppMessage, whatsappHref } from '@/lib/contact';
import { printMedicalHistory } from '@/lib/printMedicalHistory';
import { getClinicSettingsApi } from '@/services/clinic-settings.api';
import { listPrintFormatsApi } from '@/services/print-templates.api';
import { listPatientRadiographsApi } from '@/services/patient-gallery.api';
import { toast } from '@/stores/toast.store';
import type { PatientFileProps } from './PatientFile';
import {
  ageYears,
  formatBirthDate,
  formatDocument,
  formatGender,
  parseAddress,
  parseAnamnesisNotes,
  parseEmergencyContact,
  patientAlertTags,
  patientInitials,
  splitFullName,
} from './patientFile.helpers';
import { usePatientPaymentModal } from './usePatientPaymentModal';
import { PatientGalleryRedesign } from './PatientGalleryRedesign';
import { PatientRadiographsRedesign } from './PatientRadiographsRedesign';
import { PatientAnamnesisRedesign } from './PatientAnamnesisRedesign';
import { PatientAccountStatementRedesign } from './PatientAccountStatementRedesign';
import { PatientClinicalNotesRedesign } from './PatientClinicalNotesRedesign';
import { PatientBudgetsPanel } from './PatientBudgetsPanel';
import { listClinicalNotesApi } from '@/services/patient-notes.api';

const TABS = [
  { id: 'general', label: 'Datos Generales' },
  { id: 'anamnesis', label: 'Anamnesis' },
  { id: 'evolution', label: 'Evolución' },
  { id: 'notes', label: 'Notas Clínicas' },
  { id: 'gallery', label: 'Galería Clínica' },
  { id: 'radiographs', label: 'Radiografías' },
  { id: 'payments', label: 'Estado de Cuenta' },
  { id: 'budgets', label: 'Presupuestos' },
  { id: 'consents', label: 'Consentimientos' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2.5 text-[15px] font-semibold text-slate-800">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#2b7a78]">
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 p-8 text-center">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-xs text-slate-400">Próximamente en esta vista</p>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function PatientFileRedesign({
  patient,
  balance,
  odontogramStates,
  evolutions,
  onOdontogramChange: _onOdontogramChange,
  onRegisterPayment,
  onEditEvolution: _onEditEvolution,
  onDeleteEvolution: _onDeleteEvolution,
  onOpenVisitSession,
  onOpenEvolutionSoap,
}: PatientFileProps) {
  const clinicName = useAuthStore((s) => s.user?.clinicName);
  const [tab, setTab] = useState<TabId>('general');

  const clinicQ = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: getClinicSettingsApi,
    staleTime: 60_000,
  });

  const radiographsQ = useQuery({
    queryKey: ['patient-radiographs', patient.id],
    queryFn: () => listPatientRadiographsApi(patient.id),
    staleTime: 30_000,
  });

  const notesQ = useQuery({
    queryKey: ['patient-notes', patient.id],
    queryFn: () => listClinicalNotesApi(patient.id),
    staleTime: 15_000,
  });

  const tabLabels = useMemo(() => {
    const rxCount = radiographsQ.data?.length ?? 0;
    const notesCount = notesQ.data?.length ?? 0;
    return TABS.map((t) => {
      if (t.id === 'radiographs' && rxCount > 0) {
        return { ...t, label: `Radiografías (${rxCount})` };
      }
      if (t.id === 'notes' && notesCount > 0) {
        return { ...t, label: `Notas Clínicas (${notesCount})` };
      }
      return t;
    });
  }, [radiographsQ.data?.length, notesQ.data?.length]);

  const { openPayModal, paymentModal } = usePatientPaymentModal(
    evolutions,
    onRegisterPayment,
  );

  const age = ageYears(patient.birthDate);
  const { firstName, lastName } = splitFullName(patient.fullName);
  const notes = parseAnamnesisNotes(patient.anamnesisNotes);
  const emergency = parseEmergencyContact(patient.emergencyContact);
  const location = parseAddress(patient.address);
  const alertTags = patientAlertTags(patient);

  async function handlePrintHistory() {
    try {
      const c = clinicQ.data;
      const formats = await listPrintFormatsApi('MEDICAL_HISTORY');
      const format = formats.find((f) => f.isDefault) ?? formats[0] ?? null;
      printMedicalHistory({
        patient: {
          fullName: patient.fullName,
          documentId: patient.documentId,
          birthDate: patient.birthDate,
          phone: patient.phone,
          address: patient.address,
          anamnesisNotes: patient.anamnesisNotes,
          medicalConditions: patient.medicalConditions,
          allergyAnesthesia: patient.allergyAnesthesia,
          allergyPenicillin: patient.allergyPenicillin,
          hasHypertension: patient.hasHypertension,
          hasDiabetes: patient.hasDiabetes,
          coagulationIssues: patient.coagulationIssues,
          isPregnant: patient.isPregnant,
        },
        evolutions,
        odontogramStates,
        clinic: {
          name: c?.name ?? clinicName ?? null,
          email: c?.email ?? null,
          whatsapp: c?.whatsapp ?? null,
          address: c?.address ?? null,
          logoUrl: c?.logoUrl ?? null,
        },
        format,
      });
    } catch {
      toast('No se pudo preparar la historia para imprimir', 'error');
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      {/* Breadcrumb + estado */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link
            to="/patients"
            className="font-medium transition hover:text-[#2b7a78]"
          >
            Pacientes
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <span className="font-medium text-slate-700">Información Personal</span>
        </nav>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Historial Activo
        </span>
      </div>

      {/* Tarjeta resumen paciente */}
      <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
              <div
                className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-teal-50 text-lg font-bold text-[#2b7a78] ring-2 ring-white sm:h-20 sm:w-20 sm:text-xl"
                aria-hidden
              >
                {patientInitials(patient.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
                  {patient.fullName}
                </h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
                  <span>Cédula: {formatDocument(patient.documentId)}</span>
                  {age != null && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span>Edad: {age} años</span>
                    </>
                  )}
                  <span className="text-slate-300">|</span>
                  <span>Género: {formatGender(patient.gender)}</span>
                </p>
                {alertTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {alertTags.map((tag) => (
                      <span
                        key={tag.key}
                        className={clsx(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                          tag.className,
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
              <div className="text-left lg:text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                  Saldo pendiente
                </p>
                <p className="font-display text-2xl font-bold tabular-nums text-red-600 sm:text-3xl">
                  <MoneyAmount usd={balance.balanceDue} showVes={false} />
                </p>
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                {patient.phone && (
                  <a
                    href={
                      whatsappHref(
                        patient.phone,
                        patientWhatsAppMessage(patient.fullName, clinicName),
                      ) ?? undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-medium text-emerald-700 hover:underline"
                  >
                    <WhatsAppIcon className="h-4 w-4 shrink-0" />
                    <span>{patient.phone}</span>
                  </a>
                )}
                {patient.email && (
                  <a
                    href={mailtoHref(patient.email) ?? undefined}
                    className="inline-flex items-center gap-2 font-medium text-slate-600 hover:text-[#2b7a78] hover:underline"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="break-all">{patient.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="border-slate-200 bg-white text-slate-700"
              onClick={() => toast('Edición de ficha próximamente', 'info')}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-slate-200 bg-white text-slate-700"
              onClick={() => void handlePrintHistory()}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="border-0 bg-[#2b7a78] hover:bg-[#236663]"
              onClick={openPayModal}
            >
              <Plus className="h-4 w-4" />
              Nuevo Pago
            </Button>
            <Button
              type="button"
              className="border-0 bg-[#2b7a78] hover:bg-[#236663]"
              onClick={onOpenEvolutionSoap ?? onOpenVisitSession}
            >
              <ClipboardList className="h-4 w-4" />
              Evolución SOAP
            </Button>
            <Button
              type="button"
              className="border-0 bg-orange-500 hover:bg-orange-600"
              onClick={onOpenVisitSession}
            >
              <Stethoscope className="h-4 w-4" />
              Nueva Atención
            </Button>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="mt-5 border-b border-slate-200">
        <div className="-mb-px flex gap-1 overflow-x-auto pb-px scrollbar-none">
          {tabLabels.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (t.id === 'evolution' && onOpenEvolutionSoap) {
                  onOpenEvolutionSoap();
                  return;
                }
                setTab(t.id);
              }}
              className={clsx(
                'shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition sm:px-4',
                tab === t.id
                  ? 'border-[#2b7a78] text-[#2b7a78]'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido por tab */}
      <div className="mt-5 min-h-0 flex-1 pb-6">
        {tab === 'general' && (
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <InfoCard icon={UserRound} title="Aseguradora & Convenio">
              <FieldGrid>
                <Field label="Nombre" value={firstName} />
                <Field label="Apellido" value={lastName} />
                <Field
                  label="Cédula"
                  value={formatDocument(patient.documentId)}
                />
                <Field
                  label="Fecha de Nacimiento"
                  value={formatBirthDate(patient.birthDate)}
                />
                <Field label="Género" value={formatGender(patient.gender)} />
                <Field label="Estado Civil" value={notes.maritalStatus} />
                <Field
                  label="Ocupación"
                  value={notes.occupation}
                  className="sm:col-span-2"
                />
              </FieldGrid>
            </InfoCard>

            <InfoCard icon={MapPin} title="Ubicación y Contacto">
              <FieldGrid>
                <Field label="Teléfono" value={patient.phone || '—'} />
                <Field label="Celular" value={patient.phone || '—'} />
                <Field
                  label="Correo Electrónico"
                  value={patient.email || '—'}
                  className="sm:col-span-2"
                />
                <Field
                  label="Dirección"
                  value={location.street}
                  className="sm:col-span-2"
                />
                <Field label="Ciudad" value={location.city} />
                <Field label="Estado" value={location.state} />
                <Field label="Referido por" value={notes.referredBy} />
              </FieldGrid>
            </InfoCard>

            <InfoCard icon={Phone} title="Contacto de Emergencia">
              <FieldGrid>
                <Field
                  label="Contacto de Emergencia"
                  value={emergency.name}
                  className="sm:col-span-2"
                />
                <Field label="Relación / Parentesco" value={emergency.relation} />
                <Field
                  label="Teléfono de Emergencia"
                  value={patient.emergencyPhone || '—'}
                />
              </FieldGrid>
            </InfoCard>

            <InfoCard icon={Shield} title={patient.fullName}>
              <FieldGrid>
                <Field label="Compañía Aseguradora" value={notes.insurer} />
                <Field label="Tipo de Plan / Cobertura" value={notes.plan} />
                <Field label="Nº de Póliza" value={notes.policyNumber} />
                <Field label="Vencimiento" value={notes.expiry} />
              </FieldGrid>
            </InfoCard>
          </div>
        )}

        {tab === 'anamnesis' && (
          <PatientAnamnesisRedesign patient={patient} />
        )}

        {tab === 'evolution' && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-[#2b7a78]" />
            <h3 className="mt-3 font-display text-lg font-bold text-slate-900">
              Evolución SOAP
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Registrá la consulta en la pantalla de Evolución SOAP (subjetivo,
              objetivo, análisis y plan) con historial y cobro.
            </p>
            <Button
              type="button"
              className="mt-5 border-0 bg-[#2b7a78] hover:bg-[#236663]"
              onClick={onOpenEvolutionSoap}
            >
              Abrir Evolución SOAP
            </Button>
          </div>
        )}

        {tab === 'notes' && (
          <PatientClinicalNotesRedesign patientId={patient.id} />
        )}

        {tab === 'gallery' && (
          <PatientGalleryRedesign patientId={patient.id} />
        )}

        {tab === 'radiographs' && (
          <PatientRadiographsRedesign patientId={patient.id} />
        )}

        {tab === 'payments' && (
          <PatientAccountStatementRedesign
            patientId={patient.id}
            patientName={patient.fullName}
            documentId={formatDocument(patient.documentId)}
            balance={balance}
            onRegisterPayment={openPayModal}
          />
        )}

        {tab === 'budgets' && (
          <PatientBudgetsPanel
            patientId={patient.id}
            patientName={patient.fullName}
          />
        )}

        {tab === 'consents' && (
          <TabPlaceholder label="Consentimientos informados" />
        )}
      </div>

      {paymentModal}
    </div>
  );
}
