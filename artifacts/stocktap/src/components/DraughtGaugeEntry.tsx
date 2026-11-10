import { useEffect, useState } from "react";
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
  // Gallons you can tap: 0 up to just under a full one (0-10 for an 11 gallon keg).
  const maxGal = capGal != null ? Math.max(1, Math.min(35, Math.ceil(capGal - 0.05) - 1)) : 10;
  // What's typed in the gallons box, kept as text so "10." survives until the 5 goes in.
  const [galText, setGalText] = useState(galN ? String(galN) : "");
  useEffect(() => {
    // The form was reset (after Save): clear the box too.
    if (gallons === "0" && pints === "0" && (parseFloat(galText) || 0) !== 0) setGalText("");
    // Filled from outside (editing a saved count): show those gallons.
    else if (Math.floor(parseFloat(galText) || 0) !== galN) setGalText(galN ? String(galN) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallons, pints]);

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

      {fullN > 40 && (
        <p className="text-sm font-semibold text-destructive" data-testid="warn-full-high">
          {fullN} full {word}s is a lot for one line. Check the number before you save.
        </p>
      )}
      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Part {word}</div>
            <div className="text-xs text-muted-foreground">Tap the gallons on the gauge{scale ? ` (${scale} side)` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="0"
              aria-label={`Gallons left in the open ${word}`}
              className="h-12 w-20 rounded-xl border border-border bg-background text-center text-3xl font-bold tabular-nums"
              type="text"
              value={galText}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9.]/g, "");
                setGalText(raw);
                // 10.5 gal on the gauge = 10 gal 4 pt: a half gallon is never dropped.
                const v = Math.max(0, parseFloat(raw) || 0);
                const g = Math.floor(v), extra = Math.round((v - g) * 8);
                if (extra > 0) { const p = Math.min(7, extra); onGallons(String(g + (extra >= 8 ? 1 : 0))); onPints(String(extra >= 8 ? 0 : p)); }
                else onGallons(String(g));
              }}
              data-testid="input-part-gallons"
            />
            <span className="text-sm font-semibold text-muted-foreground">gal</span>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label="Gallons on the gauge" data-testid="gallon-chips">
          {Array.from({ length: maxGal + 1 }, (_, n) => n).map(n => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={galN === n && (galN > 0 || ptN > 0 || galText !== "")}
              onClick={() => { setGalText(String(n)); onGallons(String(n)); }}
              className={`h-12 rounded-lg border text-lg font-bold tabular-nums ${galN === n && (galN > 0 || galText !== "") ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
              data-testid={`button-part-gallons-${n}`}
            >{n}</button>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted-foreground">Plus odd pints, only if the needle is between two gallons</div>
          <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="Pints">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={ptN === n}
                onClick={() => onPints(String(n))}
                className={`h-9 rounded-lg border text-sm font-bold tabular-nums ${ptN === n && n > 0 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                data-testid={`button-part-pints-${n}`}
              >{n}</button>
            ))}
          </div>
        </div>
        {galN === 0 && ptN > 0 && (
          <div className="rounded-lg border border-[#E0A343]/50 bg-[#E0A343]/10 p-2 text-sm" data-testid="warn-pints-only">
            <div className="font-semibold">Only {ptN} {ptN === 1 ? "pint" : "pints"} left in the open {word}?</div>
            <button type="button" className="mt-1 h-10 w-full rounded-lg bg-primary text-primary-foreground font-bold" onClick={() => { setGalText(String(ptN)); onGallons(String(ptN)); onPints("0"); }} data-testid="button-pints-to-gallons">
              No, the gauge said {ptN} {ptN === 1 ? "gallon" : "gallons"}
            </button>
          </div>
        )}
        {over && (
          <p className="text-sm font-semibold text-destructive" data-testid="warn-part-over">
            That's more than a full {word} ({Math.round((capGal ?? 0) * 10) / 10} gal). Check the gauge.
          </p>
        )}
      </div>
    </div>
  );
}
