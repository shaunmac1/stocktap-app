import React, { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, ArrowLeft, Plus, Trash2, Copy, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/hooks/useTeam";
import { useRotaForDate, useRotaForWeek, useAddRotaShift, useDeleteRotaShift, useCopyLastWeek } from "@/hooks/useRota";
import {
  ROTA_AREAS, AREA_LABELS, weekStartISO, weekDaysISO, addDaysISO, weekdayShort,
  shiftsByArea, shiftRangeLabel, prettyTime, type RotaArea,
} from "@/lib/rota";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function prettyDate(dateISO: string): string {
  const today = todayISO();
  if (dateISO === today) return "Today";
  if (dateISO === addDaysISO(today, -1)) return "Yesterday";
  if (dateISO === addDaysISO(today, 1)) return "Tomorrow";
  return new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function initials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}
const AVATAR_COLORS = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600"];

export default function Rota() {
  const { venue } = useAuth();
  const { toast } = useToast();
  const [dateISO, setDateISO] = useState(todayISO());
  const weekStart = weekStartISO(dateISO);

  const { data: staff = [] } = useStaff(venue?.id);
  const { data: dayShifts = [] } = useRotaForDate(venue?.id, dateISO);
  const { data: weekShifts = [] } = useRotaForWeek(venue?.id, weekStart);
  const addShift = useAddRotaShift();
  const delShift = useDeleteRotaShift();
  const copyWeek = useCopyLastWeek();

  const staffById = useMemo(() => {
    const m = new Map<string, { name: string; i: number }>();
    staff.forEach((s, i) => m.set(s.id, { name: s.name, i }));
    return m;
  }, [staff]);
  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of weekShifts) m.set(s.shift_date, (m.get(s.shift_date) ?? 0) + 1);
    return m;
  }, [weekShifts]);

  // Add-shift form
  const [addArea, setAddArea] = useState<RotaArea>("bar");
  const [showAdd, setShowAdd] = useState(false);
  const [pickStaff, setPickStaff] = useState("");
  const [start, setStart] = useState("11:30");
  const [end, setEnd] = useState("17:00");
  const [untilClose, setUntilClose] = useState(false);

  function openAdd(area: RotaArea) {
    setAddArea(area);
    setPickStaff(staff[0]?.id ?? "");
    setShowAdd(true);
  }

  async function handleAdd() {
    if (!venue?.id || !pickStaff) return;
    try {
      await addShift.mutateAsync({
        venue_id: venue.id, staff_id: pickStaff, area: addArea, shift_date: dateISO,
        start_time: start, end_time: untilClose ? null : end, until_close: untilClose,
      });
      setShowAdd(false);
    } catch (e: any) { toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }

  async function handleCopyLastWeek() {
    if (!venue?.id) return;
    try {
      const r = await copyWeek.mutateAsync({ venue_id: venue.id, targetWeekStartISO: weekStart });
      toast({ title: r.copied ? `Copied ${r.copied} shifts` : "Last week was empty", description: r.copied ? "Tweak anyone who's off or swapped." : "Nothing to copy from last week." });
    } catch (e: any) { toast({ title: "Couldn't copy", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-1.5"><CalendarDays className="w-5 h-5" /> Rota</h1>
          <Link href="/team" className="text-xs text-muted-foreground flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to Team</Link>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-md border border-border" onClick={() => setDateISO(addDaysISO(dateISO, -1))} aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-medium min-w-[92px] text-center">{prettyDate(dateISO)}</span>
          <button className="p-1.5 rounded-md border border-border" onClick={() => setDateISO(addDaysISO(dateISO, 1))} aria-label="Next day"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Week strip */}
      <div className="flex gap-1.5">
        {weekDaysISO(dateISO).map((d) => {
          const active = d === dateISO;
          const count = countByDay.get(d) ?? 0;
          return (
            <button key={d} onClick={() => setDateISO(d)}
              className={`flex-1 rounded-lg py-1.5 flex flex-col items-center border ${active ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <span className={`text-[10px] ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}>{weekdayShort(d)}</span>
              <span className={`text-sm font-bold ${active ? "text-primary" : ""}`}>{Number(d.slice(8, 10))}</span>
              <span className={`mt-0.5 w-1.5 h-1.5 rounded-full ${count > 0 ? "bg-emerald-500" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      {/* Copy last week */}
      <Button variant="outline" className="w-full" onClick={handleCopyLastWeek} disabled={copyWeek.isPending}>
        <Copy className="w-4 h-4 mr-1.5" /> {copyWeek.isPending ? "Copying…" : "Copy last week onto this week"}
      </Button>

      {staff.length === 0 && (
        <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">
          Add your team on the <Link href="/team" className="text-primary underline">Team</Link> page first, then you can rota them on here.
        </CardContent></Card>
      )}

      {/* Areas */}
      {ROTA_AREAS.map((area) => {
        const list = shiftsByArea(dayShifts, area);
        return (
          <div key={area} className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 flex items-center justify-between">
              <span>{AREA_LABELS[area]} · {list.length}</span>
            </div>
            {list.length === 0 && <p className="text-[11px] text-muted-foreground px-1">Nobody on {AREA_LABELS[area].toLowerCase()} yet.</p>}
            {list.map((s) => {
              const info = staffById.get(s.staff_id);
              const name = info?.name ?? "Staff";
              return (
                <Card key={s.id}><CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold ${AVATAR_COLORS[(info?.i ?? 0) % AVATAR_COLORS.length]}`}>{initials(name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{name}</div>
                    <div className="text-xs text-muted-foreground">{shiftRangeLabel(s)}</div>
                  </div>
                  <button className="text-muted-foreground/40 hover:text-red-600 p-1" onClick={() => delShift.mutate({ id: s.id, venue_id: venue!.id })} aria-label="Remove shift"><Trash2 className="w-4 h-4" /></button>
                </CardContent></Card>
              );
            })}
            {staff.length > 0 && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => openAdd(area)}>
                <Plus className="w-4 h-4 mr-1" /> Add to {AREA_LABELS[area].toLowerCase()}
              </Button>
            )}
          </div>
        );
      })}

      {/* Add shift form */}
      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="font-semibold text-sm">Add to {AREA_LABELS[addArea].toLowerCase()} · {prettyDate(dateISO)}</div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Who</label>
            <select value={pickStaff} onChange={(e) => setPickStaff(e.target.value)} className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm">
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ROTA_AREAS.map((a) => (
              <button key={a} onClick={() => setAddArea(a)} className={`text-sm py-2 rounded-lg border ${addArea === a ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{AREA_LABELS[a]}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground">Start</label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Finish</label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={untilClose} className={untilClose ? "opacity-50" : ""} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={untilClose} onChange={(e) => setUntilClose(e.target.checked)} className="w-4 h-4 accent-primary" />
            Until close
          </label>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleAdd} disabled={addShift.isPending || !pickStaff}>{addShift.isPending ? "Adding…" : "Add shift"}</Button>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Preview: {prettyTime(start)} – {untilClose ? "close" : prettyTime(end)}</p>
        </CardContent></Card>
      )}
    </div>
  );
}
