import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { LOWER_TEETH, UPPER_TEETH } from '@/features/clinical-history/odontogram.types';

interface MouthToothPickerProps {
  selected: number[];
  onChange: (teeth: number[]) => void;
}

type QuadrantId = 'Q1' | 'Q2' | 'Q3' | 'Q4';

const QUADRANTS: Record<
  QuadrantId,
  { label: string; short: string; teeth: readonly number[] }
> = {
  Q1: { label: 'Superior derecho', short: 'Sup. der', teeth: UPPER_TEETH.slice(0, 8) },
  Q2: { label: 'Superior izquierdo', short: 'Sup. izq', teeth: UPPER_TEETH.slice(8) },
  Q3: { label: 'Inferior izquierdo', short: 'Inf. izq', teeth: LOWER_TEETH.slice(8) },
  Q4: { label: 'Inferior derecho', short: 'Inf. der', teeth: LOWER_TEETH.slice(0, 8) },
};

/** Recorrido clínico: der→izq en superior, der→izq en inferior */
const ARCH_ORDER = [...UPPER_TEETH, ...LOWER_TEETH] as number[];

function partnerArch(tooth: number): number {
  // Misma posición mesio-distal en la otra arcada (11↔41, 27↔37, …)
  const u = UPPER_TEETH.indexOf(tooth as (typeof UPPER_TEETH)[number]);
  if (u >= 0) return LOWER_TEETH[u];
  const l = LOWER_TEETH.indexOf(tooth as (typeof LOWER_TEETH)[number]);
  return l >= 0 ? UPPER_TEETH[l] : tooth;
}

const W = 520;
const H = 300;

function positionsOnArc(
  count: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startDeg: number,
  endDeg: number,
) {
  return Array.from({ length: count }, (_, i) => {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + Math.cos(rad) * rx,
      y: cy - Math.sin(rad) * ry,
    };
  });
}

const UPPER_POS = positionsOnArc(16, W / 2, 95, 230, 72, 182, -2);
const LOWER_POS = positionsOnArc(16, W / 2, 205, 230, 72, -182, 2);

export function MouthToothPicker({ selected, onChange }: MouthToothPickerProps) {
  const set = useMemo(() => new Set(selected), [selected]);
  const [focus, setFocus] = useState(11);
  const [openQ, setOpenQ] = useState<QuadrantId | null>(null);

  const focusIdx = Math.max(0, ARCH_ORDER.indexOf(focus));
  const focusedOn = set.has(focus);

  function toggle(n: number) {
    if (set.has(n)) onChange(selected.filter((x) => x !== n));
    else onChange([...selected, n].sort((a, b) => a - b));
  }

  function move(delta: number) {
    const next = ARCH_ORDER[(focusIdx + delta + ARCH_ORDER.length) % ARCH_ORDER.length];
    setFocus(next);
  }

  function moveArch() {
    setFocus(partnerArch(focus));
  }

  function setQuadrantAll(qid: QuadrantId, on: boolean) {
    const teeth = QUADRANTS[qid].teeth;
    if (on) {
      const next = new Set(selected);
      for (const t of teeth) next.add(t);
      onChange([...next].sort((a, b) => a - b));
    } else {
      onChange(selected.filter((t) => !(teeth as readonly number[]).includes(t)));
    }
  }

  const sheet = openQ ? QUADRANTS[openQ] : null;
  const sheetSelected = sheet
    ? sheet.teeth.filter((t) => set.has(t)).length
    : 0;

  const archLabel = (UPPER_TEETH as readonly number[]).includes(focus)
    ? 'Superior'
    : 'Inferior';
  const sideLabel = [1, 4].includes(Math.floor(focus / 10)) ? 'Derecho' : 'Izquierdo';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-clinic-ink">
            Piezas trabajadas
          </h2>
          <p className="text-xs text-clinic-slate">
            En el celular: mové con flechas y marcá. Opcional.
          </p>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-clinic-slate">
              {selected.length} pieza{selected.length === 1 ? '' : 's'}:{' '}
              {selected
                .slice()
                .sort((a, b) => a - b)
                .join(', ')}
            </span>
            <button
              type="button"
              className="text-xs font-semibold text-clinic-deep hover:underline"
              onClick={() => onChange([])}
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Control principal móvil: pad de flechas */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 md:hidden">
        <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-clinic-slate">
          {archLabel} · {sideLabel}
        </p>

        <div className="mx-auto grid max-w-[220px] grid-cols-3 gap-2">
          <div />
          <NavBtn ariaLabel="Arcada superior / inferior" onClick={moveArch}>
            <ChevronUp className="h-6 w-6" />
          </NavBtn>
          <div />

          <NavBtn ariaLabel="Pieza anterior" onClick={() => move(-1)}>
            <ChevronLeft className="h-6 w-6" />
          </NavBtn>

          <button
            type="button"
            onClick={() => toggle(focus)}
            className={clsx(
              'flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-2xl font-bold tabular-nums transition active:scale-95',
              focusedOn
                ? 'border-accent bg-accent text-white shadow-md'
                : 'border-clinic-deep/30 bg-slate-50 text-clinic-ink',
            )}
            aria-label={
              focusedOn ? `Quitar pieza ${focus}` : `Seleccionar pieza ${focus}`
            }
          >
            {focus}
            {focusedOn && <Check className="mt-0.5 h-4 w-4" />}
          </button>

          <NavBtn ariaLabel="Pieza siguiente" onClick={() => move(1)}>
            <ChevronRight className="h-6 w-6" />
          </NavBtn>

          <div />
          <NavBtn ariaLabel="Cambiar de arcada" onClick={moveArch}>
            <ChevronDown className="h-6 w-6" />
          </NavBtn>
          <div />
        </div>

        <button
          type="button"
          onClick={() => toggle(focus)}
          className={clsx(
            'mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition active:scale-[0.99]',
            focusedOn
              ? 'bg-slate-100 text-clinic-ink'
              : 'bg-accent text-white shadow-sm',
          )}
        >
          {focusedOn ? (
            <>Quitar pieza {focus}</>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Seleccionar pieza {focus}
            </>
          )}
        </button>
      </div>

      {/* Mapa bucal */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-rose-50/70 via-white to-sky-50/60 p-2 sm:p-3">
        <div
          className="relative mx-auto w-full max-w-lg"
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            <ellipse
              cx={W / 2}
              cy={H / 2}
              rx={245}
              ry={128}
              fill="rgba(255,255,255,0.55)"
              stroke="rgba(251, 113, 133, 0.28)"
              strokeWidth="1.5"
            />
            <ellipse
              cx={W / 2}
              cy={H / 2}
              rx={100}
              ry={22}
              fill="rgba(254, 226, 226, 0.5)"
              stroke="rgba(251, 113, 133, 0.2)"
              strokeWidth="1"
            />
            <line
              x1={W / 2}
              y1={36}
              x2={W / 2}
              y2={H - 36}
              stroke="rgba(148, 163, 184, 0.4)"
              strokeDasharray="3 3"
            />
            <text
              x={W / 2}
              y={26}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="11"
              fontWeight="700"
              letterSpacing="2"
            >
              SUPERIOR
            </text>
            <text
              x={28}
              y={H / 2 + 3}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="10"
              fontWeight="600"
            >
              DER
            </text>
            <text
              x={W - 28}
              y={H / 2 + 3}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="10"
              fontWeight="600"
            >
              IZQ
            </text>
            <text
              x={W / 2}
              y={H - 14}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="11"
              fontWeight="700"
              letterSpacing="2"
            >
              INFERIOR
            </text>
          </svg>

          {UPPER_TEETH.map((n, i) => (
            <MouthChip
              key={n}
              n={n}
              active={set.has(n)}
              focused={focus === n}
              onClick={() => {
                setFocus(n);
                // En desktop toggle directo; en móvil solo enfoca (el pad marca)
                if (window.matchMedia('(min-width: 768px)').matches) {
                  toggle(n);
                }
              }}
              x={(UPPER_POS[i].x / W) * 100}
              y={(UPPER_POS[i].y / H) * 100}
            />
          ))}
          {LOWER_TEETH.map((n, i) => (
            <MouthChip
              key={`l-${n}`}
              n={n}
              active={set.has(n)}
              focused={focus === n}
              mirror
              onClick={() => {
                setFocus(n);
                if (window.matchMedia('(min-width: 768px)').matches) {
                  toggle(n);
                }
              }}
              x={(LOWER_POS[i].x / W) * 100}
              y={(LOWER_POS[i].y / H) * 100}
            />
          ))}
        </div>
      </div>

      {/* Atajos de cuadrante */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['Q1', 'Q2', 'Q4', 'Q3'] as QuadrantId[]).map((id) => {
          const q = QUADRANTS[id];
          const count = q.teeth.filter((t) => set.has(t)).length;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setOpenQ(id)}
              className={clsx(
                'rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98]',
                count > 0
                  ? 'border-accent/40 bg-orange-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <span className="block text-xs font-semibold text-clinic-ink">
                {q.short}
              </span>
              <span className="text-[10px] text-clinic-slate">
                {count > 0
                  ? `${count} seleccionada${count === 1 ? '' : 's'}`
                  : 'Ver lista'}
              </span>
            </button>
          );
        })}
      </div>

      <Modal
        open={openQ != null}
        onClose={() => setOpenQ(null)}
        title={sheet?.label ?? 'Piezas'}
      >
        {sheet && openQ && (
          <div className="space-y-4">
            <p className="text-sm text-clinic-slate">
              Lista grande del cuadrante — ideal si preferís ver las 8 juntas.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {sheet.teeth.map((n) => {
                const on = set.has(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setFocus(n);
                      toggle(n);
                    }}
                    aria-pressed={on}
                    className={clsx(
                      'flex h-14 flex-col items-center justify-center rounded-xl border text-base font-bold tabular-nums transition active:scale-95',
                      on
                        ? 'border-accent bg-accent text-white shadow-sm ring-2 ring-orange-200'
                        : 'border-slate-200 bg-white text-clinic-ink',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setQuadrantAll(openQ, true)}
              >
                Todas
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setQuadrantAll(openQ, false)}
                disabled={sheetSelected === 0}
              >
                Ninguna
              </Button>
            </div>
            <Button type="button" className="w-full" onClick={() => setOpenQ(null)}>
              Listo{sheetSelected > 0 ? ` · ${sheetSelected}` : ''}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function NavBtn({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex aspect-square items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-clinic-ink transition active:scale-95 active:bg-slate-100"
    >
      {children}
    </button>
  );
}

function MouthChip({
  n,
  active,
  focused,
  onClick,
  x,
  y,
  mirror,
}: {
  n: number;
  active: boolean;
  focused?: boolean;
  onClick: () => void;
  x: number;
  y: number;
  mirror?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Pieza ${n}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={clsx(
        'absolute flex h-7 w-6 -translate-x-1/2 -translate-y-1/2 flex-col items-center border text-[9px] font-bold leading-none tabular-nums transition sm:h-8 sm:w-7 sm:text-[10px]',
        mirror
          ? 'justify-start rounded-t-md rounded-b-sm pt-0.5'
          : 'justify-end rounded-b-md rounded-t-sm pb-0.5',
        active
          ? 'z-20 border-accent bg-accent text-white shadow-sm'
          : 'z-10 border-slate-300 bg-gradient-to-b from-white to-slate-100 text-clinic-ink',
        focused && 'z-30 ring-2 ring-clinic-deep ring-offset-1',
      )}
    >
      {n}
    </button>
  );
}
