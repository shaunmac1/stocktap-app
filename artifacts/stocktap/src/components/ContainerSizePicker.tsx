import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presetsFor } from "@/lib/container-sizes";

/** Keg / cask / postmix box size: one-tap presets plus a free "Other size" box. */
export function ContainerSizePicker({ id, kind, value, onChange, onPreset, label = "Size", testId = "container" }: {
  id: string;
  kind: string;
  value: string;
  onChange: (v: string) => void;
  /** Called when a preset chip is tapped (e.g. to save straight away). */
  onPreset?: (litres: number) => void;
  label?: string;
  testId?: string;
}) {
  const presets = presetsFor(kind);
  const current = parseFloat(value);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {presets.map(preset => {
          const on = Math.abs(current - preset.value) < 0.05;
          return (
            <button
              key={preset.value}
              type="button"
              aria-pressed={on}
              onClick={() => { onChange(String(preset.value)); onPreset?.(preset.value); }}
              className={`text-sm px-3 py-2 rounded-md border ${on ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
              data-testid={`preset-${testId}-${preset.value}`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input id={id} type="number" inputMode="decimal" step="0.1" value={value} onChange={e => onChange(e.target.value)} className="h-9" placeholder="Other size" data-testid={`input-${testId}-size`} />
        <span className="text-xs text-muted-foreground whitespace-nowrap">litres</span>
      </div>
    </div>
  );
}
