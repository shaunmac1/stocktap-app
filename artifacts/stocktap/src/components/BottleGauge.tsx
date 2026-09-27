import { useId, useRef } from "react";
import { clampTenths, fillToY, outlineFor, pathBounds, yToFill, type FillPoint } from "@/lib/bottle-shape";

type Props = {
  /** Outline path in the 1000x1000 bottle box. Falls back to a generic bottle. */
  shapePath?: string | null;
  /** Volume-to-height curve. Falls back to the generic bottle's curve. */
  fillCurve?: FillPoint[] | null;
  /** Tenths left in the bottle, 0-10. */
  tenths: number;
  /** Photo of the actual bottle (transparent cut-out on the same 1000x1000 box). */
  imageUrl?: string | null;
  /** Tap or drag on the bottle to set the level. */
  onChange?: (tenths: number) => void;
  className?: string;
};

/** A bottle drawn with its liquid level and a mark for every tenth. */
export function BottleGauge({ shapePath, fillCurve, imageUrl, tenths, onChange, className }: Props) {
  const clipId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const path = outlineFor(shapePath);
  const photo = typeof imageUrl === "string" && /^\/bottles\/[a-z0-9-]+\.webp$/.test(imageUrl) ? imageUrl : null;
  const curve = fillCurve && fillCurve.length >= 2 ? fillCurve : null;
  const b = pathBounds(path);
  // room on the left for the level line, on the right for the tenths scale and "10"
  const vb = `${b.x0 - 40} ${b.y0 - 20} ${b.x1 - b.x0 + 40 + 140} ${b.y1 - b.y0 + 40}`;
  const t = clampTenths(tenths);
  const levelY = 1000 - fillToY(curve, t / 10) * 1000;

  const setFromPointer = (clientY: number) => {
    const svg = svgRef.current;
    if (!svg || !onChange) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = 0;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    const fill = yToFill(curve, (1000 - p.y) / 1000);
    // snap to half-tenths so a tap lands on a sensible number
    onChange(clampTenths(Math.round(fill * 20) / 2));
  };

  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role={onChange ? "slider" : "img"}
      aria-label={`Bottle, ${t.toFixed(1)} tenths left`}
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={t}
      data-testid="bottle-gauge"
      style={{ touchAction: onChange ? "none" : undefined, cursor: onChange ? "pointer" : undefined }}
      onPointerDown={e => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setFromPointer(e.clientY); }}
      onPointerMove={e => { if (dragging.current) setFromPointer(e.clientY); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <defs>
        <clipPath id={`bottle-${clipId}`}>
          <path d={path} />
        </clipPath>
      </defs>
      {photo ? (
        <>
          <image href={photo} x={0} y={0} width={1000} height={1000} preserveAspectRatio="none" data-testid="bottle-photo" />
          {/* fade the empty part of the bottle so the level reads at a glance */}
          <rect
            x={b.x0 - 10}
            y={b.y0 - 10}
            width={b.x1 - b.x0 + 20}
            height={Math.max(0, levelY - b.y0 + 10)}
            clipPath={`url(#bottle-${clipId})`}
            className="fill-background"
            opacity={0.62}
            data-testid="bottle-empty-shade"
          />
        </>
      ) : (
        <>
          <path d={path} className="fill-muted" />
          <rect
            x={b.x0 - 10}
            y={levelY}
            width={b.x1 - b.x0 + 20}
            height={Math.max(0, 1000 - levelY)}
            clipPath={`url(#bottle-${clipId})`}
            className="fill-primary/70"
            data-testid="bottle-liquid"
          />
        </>
      )}
      {Array.from({ length: 10 }, (_, i) => i + 1).map(k => {
        const y = 1000 - fillToY(curve, k / 10) * 1000;
        const major = k % 2 === 0;
        return (
          <g key={k}>
            <line x1={b.x1 + 8} x2={b.x1 + (major ? 40 : 26)} y1={y} y2={y} className="stroke-muted-foreground" strokeWidth={major ? 6 : 4} />
            {!photo && <line x1={b.x0} x2={b.x1} y1={y} y2={y} className="stroke-background" strokeWidth={2} clipPath={`url(#bottle-${clipId})`} opacity={0.7} />}
            {major && (
              <text x={b.x1 + 46} y={y + 12} fontSize={34} className="fill-muted-foreground" fontWeight={600}>{k}</text>
            )}
          </g>
        );
      })}
      {!photo && <path d={path} fill="none" className="stroke-foreground" strokeWidth={8} strokeLinejoin="round" />}
      <line x1={b.x0 - 30} x2={b.x1 + 8} y1={levelY} y2={levelY} className="stroke-primary" strokeWidth={8} />
    </svg>
  );
}
