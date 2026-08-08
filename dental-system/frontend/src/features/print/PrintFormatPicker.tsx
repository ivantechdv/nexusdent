import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, FileText, Printer } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import {
  listPrintFormatsApi,
  type PrintFormat,
} from '@/services/print-templates.api';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (format: PrintFormat) => void;
  selectedCount: number;
};

export function PrintFormatPicker({
  open,
  onClose,
  onConfirm,
  selectedCount,
}: Props) {
  const logQ = useQuery({
    queryKey: ['print-formats', 'ATTENTION_LOG'],
    queryFn: () => listPrintFormatsApi('ATTENTION_LOG'),
    enabled: open,
  });
  const historyQ = useQuery({
    queryKey: ['print-formats', 'MEDICAL_HISTORY'],
    queryFn: () => listPrintFormatsApi('MEDICAL_HISTORY'),
    enabled: open,
  });

  const formats = useMemo(() => {
    const history = historyQ.data ?? [];
    const log = logQ.data ?? [];
    // Historia primero (formato Ortodent), luego bitácoras
    return [...history, ...log];
  }, [historyQ.data, logQ.data]);

  const loading = logQ.isLoading || historyQ.isLoading;
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!formats.length) return;
    setPicked((prev) => {
      if (prev && formats.some((f) => f.id === prev)) return prev;
      const preferred =
        formats.find((f) => f.docType === 'MEDICAL_HISTORY' && f.isDefault) ??
        formats.find((f) => f.docType === 'MEDICAL_HISTORY') ??
        formats.find((f) => f.isDefault) ??
        formats[0];
      return preferred.id;
    });
  }, [formats]);

  function confirm() {
    const format = formats.find((f) => f.id === picked) ?? formats[0];
    if (!format) return;
    onConfirm(format);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elegí cómo imprimir"
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={!formats.length || loading}
          >
            <Printer className="h-4 w-4" />
            Imprimir{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-clinic-slate">
        Incluye historia clínico-odontológica y bitácoras. Se editan en
        Configuración de impresión.
      </p>

      {loading ? (
        <p className="text-sm text-clinic-slate">Cargando formatos…</p>
      ) : formats.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-clinic-slate">
            No hay formatos activos.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {formats.map((f) => {
            const active = picked === f.id;
            const isHistory = f.docType === 'MEDICAL_HISTORY';
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setPicked(f.id)}
                  className={clsx(
                    'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition',
                    active
                      ? 'border-clinic-deep bg-clinic-deep/5 ring-2 ring-clinic-deep/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <span
                    className={clsx(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      active
                        ? 'border-clinic-deep bg-clinic-deep text-white'
                        : 'border-slate-300',
                    )}
                  >
                    {active && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-clinic-ink">
                        {f.name}
                      </span>
                      {isHistory ? (
                        <Badge tone="success">Historia clínica</Badge>
                      ) : (
                        <Badge tone="neutral">Bitácora</Badge>
                      )}
                      {f.isDefault && <Badge tone="info">Predeterminado</Badge>}
                    </span>
                    {f.description && (
                      <span className="mt-0.5 block text-xs text-clinic-slate">
                        {f.description}
                      </span>
                    )}
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <Chip on={f.showPrices}>Precios</Chip>
                      <Chip on={f.showClinicalNotes}>Notas</Chip>
                      <Chip on={f.showSignatures}>Firmas</Chip>
                      <Chip on={Boolean(f.headerId)}>Encabezado</Chip>
                      <Chip on={Boolean(f.footerId)}>Pie</Chip>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        on
          ? 'bg-emerald-50 text-emerald-800'
          : 'bg-slate-100 text-slate-400 line-through',
      )}
    >
      {children}
    </span>
  );
}
