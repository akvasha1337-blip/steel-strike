import { useRef } from 'preact/hooks';
import type { TargetView } from '../engine/types';
import type { Shape, TargetConfig } from '../settings';

/** Shared SVG defs: brushed-steel gradients and the no-shoot hatch. Rendered once per range. */
export function PlateDefs() {
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <defs>
        <radialGradient id="steelIdle" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stop-color="var(--steel-hi)" stop-opacity="0.55" />
          <stop offset="100%" stop-color="var(--steel-lo)" />
        </radialGradient>
        <radialGradient id="steelLive" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stop-color="var(--steel-hi)" />
          <stop offset="70%" stop-color="var(--steel)" />
          <stop offset="100%" stop-color="var(--steel-lo)" />
        </radialGradient>
        <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="var(--panel-2)" />
          <rect width="5" height="10" fill="var(--warn)" opacity="0.85" />
        </pattern>
      </defs>
    </svg>
  );
}

const SIL = 'M-13,-56 H13 V-41 H29 L44,-25 V28 L28,48 H-28 L-44,28 V-25 L-29,-41 H-13 Z';
const POPPER_BODY = 'M-15,-6 L15,-6 L23,46 L-23,46 Z';

function ShapeEls({ shape, cls, fill, stroke }: { shape: Shape; cls: string; fill?: string; stroke?: string }) {
  const p = { class: cls, fill, stroke };
  switch (shape) {
    case 'square':
      return <rect {...p} x={-37} y={-37} width={74} height={74} rx={3} />;
    case 'popper':
      return (
        <g>
          <circle {...p} cx={0} cy={-26} r={21} />
          <path {...p} d={POPPER_BODY} />
        </g>
      );
    case 'silhouette':
      return <path {...p} d={SIL} />;
    default:
      return <circle {...p} cx={0} cy={0} r={40} />;
  }
}

/** Vertical centre of the glyph for each shape. */
const GLYPH_Y: Record<Shape, number> = { circle: 0, square: 0, popper: -26, silhouette: -4 };

export interface PlateProps {
  cfg: TargetConfig;
  view?: TargetView;
  offline?: boolean;
  caption?: string;
  showName?: boolean;
  selected?: boolean;
  draggable?: boolean;
}

export function PlateSvg({ cfg, view, offline }: { cfg: TargetConfig; view?: TargetView; offline?: boolean }) {
  const state = offline ? 'offline' : view?.state ?? 'idle';
  const owned = state === 'owned' ? view?.color : undefined;
  const gy = GLYPH_Y[cfg.shape];
  let glyph: string | null = null;
  if (state === 'hit') glyph = '✓';
  else if (state === 'miss') glyph = '✕';
  else if (state === 'noshoot') glyph = 'NO';
  else if (state === 'offline') glyph = '!';
  else if (view?.label) glyph = view.label;
  else glyph = String(cfg.id);
  const glyphColor = state === 'hit' || state === 'miss' ? '#fff' : state === 'active' ? 'var(--accent-ink)' : state === 'owned' ? '#fff' : 'var(--fg)';
  const flashColor = view?.flashOk === false ? 'var(--stop)' : 'var(--go)';
  return (
    <svg viewBox="-60 -64 120 152" class={`st-${state}`} role="img" aria-label={`${cfg.name}: ${state}`}>
      {/* stand */}
      <rect x={-3} y={cfg.shape === 'circle' || cfg.shape === 'square' ? 36 : 44} width={6} height={36} fill="var(--steel-lo)" />
      <rect x={-22} y={78} width={44} height={6} rx={2} fill="var(--steel-lo)" />
      {state === 'active' && <ShapeEls shape={cfg.shape} cls="halo" fill="none" />}
      <ShapeEls shape={cfg.shape} cls="face" fill={owned} stroke={owned ? '#0006' : undefined} />
      {view?.flash !== undefined && (
        <g key={view.flash}>
          <ShapeEls shape={cfg.shape} cls="flashfill" fill={flashColor} />
          <circle
            class="ripple"
            cx={0}
            cy={gy}
            r={30}
            stroke={flashColor}
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animationName: 'rippleScale' }}
          />
        </g>
      )}
      {glyph && (
        <text class="glyph" x={0} y={gy} text-anchor="middle" dominant-baseline="central" font-size={glyph.length > 1 ? 26 : 34} fill={glyphColor}>
          {glyph}
        </text>
      )}
    </svg>
  );
}

export interface RangeProps {
  targets: TargetConfig[];
  views?: Record<number, TargetView>;
  offline?: Set<number>;
  captions?: Record<number, string>;
  showNames?: boolean;
  selected?: number | null;
  onPlate?: (id: number) => void;
  onMove?: (id: number, x: number, y: number) => void;
  className?: string;
  label?: string;
}

export function Range({ targets, views, offline, captions, showNames, selected, onPlate, onMove, className, label }: RangeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; moved: boolean } | null>(null);

  const pos = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(0.96, Math.max(0.04, (e.clientX - r.left) / r.width)),
      y: Math.min(0.6, Math.max(0.2, (e.clientY - r.top) / r.height)),
    };
  };

  return (
    <div class={`range ${className ?? ''}`} ref={ref} role="group" aria-label={label ?? 'Range layout'}>
      <PlateDefs />
      <div class="ground" />
      <div class="dist">10–15 m</div>
      {targets.map((cfg) => (
        <div
          key={cfg.id}
          class={`plate ${onMove ? 'drag' : ''} ${selected === cfg.id ? 'sel' : ''}`}
          style={{ left: `${cfg.x * 100}%`, top: `${cfg.y * 100}%`, '--s': cfg.size } as any}
          tabIndex={onPlate ? 0 : -1}
          role={onPlate ? 'button' : undefined}
          aria-label={`${cfg.name}${views?.[cfg.id] ? ', ' + views[cfg.id].state : ''}`}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && onPlate) {
              e.preventDefault();
              onPlate(cfg.id);
            }
          }}
          onPointerDown={(e) => {
            if (onMove) {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { id: cfg.id, moved: false };
            } else onPlate?.(cfg.id);
          }}
          onPointerMove={(e) => {
            if (!drag.current || drag.current.id !== cfg.id) return;
            drag.current.moved = true;
            const p = pos(e);
            onMove?.(cfg.id, p.x, p.y);
          }}
          onPointerUp={() => {
            if (drag.current && !drag.current.moved) onPlate?.(cfg.id);
            drag.current = null;
          }}
        >
          <PlateSvg cfg={cfg} view={views?.[cfg.id]} offline={offline?.has(cfg.id)} />
          <div class="cap tabnum">{captions?.[cfg.id] ?? ''}</div>
          {showNames && <div class="nm">{cfg.name}</div>}
        </div>
      ))}
    </div>
  );
}
