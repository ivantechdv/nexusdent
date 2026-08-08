import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Mail, Plus, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { BirthDateInput } from '@/components/BirthDateInput';
import { WhatsAppPhoneInput } from '@/components/WhatsAppPhoneInput';
import { Modal } from '@/components/Modal';
import {
  createPatientApi,
  listPatientsApi,
  type UpsertPatient,
} from '@/services/patients.api';
import {
  formatWhatsAppPhoneInput,
  mailtoHref,
  normalizePhoneForStorage,
  patientWhatsAppMessage,
  whatsappHref,
} from '@/lib/contact';
import { useAuthStore } from '@/stores/auth.store';

const emptyForm: UpsertPatient = {
  documentId: '',
  fullName: '',
  birthDate: '',
  gender: 'UNSPECIFIED',
  phone: '',
  email: '',
  emergencyContact: '',
  emergencyPhone: '',
  isPregnant: false,
  anamnesisNotes: '',
  medicalConditions: '',
};

function PhoneLink({
  phone,
  patientName,
}: {
  phone: string;
  patientName: string;
}) {
  const clinicName = useAuthStore((s) => s.user?.clinicName);
  const href = whatsappHref(
    phone,
    patientWhatsAppMessage(patientName, clinicName),
  );
  if (!href) return <span>{phone}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-emerald-700 hover:underline"
      title="Abrir WhatsApp"
      onClick={(e) => e.stopPropagation()}
    >
      {phone}
    </a>
  );
}

function EmailLink({ email }: { email: string }) {
  const href = mailtoHref(email);
  if (!href) return <span>{email}</span>;
  return (
    <a
      href={href}
      className="font-medium text-clinic-deep hover:underline"
      title="Enviar email"
      onClick={(e) => e.stopPropagation()}
    >
      {email}
    </a>
  );
}

export function PatientsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UpsertPatient>(emptyForm);
  const [error, setError] = useState('');

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients', search],
    queryFn: () => listPatientsApi(search || undefined),
  });

  const createMut = useMutation({
    mutationFn: createPatientApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: () => setError('No se pudo crear el paciente (¿documento duplicado?)'),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.documentId.trim() || !form.fullName.trim() || !form.birthDate) {
      setError('Documento, nombre y fecha de nacimiento son obligatorios');
      return;
    }
    createMut.mutate({
      ...form,
      phone: normalizePhoneForStorage(form.phone ?? '') ?? '',
      emergencyPhone:
        normalizePhoneForStorage(form.emergencyPhone ?? '') ?? '',
      email: form.email?.trim() || '',
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:space-y-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
            Pacientes
          </h1>
          <p className="text-sm text-clinic-slate">
            Registro, búsqueda y ficha clínica
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Nuevo paciente
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            id="patient-search"
            placeholder="Nombre, documento o teléfono…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" className="shrink-0">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Buscar</span>
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-clinic-slate">Cargando pacientes…</p>
      ) : patients.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <UserRound className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-clinic-slate">No hay pacientes</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {patients.map((p) => (
              <li key={p.id} className="panel p-3.5">
                <Link to={`/patients/${p.id}`} className="block active:opacity-90">
                  <p className="font-medium text-clinic-ink">{p.fullName}</p>
                  <p className="mt-1 text-xs text-clinic-slate">
                    Doc. {p.documentId}
                  </p>
                </Link>
                <div className="mt-2 flex flex-col gap-1 text-xs">
                  {p.phone && (
                    <PhoneLink phone={p.phone} patientName={p.fullName} />
                  )}
                  {p.email && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0 text-clinic-slate" />
                      <EmailLink email={p.email} />
                    </span>
                  )}
                </div>
                <Link
                  to={`/patients/${p.id}`}
                  className="mt-2 inline-block text-xs font-semibold text-clinic-deep"
                >
                  Abrir ficha →
                </Link>
              </li>
            ))}
          </ul>

          <div className="panel hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-clinic-slate">
                <tr>
                  <th className="px-4 py-3 font-semibold">Paciente</th>
                  <th className="px-4 py-3 font-semibold">Documento</th>
                  <th className="px-4 py-3 font-semibold">Teléfono</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-clinic-ink">
                      {p.fullName}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-clinic-slate">
                      {p.documentId}
                    </td>
                    <td className="px-4 py-3">
                      {p.phone ? (
                        <PhoneLink phone={p.phone} patientName={p.fullName} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3">
                      {p.email ? <EmailLink email={p.email} /> : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/patients/${p.id}`}
                        className="font-semibold text-clinic-deep hover:underline"
                      >
                        Abrir ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo paciente"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="patients-new-form"
              disabled={createMut.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="patients-new-form" className="space-y-3" onSubmit={onCreate}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="doc"
              label="Documento"
              value={form.documentId}
              onChange={(e) => setForm({ ...form, documentId: e.target.value })}
              required
            />
            <Input
              id="name"
              label="Nombre completo"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
            <BirthDateInput
              id="birth"
              value={form.birthDate}
              onChange={(birthDate) => setForm({ ...form, birthDate })}
              required
            />
            <WhatsAppPhoneInput
              id="phone"
              value={
                form.phone
                  ? formatWhatsAppPhoneInput(String(form.phone))
                  : ''
              }
              onChange={(phone) => setForm({ ...form, phone })}
            />
            <Input
              id="email"
              label="Email"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              tip="Servirá para enviar notificaciones por correo (citas, recordatorios, etc.)."
            />
            <Input
              id="emerg"
              label="Contacto emergencia"
              value={form.emergencyContact ?? ''}
              onChange={(e) =>
                setForm({ ...form, emergencyContact: e.target.value })
              }
            />
            <WhatsAppPhoneInput
              id="emerg-phone"
              label="WhatsApp emergencia"
              value={
                form.emergencyPhone
                  ? formatWhatsAppPhoneInput(String(form.emergencyPhone))
                  : ''
              }
              onChange={(emergencyPhone) =>
                setForm({ ...form, emergencyPhone })
              }
            />
          </div>

          <div className="space-y-2">
            <Input
              id="conditions"
              label="Enfermedades / alergias (separadas por coma)"
              value={form.medicalConditions ?? ''}
              onChange={(e) =>
                setForm({ ...form, medicalConditions: e.target.value })
              }
              placeholder="Ej: hipertensión, polvo, penicilina"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.isPregnant)}
                onChange={(e) =>
                  setForm({ ...form, isPregnant: e.target.checked })
                }
              />
              Embarazo
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </Modal>
    </div>
  );
}
