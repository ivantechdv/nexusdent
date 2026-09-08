import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Check,
  Clock,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  updatePatientApi,
  type Patient,
  type UpsertPatient,
} from '@/services/patients.api';
import {
  DENTAL_HISTORY,
  FAMILY_HISTORY,
  HABITS,
  SYSTEMIC_DISEASES,
  derivePatientFlags,
  parseAnamnesisData,
  serializeAnamnesisData,
  type AllergySeverity,
  type AnamnesisAllergy,
  type AnamnesisData,
  type AnamnesisMedication,
  type AnamnesisSurgery,
} from './anamnesis.types';

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function CheckboxItem({
  checked,
  label,
  note,
  onChange,
}: {
  checked: boolean;
  label: string;
  note?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
      <span
        className={clsx(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
          checked
            ? 'border-[#2b7a78] bg-[#2b7a78] text-white'
            : 'border-slate-300 bg-white',
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {note ? (
          <span className="text-slate-500"> ({note})</span>
        ) : null}
      </span>
    </label>
  );
}

function NotesBox({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2b7a78] focus:bg-white focus:ring-2 focus:ring-[#2b7a78]/15"
      />
    </div>
  );
}

function allergyBadgeClass(severity: AllergySeverity) {
  if (severity === 'SEVERA') return 'border-red-200 bg-red-50 text-red-700';
  if (severity === 'MODERADA')
    return 'border-orange-200 bg-orange-50 text-orange-700';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function severityLabel(s: AllergySeverity) {
  if (s === 'SEVERA') return 'Severa';
  if (s === 'MODERADA') return 'Moderada';
  return 'Leve';
}

interface PatientAnamnesisRedesignProps {
  patient: Patient;
}

export function PatientAnamnesisRedesign({
  patient,
}: PatientAnamnesisRedesignProps) {
  const qc = useQueryClient();
  const userName = useAuthStore((s) => s.user?.fullName);

  const initial = useMemo(
    () =>
      parseAnamnesisData(patient.anamnesisNotes, {
        hasDiabetes: patient.hasDiabetes,
        hasHypertension: patient.hasHypertension,
        isPregnant: patient.isPregnant,
        allergyPenicillin: patient.allergyPenicillin,
        allergyAnesthesia: patient.allergyAnesthesia,
        medicalConditions: patient.medicalConditions,
      }),
    [patient],
  );

  const [data, setData] = useState<AnamnesisData>(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setData(initial);
    setDirty(false);
  }, [initial]);

  function patch(updater: (prev: AnamnesisData) => AnamnesisData) {
    setData((prev) => updater(prev));
    setDirty(true);
  }

  const saveM = useMutation({
    mutationFn: async () => {
      const flags = derivePatientFlags(data);
      const payload: UpsertPatient = {
        documentId: patient.documentId,
        fullName: patient.fullName,
        birthDate: patient.birthDate ?? '2000-01-01',
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        emergencyContact: patient.emergencyContact,
        emergencyPhone: patient.emergencyPhone,
        coagulationIssues: patient.coagulationIssues,
        anamnesisNotes: serializeAnamnesisData(data),
        ...flags,
      };
      return updatePatientApi(patient.id, payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['patient', patient.id] });
      void qc.invalidateQueries({ queryKey: ['patients'] });
      setDirty(false);
      toast('Historia médica guardada', 'success');
    },
    onError: () => toast('No se pudo guardar la anamnesis', 'error'),
  });

  function discard() {
    setData(initial);
    setDirty(false);
  }

  function addAllergy() {
    const name = window.prompt('Nombre de la alergia');
    if (!name?.trim()) return;
    const sevRaw = window.prompt(
      'Severidad: SEVERA, MODERADA o LEVE',
      'MODERADA',
    );
    const severity = (
      ['SEVERA', 'MODERADA', 'LEVE'].includes(
        (sevRaw ?? '').toUpperCase(),
      )
        ? (sevRaw ?? 'MODERADA').toUpperCase()
        : 'MODERADA'
    ) as AllergySeverity;
    patch((prev) => ({
      ...prev,
      allergies: [...prev.allergies, { name: name.trim(), severity }],
    }));
  }

  function removeAllergy(idx: number) {
    patch((prev) => ({
      ...prev,
      allergies: prev.allergies.filter((_, i) => i !== idx),
    }));
  }

  function addMedication() {
    patch((prev) => ({
      ...prev,
      medications: [
        ...prev.medications,
        { name: '', dose: '', frequency: '', reason: '' },
      ],
    }));
  }

  function updateMed(
    idx: number,
    field: keyof AnamnesisMedication,
    value: string,
  ) {
    patch((prev) => ({
      ...prev,
      medications: prev.medications.map((m, i) =>
        i === idx ? { ...m, [field]: value } : m,
      ),
    }));
  }

  function removeMed(idx: number) {
    patch((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== idx),
    }));
  }

  function addSurgery() {
    patch((prev) => ({
      ...prev,
      surgeries: [
        ...prev.surgeries,
        { procedure: '', date: '', hospital: '', complications: 'Ninguna' },
      ],
    }));
  }

  function updateSurgery(
    idx: number,
    field: keyof AnamnesisSurgery,
    value: string,
  ) {
    patch((prev) => ({
      ...prev,
      surgeries: prev.surgeries.map((s, i) =>
        i === idx ? { ...s, [field]: value } : s,
      ),
    }));
  }

  function removeSurgery(idx: number) {
    patch((prev) => ({
      ...prev,
      surgeries: prev.surgeries.filter((_, i) => i !== idx),
    }));
  }

  const updatedLabel = patient.updatedAt
    ? new Date(patient.updatedAt).toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

  const halfDiseases = Math.ceil(SYSTEMIC_DISEASES.length / 2);
  const diseaseLeft = SYSTEMIC_DISEASES.slice(0, halfDiseases);
  const diseaseRight = SYSTEMIC_DISEASES.slice(halfDiseases);

  return (
    <div className="space-y-5 pb-24">
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        {/* Columna izquierda */}
        <div className="space-y-4">
          <Card title="Enfermedades Sistémicas">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div className="space-y-2.5">
                {diseaseLeft.map((d) => (
                  <CheckboxItem
                    key={d.key}
                    checked={Boolean(data.diseases[d.key])}
                    label={d.label}
                    onChange={(v) =>
                      patch((prev) => ({
                        ...prev,
                        diseases: { ...prev.diseases, [d.key]: v },
                      }))
                    }
                  />
                ))}
              </div>
              <div className="space-y-2.5">
                {diseaseRight.map((d) => (
                  <CheckboxItem
                    key={d.key}
                    checked={Boolean(data.diseases[d.key])}
                    label={d.label}
                    onChange={(v) =>
                      patch((prev) => ({
                        ...prev,
                        diseases: { ...prev.diseases, [d.key]: v },
                      }))
                    }
                  />
                ))}
              </div>
            </div>
            <NotesBox
              label="Observaciones de enfermedad"
              value={data.diseaseNotes}
              onChange={(v) => patch((prev) => ({ ...prev, diseaseNotes: v }))}
            />
          </Card>

          <Card
            title="Medicamentos Actuales"
            action={
              <button
                type="button"
                onClick={addMedication}
                className="text-xs font-semibold text-[#2b7a78] hover:underline"
              >
                + Agregar
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-2 pr-2 font-bold">Medicamento</th>
                    <th className="pb-2 pr-2 font-bold">Dosis</th>
                    <th className="pb-2 pr-2 font-bold">Frecuencia</th>
                    <th className="pb-2 font-bold">Motivo</th>
                    <th className="w-8 pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.medications.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-4 text-center text-xs text-slate-400"
                      >
                        Sin medicamentos registrados
                      </td>
                    </tr>
                  ) : (
                    data.medications.map((m, idx) => (
                      <tr key={idx}>
                        {(
                          [
                            'name',
                            'dose',
                            'frequency',
                            'reason',
                          ] as const
                        ).map((field) => (
                          <td key={field} className="py-1.5 pr-2">
                            <input
                              value={m[field]}
                              onChange={(e) =>
                                updateMed(idx, field, e.target.value)
                              }
                              className="w-full rounded border-0 bg-transparent px-0 py-1 text-sm text-slate-700 outline-none focus:bg-slate-50"
                              placeholder="—"
                            />
                          </td>
                        ))}
                        <td className="py-1.5">
                          <button
                            type="button"
                            onClick={() => removeMed(idx)}
                            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="Cirugías Previas"
            action={
              <button
                type="button"
                onClick={addSurgery}
                className="text-xs font-semibold text-[#2b7a78] hover:underline"
              >
                + Agregar
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-2 pr-2">Procedimiento</th>
                    <th className="pb-2 pr-2">Fecha</th>
                    <th className="pb-2 pr-2">Hospital</th>
                    <th className="pb-2">Complicaciones</th>
                    <th className="w-8 pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.surgeries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-4 text-center text-xs text-slate-400"
                      >
                        Sin cirugías registradas
                      </td>
                    </tr>
                  ) : (
                    data.surgeries.map((s, idx) => (
                      <tr key={idx}>
                        {(
                          [
                            'procedure',
                            'date',
                            'hospital',
                            'complications',
                          ] as const
                        ).map((field) => (
                          <td key={field} className="py-1.5 pr-2">
                            <input
                              value={s[field]}
                              onChange={(e) =>
                                updateSurgery(idx, field, e.target.value)
                              }
                              className={clsx(
                                'w-full rounded border-0 bg-transparent px-0 py-1 text-sm outline-none focus:bg-slate-50',
                                field === 'complications' &&
                                  /^ninguna$/i.test(s.complications)
                                  ? 'font-medium text-emerald-600'
                                  : 'text-slate-700',
                              )}
                              placeholder="—"
                            />
                          </td>
                        ))}
                        <td className="py-1.5">
                          <button
                            type="button"
                            onClick={() => removeSurgery(idx)}
                            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Antecedentes Odontológicos">
            <div className="space-y-2.5">
              {DENTAL_HISTORY.map((d) => (
                <CheckboxItem
                  key={d.key}
                  checked={Boolean(data.dental[d.key])}
                  label={d.label}
                  onChange={(v) =>
                    patch((prev) => ({
                      ...prev,
                      dental: { ...prev.dental, [d.key]: v },
                    }))
                  }
                />
              ))}
            </div>
            <NotesBox
              label="Notas adicionales"
              value={data.dentalNotes}
              onChange={(v) => patch((prev) => ({ ...prev, dentalNotes: v }))}
            />
          </Card>
        </div>

        {/* Columna derecha */}
        <div className="space-y-4">
          <Card
            title="Alergias y Alertas"
            action={
              <button
                type="button"
                onClick={addAllergy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#2b7a78] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </button>
            }
          >
            {data.allergies.length === 0 ? (
              <p className="text-sm text-slate-400">Sin alergias registradas</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.allergies.map((a: AnamnesisAllergy, idx) => (
                  <span
                    key={`${a.name}-${idx}`}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
                      allergyBadgeClass(a.severity),
                    )}
                  >
                    {a.name} ({severityLabel(a.severity)})
                    <button
                      type="button"
                      onClick={() => removeAllergy(idx)}
                      className="rounded-full p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100"
                      aria-label="Quitar alergia"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card title="Estado de Embarazo">
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={data.pregnancy.active}
                onChange={(e) =>
                  patch((prev) => ({
                    ...prev,
                    pregnancy: { ...prev.pregnancy, active: e.target.checked },
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-[#2b7a78] focus:ring-[#2b7a78]"
              />
              Embarazo activo
            </label>

            {data.pregnancy.active ? (
              <div className="rounded-lg border border-orange-200 bg-orange-50/80 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-orange-800">
                  Embarazo activo:{' '}
                  <span className="font-semibold normal-case">
                    Sí
                    {data.pregnancy.weeks != null
                      ? ` — ${data.pregnancy.weeks} Semanas`
                      : ''}
                  </span>
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs">
                    <span className="font-semibold uppercase tracking-wide text-orange-700/80">
                      Semanas
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={42}
                      value={data.pregnancy.weeks ?? ''}
                      onChange={(e) =>
                        patch((prev) => ({
                          ...prev,
                          pregnancy: {
                            ...prev.pregnancy,
                            weeks: e.target.value
                              ? Number(e.target.value)
                              : null,
                          },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-orange-400"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="font-semibold uppercase tracking-wide text-orange-700/80">
                      FPP (Est. de Parto)
                    </span>
                    <input
                      type="date"
                      value={data.pregnancy.dueDate}
                      onChange={(e) =>
                        patch((prev) => ({
                          ...prev,
                          pregnancy: {
                            ...prev.pregnancy,
                            dueDate: e.target.value,
                          },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-orange-400"
                    />
                  </label>
                  <label className="block text-xs sm:col-span-2">
                    <span className="font-semibold uppercase tracking-wide text-orange-700/80">
                      Obstetra asignada
                    </span>
                    <input
                      type="text"
                      value={data.pregnancy.obstetrician}
                      onChange={(e) =>
                        patch((prev) => ({
                          ...prev,
                          pregnancy: {
                            ...prev.pregnancy,
                            obstetrician: e.target.value,
                          },
                        }))
                      }
                      placeholder="Dra. …"
                      className="mt-1 w-full rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-orange-400"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Sin embarazo activo registrado
              </p>
            )}
          </Card>

          <Card title="Antecedentes Familiares">
            <div className="space-y-3">
              {FAMILY_HISTORY.map((f) => (
                <div
                  key={f.key}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <CheckboxItem
                    checked={Boolean(data.family[f.key]?.trim())}
                    label={f.label}
                    note={data.family[f.key]?.trim() || undefined}
                    onChange={(v) =>
                      patch((prev) => ({
                        ...prev,
                        family: {
                          ...prev.family,
                          [f.key]: v
                            ? prev.family[f.key]?.trim() || 'Familiar'
                            : '',
                        },
                      }))
                    }
                  />
                  {Boolean(data.family[f.key]?.trim()) && (
                    <input
                      value={data.family[f.key]}
                      onChange={(e) =>
                        patch((prev) => ({
                          ...prev,
                          family: { ...prev.family, [f.key]: e.target.value },
                        }))
                      }
                      placeholder="Padre / Madre / …"
                      className="ml-6 w-36 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 outline-none focus:border-[#2b7a78]"
                    />
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Hábitos">
            <div className="space-y-3">
              {HABITS.map((h) => {
                const note = data.habits[h.key] || 'No';
                const active = !/^no$/i.test(note.trim());
                return (
                  <div key={h.key} className="space-y-1">
                    <CheckboxItem
                      checked={active}
                      label={h.label}
                      note={note}
                      onChange={(v) =>
                        patch((prev) => ({
                          ...prev,
                          habits: {
                            ...prev.habits,
                            [h.key]: v
                              ? prev.habits[h.key] === 'No'
                                ? 'Sí'
                                : prev.habits[h.key]
                              : 'No',
                          },
                        }))
                      }
                    />
                    {active && (
                      <input
                        value={data.habits[h.key]}
                        onChange={(e) =>
                          patch((prev) => ({
                            ...prev,
                            habits: {
                              ...prev.habits,
                              [h.key]: e.target.value,
                            },
                          }))
                        }
                        className="ml-6 w-full max-w-xs rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 outline-none focus:border-[#2b7a78]"
                        placeholder="Detalle (ej. Social, usa férula…)"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Observaciones Generales">
            {(data.specialAttention.trim() || dirty) && (
              <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-800">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold text-white">
                    !
                  </span>
                  Atención clínica especial
                </p>
                <textarea
                  value={data.specialAttention}
                  onChange={(e) =>
                    patch((prev) => ({
                      ...prev,
                      specialAttention: e.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Alertas de manejo clínico…"
                  className="mt-2 w-full resize-y rounded-lg border border-orange-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-400"
                />
              </div>
            )}
            {!data.specialAttention.trim() && (
              <button
                type="button"
                onClick={() =>
                  patch((prev) => ({
                    ...prev,
                    specialAttention: ' ',
                  }))
                }
                className="mb-3 text-xs font-semibold text-orange-600 hover:underline"
              >
                + Agregar atención clínica especial
              </button>
            )}
            <NotesBox
              label="Notas generales"
              value={data.generalNotes}
              onChange={(v) =>
                patch((prev) => ({ ...prev, generalNotes: v }))
              }
              rows={3}
            />
          </Card>
        </div>
      </div>

      {/* Footer sticky */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-0 sm:rounded-xl sm:border sm:shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            Última actualización: {updatedLabel}
            {userName ? ` por ${userName}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!dirty || saveM.isPending}
              onClick={discard}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Descartar
            </button>
            <button
              type="button"
              disabled={!dirty || saveM.isPending}
              onClick={() => saveM.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {saveM.isPending ? 'Guardando…' : 'Guardar Historia Médica'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}