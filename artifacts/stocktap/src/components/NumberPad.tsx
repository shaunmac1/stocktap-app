import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";

interface NumberPadProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: () => void;
  label?: string;
  allowDecimal?: boolean;
}

export function NumberPad({ value, onChange, onSubmit, label, allowDecimal = false }: NumberPadProps) {
  const handlePress = (num: string) => {
    if (num === "." && value.includes(".")) return;
    if (value === "0" && num !== ".") {
      onChange(num);
    } else {
      onChange(value + num);
    }
  };

  const handleDelete = () => {
    onChange(value.length > 1 ? value.slice(0, -1) : "0");
  };

  const handleClear = () => {
    onChange("0");
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {label && <div className="text-center text-sm font-medium text-muted-foreground uppercase tracking-widest">{label}</div>}
      <div className="bg-muted text-center text-4xl font-bold py-6 rounded-xl tracking-wider tabular-nums">
        {value}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <Button
            key={n}
            type="button"
            variant="outline"
            className="h-20 text-2xl font-semibold shadow-sm border-2 active:scale-95 transition-transform"
            onClick={() => handlePress(n.toString())}
          >
            {n}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="h-20 text-xl font-semibold shadow-sm border-2 text-destructive active:scale-95 transition-transform"
          onClick={handleClear}
        >
          C
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-20 text-2xl font-semibold shadow-sm border-2 active:scale-95 transition-transform"
          onClick={() => handlePress("0")}
        >
          0
        </Button>
        {allowDecimal ? (
          <Button
            type="button"
            variant="outline"
            className="h-20 text-2xl font-semibold shadow-sm border-2 active:scale-95 transition-transform"
            onClick={() => handlePress(".")}
          >
            .
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-20 text-2xl font-semibold shadow-sm border-2 active:scale-95 transition-transform"
            onClick={handleDelete}
          >
            <Delete className="w-8 h-8" />
          </Button>
        )}
      </div>
      
      {allowDecimal && (
        <div className="grid grid-cols-1 mt-2">
          <Button
            type="button"
            variant="outline"
            className="h-16 text-xl font-semibold shadow-sm border-2 active:scale-95 transition-transform"
            onClick={handleDelete}
          >
            <Delete className="w-6 h-6 mr-2" /> Delete
          </Button>
        </div>
      )}

      {onSubmit && (
        <Button 
          type="button" 
          size="lg" 
          className="h-16 text-xl font-bold shadow-md mt-2" 
          onClick={onSubmit}
        >
          Confirm
        </Button>
      )}
    </div>
  );
}

export interface PadField {
  key: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  allowDecimal?: boolean;
}

/**
 * Two (or more) numbers on ONE keypad — tap a box to choose which number the keys
 * type into. Used for "gallons + pints" so a phone doesn't need two full keypads.
 */
export function MultiFieldPad({ fields, testId }: { fields: PadField[]; testId?: string }) {
  const [activeKey, setActiveKey] = useState(fields[0]?.key);
  const active = fields.find(f => f.key === activeKey) ?? fields[0];
  const press = (k: string) => {
    if (!active) return;
    const v = active.value;
    if (k === "C") return active.onChange("0");
    if (k === "del") return active.onChange(v.length > 1 ? v.slice(0, -1) : "0");
    if (k === "." && (!active.allowDecimal || v.includes("."))) return;
    active.onChange(v === "0" && k !== "." ? k : v + k);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "."];
  return (
    <div className="w-full flex flex-col gap-3" data-testid={testId}>
      <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }}>
        {fields.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setActiveKey(f.key)}
            className={`rounded-xl py-3 text-center border-2 transition-colors ${f.key === active?.key ? "border-primary bg-primary/10" : "border-transparent bg-muted"}`}
            data-testid={`${testId ?? "pad"}-field-${f.key}`}
            aria-pressed={f.key === active?.key}
          >
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{f.label}</div>
            <div className="text-3xl font-bold tabular-nums">{f.value}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map(k => (
          <Button
            key={k}
            type="button"
            variant="outline"
            disabled={k === "." && !active?.allowDecimal}
            className={`h-16 text-2xl font-semibold shadow-sm border-2 active:scale-95 transition-transform ${k === "C" ? "text-destructive text-xl" : ""}`}
            onClick={() => press(k)}
            data-testid={`${testId ?? "pad"}-key-${k === "." ? "dot" : k}`}
          >
            {k}
          </Button>
        ))}
      </div>
      <Button type="button" variant="outline" className="h-12 text-lg font-semibold border-2" onClick={() => press("del")}>
        <Delete className="w-5 h-5 mr-2" /> Delete
      </Button>
    </div>
  );
}
