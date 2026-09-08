import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ChevronDown,
  Copy,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { formatUsd, usdToVes } from '@/lib/exchange';
import { can, type Permission } from '@/lib/permissions';
import {
  createPlanApi,
  duplicatePlanApi,
  listPlansApi,
  updatePlanApi,
  updatePlanStatusApi,
  type TreatmentPlan,
  type TreatmentPlanItem,
} from '@/services/billing.api';
import { listTreatmentsApi, type Treatment } from '@/services/treatments.api';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';

type StatusFilter =
  | 'ALL'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PENDING'
  | 'CANCELLED';

type DraftLine = {
  key: string;
  treatmentId: string;
  toothNumber: string;
  quantity: string;
  unitPrice: string;
};

const PAGE_SIZE = 4;

function moneyDollar(n: number) {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatShortDate(iso?: string | Date) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function isQuote(plan: TreatmentPlan) {
  if (plan.kind === 'VISIT') return false;
  if (plan.kind === 'QUOTE') return true;
  const notes = plan.notes ?? '';
  const title = plan.title ?? '';
  if (/atenci[oó]n/i.test(notes)) return false;
  if (/^atenci[oó]n\b/i.test(title)) return false;
  return true;
}

function quoteLabel(plan: TreatmentPlan) {
  if (plan.quoteCode) return plan.quoteCode;
  const year = plan.createdAt
    ? new Date(plan.createdAt).getFullYear()
    : new Date().getFullYear();
  return `PRES-${year}-${plan.id.replace(/-/g, '').slice(-3).toUpperCase()}`;
}

function statusGroup(status: TreatmentPlan['status']): StatusFilter {
  if (status === 'APPROVED' || status === 'IN_PROGRESS') return 'ACCEPTED';
  if (status === 'REJECTED') return 'REJECTED';
  if (status === 'CLOSED' || status === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
}

function statusMeta(status: TreatmentPlan['status']) {
  const group = statusGroup(status);
  if (group === 'ACCEPTED') {
    return {
      label: 'Aceptado',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    };
  }
  if (group === 'REJECTED') {
    return {
      label: 'Rechazado',
      className: 'bg-red-50 text-red-600 ring-red-200',
    };
  }
  if (group === 'CANCELLED') {
    return {
      label: 'Cancelado',
      className: 'bg-slate-100 text-slate-600 ring-slate-200',
    };
  }
  return {
    label: 'Pendiente',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
  };
}

function procedureSummary(plan: TreatmentPlan) {
  const names = (plan.items ?? [])
    .map((i) => i.treatmentName)
    .filter(Boolean)
    .slice(0, 3);
  if (names.length) return names.join(' · ');
  return plan.title || 'Presupuesto';
}

function emptyLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    treatmentId: '',
    toothNumber: '',
    quantity: '1',
    unitPrice: '',
  };
}

function linesFromPlan(plan: TreatmentPlan): DraftLine[] {
  const items = plan.items ?? [];
  if (!items.length) return [emptyLine()];
  return items.map((item) => ({
    key: item.id,
    treatmentId: String(item.treatmentId),
    toothNumber: item.toothNumber != null ? String(item.toothNumber) : '',
    quantity: String(item.quantity || 1),
    unitPrice: String(item.unitPrice),
  }));
}

export function PatientBudgetsPanel({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const perms = (user?.permissions ?? null) as Permission[] | null;
  const canWrite = can(user?.role, 'billing.plans.write', perms);
  const { rate } = useExchangeRate();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const plansQ = useQuery({
    queryKey: ['plans', patientId],
    queryFn: () => listPlansApi(patientId, 'QUOTE'),
  });
  const treatmentsQ = useQuery({
    queryKey: ['treatments'],
    queryFn: () => listTreatmentsApi(),
    staleTime: 60_000,
  });

  const plans = (plansQ.data ?? []).filter(
    (plan) => isQuote(plan) && plan.status !== 'IN_PROGRESS' && plan.status !== 'CLOSED',
  );
  const treatments = treatmentsQ.data ?? [];

  const stats = useMemo(() => {
    const active = plans.filter((p) => statusGroup(p.status) !== 'CANCELLED');
    const sum = (rows: TreatmentPlan[]) =>
      rows.reduce((acc, p) => acc + Number(p.totalAmount || 0), 0);
    const accepted = plans.filter((p) => statusGroup(p.status) === 'ACCEPTED');
    const rejected = plans.filter((p) => statusGroup(p.status) === 'REJECTED');
    const pending = plans.filter((p) => statusGroup(p.status) === 'PENDING');
    const cancelled = plans.filter((p) => statusGroup(p.status) === 'CANCELLED');
    return {
      total: sum(active),
      count: plans.length,
      accepted: sum(accepted),
      acceptedCount: accepted.length,
      rejected: sum(rejected),
      rejectedCount: rejected.length,
      cancelledCount: cancelled.length,
      pending: sum(pending),
      pendingCount: pending.length,
    };
  }, [plans]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((plan) => {
      if (filter !== 'ALL' && statusGroup(plan.status) !== filter) return false;
      if (!q) return true;
      const blob = [
        quoteLabel(plan),
        plan.title,
        plan.createdByName,
        plan.notes,
        ...(plan.items ?? []).map((i) => i.treatmentName),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [plans, query, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['plans', patientId] });
    qc.invalidateQueries({ queryKey: ['balance', patientId] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((l) => l.treatmentId)
        .map((l) => ({
          treatmentId: Number(l.treatmentId),
          toothNumber: l.toothNumber ? Number(l.toothNumber) : null,
          quantity: Math.max(1, Number(l.quantity) || 1),
          unitPrice: Number(l.unitPrice) || undefined,
        }));
      if (!items.length) throw new Error('Agregá al menos un procedimiento');
      if (editingId) {
        return updatePlanApi(editingId, {
          title: title.trim() || 'Presupuesto',
          notes: notes.trim() || null,
          items,
        });
      }
      return createPlanApi({
        patientId,
        title: title.trim() || 'Presupuesto',
        notes: notes.trim() || null,
        status: 'DRAFT',
        items,
      });
    },
    onSuccess: (plan) => {
      toast(editingId ? 'Presupuesto actualizado' : 'Presupuesto creado', 'success');
      setEditorOpen(false);
      setOpenId(plan.id);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        'No se pudo guardar el presupuesto';
      toast(msg, 'error');
    },
  });

  const statusMut = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: TreatmentPlan['status'];
    }) => updatePlanStatusApi(id, status),
    onSuccess: () => {
      toast('Estado actualizado', 'success');
      invalidate();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo cambiar el estado';
      toast(msg, 'error');
    },
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => duplicatePlanApi(id),
    onSuccess: (plan) => {
      toast('Presupuesto duplicado', 'success');
      setOpenId(plan.id);
      setFilter('ALL');
      setPage(1);
      invalidate();
    },
    onError: () => toast('No se pudo duplicar', 'error'),
  });

  function openCreate() {
    navigate(`/presupuesto?patientId=${patientId}`);
  }

  function openEdit(plan: TreatmentPlan) {
    if (plan.paidAmount > 0.009) {
      toast('No se puede editar un presupuesto con pagos', 'error');
      return;
    }
    navigate(`/presupuesto?patientId=${patientId}&quoteId=${plan.id}`);
  }

  function printPlan(plan: TreatmentPlan) {
    const vesRate = rate ?? 0;
    const esc = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const rows = (plan.items ?? [])
      .map((item) => {
        const ves =
          vesRate > 0 ? usdToVes(item.lineTotal, vesRate).toFixed(2) : '—';
        return `<tr>
          <td>${esc(item.treatmentName || 'Procedimiento')}</td>
          <td>${item.toothNumber ?? 'General'}</td>
          <td>${item.quantity}</td>
          <td>${esc(formatUsd(item.lineTotal))}</td>
          <td>${ves === '—' ? '—' : `Bs ${ves}`}</td>
        </tr>`;
      })
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(quoteLabel(plan))}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:28px;color:#0f172a}
        h1{font-size:20px;margin:0}
        .meta{color:#64748b;font-size:12px;margin:6px 0 18px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}
        th{font-size:11px;text-transform:uppercase;color:#64748b}
        .total{margin-top:16px;font-size:16px}
        @media print{button{display:none}}
      </style></head><body>
      <h1>${esc(quoteLabel(plan))}</h1>
      <div class="meta">${esc(patientName)} · ${formatShortDate(plan.createdAt)} · ${statusMeta(plan.status).label}</div>
      <table><thead><tr><th>Procedimiento</th><th>Pieza</th><th>Cant.</th><th>USD</th><th>Bs</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Sin procedimientos</td></tr>'}</tbody></table>
      <p class="total">Total ${esc(formatUsd(plan.totalAmount))}</p>
      <button onclick="window.print()">Imprimir</button>
      </body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      URL.revokeObjectURL(url);
      toast('Permití ventanas emergentes para ver el PDF', 'error');
      return;
    }
    w.addEventListener('load', () => {
      w.focus();
      w.print();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  function setLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.treatmentId) {
          const t = treatments.find((x) => String(x.id) === patch.treatmentId);
          if (t) next.unitPrice = String(t.basePrice);
        }
        return next;
      }),
    );
  }

  const draftTotal = lines.reduce((sum, line) => {
    const qty = Math.max(1, Number(line.quantity) || 1);
    const price = Number(line.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total presupuestado"
          value={moneyDollar(stats.total)}
          hint={`${stats.count} presupuesto${stats.count === 1 ? '' : 's'}`}
        />
        <Kpi
          label="Aceptados"
          value={moneyDollar(stats.accepted)}
          hint={`${stats.acceptedCount} aprobado${stats.acceptedCount === 1 ? '' : 's'}`}
          valueClass="text-emerald-600"
        />
        <Kpi
          label="Rechazados"
          value={moneyDollar(stats.rejected)}
          hint={
            stats.cancelledCount
              ? `${stats.cancelledCount} cancelado${stats.cancelledCount === 1 ? '' : 's'}`
              : `${stats.rejectedCount} rechazado${stats.rejectedCount === 1 ? '' : 's'}`
          }
          valueClass="text-red-600"
        />
        <Kpi
          label="Pendientes"
          value={moneyDollar(stats.pending)}
          hint={`${stats.pendingCount} por revisar`}
          valueClass="text-amber-600"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar presupuestos..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none ring-[#2b7a78]/20 focus:border-[#2b7a78] focus:ring-2"
          />
        </label>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as StatusFilter);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
        >
          <option value="ALL">Todos los estados</option>
          <option value="ACCEPTED">Aceptados</option>
          <option value="PENDING">Pendientes</option>
          <option value="REJECTED">Rechazados</option>
          <option value="CANCELLED">Cancelados</option>
        </select>
        {canWrite && (
          <Button
            type="button"
            className="border-0 bg-orange-500 hover:bg-orange-600"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" />
            Nuevo Presupuesto
          </Button>
        )}
      </div>

      {plansQ.isLoading ? (
        <p className="text-sm text-slate-500">Cargando presupuestos…</p>
      ) : pageRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          {plans.length === 0
            ? 'Aún no hay presupuestos. Un presupuesto es la cotización de lo que se haría; recién si lo aceptan pasa a atención.'
            : 'Ningún presupuesto coincide con la búsqueda.'}
        </div>
      ) : (
        <div className="space-y-3">
          {pageRows.map((plan) => (
            <BudgetCard
              key={plan.id}
              plan={plan}
              patientName={patientName}
              rate={rate}
              expanded={openId === plan.id || (openId == null && pageRows[0]?.id === plan.id)}
              canWrite={canWrite}
              busy={statusMut.isPending || dupMut.isPending}
              onToggle={() =>
                setOpenId((id) => (id === plan.id ? '' : plan.id))
              }
              onPrint={() => printPlan(plan)}
              onEdit={() => openEdit(plan)}
              onDuplicate={() => dupMut.mutate(plan.id)}
              onStatus={(status) => statusMut.mutate({ id: plan.id, status })}
              onStartAttention={() =>
                navigate(
                  `/atencion?patientId=${patientId}&quoteId=${plan.id}`,
                )
              }
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>
          Mostrando {from}-{to} de {filtered.length} presupuestos
        </p>
        <div className="flex items-center gap-1">
          <PagerBtn
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            Anterior
          </PagerBtn>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .slice(0, 6)
            .map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={clsx(
                  'h-8 min-w-8 rounded-md px-2 text-xs font-semibold',
                  n === safePage
                    ? 'bg-[#2b7a78] text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {n}
              </button>
            ))}
          <PagerBtn
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            Siguiente
          </PagerBtn>
        </div>
      </div>

      <Modal
        open={editorOpen}
        onClose={() => !saveMut.isPending && setEditorOpen(false)}
        title={editingId ? 'Editar presupuesto' : 'Nuevo presupuesto'}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saveMut.isPending}
              onClick={() => setEditorOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saveMut.isPending}
              className="border-0 bg-orange-500 hover:bg-orange-600"
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? 'Guardando…' : 'Guardar presupuesto'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Título
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Endodoncia pieza 22"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
          <div className="space-y-2">
            {lines.map((line) => (
              <div
                key={line.key}
                className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-[1fr_88px_72px_96px_auto]"
              >
                <select
                  value={line.treatmentId}
                  onChange={(e) =>
                    setLine(line.key, { treatmentId: e.target.value })
                  }
                  className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                >
                  <option value="">Procedimiento…</option>
                  {treatments.map((t: Treatment) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  value={line.toothNumber}
                  onChange={(e) =>
                    setLine(line.key, { toothNumber: e.target.value })
                  }
                  placeholder="Pieza"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                />
                <input
                  value={line.quantity}
                  onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                  placeholder="Cant."
                  className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                />
                <input
                  value={line.unitPrice}
                  onChange={(e) =>
                    setLine(line.key, { unitPrice: e.target.value })
                  }
                  placeholder="USD"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                />
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600"
                  onClick={() =>
                    setLines((prev) =>
                      prev.length === 1
                        ? [emptyLine()]
                        : prev.filter((l) => l.key !== line.key),
                    )
                  }
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-sm font-semibold text-[#2b7a78]"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              + Agregar procedimiento
            </button>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notas
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condiciones, vigencia, observaciones…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
          <p className="text-right text-sm font-semibold text-slate-800">
            Total estimado {formatUsd(draftTotal)}
            {rate ? ` · Bs ${usdToVes(draftTotal, rate).toLocaleString('es-VE')}` : ''}
          </p>
        </div>
      </Modal>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={clsx('mt-1 font-display text-2xl font-bold text-slate-900', valueClass)}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function PagerBtn({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function BudgetCard({
  plan,
  patientName,
  rate,
  expanded,
  canWrite,
  busy,
  onToggle,
  onPrint,
  onEdit,
  onDuplicate,
  onStatus,
  onStartAttention,
}: {
  plan: TreatmentPlan;
  patientName: string;
  rate: number | null;
  expanded: boolean;
  canWrite: boolean;
  busy: boolean;
  onToggle: () => void;
  onPrint: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onStatus: (status: TreatmentPlan['status']) => void;
  onStartAttention: () => void;
}) {
  const meta = statusMeta(plan.status);
  const due = Math.max(0, plan.totalAmount - plan.paidAmount);
  const group = statusGroup(plan.status);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-slate-900">{quoteLabel(plan)}</span>
            <span className="text-sm text-slate-500">
              {formatShortDate(plan.createdAt)}
            </span>
            {plan.createdByName && (
              <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                <UserRound className="h-3.5 w-3.5" />
                {plan.createdByName}
              </span>
            )}
          </div>
          {!expanded && (
            <p className="mt-1 truncate text-sm text-slate-500">
              {plan.notes || procedureSummary(plan)}
            </p>
          )}
        </div>
        <span className="hidden text-sm font-medium text-slate-700 sm:inline">
          {patientName}
        </span>
        <span
          className={clsx(
            'rounded-full px-2.5 py-1 text-[11px] font-bold ring-1',
            meta.className,
          )}
        >
          {meta.label}
        </span>
        <ChevronDown
          className={clsx(
            'h-4 w-4 text-slate-400 transition',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Procedimiento</th>
                  <th className="px-4 py-2">Pieza</th>
                  <th className="px-4 py-2 text-right">USD</th>
                  <th className="px-4 py-2 text-right">Bs</th>
                </tr>
              </thead>
              <tbody>
                {(plan.items ?? []).map((item: TreatmentPlanItem) => (
                  <tr key={item.id} className="border-t border-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {item.treatmentName || 'Procedimiento'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {item.toothNumber ?? 'General'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${Number(item.lineTotal).toFixed(0)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {rate
                        ? `${usdToVes(item.lineTotal, rate).toLocaleString('es-VE')} Bs`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total presupuesto
              </p>
              <p className="font-display text-lg font-bold text-[#2b7a78]">
                {patientName}{' '}
                <span className="text-slate-400">/</span>{' '}
                {formatUsd(plan.totalAmount)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Pagado {formatUsd(plan.paidAmount)} · Pendiente {formatUsd(due)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {group === 'ACCEPTED' && (
                <Button
                  type="button"
                  className="border-0 bg-[#2b7a78] hover:bg-[#236663]"
                  onClick={onStartAttention}
                >
                  Pasar a atención
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={onPrint}>
                <FileText className="h-4 w-4" />
                Ver PDF
              </Button>
              <Button type="button" variant="secondary" onClick={onPrint}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
              {canWrite && plan.paidAmount <= 0.009 && (
                <Button type="button" variant="secondary" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              )}
              {canWrite && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={onDuplicate}
                >
                  <Copy className="h-4 w-4" />
                  {group === 'REJECTED' ? 'Re-cotizar' : 'Duplicar'}
                </Button>
              )}
            </div>
          </div>

          {canWrite && plan.paidAmount <= 0.009 && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
              {group !== 'ACCEPTED' && (
                <Button
                  type="button"
                  disabled={busy}
                  className="border-0 bg-[#2b7a78] hover:bg-[#236663]"
                  onClick={() => onStatus('APPROVED')}
                >
                  Marcar aceptado
                </Button>
              )}
              {group !== 'REJECTED' && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onStatus('REJECTED')}
                >
                  Rechazar
                </Button>
              )}
              {group !== 'CANCELLED' && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onStatus('CANCELLED')}
                >
                  Cancelar
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
