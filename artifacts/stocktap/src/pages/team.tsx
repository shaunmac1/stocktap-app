import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Plus, LogOut, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { formatGBP } from "@/lib/calculations";
import { useToast } from "@/hooks/use-toast";
import { useCashUps } from "@/hooks/useDailyBoard";
import { useStaff, useShiftsForDate, useOpenShifts, useAddStaff, useClockIn, useClockOut, useCloseShiftAt, useUpdateShiftTimes, useDeleteShift } from "@/hooks/useTeam";
import {
  shiftDurationHours,
  shiftCost,
  dayWageCost,
  wagePercent,
  shiftCapISO,
  isForgottenClockOut,
  type Staff,
  type Shift,
} from "@/lib/wages";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function initials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}
function fmtDur(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
const AVATAR_COLORS = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600"];

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function Team() {
  const { venue } = useAuth();
  const { toast } = useToast();
  const today = todayISO();

  const { data: staff = [] } = useStaff(venue?.id);
  const { data: shifts = [] } = useShiftsForDate(venue?.id, today);
  const { data: openShifts = [] } = useOpenShifts(venue?.id);
  const { data: cashUps = [] } = useCashUps(venue?.id);
  const addStaff = useAddStaff();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const closeShiftAt = useCloseShiftAt();
  const updateTimes = useUpdateShiftTimes();
  const deleteShift = useDeleteShift();
  const closeTimes = (venue as any)?.close_times as Record<string, string> | undefined;

  // Tick so open-shift costs update live.
  const [nowISO, setNowISO] = useState(new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNowISO(new Date().toISOString()), 30_000);
    return () => clearInterval(t);
  }, []);

  const openByStaff = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of shifts) if (s.clock_out == null) m.set(s.staff_id, s);
    return m;
  }, [shifts]);

  const wageCost = useMemo(() => dayWageCost(shifts, nowISO, closeTimes), [shifts, nowISO, closeTimes]);
  const staffById = useMemo(() => {
    const m = new Map<string, Staff>();
    for (const s of staff) m.set(s.id, s);
    return m;
  }, [staff]);
  const forgotten = useMemo(
    () => openShifts.filter((s) => isForgottenClockOut(s, nowISO, shiftCapISO(s.business_date, closeTimes ?? null))),
    [openShifts, nowISO, closeTimes]
  );
  const todayTake = useMemo(
    () => cashUps.find((c) => c.business_date === today)?.total_taken ?? null,
    [cashUps, today]
  );
  const wagePct = wagePercent(wageCost, todayTake);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");

  async function handleClockIn(s: Staff) {
    if (!venue?.id) return;
    try {
      await clockIn.mutateAsync({ venue_id: venue.id, staff_id: s.id, business_date: today, rate_snapshot: s.hourly_rate });
    } catch (e: any) {
      toast({ title: "Couldn't clock in", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }
  async function handleClockOut(shift: Shift, name: string) {
    if (!venue?.id) return;
    try {
      await clockOut.mutateAsync({ id: shift.id, venue_id: venue.id, business_date: today });
      toast({ title: `${name} clocked out`, description: `${fmtDur(shiftDurationHours(shift.clock_in, new Date().toISOString(), nowISO))} on shift.` });
    } catch (e: any) {
      toast({ title: "Couldn't clock out", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }
  async function handleAddStaff() {
    if (!venue?.id || !newName.trim()) return;
    try {
      await addStaff.mutateAsync({ venue_id: venue.id, name: newName.trim(), hourly_rate: newRate ? parseFloat(newRate) : null });
      setNewName(""); setNewRate(""); setShowAdd(false);
    } catch (e: any) {
      toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  async function handleFixForgotten(s: Shift) {
    if (!venue?.id) return;
    const cap = shiftCapISO(s.business_date, closeTimes ?? null);
    if (!cap) return;
    try {
      await closeShiftAt.mutateAsync({ id: s.id, venue_id: venue.id, at: cap });
      toast({ title: "Sorted", description: `Clocked out at ${new Date(cap).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.` });
    } catch (e: any) {
      toast({ title: "Couldn't fix that", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  const forgottenStaffIds = new Set(forgotten.map((s) => s.staff_id));
  function startEdit(s: Shift) {
    setEditId(s.id);
    setEditIn(toLocalInput(s.clock_in));
    setEditOut(toLocalInput(s.clock_out));
  }
  async function saveEdit(s: Shift) {
    if (!venue?.id) return;
    const ci = fromLocalInput(editIn);
    if (!ci) { toast({ title: "Pop in a clock-in time" }); return; }
    try {
      await updateTimes.mutateAsync({ id: s.id, venue_id: venue.id, clock_in: ci, clock_out: fromLocalInput(editOut) });
      setEditId(null);
      toast({ title: "Times updated" });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }
  async function removeShift(s: Shift) {
    if (!venue?.id) return;
    try {
      await deleteShift.mutateAsync({ id: s.id, venue_id: venue.id });
      setEditId(null);
    } catch (e: any) {
      toast({ title: "Couldn't delete", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  const onNow = staff.filter((s) => openByStaff.has(s.id) && !forgottenStaffIds.has(s.id));
  const offNow = staff.filter((s) => !openByStaff.has(s.id));

  const pctClass = wagePct == null ? "" : wagePct <= 25 ? "text-emerald-200" : wagePct <= 32 ? "text-amber-200" : "text-rose-200";

  return (
    <div className="flex flex-col h-full overflow-auto pb-24">
      <div className="p-4 bg-card border-b border-border sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Team</h1>
        <span className="text-xs text-muted-foreground truncate max-w-[45%]">{venue?.name ?? ""}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Tonight's wages */}
        <Card className="bg-primary text-primary-foreground border-none shadow-md">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-primary-foreground/75">Tonight's wages</div>
            <div className="flex items-end justify-between mt-1">
              <div className="text-4xl font-bold tabular-nums">{formatGBP(wageCost)}</div>
              {wagePct != null ? (
                <div className="text-right">
                  <div className={`text-2xl font-bold ${pctClass}`}>{wagePct.toFixed(1)}%</div>
                  <div className="text-[11px] text-primary-foreground/70">of the take</div>
                </div>
              ) : (
                <div className="text-[11px] text-primary-foreground/70 max-w-[9rem] text-right">
                  Log tonight's take on the <Link href="/daily-board" className="underline">Board</Link> to see your wage&nbsp;%
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Forgotten clock-outs — capped at close, one tap to fix */}
        {forgotten.map((s) => {
          const cap = shiftCapISO(s.business_date, closeTimes ?? null);
          const capLabel = cap ? new Date(cap).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "close";
          const dayLabel = new Date(s.business_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
          const name = staffById.get(s.staff_id)?.name ?? "Someone";
          return (
            <Card key={s.id} className="border-amber-300 bg-amber-50">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-amber-900 truncate">{name} never clocked out</div>
                  <div className="text-xs text-amber-700">{dayLabel} · capped at {capLabel}</div>
                </div>
                <Button size="sm" onClick={() => handleFixForgotten(s)} disabled={closeShiftAt.isPending}>
                  Clock out {capLabel}
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {/* On now */}
        {onNow.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">On now</div>
            {onNow.map((s, i) => {
              const shift = openByStaff.get(s.id)!;
              const hours = shiftDurationHours(shift.clock_in, null, nowISO);
              return (
                <Card key={s.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                      {initials(s.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{fmtDur(hours)} · {formatGBP(shiftCost(shift, nowISO))}{s.hourly_rate != null ? ` · £${s.hourly_rate}/hr` : ""}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleClockOut(shift, s.name)} disabled={clockOut.isPending}>
                      <LogOut className="w-4 h-4 mr-1" /> Out
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Clock in */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Tap to clock in</div>
          {offNow.length === 0 && staff.length > 0 && (
            <p className="text-sm text-muted-foreground px-1">Everyone's on shift.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {offNow.map((s, i) => (
              <button
                key={s.id}
                onClick={() => handleClockIn(s)}
                disabled={clockIn.isPending}
                className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl text-left active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold ${AVATAR_COLORS[(i + 2) % AVATAR_COLORS.length]}`}>
                  {initials(s.name)}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">{s.hourly_rate != null ? `£${s.hourly_rate}/hr` : "no rate set"}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Today's shifts — admin can correct any times */}
        {shifts.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Today's shifts</div>
            {shifts.map((s) => {
              const st = staffById.get(s.staff_id);
              const cap = shiftCapISO(s.business_date, closeTimes ?? null);
              if (editId === s.id) {
                return (
                  <Card key={s.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="font-semibold text-sm">{st?.name ?? "Staff"}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-muted-foreground">Clocked in</label>
                          <Input type="datetime-local" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Clocked out</label>
                          <Input type="datetime-local" value={editOut} onChange={(e) => setEditOut(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => saveEdit(s)} disabled={updateTimes.isPending}>Save times</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => removeShift(s)} disabled={deleteShift.isPending} aria-label="Delete shift">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              return (
                <Card key={s.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{st?.name ?? "Staff"}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtTime(s.clock_in)} – {s.clock_out ? fmtTime(s.clock_out) : "on now"} · {formatGBP(shiftCost(s, nowISO, cap))}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(s)} aria-label="Edit times">
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add staff */}
        {showAdd ? (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Libby" autoFocus />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">£ / hour</label>
                  <Input type="number" inputMode="decimal" value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="12.00" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleAddStaff} disabled={addStaff.isPending || !newName.trim()}>
                  {addStaff.isPending ? "Adding…" : "Add to the team"}
                </Button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add a team member
          </Button>
        )}

        {staff.length === 0 && !showAdd && (
          <p className="text-xs text-muted-foreground text-center px-4">
            Add your team once, then it's a single tap each shift — and you'll see your wage bill build live against the night's take.
          </p>
        )}
      </div>
    </div>
  );
}
