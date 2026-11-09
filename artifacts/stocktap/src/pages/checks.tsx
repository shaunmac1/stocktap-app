import React, { useMemo, useState } from "react";
import { useAuth, isAdminRole } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, ChevronRight, Thermometer, AlertTriangle, Check, Plus, Trash2,
  ClipboardCheck, ShieldAlert, Circle, CheckCircle2, Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shiftISO } from "@/hooks/useDailyBoard";
import { useStaff } from "@/hooks/useTeam";
import {
  useAppliances, useReadingsForDate, useAddReading, useAddAppliance, useAddAppliances, useDeactivateAppliance, useUpdateAppliance,
  useCheckItems, useCompletions, useTickItem, useUntickItem, useAddCheckItem, useAddCheckItems, useDeactivateCheckItem,
  useRefusalsForDate, useAddRefusal, useChecksRange,
} from "@/hooks/useChecks";
import {
  readingStatus, statusLabel, latestReading, todaysCompletion, outOfRangeToday, defaultRange, DEFAULT_APPLIANCES,
  isItemDone, weeklyStatus, itemsInSection, sectionCompletion, activeSections, DEFAULT_CHECK_ITEMS,
  SECTION_LABELS, REFUSAL_REASONS, checksHistory, checksCsv,
  type ApplianceKind, type CheckSection, type Cadence, type CheckItem, type CheckCompletion,
} from "@/lib/checks";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function prettyDate(dateISO: string): string {
  const today = todayISO();
  if (dateISO === today) return "Today";
  if (dateISO === shiftISO(today, -1)) return "Yesterday";
  return new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function fmtRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min} to ${max}°C`;
  if (min != null) return `${min}°C or above`;
  if (max != null) return `${max}°C or below`;
  return "no range set";
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}
/** "filled in later on 30 Sept" when an entry was made on a later day than the one it's for. */
function lateNote(businessDate: string, iso: string): string {
  const d = new Date(iso);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return local !== businessDate ? ` · filled in later on ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "";
}
const SANE_MIN = -40, SANE_MAX = 110;

const KIND_LABELS: Record<ApplianceKind, string> = {
  fridge: "Fridge", freezer: "Freezer", hot_hold: "Hot holding", probe: "Probe / cooked", cellar: "Cellar", delivery: "Delivery", other: "Other",
};
const STATUS_STYLE: Record<string, string> = { ok: "text-emerald-600", high: "text-red-600", low: "text-sky-600" };

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1.5 pt-1">
      <Icon className="w-3.5 h-3.5" /> {title}
    </div>
  );
}

export default function Checks() {
  const { venue, role, user } = useAuth();
  const admin = isAdminRole(role);
  const { toast } = useToast();
  const [dateISO, setDateISO] = useState(todayISO());
  const [tab, setTab] = useState<"day" | "history">("day");
  const isToday = dateISO === todayISO();
  const windowFrom = shiftISO(dateISO, -6); // covers weekly cadence

  const { data: appliances = [] } = useAppliances(venue?.id);
  const { data: readings = [] } = useReadingsForDate(venue?.id, dateISO);
  const { data: items = [] } = useCheckItems(venue?.id);
  const { data: completions = [] } = useCompletions(venue?.id, windowFrom, dateISO);
  const { data: refusals = [] } = useRefusalsForDate(venue?.id, dateISO);
  const { data: staff = [] } = useStaff(admin ? venue?.id : undefined); // names for review; staff can't read this table

  const addReading = useAddReading();
  const addAppliance = useAddAppliance();
  const addAppliances = useAddAppliances();
  const deactivateApp = useDeactivateAppliance();
  const updateApp = useUpdateAppliance();
  const tick = useTickItem();
  const untick = useUntickItem();
  const addItem = useAddCheckItem();
  const addItems = useAddCheckItems();
  const deactivateItem = useDeactivateCheckItem();
  const addRefusal = useAddRefusal();

  const tempCompletion = useMemo(() => todaysCompletion(appliances, readings), [appliances, readings]);
  const alerts = useMemo(() => outOfRangeToday(appliances, readings), [appliances, readings]);
  const sections = useMemo(() => activeSections(items), [items]);
  const nameByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) if (s.user_id) m.set(s.user_id, s.name);
    return m;
  }, [staff]);
  const loggedBy = (uid: string | null) => (uid ? nameByUser.get(uid) ?? (uid === user?.id ? "You" : null) : null);

  // completions dated exactly the viewed day, keyed by item for tick/untick.
  const todayCompByItem = useMemo(() => {
    const m = new Map<string, CheckCompletion>();
    for (const c of completions) if (c.business_date === dateISO) m.set(c.item_id, c);
    return m;
  }, [completions, dateISO]);

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [showAddApp, setShowAddApp] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<ApplianceKind>("fridge");
  const [newMin, setNewMin] = useState("0");
  const [newMax, setNewMax] = useState("5");
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemSection, setItemSection] = useState<CheckSection>("opening");
  const [itemLabel, setItemLabel] = useState("");
  const [itemCadence, setItemCadence] = useState<Cadence>("daily");
  const [showRefusal, setShowRefusal] = useState(false);
  // Removing takes two taps, so a stray thumb never wipes a fridge or a check.
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const askRemove = (id: string, go: () => void) => {
    if (confirmRemove === id) { setConfirmRemove(null); go(); return; }
    setConfirmRemove(id);
    window.setTimeout(() => setConfirmRemove(c => (c === id ? null : c)), 4000);
  };
  const [editing, setEditing] = useState<string | null>(null);
  const [refReason, setRefReason] = useState<string>(REFUSAL_REASONS[0]);
  const [refDesc, setRefDesc] = useState("");

  function setKind(kind: ApplianceKind) {
    setNewKind(kind);
    const r = defaultRange(kind);
    setNewMin(r.min_c == null ? "" : String(r.min_c));
    setNewMax(r.max_c == null ? "" : String(r.max_c));
  }

  async function logReading(applianceId: string) {
    if (!venue?.id) return;
    const raw = (inputs[applianceId] ?? "").trim();
    if (raw === "") return;
    const val = parseFloat(raw);
    if (!Number.isFinite(val)) { toast({ title: "Enter a number", description: "Like 3 or -19.", variant: "destructive" }); return; }
    if (val < SANE_MIN || val > SANE_MAX) { toast({ title: `${val}°C doesn't look right`, description: "Check the thermometer and type it again.", variant: "destructive" }); return; }
    try {
      await addReading.mutateAsync({ venue_id: venue.id, appliance_id: applianceId, business_date: dateISO, reading_c: val });
      setInputs((m) => ({ ...m, [applianceId]: "" }));
    } catch (e: any) { toast({ title: "Couldn't save", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }

  async function toggleItem(item: CheckItem) {
    if (!venue?.id) return;
    const existing = todayCompByItem.get(item.id);
    try {
      if (existing) await untick.mutateAsync({ id: existing.id, venue_id: venue.id });
      else await tick.mutateAsync({ venue_id: venue.id, item_id: item.id, business_date: dateISO });
    } catch (e: any) { toast({ title: "Couldn't update", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }

  const haveApp = new Set(appliances.map(a => a.name.trim().toLowerCase()));
  const missingApps = DEFAULT_APPLIANCES.filter(a => !haveApp.has(a.name.toLowerCase()));
  const haveItem = new Set(items.map(i => `${i.section}|${i.label.trim().toLowerCase()}`));
  const missingItems = DEFAULT_CHECK_ITEMS.filter(i => !haveItem.has(`${i.section}|${i.label.toLowerCase()}`));

  async function addApplianceStarters() {
    if (!venue?.id || !missingApps.length) return;
    try {
      await addAppliances.mutateAsync(missingApps.map((a, i) => ({ venue_id: venue.id, name: a.name, kind: a.kind, min_c: a.min_c, max_c: a.max_c, sort: appliances.length + i })));
      toast({ title: `Added ${missingApps.length} temperature point${missingApps.length === 1 ? "" : "s"}` });
    } catch (e: any) { toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }
  async function addChecklistStarters() {
    if (!venue?.id || !missingItems.length) return;
    try {
      await addItems.mutateAsync(missingItems.map((it, i) => ({ venue_id: venue.id, section: it.section, label: it.label, cadence: it.cadence, sort: items.length + i })));
      toast({ title: `Added ${missingItems.length} standard check${missingItems.length === 1 ? "" : "s"}` });
    } catch (e: any) { toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }
  function rangeProblem(): string | null {
    const mn = newMin.trim() === "" ? null : parseFloat(newMin), mx = newMax.trim() === "" ? null : parseFloat(newMax);
    if ((mn != null && !Number.isFinite(mn)) || (mx != null && !Number.isFinite(mx))) return "The range needs numbers, like 0 and 5.";
    if (mn != null && mx != null && mn > mx) return `The lowest (${mn}°C) is higher than the highest (${mx}°C). Swap them round.`;
    const dupe = appliances.some(a => a.id !== editing && a.name.trim().toLowerCase() === newName.trim().toLowerCase());
    if (dupe) return `You've already got one called ${newName.trim()}.`;
    return null;
  }
  const rangeErr = newName.trim() ? rangeProblem() : null;
  async function handleAddAppliance() {
    if (!venue?.id || !newName.trim() || rangeErr) return;
    const row = { venue_id: venue.id, name: newName.trim(), kind: newKind, min_c: newMin.trim() === "" ? null : parseFloat(newMin), max_c: newMax.trim() === "" ? null : parseFloat(newMax) };
    try {
      if (editing) await updateApp.mutateAsync({ id: editing, ...row });
      else await addAppliance.mutateAsync({ ...row, sort: appliances.length });
      setNewName(""); setShowAddApp(false); setEditing(null); setKind("fridge");
    } catch (e: any) { toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }
  async function handleAddItem() {
    if (!venue?.id || !itemLabel.trim()) return;
    try {
      await addItem.mutateAsync({ venue_id: venue.id, section: itemSection, label: itemLabel.trim(), cadence: itemCadence, sort: items.length });
      setItemLabel(""); setShowAddItem(false);
    } catch (e: any) { toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }
  async function handleAddRefusal() {
    if (!venue?.id) return;
    try {
      await addRefusal.mutateAsync({ venue_id: venue.id, business_date: dateISO, reason: refReason, description: refDesc.trim() || null });
      setRefDesc(""); setShowRefusal(false);
      toast({ title: "Refusal logged" });
    } catch (e: any) { toast({ title: "Couldn't log", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }

  const nothingSetUp = appliances.length === 0 && items.length === 0;
  const checklistRemaining = useMemo(
    () => sections.reduce((n, s) => n + sectionCompletion(items, completions, dateISO, s).remaining, 0),
    [sections, items, completions, dateISO],
  );
  const totalRemaining = tempCompletion.remaining + checklistRemaining;

  const historyToggle = admin && !nothingSetUp && (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Checks view">
      {(["day", "history"] as const).map(t => (
        <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
          className={`h-9 rounded-lg text-sm font-semibold ${tab === t ? "bg-card shadow-sm text-primary" : "text-muted-foreground"}`} data-testid={`checks-tab-${t}`}>
          {t === "day" ? "Day by day" : "History & download"}
        </button>
      ))}
    </div>
  );

  const pastDay = !isToday;
  const openEdit = (a: { id: string; name: string; kind: ApplianceKind; min_c: number | null; max_c: number | null }) => {
    setEditing(a.id); setShowAddApp(true); setNewName(a.name); setNewKind(a.kind);
    setNewMin(a.min_c == null ? "" : String(a.min_c)); setNewMax(a.max_c == null ? "" : String(a.max_c));
  };

  if (admin && tab === "history" && venue?.id) {
    return (
      <div className="flex flex-col gap-4 p-4 pb-24">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-1.5"><Thermometer className="w-5 h-5" /> Checks</h1>
          {venue?.name && <div className="text-xs text-muted-foreground">{venue.name}</div>}
        </div>
        {historyToggle}
        <ChecksHistoryView venueId={venue.id} venueName={venue.name ?? "venue"} appliances={appliances} items={items} nameOf={loggedBy}
          openDay={(d) => { setDateISO(d); setTab("day"); window.scrollTo(0, 0); }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* Header + date nav */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-1.5"><Thermometer className="w-5 h-5" /> Checks</h1>
          {venue?.name && <div className="text-xs text-muted-foreground">{venue.name}</div>}
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-md border border-border" onClick={() => setDateISO(shiftISO(dateISO, -1))} aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></button>
          <label className="relative text-sm font-medium min-w-[84px] text-center underline decoration-dotted underline-offset-4 cursor-pointer" data-testid="checks-date-label">
            {prettyDate(dateISO)}
            <input type="date" aria-label="Pick a date" max={todayISO()} value={dateISO} data-testid="input-checks-date"
              onChange={(e) => { if (e.target.value && e.target.value <= todayISO()) setDateISO(e.target.value); }}
              className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <button className="p-1.5 rounded-md border border-border disabled:opacity-40" onClick={() => setDateISO(shiftISO(dateISO, 1))} disabled={isToday} aria-label="Next day"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {historyToggle}

      {pastDay && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 flex items-center justify-between gap-2" data-testid="checks-past-day">
          <span>You're looking at {prettyDate(dateISO)}. Anything added now is marked as filled in later.</span>
          <button type="button" className="font-semibold text-primary shrink-0" onClick={() => setDateISO(todayISO())} data-testid="button-checks-today">Today</button>
        </div>
      )}

      {/* Admin at-a-glance nudge */}
      {admin && !nothingSetUp && isToday && (
        totalRemaining > 0 ? (
          <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900">
            <span className="font-semibold">{totalRemaining} still to do today.</span> Anything out of range or overdue is flagged below.
          </div>
        ) : (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-center gap-2">
            <Check className="w-4 h-4" /> All of today's checks are done.
          </div>
        )
      )}

      {/* Staff, nothing set up yet */}
      {nothingSetUp && !admin && (
        <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">
          Your manager hasn't set up any checks yet. Once they do, they'll show up here for you to fill in.
        </CardContent></Card>
      )}

      {/* Admin first-run intro */}
      {admin && nothingSetUp && (
        <Card><CardContent className="p-4 text-center space-y-1">
          <ClipboardCheck className="w-8 h-8 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Set up your daily checks once. Staff fill them in on their phones, and you see everything here with anything out of range or missed flagged automatically. Add temperatures and checklists below.</p>
        </CardContent></Card>
      )}

      {/* Temperatures starter — available whenever none are set up yet */}
      {admin && appliances.length === 0 && (
        <Card><CardContent className="p-4 text-center space-y-3">
          <div className="text-sm font-semibold flex items-center justify-center gap-1.5"><Thermometer className="w-4 h-4 text-primary" /> Temperatures</div>
          <p className="text-xs text-muted-foreground">Fridges, freezers, hot holding and the cellar — logged daily with anything out of range flagged.</p>
          <Button className="w-full" onClick={addApplianceStarters} disabled={addAppliances.isPending}>{addAppliances.isPending ? "Adding…" : "Add the usual temperature points"}</Button>
          <Button variant="outline" className="w-full" onClick={() => { setEditing(null); setNewName(""); setShowAddApp(true); setKind("fridge"); }}>Add one manually</Button>
        </CardContent></Card>
      )}

      {/* ── Temperatures ── */}
      {appliances.length > 0 && (
        <>
          <SectionHeader icon={Thermometer} title="Temperatures" />
          <div className={`rounded-2xl p-4 text-white shadow-lg ${tempCompletion.complete ? "bg-primary shadow-primary/30" : "bg-slate-700"}`}>
            <div className="text-sm font-medium opacity-85">Temperatures logged</div>
            <div className="flex items-end justify-between mt-1">
              <div className="text-3xl font-bold tabular-nums">{tempCompletion.done}<span className="text-lg font-medium opacity-80">/{tempCompletion.total}</span></div>
              {tempCompletion.complete
                ? <div className="flex items-center gap-1 text-sm font-semibold"><Check className="w-4 h-4" /> All logged</div>
                : <div className="text-sm font-semibold">{tempCompletion.remaining} to go</div>}
            </div>
          </div>

          {alerts.map(({ appliance, reading, status }) => (
            <Card key={appliance.id} className="border-amber-300 bg-amber-50">
              <CardContent className="p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-amber-900">{appliance.name} — {statusLabel(status).toLowerCase()}</div>
                  <div className="text-amber-800">Last {reading.reading_c}°C at {fmtTime(reading.created_at)}. Safe range {fmtRange(appliance.min_c, appliance.max_c)}.</div>
                </div>
              </CardContent>
            </Card>
          ))}

          {appliances.map((a) => {
            const last = latestReading(a.id, readings);
            const status = last ? readingStatus(last.reading_c, a.min_c, a.max_c) : null;
            const who = last ? loggedBy(last.recorded_by) : null;
            return (
              <Card key={a.id}><CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{KIND_LABELS[a.kind]} · {fmtRange(a.min_c, a.max_c)}</div>
                  </div>
                  {admin && (
                    <div className="flex items-center shrink-0">
                      <button type="button" className="text-muted-foreground/60 hover:text-primary p-1.5" onClick={() => openEdit(a)} aria-label={`Change ${a.name}`} data-testid={`edit-appliance-${a.id}`}><Pencil className="w-4 h-4" /></button>
                      <button type="button" className={confirmRemove === a.id ? "text-xs font-semibold text-red-600 px-2 py-1 rounded-md border border-red-300 bg-red-50" : "text-muted-foreground/60 hover:text-red-600 p-1.5"}
                        onClick={() => askRemove(a.id, () => deactivateApp.mutate({ id: a.id, venue_id: venue!.id }, { onSuccess: () => toast({ title: `${a.name} removed`, description: "Its past readings are kept in your history." }) }))}
                        aria-label={confirmRemove === a.id ? `Tap again to remove ${a.name}` : `Remove ${a.name}`} data-testid={`remove-appliance-${a.id}`}>
                        {confirmRemove === a.id ? "Tap again to remove" : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Input type="number" inputMode="decimal" placeholder="°C" className="h-11 text-base" value={inputs[a.id] ?? ""} onChange={(e) => setInputs((m) => ({ ...m, [a.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") logReading(a.id); }} />
                  <Button className="h-11 px-5" onClick={() => logReading(a.id)} disabled={addReading.isPending || (inputs[a.id] ?? "").trim() === ""}>Log</Button>
                </div>
                {last && (
                  <div className="text-[11px] mt-2">
                    <span className={STATUS_STYLE[status ?? "ok"]}>Last: {last.reading_c}°C — {statusLabel(status ?? "ok")}</span>
                    <span className="text-muted-foreground"> at {fmtTime(last.created_at)}{who ? ` · ${who}` : ""}{lateNote(last.business_date, last.created_at)}</span>
                  </div>
                )}
              </CardContent></Card>
            );
          })}
          {admin && !showAddApp && (
            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={() => { setEditing(null); setNewName(""); setShowAddApp(true); setKind("fridge"); }} data-testid="button-add-appliance"><Plus className="w-4 h-4 mr-1" /> Add a temperature point</Button>
              {missingApps.length > 0 && missingApps.length < DEFAULT_APPLIANCES.length && (
                <button type="button" className="w-full text-sm text-primary font-medium" onClick={addApplianceStarters} disabled={addAppliances.isPending} data-testid="button-add-missing-appliances">
                  Add the usual ones you haven't got ({missingApps.map(a => a.name).join(", ")})
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Appliance add form — renders independently so it works from the starter too */}
      {admin && showAddApp && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold">{editing ? "Change this temperature point" : "New temperature point"}</div>
          <div><label className="text-xs font-medium text-muted-foreground">Name</label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Cellar fridge" autoFocus data-testid="input-appliance-name" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Type</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(Object.keys(KIND_LABELS) as ApplianceKind[]).map((k) => (
                <button type="button" key={k} onClick={() => setKind(k)} className={`text-xs py-2 rounded-lg border ${newKind === k ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{KIND_LABELS[k]}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground">Lowest safe °C</label><Input type="number" inputMode="decimal" value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="none" data-testid="input-appliance-min" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Highest safe °C</label><Input type="number" inputMode="decimal" value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="none" data-testid="input-appliance-max" /></div>
          </div>
          {rangeErr && <p className="text-xs text-red-600" data-testid="text-appliance-error">{rangeErr}</p>}
          {editing && <p className="text-[11px] text-muted-foreground">Past readings keep the result they were logged with.</p>}
          <div className="flex gap-2"><Button className="flex-1" onClick={handleAddAppliance} disabled={addAppliance.isPending || updateApp.isPending || !newName.trim() || !!rangeErr} data-testid="button-save-appliance">{editing ? "Save" : "Add"}</Button><Button variant="outline" onClick={() => { setShowAddApp(false); setEditing(null); }}>Cancel</Button></div>
        </CardContent></Card>
      )}

      {/* Checklists starter — available whenever none are set up yet */}
      {admin && items.length === 0 && (
        <Card><CardContent className="p-4 text-center space-y-3">
          <div className="text-sm font-semibold flex items-center justify-center gap-1.5"><ClipboardCheck className="w-4 h-4 text-primary" /> Checklists</div>
          <p className="text-xs text-muted-foreground">Opening, closing and cleaning checks — the SFBB daily diary your EHO looks for, plus weekly jobs like the beer lines.</p>
          <Button className="w-full" onClick={addChecklistStarters} disabled={addItems.isPending}>{addItems.isPending ? "Adding…" : "Add the standard checklists"}</Button>
          <Button variant="outline" className="w-full" onClick={() => setShowAddItem(true)}>Add one manually</Button>
        </CardContent></Card>
      )}

      {/* ── Checklists ── */}
      {sections.map((section) => {
        const secItems = itemsInSection(items, section);
        const comp = sectionCompletion(items, completions, dateISO, section);
        return (
          <React.Fragment key={section}>
            <SectionHeader icon={ClipboardCheck} title={`${SECTION_LABELS[section]} · ${comp.done}/${comp.total}`} />
            {secItems.map((item) => {
              const done = isItemDone(item, completions, dateISO);
              const wk = item.cadence === "weekly" ? weeklyStatus(item, completions, dateISO) : null;
              return (
                <div key={item.id} className={`w-full flex items-center gap-1 rounded-xl border transition-colors ${done ? "bg-emerald-50 border-emerald-200" : "bg-card border-border"}`}>
                <button type="button" onClick={() => toggleItem(item)} disabled={tick.isPending || untick.isPending}
                  className="flex-1 min-w-0 text-left flex items-center gap-3 p-3" data-testid={`check-item-${item.id}`} aria-pressed={done}>
                  {done ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${done ? "text-emerald-900" : ""}`}>{item.label}</div>
                    {wk && (
                      <div className={`text-[11px] ${wk.overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {wk.lastDoneISO == null ? "Weekly · never done" : wk.overdue ? `Weekly · overdue (last ${wk.daysAgo}d ago)` : `Weekly · done ${wk.daysAgo === 0 ? "today" : `${wk.daysAgo}d ago`}, due in ${wk.dueInDays}d`}
                      </div>
                    )}
                  </div>
                </button>
                  {admin && (
                    <button type="button" className={confirmRemove === item.id ? "mr-2 text-xs font-semibold text-red-600 px-2 py-1 rounded-md border border-red-300 bg-red-50 shrink-0" : "mr-1 text-muted-foreground/60 hover:text-red-600 p-2 shrink-0"}
                      onClick={() => askRemove(item.id, () => deactivateItem.mutate({ id: item.id, venue_id: venue!.id }, { onSuccess: () => toast({ title: "Check removed", description: "Past ticks are kept in your history." }) }))}
                      aria-label={confirmRemove === item.id ? `Tap again to remove ${item.label}` : `Remove ${item.label}`} data-testid={`remove-item-${item.id}`}>
                      {confirmRemove === item.id ? "Tap again to remove" : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}

      {admin && showAddItem && (
        <Card><CardContent className="p-4 space-y-3">
          <div><label className="text-xs font-medium text-muted-foreground">Section</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(["opening", "closing", "cleaning"] as CheckSection[]).map((s) => (
                <button type="button" key={s} onClick={() => setItemSection(s)} className={`text-xs py-2 rounded-lg border capitalize ${itemSection === s ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{s}</button>
              ))}
            </div>
          </div>
          <div><label className="text-xs font-medium text-muted-foreground">Check</label><Input value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} placeholder="Fire exits clear" autoFocus /></div>
          <div><label className="text-xs font-medium text-muted-foreground">How often</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(["daily", "weekly"] as Cadence[]).map((c) => (
                <button type="button" key={c} onClick={() => setItemCadence(c)} className={`text-xs py-2 rounded-lg border capitalize ${itemCadence === c ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2"><Button className="flex-1" onClick={handleAddItem} disabled={addItem.isPending || !itemLabel.trim()}>Add</Button><Button variant="outline" onClick={() => setShowAddItem(false)}>Cancel</Button></div>
        </CardContent></Card>
      )}
      {admin && items.length > 0 && !showAddItem && (
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={() => setShowAddItem(true)} data-testid="button-add-check"><Plus className="w-4 h-4 mr-1" /> Add a check</Button>
          {missingItems.length > 0 && missingItems.length < DEFAULT_CHECK_ITEMS.length && (
            <button type="button" className="w-full text-sm text-primary font-medium" onClick={addChecklistStarters} disabled={addItems.isPending} data-testid="button-add-missing-checks">
              Add the {missingItems.length} standard check{missingItems.length === 1 ? "" : "s"} you haven't got
            </button>
          )}
        </div>
      )}

      {/* ── Refusals register ── */}
      {(items.length > 0 || appliances.length > 0 || refusals.length > 0) && (
        <>
          <SectionHeader icon={ShieldAlert} title={`Refusals register · ${refusals.length}`} />
          {refusals.length === 0 && <p className="text-[11px] text-muted-foreground px-1">No refusals logged for this day.</p>}
          {refusals.map((r) => {
            const who = loggedBy(r.recorded_by);
            return (
              <Card key={r.id}><CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{r.reason ?? "Refusal"}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtTime(r.occurred_at)}{who ? ` · ${who}` : ""}{lateNote(r.business_date, r.occurred_at)}</div>
                </div>
                {r.description && <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>}
              </CardContent></Card>
            );
          })}
          {showRefusal ? (
            <Card><CardContent className="p-4 space-y-3">
              <div><label className="text-xs font-medium text-muted-foreground">Reason</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {REFUSAL_REASONS.map((reason) => (
                    <button type="button" key={reason} onClick={() => setRefReason(reason)} className={`text-xs py-1.5 px-3 rounded-full border ${refReason === reason ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{reason}</button>
                  ))}
                </div>
              </div>
              <div><label className="text-xs font-medium text-muted-foreground">Notes (optional)</label><Input value={refDesc} onChange={(e) => setRefDesc(e.target.value)} placeholder="Two lads, no ID, left ok" autoFocus /></div>
              <div className="flex gap-2"><Button className="flex-1" onClick={handleAddRefusal} disabled={addRefusal.isPending}>Log it</Button><Button variant="outline" onClick={() => setShowRefusal(false)}>Cancel</Button></div>
            </CardContent></Card>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setShowRefusal(true)}><Plus className="w-4 h-4 mr-1" /> Log a refusal</Button>
          )}
        </>
      )}
    </div>
  );
}


function ChecksHistoryView({ venueId, venueName, appliances, items, nameOf, openDay }: {
  venueId: string; venueName: string; appliances: any[]; items: CheckItem[]; nameOf: (uid: string | null) => string | null; openDay: (d: string) => void;
}) {
  const [days, setDays] = useState(30);
  const to = todayISO(); const from = shiftISO(to, -(days - 1));
  const { data, isLoading } = useChecksRange(venueId, from, to);
  // Start from the first day anything was logged, so days before you began aren't counted as missed.
  const first = useMemo(() => {
    if (!data) return from;
    const ds = [...data.readings.map(r => r.business_date), ...data.completions.map(c => c.business_date), ...data.refusals.map(r => r.business_date)].sort();
    return ds.length && ds[0] > from ? ds[0] : from;
  }, [data, from]);
  const hist = useMemo(() => data ? checksHistory(appliances, items, data.readings, data.completions, data.refusals, first, to) : [], [data, appliances, items, first, to]);
  const past = hist.filter(d => d.date !== to);
  const allDone = past.filter(d => d.complete).length;
  const flagged = hist.reduce((n, d) => n + d.outOfRange.length, 0);
  const refusals = hist.reduce((n, d) => n + d.refusals, 0);

  function download() {
    if (!data) return;
    const csv = checksCsv(appliances, items, data.readings, data.completions, data.refusals, nameOf);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${venueName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-checks-${from}-to-${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="space-y-4" data-testid="checks-history">
      <p className="text-xs text-muted-foreground">Every temperature, tick and refusal your team logs is saved against the day and who did it. Look back any time, or download it for your records.</p>
      <div className="flex gap-1.5">
        {[7, 30, 90, 365].map(n => (
          <button key={n} type="button" onClick={() => setDays(n)} className={`flex-1 h-9 rounded-lg border text-sm font-semibold ${days === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`} data-testid={`checks-range-${n}`}>
            {n === 365 ? "Year" : `${n} days`}
          </button>
        ))}
      </div>
      {isLoading ? <div className="h-40 rounded-xl bg-muted animate-pulse" /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Days fully done</div><div className="text-lg font-bold tabular-nums" data-testid="text-days-complete">{allDone} of {past.length}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Out of range</div><div className={`text-lg font-bold tabular-nums ${flagged ? "text-red-600" : ""}`} data-testid="text-out-of-range">{flagged}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Refusals</div><div className="text-lg font-bold tabular-nums" data-testid="text-refusals">{refusals}</div></CardContent></Card>
          </div>
          <Button variant="outline" className="w-full" onClick={download} disabled={!data} data-testid="button-download-checks">Download {days === 365 ? "the year" : `${days} days`} as a spreadsheet (CSV)</Button>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {hist.map(d => (
                <button key={d.date} type="button" onClick={() => openDay(d.date)} className="w-full text-left px-3 py-2.5 flex items-start gap-3" data-testid={`checks-day-${d.date}`}>
                  {d.complete && !d.outOfRange.length ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : d.outOfRange.length ? <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" /> : <Circle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{prettyDate(d.date)}</div>
                    <div className="text-xs text-muted-foreground">
                      Temps {d.tempsDone}/{d.tempsTotal}{d.dailyTotal ? ` · checklist ${d.dailyDone}/${d.dailyTotal}` : ""}{d.refusals ? ` · ${d.refusals} refusal${d.refusals === 1 ? "" : "s"}` : ""}
                    </div>
                    {d.outOfRange.map((o, i) => <div key={i} className="text-xs text-red-600">{o.name} {o.reading_c}°C · {statusLabel(o.status)}</div>)}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </button>
              ))}
            </CardContent>
          </Card>
          <p className="text-[11px] text-muted-foreground text-center">Tap a day to see exactly what was logged, when, and by whom.</p>
        </>
      )}
    </div>
  );
}
