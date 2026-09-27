import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottleGauge } from "@/components/BottleGauge";
import { clampTenths, type FillPoint } from "@/lib/bottle-shape";

type Props = {
  /** Current value as the string the number pad edits. */
  value: string;
  onChange: (value: string) => void;
  shapePath?: string | null;
  fillCurve?: FillPoint[] | null;
  /** Short name of the container, e.g. "bottle". */
  noun?: string;
  /** Photo of the bottle, when the catalogue has one. */
  imageUrl?: string | null;
  /** The line's bottle size in ml. Shows the size picker when set together with onSizeChange. */
  sizeMl?: number | null;
  /** Save a new bottle size for this line. */
  onSizeChange?: (ml: number) => Promise<void> | void;
};

export const BOTTLE_SIZES: { ml: number; label: string }[] = [
  { ml: 200, label: "20cl" }, { ml: 350, label: "35cl" }, { ml: 500, label: "50cl" }, { ml: 700, label: "70cl" },
  { ml: 750, label: "75cl" }, { ml: 1000, label: "1L" }, { ml: 1500, label: "1.5L" }, { ml: 2000, label: "2L" },
];
export function sizeLabel(ml: number): string {
  return BOTTLE_SIZES.find(s => s.ml === ml)?.label ?? (ml >= 1000 ? `${ml / 1000}L` : `${ml / 10}cl`);
}

const QUICK = [
  { label: "Empty", t: 0 },
  { label: "¼", t: 2.5 },
  { label: "½", t: 5 },
  { label: "¾", t: 7.5 },
  { label: "Full", t: 10 },
];

/**
 * Count an open bottle in tenths without a scale: drag the slider or tap the
 * bottle where the drink comes up to. 10 is full, 5 is half.
 */
export function TenthsInput({ value, onChange, shapePath, fillCurve, noun = "bottle", imageUrl, sizeMl, onSizeChange }: Props) {
  const t = clampTenths(parseFloat(value) || 0);
  const set = (n: number) => onChange(String(clampTenths(n)));
  const [pendingMl, setPendingMl] = useState<number | null>(null);
  const [savingSize, setSavingSize] = useState(false);
  const sizes = sizeMl && !BOTTLE_SIZES.some(b => b.ml === sizeMl)
    ? [...BOTTLE_SIZES, { ml: sizeMl, label: sizeLabel(sizeMl) }].sort((a, b) => a.ml - b.ml)
    : BOTTLE_SIZES;
  const confirmSize = async () => {
    if (pendingMl == null || !onSizeChange) return;
    setSavingSize(true);
    try { await onSizeChange(pendingMl); setPendingMl(null); } finally { setSavingSize(false); }
  };
  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-3" data-testid="tenths-input">
      <p className="text-xs text-muted-foreground" data-testid="tenths-help">
        Look at the open {noun}: full is 10, half is 5. Drag the slider or tap the {noun} where the drink comes up to.
      </p>
      <div className="flex items-center gap-3">
        <BottleGauge shapePath={shapePath} fillCurve={fillCurve} imageUrl={imageUrl} tenths={t} onChange={set} className="h-52 w-28 shrink-0 select-none drop-shadow-sm" />
        <div className="flex-1 space-y-3">
          <div className="text-center">
            <span className="text-4xl font-bold text-primary" data-testid="tenths-value">{t.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground ml-1">/ 10 tenths</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={t}
            onChange={e => set(parseFloat(e.target.value))}
            aria-label={`Tenths left in the open ${noun}`}
            className="w-full accent-[hsl(var(--primary))] h-8"
            data-testid="tenths-slider"
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="icon" className="h-10 w-10" onClick={() => set(t - 0.5)} aria-label="Half a tenth less" data-testid="tenths-minus"><Minus className="w-4 h-4" /></Button>
            <div className="flex gap-1 flex-wrap justify-center">
              {QUICK.map(q => (
                <button key={q.label} type="button" onClick={() => set(q.t)}
                  className={`text-xs px-2 py-1 rounded-md border ${t === q.t ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                  data-testid={`tenths-quick-${q.t}`}>{q.label}</button>
              ))}
            </div>
            <Button type="button" variant="outline" size="icon" className="h-10 w-10" onClick={() => set(t + 0.5)} aria-label="Half a tenth more" data-testid="tenths-plus"><Plus className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
      {sizeMl != null && onSizeChange && (
        <div className="space-y-2" data-testid="bottle-size-picker">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bottle size</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Bottle size">
            {sizes.map(b => {
              const on = (pendingMl ?? sizeMl) === b.ml;
              return (
                <button key={b.ml} type="button" role="radio" aria-checked={on}
                  onClick={() => setPendingMl(b.ml === sizeMl ? null : b.ml)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-md border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                  data-testid={`bottle-size-${b.ml}`}>{b.label}</button>
              );
            })}
          </div>
          {pendingMl != null && pendingMl !== sizeMl && (
            <div className="rounded-lg border border-border bg-accent p-2.5 space-y-2" data-testid="bottle-size-confirm">
              <p className="text-xs">
                Change this line from {sizeLabel(sizeMl)} to <strong>{sizeLabel(pendingMl)}</strong> bottles? If a {sizeLabel(pendingMl)} costs you a different price, update the cost price in the Library.
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={confirmSize} disabled={savingSize} data-testid="button-confirm-size">{savingSize ? "Saving..." : `Change to ${sizeLabel(pendingMl)}`}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPendingMl(null)}>Keep {sizeLabel(sizeMl)}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
