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
