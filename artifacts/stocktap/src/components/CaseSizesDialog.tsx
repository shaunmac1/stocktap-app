import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PackagedProductLike } from "@/lib/packaged";

type Row = { product: PackagedProductLike & { id: string }; suggested: number | null };
const CHOICES = [12, 24] as const;

/**
 * Set how every bottle, can and bag line comes in, on one screen. The usual size is picked for
 * each line; tap another to change it, "1s" for one by one, or "Later" to be asked on the count.
 * Nothing is saved until the button at the bottom.
 */
export function CaseSizesDialog({
  open, onOpenChange, rows, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: Row[];
  onSave: (items: { id: string; size: number }[]) => void;
  saving: boolean;
}) {
  // undefined = use the suggestion; 0 = ask me later
  const [picked, setPicked] = useState<Record<string, number>>({});
  const sizeOf = (r: Row) => picked[r.product.id] ?? r.suggested ?? 0;
  const items = useMemo(() => rows.map(r => ({ id: r.product.id, size: sizeOf(r) })).filter(i => i.size > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, picked]);
  const chip = (r: Row, size: number, label: string) => {
    const on = sizeOf(r) === size;
    return (
      <button
        key={label}
        type="button"
        className={`h-9 min-w-[2.75rem] px-2 rounded-lg border text-sm font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-foreground"}`}
        onClick={() => setPicked(p => ({ ...p, [r.product.id]: size }))}
        aria-pressed={on}
        data-testid={`case-chip-${r.product.id}-${size}`}
      >{label}</button>
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] flex flex-col p-4" data-testid="dialog-case-sizes">
        <DialogHeader>
          <DialogTitle>How do these come in?</DialogTitle>
          <DialogDescription>
            The usual case size is picked for each line. Tap another if yours is different. Then you count full cases + loose, and orders read in cases.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5">
          {rows.map(r => (
            <div key={r.product.id} className="flex items-center gap-2 rounded-lg border border-border p-2" data-testid={`case-row-${r.product.id}`}>
              <div className="flex-1 min-w-0 text-sm font-medium leading-snug break-words">{r.product.name}</div>
              <div className="flex gap-1 shrink-0">
                {CHOICES.map(n => chip(r, n, String(n)))}
                {r.suggested && !CHOICES.includes(r.suggested as 12 | 24) ? chip(r, r.suggested, String(r.suggested)) : null}
                {chip(r, 1, "1s")}
                {chip(r, 0, "Later")}
              </div>
            </div>
          ))}
        </div>
        <Button className="h-12 text-base font-bold" disabled={saving || items.length === 0} onClick={() => onSave(items)} data-testid="button-save-case-sizes">
          {saving ? "Saving…" : `Set ${items.length} ${items.length === 1 ? "line" : "lines"}`}
        </Button>
        <p className="text-xs text-muted-foreground text-center">Change any line later on its count screen. "1s" = counted one by one. "Later" = ask me when I count it.</p>
      </DialogContent>
    </Dialog>
  );
}
