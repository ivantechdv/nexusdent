import { useMemo, useState } from 'react';
import { Paintbrush } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ToothSvg } from './ToothSvg';
import {
  ColorCode,
  LOWER_TEETH,
  OdontogramStateItem,
  SURFACE_LABELS,
  ToothSurface,
  UPPER_TEETH,
  colorCodeToState,
} from './odontogram.types';

export interface OdontogramProps {
  states: OdontogramStateItem[];
  onChange: (next: OdontogramStateItem) => void;
  readOnly?: boolean;
}

const COLOR_TOOLS: Array<{
  code: ColorCode;
  label: string;
  swatch: string;
  meaning: string;
}> = [
  { code: 'RED', label: 'Rojo', swatch: 'bg-red-600', meaning: 'Tratamiento requerido / Caries' },
  { code: 'BLUE', label: 'Azul', swatch: 'bg-blue-600', meaning: 'Tratamiento realizado / Calza / Corona' },
  { code: 'BLACK', label: 'Negro', swatch: 'bg-gray-700', meaning: 'Pieza ausente / Exodoncia' },
  { code: 'GREEN', label: 'Verde', swatch: 'bg-green-600', meaning: 'En proceso' },
  { code: 'CLEAR', label: 'Limpiar', swatch: 'bg-slate-100 border border-slate-300', meaning: 'Sano / Sin hallazgo' },
];

export function Odontogram({ states, onChange, readOnly = false }: OdontogramProps) {
  const [tool, setTool] = useState<ColorCode>('RED');
  const [selected, setSelected] = useState<{
    tooth: number;
    surface?: ToothSurface;
  } | null>(null);

  const byTooth = useMemo(() => {
    const map = new Map<number, OdontogramStateItem[]>();
    for (const s of states) {
      const list = map.get(s.toothNumber) ?? [];
      list.push(s);
      map.set(s.toothNumber, list);
    }
    return map;
  }, [states]);

  const apply = (tooth: number, surface: ToothSurface) => {
    if (readOnly) return;
    const mapped = colorCodeToState(tool);
    if (!mapped) return;

    onChange({
      toothNumber: tooth,
      surface,
      condition: mapped.condition,
      status: mapped.status,
    });
    setSelected({ tooth, surface });
  };

  const handleSurface = (tooth: number, surface: ToothSurface) => {
    setSelected({ tooth, surface });
    apply(tooth, surface);
  };

  const handleTooth = (tooth: number) => {
    setSelected({ tooth, surface: 'WHOLE' });
    apply(tooth, 'WHOLE');
  };

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-clinic-ink">
            Odontograma — Notación FDI
          </h3>
          <p className="mt-0.5 text-sm text-clinic-slate">
            32 piezas adultas · 5 caras por diente (V, L/P, M, D, O)
          </p>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              <Paintbrush className="h-3.5 w-3.5" />
              Diagnóstico rápido
            </span>
            {COLOR_TOOLS.map((t) => (
              <button
                key={t.code}
                type="button"
                title={t.meaning}
                onClick={() => setTool(t.code)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  tool === t.code
                    ? 'ring-2 ring-accent ring-offset-1 bg-white'
                    : 'bg-white/80 hover:bg-white'
                }`}
              >
                <span className={`h-3 w-3 rounded-sm ${t.swatch}`} />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Arcada superior */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-clinic-slate">
          <span>Cuadrante 1 (sup. der.)</span>
          <span>Arcada superior</span>
          <span>Cuadrante 2 (sup. izq.)</span>
        </div>
        <div className="flex flex-wrap justify-center gap-1 rounded-lg bg-slate-50/80 px-2 py-3 ring-1 ring-slate-100">
          {UPPER_TEETH.map((n, i) => (
            <div key={n} className="relative flex">
              {i === 8 && (
                <div className="mx-1 w-px self-stretch bg-clinic-deep/30" />
              )}
              <ToothSvg
                toothNumber={n}
                states={byTooth.get(n) ?? []}
                selected={selected}
                onSurfaceClick={handleSurface}
                onToothClick={handleTooth}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Arcada inferior */}
      <div className="space-y-2">
        <div className="flex flex-wrap justify-center gap-1 rounded-lg bg-slate-50/80 px-2 py-3 ring-1 ring-slate-100">
          {LOWER_TEETH.map((n, i) => (
            <div key={n} className="relative flex">
              {i === 8 && (
                <div className="mx-1 w-px self-stretch bg-clinic-deep/30" />
              )}
              <ToothSvg
                toothNumber={n}
                states={byTooth.get(n) ?? []}
                selected={selected}
                onSurfaceClick={handleSurface}
                onToothClick={handleTooth}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-clinic-slate">
          <span>Cuadrante 4 (inf. der.)</span>
          <span>Arcada inferior</span>
          <span>Cuadrante 3 (inf. izq.)</span>
        </div>
      </div>

      {/* Selección activa */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
        {selected ? (
          <>
            <Badge tone="info">Pieza {selected.tooth}</Badge>
            {selected.surface && selected.surface !== 'WHOLE' && (
              <Badge tone="neutral">
                Cara {selected.surface} —{' '}
                {SURFACE_LABELS[selected.surface as Exclude<ToothSurface, 'WHOLE'>] ??
                  selected.surface}
              </Badge>
            )}
            {selected.surface === 'WHOLE' && (
              <Badge tone="accent">Pieza completa</Badge>
            )}
            {!readOnly && (
              <Button
                variant="ghost"
                className="ml-auto text-xs"
                onClick={() => setSelected(null)}
              >
                Limpiar selección
              </Button>
            )}
          </>
        ) : (
          <span className="text-clinic-slate">
            Seleccione una cara o el número de pieza para aplicar el diagnóstico.
          </span>
        )}
      </div>
    </div>
  );
}
