import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  Plus,
  Printer,
  RefreshCcw,
  X,
} from 'lucide-react';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { formatRate, formatVes, usdToVes } from '@/lib/exchange';
import { paymentMethodLabel } from '@/lib/payment-methods';
import {
  listPaymentsApi,
  listPlansApi,
  type Payment,
  type TreatmentPlan,
} from '@/services/billing.api';
import { toast } from '@/stores/toast.store';
import type { PatientBalance } from './FinancialBanner';

type TypeFilter = 'ALL' | 'FULL' | 'PARTIAL';

/** Formato Figma: $2.450,00 */
function moneyDollar(value: number) {
  const n = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `$${n}`;
}

function formatPayDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Etiqueta legible: viene de atención, no de “presupuesto”. */
function attentionLabel(plan: TreatmentPlan) {
  const title = plan.title?.trim() ?? '';
  const dateMatch = title.match(/(\d{4})-(\d{2})-(\d{2})/);
  const datePart =
    dateMatch != null
      ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`
      : null;

  const procs = (plan.items ?? [])
    .map((i) => i.treatmentName)
    .filter(Boolean)
    .slice(0, 2);

  // "Atención 2026-08-30 · Limpieza, Resina"
  const afterDot = title.includes('·')
    ? title.split('·').slice(1).join('·').trim()
    : '';

  if (/^atenci[oó]n/i.test(title) && datePart) {
    const detail = afterDot || procs.join(', ');
    return detail ? `Atención ${datePart} · ${detail}` : `Atención ${datePart}`;
  }
  if (title && !/^plan de tratamiento$/i.test(title)) return title;
  if (procs.length) return procs.join(', ');
  return 'Atención clínica';
}

function attentionProcedures(plan: TreatmentPlan) {
  return (plan.items ?? [])
    .map((i) => i.treatmentName)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
}

function paymentUsd(p: Payment) {
  return Number(p.amountPaid) || 0;
}

function paymentVes(p: Payment, fallbackRate: number | null) {
  if (p.amountPaidVes != null && p.amountPaidVes > 0) return p.amountPaidVes;
  const rate = p.exchangeRate ?? fallbackRate;
  if (rate && rate > 0) return usdToVes(paymentUsd(p), rate);
  return null;
}

function isFullPayment(p: Payment, plan?: TreatmentPlan | null) {
  if (/pago total|completo/i.test(p.notes ?? '')) return true;
  if (!plan) return false;
  return paymentUsd(p) >= plan.totalAmount - 0.009 && plan.totalAmount > 0.009;
}

function conceptLabel(p: Payment, plan?: TreatmentPlan | null) {
  if (plan) {
    const label = attentionLabel(plan);
    return label.length > 28 ? `${label.slice(0, 26)}…` : label;
  }
  const fromPlan = p.planTitle?.trim();
  if (fromPlan) {
    const dateMatch = fromPlan.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (/^atenci[oó]n/i.test(fromPlan) && dateMatch) {
      const detail = fromPlan.includes('·')
        ? fromPlan.split('·').slice(1).join('·').trim()
        : '';
      const base = `Atención ${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
      const full = detail ? `${base} · ${detail}` : base;
      return full.length > 28 ? `${full.slice(0, 26)}…` : full;
    }
    return fromPlan.length > 28 ? `${fromPlan.slice(0, 26)}…` : fromPlan;
  }
  if (p.notes?.trim()) {
    const n = p.notes.trim();
    if (/^pago total/i.test(n)) return 'Pago atención';
    if (/^abono/i.test(n)) return 'Abono atención';
    return n.length > 28 ? `${n.slice(0, 26)}…` : n;
  }
  return 'Abono atención';
}

function methodBadgeLabel(method: string) {
  const label = paymentMethodLabel(method);
  if (label === 'Transf') return 'Transferencia';
  if (label === 'Pago móvil') return 'Pago Móvil';
  return label;
}

interface PatientAccountStatementRedesignProps {
  patientId: string;
  patientName: string;
  documentId: string;
  balance: PatientBalance;
  onRegisterPayment: () => void;
}

export function PatientAccountStatementRedesign({
  patientId,
  patientName,
  documentId,
  balance,
  onRegisterPayment,
}: PatientAccountStatementRedesignProps) {
  const { rate: bcvRate } = useExchangeRate();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [showFilter, setShowFilter] = useState(false);
  const [methodFilter, setMethodFilter] = useState<string>('ALL');

  const paymentsQ = useQuery({
    queryKey: ['payments', patientId],
    queryFn: () => listPaymentsApi(patientId),
    staleTime: 15_000,
  });

  const plansQ = useQuery({
    queryKey: ['plans', patientId],
    queryFn: () => listPlansApi(patientId),
    staleTime: 15_000,
  });

  const payments = paymentsQ.data ?? [];
  const plans = plansQ.data ?? [];
  const planById = useMemo(
    () => new Map(plans.map((p) => [p.id, p])),
    [plans],
  );

  const pendingPlans = useMemo(
    () =>
      plans
        .filter((p) => p.totalAmount - p.paidAmount > 0.009)
        .sort(
          (a, b) =>
            b.totalAmount - b.paidAmount - (a.totalAmount - a.paidAmount),
        ),
    [plans],
  );

  const pendingDetailTotal = pendingPlans.reduce(
    (s, p) => s + (p.totalAmount - p.paidAmount),
    0,
  );

  const filtered = useMemo(() => {
    let rows = [...payments];
    if (methodFilter !== 'ALL') {
      rows = rows.filter((p) => p.paymentMethod === methodFilter);
    }
    if (typeFilter !== 'ALL') {
      rows = rows.filter((p) => {
        const full = isFullPayment(p, planById.get(p.treatmentPlanId));
        return typeFilter === 'FULL' ? full : !full;
      });
    }
    return rows;
  }, [payments, methodFilter, typeFilter, planById]);

  const lastUpdate = payments[0]?.paidAt
    ? formatPayDate(payments[0].paidAt)
    : new Date().toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

  function printStatement() {
    const rowsHtml = filtered
      .map((p) => {
        const plan = planById.get(p.treatmentPlanId);
        const ves = paymentVes(p, bcvRate);
        const full = isFullPayment(p, plan);
        return `<tr>
          <td>${formatPayDate(p.paidAt)}</td>
          <td>${conceptLabel(p, plan)}</td>
          <td>${methodBadgeLabel(p.paymentMethod)}</td>
          <td>${moneyDollar(paymentUsd(p))}</td>
          <td>${ves != null ? formatVes(ves) : '—'}</td>
          <td>${full ? 'Pago completo' : 'Abono'}</td>
          <td>${p.receiptNumber}</td>
        </tr>`;
      })
      .join('');

    const pendingHtml = pendingPlans
      .map((p) => {
        const due = p.totalAmount - p.paidAmount;
        const procs = attentionProcedures(p);
        return `<tr>
          <td>${attentionLabel(p)}${procs ? ` · ${procs}` : ''}</td>
          <td>${moneyDollar(due)}</td>
          <td>${moneyDollar(p.totalAmount)}</td>
          <td>${moneyDollar(p.paidAmount)}</td>
        </tr>`;
      })
      .join('');

    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      toast('Permití ventanas emergentes para imprimir', 'error');
      return;
    }
    w.document.write(`<!doctype html><html><head><title>Estado de cuenta</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:18px;margin:0 0 4px}
        .meta{color:#64748b;font-size:12px;margin-bottom:20px}
        .kpis{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
        .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;min-width:140px}
        .kpi b{display:block;font-size:16px;margin-top:4px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
        th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}
        th{color:#64748b;font-size:10px;text-transform:uppercase}
        @media print{button{display:none}}
      </style></head><body>
      <h1>Estado de cuenta</h1>
      <div class="meta">${patientName} · ${documentId}</div>
      <div class="kpis">
        <div class="kpi">Presupuestado<b>${moneyDollar(balance.totalBudgeted)}</b></div>
        <div class="kpi">Pagado<b>${moneyDollar(balance.totalPaid)}</b></div>
        <div class="kpi">Pendiente<b>${moneyDollar(balance.balanceDue)}</b></div>
        <div class="kpi">Abonos<b>${payments.length}</b></div>
      </div>
      <h2 style="font-size:14px">Historial de pagos</h2>
      <table><thead><tr>
        <th>Fecha</th><th>Concepto</th><th>Método</th><th>USD</th><th>Bs</th><th>Tipo</th><th>Recibo</th>
      </tr></thead><tbody>${rowsHtml || '<tr><td colspan="7">Sin pagos</td></tr>'}</tbody></table>
      <h2 style="font-size:14px">Saldo pendiente detallado</h2>
      <table><thead><tr>
        <th>Atención</th><th>Pendiente</th><th>Total</th><th>Pagado</th>
      </tr></thead><tbody>${pendingHtml || '<tr><td colspan="4">Sin saldos pendientes</td></tr>'}</tbody></table>
      <p class="meta">Tasa BCV: ${bcvRate ? `${formatRate(bcvRate)} Bs/USD` : '—'} · Generado ${new Date().toLocaleString('es-VE')}</p>
      <button onclick="window.print()">Imprimir</button>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <p className="text-[13px] font-medium text-slate-500">
            Total Presupuestado
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
            {moneyDollar(balance.totalBudgeted)}
          </p>
          <p className="mt-2 text-xs text-slate-400">Todos los tratamientos</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between">
            <p className="text-[13px] font-medium text-slate-500">Total Pagado</p>
            <CheckCircle2 className="h-6 w-6 text-emerald-500" strokeWidth={2} />
          </div>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
            {moneyDollar(balance.totalPaid)}
          </p>
          <p className="mt-2 text-xs text-slate-400">Monto conciliado</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between">
            <p className="text-[13px] font-medium text-slate-500">
              Total Pendiente
            </p>
            <Clock3 className="h-6 w-6 text-red-500" strokeWidth={2} />
          </div>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
            {moneyDollar(balance.balanceDue)}
          </p>
          <p className="mt-2 text-xs text-slate-400">Cuentas por cobrar</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between">
            <p className="text-[13px] font-medium text-slate-500">
              Abonos Realizados
            </p>
            <RefreshCcw className="h-6 w-6 text-sky-500" strokeWidth={2} />
          </div>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
            {payments.length}
          </p>
          <p className="mt-2 text-xs text-slate-400">Abonos a atenciones</p>
        </div>
      </div>

      {/* Historial + panel */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <h3 className="text-base font-semibold text-slate-800">
              Historial de Pagos y Abonos
            </h3>
            <button
              type="button"
              onClick={() => setShowFilter((v) => !v)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition',
                showFilter
                  ? 'border-[#2b7a78] bg-teal-50 text-[#2b7a78]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtrar transacciones
            </button>
          </div>

          {showFilter && (
            <div className="flex flex-wrap gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Tipo
                <select
                  value={typeFilter}
                  onChange={(e) =>
                    setTypeFilter(e.target.value as TypeFilter)
                  }
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium"
                >
                  <option value="ALL">Todos</option>
                  <option value="FULL">Pago completo</option>
                  <option value="PARTIAL">Abono</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Método
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium"
                >
                  <option value="ALL">Todos</option>
                  <option value="PAGO_MOVIL">Pago Móvil</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CASH">Efectivo</option>
                  <option value="ZELLE">Zelle</option>
                  <option value="CARD">Tarjeta</option>
                </select>
              </label>
            </div>
          )}

          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-3 py-3">Concepto</th>
                  <th className="px-3 py-3">Método</th>
                  <th className="px-3 py-3 text-right">USD</th>
                  <th className="px-3 py-3 text-right">BS (BCV)</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-5 py-3 text-center">Recibo</th>
                </tr>
              </thead>
              <tbody>
                {paymentsQ.isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-slate-400"
                    >
                      Cargando pagos…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-slate-400"
                    >
                      Sin transacciones registradas
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const full = isFullPayment(
                      p,
                      planById.get(p.treatmentPlanId),
                    );
                    const ves = paymentVes(p, bcvRate);
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-slate-100 hover:bg-slate-50/40"
                      >
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                          {formatPayDate(p.paidAt)}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-3.5 font-medium text-slate-800">
                          {conceptLabel(p, planById.get(p.treatmentPlanId))}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                            {methodBadgeLabel(p.paymentMethod)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums text-slate-800">
                          {moneyDollar(paymentUsd(p))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-slate-500">
                          {ves != null
                            ? new Intl.NumberFormat('es-VE', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(ves)
                            : '—'}
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={clsx(
                              'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              full
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-sky-50 text-sky-700',
                            )}
                          >
                            {full ? 'Pago completo' : 'Abono'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            title={`Recibo ${p.receiptNumber}`}
                            onClick={() => {
                              void navigator.clipboard?.writeText(
                                p.receiptNumber,
                              );
                              toast(`Recibo ${p.receiptNumber}`, 'info');
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition hover:bg-red-600"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={3} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              Acciones Disponibles
            </h3>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onRegisterPayment}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f97316] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Registrar Pago
              </button>
              <button
                type="button"
                onClick={printStatement}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2b7a78]/50 bg-white px-4 py-2.5 text-sm font-semibold text-[#2b7a78] transition hover:bg-teal-50"
              >
                <FileText className="h-4 w-4" />
                Exportar Estado de Cuenta
              </button>
              <button
                type="button"
                onClick={printStatement}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-2 px-4 pt-4">
              <h3 className="text-sm font-semibold text-slate-800">
                Saldo Pendiente Detallado
              </h3>
              <AlertTriangle className="h-5 w-5 shrink-0 text-orange-500" />
            </div>

            {pendingPlans.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Sin saldos pendientes
              </p>
            ) : (
              <ul className="mt-1 px-4 pb-1">
                {pendingPlans.map((p) => {
                  const due = p.totalAmount - p.paidAmount;
                  const hasPartial = p.paidAmount > 0.009;
                  const procs = attentionProcedures(p);
                  return (
                    <li
                      key={p.id}
                      className="border-b border-slate-100 py-3 last:border-0"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        {attentionLabel(p)}
                      </p>
                      <p className="text-xs font-medium text-orange-600">
                        Pendiente {moneyDollar(due)}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                        {procs ? `${procs} · ` : ''}
                        Total original: {moneyDollar(p.totalAmount)}
                        {hasPartial ? ' · Abonos registrados' : ' · Sin pagos'}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="m-3 rounded-lg bg-orange-50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-orange-900">
                  Total Pendiente
                </span>
                <span className="text-base font-bold tabular-nums text-orange-700">
                  {moneyDollar(pendingDetailTotal)}
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Footer BCV a ancho completo */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50/80 px-5 py-3 text-xs text-slate-600">
        <p className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Tasa Oficial BCV:{' '}
          <span className="font-semibold text-slate-800">
            {bcvRate != null
              ? `${formatRate(bcvRate)} Bs/USD`
              : 'No disponible'}
          </span>
        </p>
        <p className="text-slate-500">Última actualización: {lastUpdate}</p>
      </div>
    </div>
  );
}
