import React, { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { fileToDownscaledBase64 } from "@/lib/image";
import { useAddRotaShifts } from "@/hooks/useRota";
import { matchStaffName, dayToDate, normaliseDay, type ParsedShift } from "@/lib/rota-parse";
import { ROTA_AREAS, AREA_LABELS, weekdayShort, prettyTime, type RotaArea } from "@/lib/rota";

interface DraftRow {
  key: string;
  staffId: string | null;
  parsedName: string;
  area: RotaArea;
  date: string | null;
  start: string;
  end: string;
  untilClose: boolean;
  include: boolean;
}

export function RotaUpload({
  venueId, staff, weekStartISO, onDone,
}: {
  venueId: string;
  staff: Array<{ id: string; name: string }>;
  weekStartISO: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const addShifts = useAddRotaShifts();
  const [phase, setPhase] = useState<"idle" | "reading" | "review">("idle");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [notSetUp, setNotSetUp] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !venueId) return;
    setPhase("reading");
    setNotSetUp(false);
    try {
      const { base64, media_type } = await fileToDownscaledBase64(file);
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/parse-rota`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image_base64: base64, media_type, staff_names: staff.map((s) => s.name) }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 503 && data?.error === "no_api_key") {
        setNotSetUp(true); setPhase("idle"); return;
      }
      if (!resp.ok) throw new Error(data?.message || data?.error || "Couldn't read that photo.");
      const parsed: ParsedShift[] = Array.isArray(data.shifts) ? data.shifts : [];
      if (!parsed.length) { toast({ title: "Nothing found", description: "Couldn't pick out any shifts. Try a clearer, straight-on photo." }); setPhase("idle"); return; }

      const draft: DraftRow[] = parsed.map((s, i) => {
        const m = matchStaffName(s.name || "", staff);
        const area: RotaArea = s.area === "kitchen" ? "kitchen" : "bar";
        return {
          key: `r${i}`,
          staffId: m.staffId,
          parsedName: s.name || "?",
          area,
          date: dayToDate(normaliseDay(s.day), weekStartISO),
          start: (s.start || "").slice(0, 5) || "11:30",
          end: s.until_close ? "" : ((s.end || "").slice(0, 5) || "17:00"),
          untilClose: !!s.until_close,
          include: true,
        };
      });
      setRows(draft);
      setPhase("review");
    } catch (err: any) {
      toast({ title: "Couldn't read the rota", description: err?.message ?? "Try again.", variant: "destructive" });
      setPhase("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function patch(key: string, p: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  async function save() {
    const ready = rows.filter((r) => r.include && r.staffId && r.date);
    if (!ready.length) { toast({ title: "Nothing to save", description: "Match each shift to a person and a day first." }); return; }
    try {
      await addShifts.mutateAsync(ready.map((r) => ({
        venue_id: venueId, staff_id: r.staffId!, area: r.area, shift_date: r.date!,
        start_time: r.start, end_time: r.untilClose ? null : r.end, until_close: r.untilClose,
      })));
      toast({ title: `Saved ${ready.length} shift${ready.length === 1 ? "" : "s"}`, description: "Tweak anything on the rota as normal." });
      setRows([]); setPhase("idle"); onDone();
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  if (phase === "idle") {
    return (
      <div className="space-y-2">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
          <Camera className="w-4 h-4 mr-1.5" /> Upload a photo of the paper rota
        </Button>
        {notSetUp && (
          <p className="text-[11px] text-amber-700 px-1">Photo reading isn't switched on yet — it needs an AI vision key adding. You can still type the rota in below.</p>
        )}
      </div>
    );
  }

  if (phase === "reading") {
    return (
      <Card><CardContent className="p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading your rota…
      </CardContent></Card>
    );
  }

  // review
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="font-semibold text-sm">Check the read-in rota, then save</div>
      <p className="text-[11px] text-muted-foreground">I've matched names to your team where I could. Fix anyone marked “pick a name”, and untick anything wrong.</p>
      {rows.map((r) => (
        <div key={r.key} className={`rounded-lg border p-2.5 space-y-2 ${r.include ? "border-border" : "border-dashed border-border opacity-50"}`}>
          <div className="flex items-center gap-2">
            <select
              value={r.staffId ?? ""}
              onChange={(e) => patch(r.key, { staffId: e.target.value || null })}
              className={`flex-1 h-9 rounded-md border px-2 text-sm ${r.staffId ? "border-border" : "border-amber-400 bg-amber-50"}`}
            >
              <option value="">pick a name{r.parsedName ? ` (read: ${r.parsedName})` : ""}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => patch(r.key, { include: !r.include })} className="p-1 text-muted-foreground" aria-label={r.include ? "Exclude" : "Include"}>
              {r.include ? <X className="w-4 h-4" /> : <Check className="w-4 h-4 text-emerald-600" />}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {ROTA_AREAS.map((a) => (
                <button key={a} onClick={() => patch(r.key, { area: a })} className={`text-[11px] py-1 px-2 rounded border ${r.area === a ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{AREA_LABELS[a]}</button>
              ))}
            </div>
            <span className={`text-[11px] ${r.date ? "text-muted-foreground" : "text-red-600 font-medium"}`}>{r.date ? weekdayShort(r.date) : "no day"}</span>
            <Input type="time" value={r.start} onChange={(e) => patch(r.key, { start: e.target.value })} className="h-8 w-[92px] text-xs" />
            {r.untilClose
              ? <span className="text-[11px] text-muted-foreground">→ close</span>
              : <Input type="time" value={r.end} onChange={(e) => patch(r.key, { end: e.target.value })} className="h-8 w-[92px] text-xs" />}
            <label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={r.untilClose} onChange={(e) => patch(r.key, { untilClose: e.target.checked })} className="accent-primary" /> close</label>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save} disabled={addShifts.isPending}>{addShifts.isPending ? "Saving…" : "Save these shifts"}</Button>
        <Button variant="outline" onClick={() => { setRows([]); setPhase("idle"); }}>Cancel</Button>
      </div>
    </CardContent></Card>
  );
}
