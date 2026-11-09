import { LITRES_PER_GALLON_EXACT, gaugeScaleFor } from "@/lib/draught-gauge";

/**
 * Draught count the way a cellar is actually counted: how many full kegs (or casks)
 * are still sealed, then what's left in the open one, read off a keg gauge in
 * gallons and pints. Matches the Venners "Gallon 8 Pint" columns.
 */
export function DraughtGaugeEntry({
  kind,
  containerL,
  full,
  onFull,
  gallons,
  onGallons,
  pints,
  onPints,
}: {
  kind: "keg" | "cask";
  containerL: number | null;
  full: string;
  onFull: (v: string) => void;
  gallons: string;
  onGallons: (v: string) => void;
  pints: string;
  onPints: (v: string) => void;
}) {
  const fullN = Math.max(0, Math.floor(parseFloat(full) || 0));
  const galN = Math.max(0, Math.floor(parseFloat(gallons) || 0));
  const ptN = Math.max(0, Math.min(7, Math.floor(parseFloat(pints) || 0)));
  const capGal = containerL ? containerL / LITRES_PER_GALLON_EXACT : null;
  const over = capGal != null && galN + ptN / 8 > capGal + 0.01;
  const word = kind === "cask" ? "cask" : "keg";
  const scale = gaugeScaleFor(containerL);

  return (
    <div className="space-y-3" data-testid="draught-gauge-entry">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Full {word}s</div>
          <div className="text-xs text-muted-foreground">Sealed, not tapped yet</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`One fewer full ${word}`}
            className="h-12 w-12 rounded-xl border border-border bg-muted text-2xl font-bold"
            onClick={() => onFull(String(Math.max(0, fullN - 1)))}
            data-testid="button-full-minus"
          >−</button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`Full ${word}s`}
            className="h-12 w-16 rounded-xl border border-border bg-background text-center text-3xl font-bold tabular-nums"
            value={fullN}
            onChange={e => onFull(String(Math.max(0, Math.floor(parseFloat(e.target.value) || 0))))}
            onFocus={e => e.currentTarget.select()}
            data-testid="input-full-containers"
          />
          <button
            type="button"
            aria-label={`One more full ${word}`}
            className="h-12 w-12 rounded-xl border border-border bg-muted text-2xl font-bold"
            onClick={() => onFull(String(fullN + 1))}
            data-testid="button-full-plus"
          >+</button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Part {word}</div>
            <div className="text-xs text-muted-foreground">Gallons on the gauge{scale ? ` (${scale} side)` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              aria-label={`Gallons left in the open ${word}`}
              className="h-12 w-20 rounded-xl border border-border bg-background text-center text-3xl font-bold tabular-nums"
              value={galN === 0 && (gallons === "0" || gallons === "") ? "" : galN}
              onChange={e => onGallons(String(Math.max(0, Math.floor(parseFloat(e.target.value) || 0))))}
              data-testid="input-part-gallons"
            />
            <span className="text-sm font-semibold text-muted-foreground">gal</span>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pints</div>
          <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="Pints">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={ptN === n}
                onClick={() => onPints(String(n))}
                className={`h-10 rounded-lg border text-base font-bold tabular-nums ${ptN === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                data-testid={`button-part-pints-${n}`}
              >{n}</button>
            ))}
          </div>
        </div>
        {over && (
          <p className="text-sm font-semibold text-destructive" data-testid="warn-part-over">
            That's more than a full {word} ({Math.round((capGal ?? 0) * 10) / 10} gal). Check the gauge.
          </p>
        )}
      </div>
    </div>
  );
}
