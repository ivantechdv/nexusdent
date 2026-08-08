import clsx from 'clsx';
import {
  OdontogramCondition,
  OdontogramStateItem,
  OdontogramStatus,
  ToothSurface,
  isPosterior,
  lingualOrPalatal,
  resolveSurfaceColor,
} from './odontogram.types';

interface ToothSvgProps {
  toothNumber: number;
  states: OdontogramStateItem[];
  selected?: { tooth: number; surface?: ToothSurface } | null;
  onSurfaceClick: (tooth: number, surface: ToothSurface) => void;
  onToothClick: (tooth: number) => void;
  size?: number;
}

function findState(
  states: OdontogramStateItem[],
  surface: ToothSurface,
): OdontogramStateItem | undefined {
  return (
    states.find((s) => s.surface === surface) ??
    states.find((s) => s.surface === 'WHOLE')
  );
}

function fillFor(
  states: OdontogramStateItem[],
  surface: ToothSurface,
): string {
  const st = findState(states, surface);
  if (!st) return '#f8fafc';
  return resolveSurfaceColor(st.condition as OdontogramCondition, st.status as OdontogramStatus);
}

/**
 * Diente SVG con 5 zonas clicables:
 * Mesial | Oclusal | Distal  (centro)
 * Vestibular (arriba en superior / abajo en inferior — se unifica visualmente)
 * Lingual/Palatina (opuesto)
 *
 * Layout geométrico tipo cruz:
 *        [ V ]
 *   [ M ][ O ][ D ]
 *        [ L/P ]
 */
export function ToothSvg({
  toothNumber,
  states,
  selected,
  onSurfaceClick,
  onToothClick,
  size = 52,
}: ToothSvgProps) {
  const lp = lingualOrPalatal(toothNumber);
  const whole = findState(states, 'WHOLE');
  const isMissing =
    whole?.condition === 'MISSING' || whole?.status === 'ABSENT';
  const isSelectedTooth = selected?.tooth === toothNumber;

  const stroke = isSelectedTooth ? '#f97316' : '#94a3b8';
  const strokeW = isSelectedTooth ? 2 : 1;

  // Coordenadas internas (viewBox 0 0 60 70)
  const surfaces: Array<{
    key: ToothSurface;
    d: string;
  }> = [
    { key: 'V', d: 'M12 4 H48 L42 18 H18 Z' },
    { key: 'M', d: 'M4 20 H18 V50 H4 Z' },
    {
      key: 'O',
      d: isPosterior(toothNumber)
        ? 'M18 20 H42 V50 H18 Z'
        : 'M18 20 H42 V50 H18 Z',
    },
    { key: 'D', d: 'M42 20 H56 V50 H42 Z' },
    { key: lp, d: 'M18 52 H42 L48 66 H12 Z' },
  ];

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        title={`Pieza ${toothNumber} (clic = pieza completa)`}
        onClick={() => onToothClick(toothNumber)}
        className={clsx(
          'rounded px-1 font-display text-[10px] font-bold tabular-nums transition',
          isSelectedTooth ? 'bg-accent text-white' : 'text-clinic-slate hover:bg-slate-100',
        )}
      >
        {toothNumber}
      </button>

      <svg
        width={size}
        height={size * 1.15}
        viewBox="0 0 60 70"
        className={clsx(
          'overflow-visible drop-shadow-sm',
          isMissing && 'opacity-70',
        )}
        role="img"
        aria-label={`Diente FDI ${toothNumber}`}
      >
        {isMissing ? (
          <g>
            <rect
              x="8"
              y="8"
              width="44"
              height="54"
              rx="4"
              fill="#374151"
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <line
              x1="14"
              y1="14"
              x2="46"
              y2="56"
              stroke="#f8fafc"
              strokeWidth="2"
            />
            <line
              x1="46"
              y1="14"
              x2="14"
              y2="56"
              stroke="#f8fafc"
              strokeWidth="2"
            />
          </g>
        ) : (
          <g>
            {surfaces.map(({ key, d }) => {
              const isSel =
                selected?.tooth === toothNumber &&
                (selected.surface === key || selected.surface === 'WHOLE');
              return (
                <path
                  key={key}
                  d={d}
                  fill={fillFor(states, key)}
                  stroke={isSel ? '#f97316' : stroke}
                  strokeWidth={isSel ? 2 : strokeW}
                  className="cursor-pointer transition-opacity hover:opacity-90"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSurfaceClick(toothNumber, key);
                  }}
                >
                  <title>
                    {toothNumber} — {key}
                  </title>
                </path>
              );
            })}
            {/* Borde externo */}
            <path
              d="M12 4 H48 L56 20 V50 L48 66 H12 L4 50 V20 Z"
              fill="none"
              stroke={stroke}
              strokeWidth={strokeW}
              pointerEvents="none"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
