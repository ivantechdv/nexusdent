import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ToothSvg } from './ToothSvg';
import {
  LOWER_PRIMARY,
  LOWER_TEETH,
  OdontogramCondition,
  OdontogramStateItem,
  OdontogramStatus,
  ToothSurface,
  UPPER_PRIMARY,
  UPPER_TEETH,
} from './odontogram.types';

type Dentition = 'adult' | 'child';

type LegendTool = {
  id: string;
  label: string;
  swatch: string;
  condition: OdontogramCondition;
  status: OdontogramStatus;
};

const LEGEND_TOOLS: LegendTool[] = [
  {
    id: 'healthy',
    label: 'Sano',
    swatch: 'bg-white border border-slate-300',
    condition: 'HEALTHY',
    status: 'PRESENT',
  },
  {
    id: 'caries',
    label: 'Caries',
    swatch: 'bg-red-600',
    condition: 'CARIES',
    status: 'PRESENT',
  },
  {
    id: 'treated',
    label: 'Tratado',
    swatch: 'bg-blue-600',
    condition: 'RESTORATION',
    status: 'TREATED',
  },
  {
    id: 'endo',
    label: 'Endodoncia',
    swatch: 'bg-violet-600',
    condition: 'ENDO_NEEDED',
    status: 'IN_PROGRESS',
  },
  {
    id: 'missing',
    label: 'Ausente',
    swatch: 'bg-slate-800',
    condition: 'MISSING',
    status: 'ABSENT',
  },
  {
    id: 'crown',
    label: 'Corona',
    swatch: 'bg-slate-400',
    condition: 'CROWN',
    status: 'TREATED',
  },
  {
    id: 'implant',
    label: 'Implante',
    swatch: 'bg-cyan-500',
    condition: 'IMPLANT',
    status: 'TREATED',
  },
];

const TOOTH_TYPE_LABEL: Record<number, string> = {
  11: 'Incisivo Central Superior',
  12: 'Incisivo Lateral Superior',
  13: 'Canino Superior',
  14: 'Premolar Superior',
  15: 'Premolar Superior',
  16: 'Molar Superior',
  17: 'Molar Superior',
  18: 'Molar Superior',
  21: 'Incisivo Central Superior',
  22: 'Incisivo Lateral Superior',
  23: 'Canino Superior',
  24: 'Premolar Superior',
  25: 'Premolar Superior',
  26: 'Molar Superior',
  27: 'Molar Superior',
  28: 'Molar Superior',
};

function toothLabel(n: number) {
  const mod = n % 10;
  const generic =
    mod <= 2
      ? 'Incisivo'
      : mod === 3
        ? 'Canino'
        : mod <= 5
          ? 'Premolar'
          : 'Molar';
  return TOOTH_TYPE_LABEL[n] ?? `Pieza ${n} — ${generic}`;
}

export interface OdontogramDigitalProps {
  states: OdontogramStateItem[];
  onChange: (next: OdontogramStateItem) => void;
  readOnly?: boolean;
}

export function OdontogramDigital({
  states,
  onChange,
  readOnly = false,
}: OdontogramDigitalProps) {
  const [dentition, setDentition] = useState<Dentition>('adult');
  const [activeTool, setActiveTool] = useState(LEGEND_TOOLS[1].id);
  const [hoverTooth, setHoverTooth] = useState<number | null>(null);
  const [selected, setSelected] = useState<{
    tooth: number;
    surface?: ToothSurface;
  } | null>(null);

  const upperTeeth = dentition === 'adult' ? UPPER_TEETH : UPPER_PRIMARY;
  const lowerTeeth = dentition === 'adult' ? LOWER_TEETH : LOWER_PRIMARY;

  const byTooth = useMemo(() => {
    const map = new Map<number, OdontogramStateItem[]>();
    for (const s of states) {
      const list = map.get(s.toothNumber) ?? [];
      list.push(s);
      map.set(s.toothNumber, list);
    }
    return map;
  }, [states]);

  const tool = LEGEND_TOOLS.find((t) => t.id === activeTool) ?? LEGEND_TOOLS[1];

  const apply = (tooth: number, surface: ToothSurface) => {
    if (readOnly) return;
    onChange({
      toothNumber: tooth,
      surface,
      condition: tool.condition,
      status: tool.status,
    });
    setSelected({ tooth, surface });
  };

  function renderRow(teeth: readonly number[]) {
    return (
      <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1">
        {teeth.map((n, i) => (
          <div
            key={n}
            className="relative flex"
            onMouseEnter={() => setHoverTooth(n)}
            onMouseLeave={() => setHoverTooth((prev) => (prev === n ? null : prev))}
          >
            {i === Math.floor(teeth.length / 2) && (
              <div className="mx-0.5 w-px self-stretch bg-slate-200 sm:mx-1" />
            )}
            <ToothSvg
              toothNumber={n}
              states={byTooth.get(n) ?? []}
              selected={selected}
              onSurfaceClick={(tooth, surface) => {
                setSelected({ tooth, surface });
                apply(tooth, surface);
              }}
              onToothClick={(tooth) => {
                setSelected({ tooth, surface: 'WHOLE' });
                apply(tooth, 'WHOLE');
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Odontograma Digital
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Selecciona superficies para diagnosticar o registrar tratamientos.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setDentition('adult')}
            className={clsx(
              'rounded-md px-3 py-1.5 transition',
              dentition === 'adult'
                ? 'bg-white text-[#2b7a78] shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            Adulto (32)
          </button>
          <button
            type="button"
            onClick={() => setDentition('child')}
            className={clsx(
              'rounded-md px-3 py-1.5 transition',
              dentition === 'child'
                ? 'bg-white text-[#2b7a78] shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            Infantil (20)
          </button>
        </div>
      </div>

      <div className="relative flex-1 space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        {hoverTooth != null && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            Pieza {hoverTooth} — {toothLabel(hoverTooth)}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-center text-[11px] font-bold uppercase tracking-wider text-[#2b7a78]">
            Arcada Superior (Maxilar)
          </p>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-1 py-3 sm:px-2">
            {renderRow(upperTeeth)}
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-1 py-3 sm:px-2">
            {renderRow(lowerTeeth)}
          </div>
          <p className="text-center text-[11px] font-bold uppercase tracking-wider text-[#2b7a78]">
            Arcada Inferior (Mandibular)
          </p>
        </div>
      </div>

      {!readOnly && (
        <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Leyenda de estados
          </p>
          <div className="flex flex-wrap gap-2">
            {LEGEND_TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTool(t.id)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                  activeTool === t.id
                    ? 'border-[#2b7a78] bg-teal-50 text-[#2b7a78] ring-1 ring-[#2b7a78]/30'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}
              >
                <span className={clsx('h-2.5 w-2.5 rounded-full', t.swatch)} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
