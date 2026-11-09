import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * How much finished drink one postmix box makes. Counts and Venners audits are in litres of
 * drink, so this is what turns litres into boxes for value and ordering.
 */
export function PostmixYieldField({ id, value, onChange, boxL }: { id: string; value: string; onChange: (v: string) => void; boxL: string }) {
  const box = parseFloat(boxL) || 12;
  const presets = [
    { v: box * 6, label: `${box * 6}L · standard (5:1)` },
    { v: box * 7, label: `${box * 7}L · high yield (6:1)` },
  ];
  const current = parseFloat(value);
  return (
    <div>
      <Label htmlFor={id}>Litres of drink a box makes</Label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {presets.map(p => {
          const on = Math.abs(current - p.v) < 0.05;
          return (
            <button key={p.v} type="button" aria-pressed={on} onClick={() => onChange(String(p.v))}
              className={`text-sm px-3 py-2 rounded-md border ${on ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
              data-testid={`preset-yield-${p.v}`}>{p.label}</button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input id={id} type="number" inputMode="decimal" step="0.1" value={value} onChange={e => onChange(e.target.value)} className="h-9" placeholder={`${box * 6}`} data-testid="input-postmix-yield" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">litres of drink</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">You count postmix in litres of drink, like Venners. "HY" or "High Yield" boxes usually make more.</p>
    </div>
  );
}
