import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Plus } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { listDentistsApi } from '@/services/auth.api';
import { listPatientsApi } from '@/services/patients.api';
import {
  createAppointmentApi,
  listAppointmentsApi,
  updateAppointmentApi,
  type Appointment,
  type AppointmentStatus,
} from '@/services/appointments.api';
import { toast, toastError } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  appointmentWhatsAppMessage,
  whatsappHref,
} from '@/lib/contact';
import { useFeatureFlag } from '@/lib/features';
import {
  AgendaCalendar,
  STATUS_LABEL,
} from './AgendaCalendar';
import { AppointmentsRedesign } from './AppointmentsRedesign';
import {
  type CalendarView,
  rangeForView,
  timeFromIso,
  todayYmd,
  ymdFromIso,
} from './calendarUtils';

export function AppointmentsPage() {
  const uiRedesign = useFeatureFlag('uiRedesign');
  if (uiRedesign) return <AppointmentsRedesign />;
  return <AppointmentsLegacy />;
}

function AppointmentsLegacy() {
  const qc = useQueryClient();
  const clinicName = useAuthStore((s) => s.user?.clinicName);
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState(todayYmd());
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [form, setForm] = useState({
    patientId: '',
    dentistId: '',
    date: todayYmd(),
    time: '10:00',
    durationMin: 30,
    reason: '',
  });
  const [edit, setEdit] = useState({
    date: todayYmd(),
    time: '10:00',
    durationMin: 30,
    reason: '',
    dentistId: '',
    status: 'CONFIRMED' as AppointmentStatus,
  });

  const range = useMemo(() => rangeForView(view, anchor), [view, anchor]);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments', view, range.from, range.to],
    queryFn: () => listAppointmentsApi(range),
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients', 'appt'],
    queryFn: () => listPatientsApi(),
    enabled: createOpen,
  });

  const { data: dentists = [] } = useQuery({
    queryKey: ['dentists'],
    queryFn: listDentistsApi,
    enabled: createOpen || Boolean(detail),
  });

  useEffect(() => {
    if (!detail) return;
    setEdit({
      date: ymdFromIso(detail.scheduledAt),
      time: timeFromIso(detail.scheduledAt),
      durationMin: detail.durationMin || 30,
      reason: detail.reason ?? '',
      dentistId: detail.dentistId,
      status: detail.status,
    });
  }, [detail]);

  const createMut = useMutation({
    mutationFn: createAppointmentApi,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setCreateOpen(false);
      setAnchor(ymdFromIso(created.scheduledAt));
      toast('Cita creada', 'success');
    },
    onError: (err) => toastError(err, 'No se pudo crear la cita'),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      scheduledAt?: string;
      durationMin?: number;
      reason?: string | null;
      dentistId?: string;
      status?: AppointmentStatus;
    }) => updateAppointmentApi(id, payload),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setDetail(updated);
      setAnchor(ymdFromIso(updated.scheduledAt));
      toast('Cita actualizada', 'success');
    },
    onError: (err) => toastError(err, 'No se pudo actualizar la cita'),
  });

  function openCreate(ymd: string, time = '10:00') {
    setForm((f) => ({
      ...f,
      date: ymd,
      time,
      patientId: f.patientId,
      dentistId: f.dentistId,
    }));
    setCreateOpen(true);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    createMut.mutate({
      patientId: form.patientId,
      dentistId: form.dentistId,
      scheduledAt: `${form.date}T${form.time}:00`,
      durationMin: form.durationMin,
      reason: form.reason || null,
      status: 'CONFIRMED',
    });
  }

  function onSaveDetail(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    updateMut.mutate({
      id: detail.id,
      scheduledAt: `${edit.date}T${edit.time}:00`,
      durationMin: edit.durationMin,
      reason: edit.reason.trim() || null,
      dentistId: edit.dentistId || undefined,
      status: edit.status,
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-2.5 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold text-clinic-ink sm:text-xl">
            Agenda
          </h1>
          <p className="text-xs text-clinic-slate">
            Día · semana · mes
          </p>
        </div>
        <Button
          onClick={() => openCreate(anchor, '10:00')}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Nueva cita
        </Button>
      </div>

      <AgendaCalendar
        view={view}
        onViewChange={setView}
        anchor={anchor}
        onAnchorChange={setAnchor}
        appointments={appointments}
        loading={isLoading}
        onSelectAppointment={setDetail}
        onCreateAt={openCreate}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nueva cita"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="appointment-create-form"
              disabled={createMut.isPending}
            >
              Agendar
            </Button>
          </>
        }
      >
        <form
          id="appointment-create-form"
          className="space-y-3"
          onSubmit={onCreate}
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              Paciente
            </span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
              required
            >
              <option value="">Seleccionar…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} · {p.documentId}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              Odontólogo
            </span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              value={form.dentistId}
              onChange={(e) => setForm({ ...form, dentistId: e.target.value })}
              required
            >
              <option value="">Seleccionar…</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="appt-date"
              label="Fecha"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
            <Input
              id="time"
              label="Hora"
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              required
            />
          </div>
          <Input
            id="duration"
            label="Duración (min)"
            type="number"
            min={15}
            step={15}
            value={form.durationMin}
            onChange={(e) =>
              setForm({ ...form, durationMin: Number(e.target.value) })
            }
          />
          <Input
            id="reason"
            label="Motivo / qué se va a hacer"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Ej.: Continuación endodoncia, control…"
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Editar cita"
        footer={
          detail ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDetail(null)}
              >
                Cerrar
              </Button>
              <Button
                type="submit"
                form="appointment-edit-form"
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <form
            id="appointment-edit-form"
            className="space-y-3"
            onSubmit={onSaveDetail}
          >
            <div>
              <p className="font-display text-lg font-semibold text-clinic-ink">
                {detail.patientName ?? 'Paciente'}
              </p>
              {detail.patientDocument && (
                <p className="text-sm text-clinic-slate">
                  Doc. {detail.patientDocument}
                </p>
              )}
              {detail.patientPhone &&
                (() => {
                  const wa = whatsappHref(
                    detail.patientPhone,
                    appointmentWhatsAppMessage({
                      patientName: detail.patientName ?? 'paciente',
                      clinicName,
                      dateLabel: edit.date
                        .split('-')
                        .reverse()
                        .join('/'),
                      timeLabel: edit.time || null,
                    }),
                  );
                  if (!wa) return null;
                  return (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp recordatorio
                    </a>
                  );
                })()}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="edit-date"
                label="Fecha"
                type="date"
                value={edit.date}
                onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                required
              />
              <Input
                id="edit-time"
                label="Hora"
                type="time"
                value={edit.time}
                onChange={(e) => setEdit({ ...edit, time: e.target.value })}
                required
              />
            </div>

            <Input
              id="edit-duration"
              label="Duración (min)"
              type="number"
              min={15}
              step={15}
              value={edit.durationMin}
              onChange={(e) =>
                setEdit({ ...edit, durationMin: Number(e.target.value) || 30 })
              }
            />

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Odontólogo
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                value={edit.dentistId}
                onChange={(e) =>
                  setEdit({ ...edit, dentistId: e.target.value })
                }
              >
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            </label>

            <Input
              id="edit-reason"
              label="Motivo / qué se va a hacer"
              value={edit.reason}
              onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
            />

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Estado
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                value={edit.status}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    status: e.target.value as AppointmentStatus,
                  })
                }
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {detail.notes && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-clinic-slate">
                {detail.notes}
              </p>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
