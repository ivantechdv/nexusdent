import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  CircleDollarSign,
  Download,
  Filter,
  HelpCircle,
  Plus,
  Search,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getPatientsSummaryApi,
  listPatientsApi,
  type Patient,
} from '@/services/patients.api';
import {
  mailtoHref,
  patientWhatsAppMessage,
  whatsappHref,
} from '@/lib/contact';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';

type StatusFilter = 'ALL' | 'ACTIVE' | 'NEW' | 'INACTIVE';

const STATUS_META: Record<
  'ACTIVE' | 'NEW' | 'INACTIVE',
  { label: string; className: string }
> = {
  ACTIVE: {
    label: 'Activo',
    className: 'bg-emerald-50 text-emerald-700',
  },
  NEW: {
    label: 'Nuevo',
    className: 'bg-sky-50 text-sky-700',
  },
  INACTIVE: {
    label: 'Inactivo',
    className: 'bg-slate-100 text-slate-600',
  },
};

function ageYears(birthDate?: string) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const birth = new Date(y, m - 1, d);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function formatDocument(doc: string) {
  const raw = doc.trim();
  if (!raw) return '—';
  if (/^[VEJGvejg]-/.test(raw)) return raw.toUpperCase();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `V-${withDots}`;
}

function formatVisit(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function alertTags(p: Patient) {
  const tags: Array<{ key: string; label: string; className: string }> = [];
  if (p.allergyAnesthesia || p.allergyPenicillin) {
    tags.push({
      key: 'allergy',
      label: 'Alergia',
      className: 'bg-red-50 text-red-700',
    });
  }
  if (p.hasHypertension) {
    tags.push({
      key: 'htn',
      label: 'Hipertensión',
      className: 'bg-orange-50 text-orange-700',
    });
  }
  if (p.hasDiabetes) {
    tags.push({
      key: 'dm',
      label: 'Diabetes',
      className: 'bg-violet-50 text-violet-700',
    });
  }
  if (!tags.length) {
    tags.push({
      key: 'none',
      label: 'Ninguna',
      className: 'bg-slate-100 text-slate-500',
    });
  }
  return tags;
}

type KpiProps = {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Users;
  iconClass: string;
};

function KpiCard({ label, value, hint, icon: Icon, iconClass }: KpiProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-800">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <span
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </div>
    </div>
  );
}

export function PatientsRedesign() {
  const navigate = useNavigate();
  const clinicName = useAuthStore((s) => s.user?.clinicName);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const summaryQ = useQuery({
    queryKey: ['patients', 'summary'],
    queryFn: getPatientsSummaryApi,
    refetchInterval: 60_000,
  });

  const patientsQ = useQuery({
    queryKey: ['patients', 'directory', search],
    queryFn: () => listPatientsApi(search || undefined, 500),
  });

  const filtered = useMemo(() => {
    const rows = patientsQ.data ?? [];
    if (statusFilter === 'ALL') return rows;
    return rows.filter((p) => (p.listStatus ?? 'ACTIVE') === statusFilter);
  }, [patientsQ.data, statusFilter]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const end = start + pageRows.length;

  const summary = summaryQ.data;
  const delta = summary?.newThisMonthDeltaPct;
  const totalHint =
    delta == null
      ? 'Registro histórico'
      : `${delta >= 0 ? '+' : ''}${delta}% que el mes pasado`;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    const ids = pageRows.map((p) => p.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function pageNumbers(): Array<number | '…'> {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const items: Array<number | '…'> = [1];
    if (safePage > 3) items.push('…');
    for (
      let i = Math.max(2, safePage - 1);
      i <= Math.min(totalPages - 1, safePage + 1);
      i += 1
    ) {
      items.push(i);
    }
    if (safePage < totalPages - 2) items.push('…');
    items.push(totalPages);
    return items;
  }

  return (
    <div className="min-h-full bg-[#f8fafc]">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Inicio{' '}
            <span className="text-slate-300">›</span>{' '}
            <span className="font-semibold text-[#2b7a78]">Pacientes</span>
          </p>
          <h1 className="mt-0.5 font-display text-xl font-bold text-slate-800">
            Pacientes
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <label className="relative hidden min-w-[220px] md:block lg:min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              readOnly
              placeholder="Búsqueda rápida..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-[13px] text-slate-700 outline-none placeholder:text-slate-500"
            />
          </label>
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-500" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
            aria-label="Ayuda"
            onClick={() => toast('Centro de ayuda próximamente', 'info')}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard
            label="Total Pacientes"
            value={(summary?.total ?? 0).toLocaleString('en-US')}
            hint={totalHint}
            icon={Users}
            iconClass="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            label="Nuevos Este Mes"
            value={summary?.newThisMonth ?? 0}
            hint="Pacientes de primer ingreso"
            icon={UserPlus}
            iconClass="bg-teal-50 text-teal-700"
          />
          <KpiCard
            label="Con Deuda"
            value={summary?.withDebt ?? 0}
            hint="Saldos pendientes acumulados"
            icon={CircleDollarSign}
            iconClass="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            label="Activos"
            value={(summary?.active ?? 0).toLocaleString('en-US')}
            hint="Consulta recurrente regular"
            icon={Activity}
            iconClass="bg-teal-50 text-teal-700"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between lg:p-4">
          <form
            className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(q.trim());
            }}
          >
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar paciente por nombre o cédula..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#2b7a78]"
              />
            </label>
            <label className="relative shrink-0">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setPage(1);
                }}
                className="h-10 appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-[#2b7a78]"
              >
                <option value="ALL">Todos los Estados</option>
                <option value="ACTIVE">Activos</option>
                <option value="NEW">Nuevos</option>
                <option value="INACTIVE">Inactivos</option>
              </select>
            </label>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toast('Exportar próximamente', 'info')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4 text-slate-500" />
              Exportar
            </button>
            <button
              type="button"
              onClick={() => toast('Importar próximamente', 'info')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4 text-slate-500" />
              Importar
            </button>
            <button
              type="button"
              onClick={() => navigate('/patients/new')}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Nuevo Paciente
            </button>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {patientsQ.isLoading ? (
            <p className="px-5 py-10 text-sm text-slate-500">Cargando pacientes…</p>
          ) : pageRows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No hay pacientes
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={
                            pageRows.length > 0 &&
                            pageRows.every((p) => selected.has(p.id))
                          }
                          onChange={togglePage}
                          className="h-4 w-4 rounded border-slate-300 text-[#2b7a78] accent-[#2b7a78]"
                          aria-label="Seleccionar página"
                        />
                      </th>
                      <th className="px-3 py-3">Nombre Completo</th>
                      <th className="px-3 py-3">Cédula (C.I.)</th>
                      <th className="px-3 py-3">Edad</th>
                      <th className="px-3 py-3">Teléfono</th>
                      <th className="px-3 py-3">Correo Electrónico</th>
                      <th className="px-3 py-3">Última Visita</th>
                      <th className="px-3 py-3">Estado</th>
                      <th className="px-3 py-3">Alertas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p) => {
                      const status = p.listStatus ?? 'ACTIVE';
                      const meta = STATUS_META[status];
                      const age = ageYears(p.birthDate);
                      const wa = p.phone
                        ? whatsappHref(
                            p.phone,
                            patientWhatsAppMessage(p.fullName, clinicName),
                          )
                        : null;
                      const mail = p.email ? mailtoHref(p.email) : null;
                      const isSelected = selected.has(p.id);

                      return (
                        <tr
                          key={p.id}
                          className={clsx(
                            'border-b border-slate-50 last:border-0',
                            isSelected && 'bg-teal-50/40',
                          )}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(p.id)}
                              className="h-4 w-4 rounded border-slate-300 text-[#2b7a78] accent-[#2b7a78]"
                              aria-label={`Seleccionar ${p.fullName}`}
                            />
                          </td>
                          <td className="max-w-[180px] px-3 py-3">
                            <Link
                              to={`/patients/${p.id}`}
                              className="block truncate font-semibold text-[#0f766e] hover:underline"
                            >
                              {p.fullName}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600">
                            {formatDocument(p.documentId)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                            {age != null ? `${age} años` : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {p.phone ? (
                              wa ? (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-medium text-slate-700 hover:text-[#0f766e] hover:underline"
                                >
                                  {p.phone}
                                </a>
                              ) : (
                                p.phone
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="max-w-[180px] truncate px-3 py-3">
                            {p.email ? (
                              mail ? (
                                <a
                                  href={mail}
                                  className="font-medium text-slate-700 hover:text-[#0f766e] hover:underline"
                                >
                                  {p.email}
                                </a>
                              ) : (
                                p.email
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                            {formatVisit(p.lastVisitAt)}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={clsx(
                                'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                meta.className,
                              )}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {alertTags(p).map((t) => (
                                <span
                                  key={t.key}
                                  className={clsx(
                                    'inline-flex max-w-[5.5rem] truncate rounded-md px-2 py-0.5 text-[10px] font-semibold',
                                    t.className,
                                  )}
                                  title={t.label}
                                >
                                  {t.label}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Mostrando {totalFiltered === 0 ? 0 : start + 1}-{end} de{' '}
                  {(search || statusFilter !== 'ALL'
                    ? totalFiltered
                    : (summary?.total ?? totalFiltered)
                  ).toLocaleString('en-US')}{' '}
                  pacientes
                </p>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-40"
                    aria-label="Anterior"
                  >
                    ‹
                  </button>
                  {pageNumbers().map((n, i) =>
                    n === '…' ? (
                      <span
                        key={`e-${i}`}
                        className="px-1 text-xs text-slate-400"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        className={clsx(
                          'flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold',
                          n === safePage
                            ? 'bg-[#0d1e21] text-white'
                            : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {n}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-40"
                    aria-label="Siguiente"
                  >
                    ›
                  </button>
                </div>

                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  Mostrar:
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
                  >
                    {[8, 16, 24, 50].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
