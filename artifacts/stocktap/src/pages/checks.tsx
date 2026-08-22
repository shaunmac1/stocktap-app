import React, { useMemo, useState } from "react";
import { useAuth, isAdminRole } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, ChevronRight, Thermometer, AlertTriangle, Check, Plus, Trash2,
  ClipboardCheck, ShieldAlert, Circle, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shiftISO } from "@/hooks/useDailyBoard";
import { useStaff } from "@/hooks/useTeam";
import {
  useAppliances, useReadingsForDate, useAddReading, useAddAppliance, useAddAppliances, useDeactivateAppliance,
  useCheckItems, useCompletions, useTickItem, useUntickItem, useAddCheckItem, useAddCheckItems, useDeactivateCheckItem,
  useRefusalsForDate, useAddRefusal,
} from "@/hooks/useChecks";
import {
  readingStatus, statusLabel, latestReading, todaysCompletion, outOfRangeToday, defaultRange, DEFAULT_APPLIANCES,
  isItemDone, weeklyStatus, itemsInSection, sectionCompletion, activeSections, DEFAULT_CHECK_ITEMS,
  SECTION_LABELS, REFUSAL_REASONS,
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
  const { venue, role } = useAuth();
  const admin = isAdminRole(role);
  const { toast } = useToast();
  const [dateISO, setDateISO] = useState(todayISO());
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
  const loggedBy = (uid: string | null) => (uid ? nameByUser.get(uid) ?? null : null);

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

  async function addApplianceStarters() {
    if (!venue?.id) return;
    try {
      await addAppliances.mutateAsync(DEFAULT_APPLIANCES.map((a, i) => ({ venue_id: venue.id, name: a.name, kind: a.kind, min_c: a.min_c, max_c: a.max_c, sort: i })));
      toast({ title: "Added the usual ones" });
    } catch (e: any) { toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }
  async function addChecklistStarters() {
    if (!venue?.id) return;
    try {
      await addItems.mutateAsync(DEFAULT_CHECK_ITEMS.map((it, i) => ({ venue_id: venue.id, section: it.section, label: it.label, cadence: it.cadence, sort: i })));
      toast({ title: "Added the standard checklists" });
    } catch (e: any) { toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" }); }
  }
  async function handleAddAppliance() {
    if (!venue?.id || !newName.trim()) return;
    try {
      await addAppliance.mutateAsync({ venue_id: venue.id, name: newName.trim(), kind: newKind, min_c: newMin.trim() === "" ? null : parseFloat(newMin), max_c: newMax.trim() === "" ? null : parseFloat(newMax), sort: appliances.length });
      setNewName(""); setShowAddApp(false); setKind("fridge");
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
          <span className="text-sm font-medium min-w-[84px] text-center">{prettyDate(dateISO)}</span>
          <button className="p-1.5 rounded-md border border-border disabled:opacity-40" onClick={() => setDateISO(shiftISO(dateISO, 1))} disabled={isToday} aria-label="Next day"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

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

      {/* Admin first-run setup */}
      {admin && nothingSetUp && (
        <Card><CardContent className="p-4 text-center space-y-3">
          <ClipboardCheck className="w-8 h-8 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Set up your daily checks once. Staff fill them in on their phones, you see everything here with anything out of range or missed flagged automatically.</p>
          <div className="flex flex-col gap-2">
            <Button onClick={addApplianceStarters} disabled={addAppliances.isPending}>{addAppliances.isPending ? "Adding…" : "Add the usual temperature points"}</Button>
            <Button variant="outline" onClick={addChecklistStarters} disabled={addItems.isPending}>{addItems.isPending ? "Adding…" : "Add the standard checklists"}</Button>
          </div>
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
                    <button className="text-muted-foreground/40 hover:text-red-600 p-1" onClick={() => deactivateApp.mutate({ id: a.id, venue_id: venue!.id })} aria-label={`Remove ${a.name}`}><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Input type="number" inputMode="decimal" placeholder="°C" className="h-11 text-base" value={inputs[a.id] ?? ""} onChange={(e) => setInputs((m) => ({ ...m, [a.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") logReading(a.id); }} />
                  <Button className="h-11 px-5" onClick={() => logReading(a.id)} disabled={addReading.isPending || (inputs[a.id] ?? "").trim() === ""}>Log</Button>
                </div>
                {last && (
                  <div className="text-[11px] mt-2">
                    <span className={STATUS_STYLE[status ?? "ok"]}>Last: {last.reading_c}°C — {statusLabel(status ?? "ok")}</span>
                    <span className="text-muted-foreground"> at {fmtTime(last.created_at)}{who ? ` · ${who}` : ""}</span>
                  </div>
                )}
              </CardContent></Card>
            );
          })}
          {admin && (showAddApp ? (
            <Card><CardContent className="p-4 space-y-3">
              <div><label className="text-xs font-medium text-muted-foreground">Name</label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Cellar fridge" autoFocus /></div>
              <div><label className="text-xs font-medium text-muted-foreground">Type</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(Object.keys(KIND_LABELS) as ApplianceKind[]).map((k) => (
                    <button key={k} onClick={() => setKind(k)} className={`text-xs py-2 rounded-lg border ${newKind === k ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{KIND_LABELS[k]}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-muted-foreground">Min °C</label><Input type="number" inputMode="decimal" value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="none" /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Max °C</label><Input type="number" inputMode="decimal" value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="none" /></div>
              </div>
              <div className="flex gap-2"><Button className="flex-1" onClick={handleAddAppliance} disabled={addAppliance.isPending || !newName.trim()}>Add</Button><Button variant="outline" onClick={() => setShowAddApp(false)}>Cancel</Button></div>
            </CardContent></Card>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => { setShowAddApp(true); setKind("fridge"); }}><Plus className="w-4 h-4 mr-1" /> Add a temperature point</Button>
          ))}
        </>
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
                <button key={item.id} onClick={() => toggleItem(item)} disabled={tick.isPending || untick.isPending}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${done ? "bg-emerald-50 border-emerald-200" : "bg-card border-border"}`}>
                  {done ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${done ? "text-emerald-900" : ""}`}>{item.label}</div>
                    {wk && (
                      <div className={`text-[11px] ${wk.overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {wk.lastDoneISO == null ? "Weekly · never done" : wk.overdue ? `Weekly · overdue (last ${wk.daysAgo}d ago)` : `Weekly · done ${wk.daysAgo === 0 ? "today" : `${wk.daysAgo}d ago`}, due in ${wk.dueInDays}d`}
                      </div>
                    )}
                  </div>
                  {admin && (
                    <span onClick={(e) => { e.stopPropagation(); deactivateItem.mutate({ id: item.id, venue_id: venue!.id }); }} className="text-muted-foreground/40 hover:text-red-600 p-1" aria-label={`Remove ${item.label}`}><Trash2 className="w-4 h-4" /></span>
                  )}
                </button>
              );
            })}
          </React.Fragment>
        );
      })}

      {admin && items.length > 0 && (showAddItem ? (
        <Card><CardContent className="p-4 space-y-3">
          <div><label className="text-xs font-medium text-muted-foreground">Section</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(["opening", "closing", "cleaning"] as CheckSection[]).map((s) => (
                <button key={s} onClick={() => setItemSection(s)} className={`text-xs py-2 rounded-lg border capitalize ${itemSection === s ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{s}</button>
              ))}
            </div>
          </div>
          <div><label className="text-xs font-medium text-muted-foreground">Check</label><Input value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} placeholder="Fire exits clear" autoFocus /></div>
          <div><label className="text-xs font-medium text-muted-foreground">How often</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(["daily", "weekly"] as Cadence[]).map((c) => (
                <button key={c} onClick={() => setItemCadence(c)} className={`text-xs py-2 rounded-lg border capitalize ${itemCadence === c ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2"><Button className="flex-1" onClick={handleAddItem} disabled={addItem.isPending || !itemLabel.trim()}>Add</Button><Button variant="outline" onClick={() => setShowAddItem(false)}>Cancel</Button></div>
        </CardContent></Card>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setShowAddItem(true)}><Plus className="w-4 h-4 mr-1" /> Add a check</Button>
      ))}

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
                  <div className="text-[11px] text-muted-foreground">{fmtTime(r.occurred_at)}{who ? ` · ${who}` : ""}</div>
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
                    <button key={reason} onClick={() => setRefReason(reason)} className={`text-xs py-1.5 px-3 rounded-full border ${refReason === reason ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>{reason}</button>
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
