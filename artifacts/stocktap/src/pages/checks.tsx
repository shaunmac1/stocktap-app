import React, { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Thermometer, AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shiftISO } from "@/hooks/useDailyBoard";
import {
  useAppliances,
  useReadingsForDate,
  useAddReading,
  useAddAppliance,
  useAddAppliances,
  useDeactivateAppliance,
} from "@/hooks/useChecks";
import {
  readingStatus,
  statusLabel,
  latestReading,
  todaysCompletion,
  outOfRangeToday,
  defaultRange,
  DEFAULT_APPLIANCES,
  type ApplianceKind,
} from "@/lib/checks";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function prettyDate(dateISO: string): string {
  const today = todayISO();
  if (dateISO === today) return "Today";
  if (dateISO === shiftISO(today, -1)) return "Yesterday";
  return new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
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
  fridge: "Fridge", freezer: "Freezer", hot_hold: "Hot holding", probe: "Probe / cooked", other: "Other",
};
const STATUS_STYLE: Record<string, string> = {
  ok: "text-emerald-600", high: "text-red-600", low: "text-sky-600",
};

export default function Checks() {
  const { venue } = useAuth();
  const { toast } = useToast();
  const [dateISO, setDateISO] = useState(todayISO());
  const isToday = dateISO === todayISO();

  const { data: appliances = [] } = useAppliances(venue?.id);
  const { data: readings = [] } = useReadingsForDate(venue?.id, dateISO);
  const addReading = useAddReading();
  const addAppliance = useAddAppliance();
  const addAppliances = useAddAppliances();
  const deactivate = useDeactivateAppliance();

  const completion = useMemo(() => todaysCompletion(appliances, readings), [appliances, readings]);
  const alerts = useMemo(() => outOfRangeToday(appliances, readings), [appliances, readings]);

  // Per-appliance temperature input.
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<ApplianceKind>("fridge");
  const [newMin, setNewMin] = useState("0");
  const [newMax, setNewMax] = useState("5");

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
    if (!Number.isFinite(val)) {
      toast({ title: "Enter a number", description: "Temperature should be a number like 3 or -19.", variant: "destructive" });
      return;
    }
    try {
      await addReading.mutateAsync({ venue_id: venue.id, appliance_id: applianceId, business_date: dateISO, reading_c: val });
      setInputs((m) => ({ ...m, [applianceId]: "" }));
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  async function addStarterSet() {
    if (!venue?.id) return;
    try {
      await addAppliances.mutateAsync(
        DEFAULT_APPLIANCES.map((a, i) => ({ venue_id: venue.id, name: a.name, kind: a.kind, min_c: a.min_c, max_c: a.max_c, sort: i })),
      );
      toast({ title: "Added the usual ones", description: "Tweak any names or ranges any time." });
    } catch (e: any) {
      toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  async function handleAddAppliance() {
    if (!venue?.id || !newName.trim()) return;
    try {
      await addAppliance.mutateAsync({
        venue_id: venue.id,
        name: newName.trim(),
        kind: newKind,
        min_c: newMin.trim() === "" ? null : parseFloat(newMin),
        max_c: newMax.trim() === "" ? null : parseFloat(newMax),
        sort: appliances.length,
      });
      setNewName(""); setShowAdd(false); setKind("fridge");
    } catch (e: any) {
      toast({ title: "Couldn't add", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  }

  const complete = completion.complete;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* Header + date nav */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-1.5"><Thermometer className="w-5 h-5" /> Checks</h1>
          {venue?.name && <div className="text-xs text-muted-foreground">{venue.name}</div>}
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-md border border-border" onClick={() => setDateISO(shiftISO(dateISO, -1))} aria-label="Previous day">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[84px] text-center">{prettyDate(dateISO)}</span>
          <button
            className="p-1.5 rounded-md border border-border disabled:opacity-40"
            onClick={() => setDateISO(shiftISO(dateISO, 1))}
            disabled={isToday}
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Completion hero */}
      {appliances.length > 0 && (
        <div className={`rounded-2xl p-4 text-white shadow-lg ${complete ? "bg-primary shadow-primary/30" : "bg-slate-700 shadow-slate-700/20"}`}>
          <div className="text-sm font-medium opacity-85">{isToday ? "Today's temperature checks" : "Temperature checks"}</div>
          <div className="flex items-end justify-between mt-1">
            <div className="text-3xl font-bold tabular-nums">{completion.done}<span className="text-lg font-medium opacity-80">/{completion.total}</span></div>
            <div className="text-right">
              {complete ? (
                <div className="flex items-center gap-1 text-sm font-semibold"><Check className="w-4 h-4" /> All logged</div>
              ) : (
                <div className="text-sm font-semibold">{completion.remaining} to go</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Out-of-range alerts */}
      {alerts.map(({ appliance, reading, status }) => (
        <Card key={appliance.id} className="border-amber-300 bg-amber-50">
          <CardContent className="p-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-amber-900">{appliance.name} — {statusLabel(status).toLowerCase()}</div>
              <div className="text-amber-800">
                Last read {reading.reading_c}°C at {fmtTime(reading.created_at)}. Safe range {fmtRange(appliance.min_c, appliance.max_c)}.
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Appliance list with quick entry */}
      {appliances.map((a) => {
        const last = latestReading(a.id, readings);
        const status = last ? readingStatus(last.reading_c, a.min_c, a.max_c) : null;
        return (
          <Card key={a.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.name}</div>
                  <div className="text-[11px] text-muted-foreground">{KIND_LABELS[a.kind]} · {fmtRange(a.min_c, a.max_c)}</div>
                </div>
                <button
                  className="text-muted-foreground/50 hover:text-red-600 p-1"
                  onClick={() => deactivate.mutate({ id: a.id, venue_id: venue!.id })}
                  aria-label={`Remove ${a.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="°C"
                  className="h-11 text-base"
                  value={inputs[a.id] ?? ""}
                  onChange={(e) => setInputs((m) => ({ ...m, [a.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") logReading(a.id); }}
                />
                <Button className="h-11 px-5" onClick={() => logReading(a.id)} disabled={addReading.isPending || (inputs[a.id] ?? "").trim() === ""}>
                  Log
                </Button>
              </div>

              {last && (
                <div className="text-[11px] mt-2">
                  <span className={STATUS_STYLE[status ?? "ok"]}>
                    Last: {last.reading_c}°C — {statusLabel(status ?? "ok")}
                  </span>
                  <span className="text-muted-foreground"> at {fmtTime(last.created_at)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Empty state */}
      {appliances.length === 0 && (
        <Card>
          <CardContent className="p-4 text-center space-y-3">
            <Thermometer className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Log your fridge, freezer and hot-holding temperatures every day. It builds the record your EHO wants to see — and flags anything out of range on the spot.
            </p>
            <Button className="w-full" onClick={addStarterSet} disabled={addAppliances.isPending}>
              {addAppliances.isPending ? "Adding…" : "Add the usual ones"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add appliance */}
      {showAdd ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Cellar fridge" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(Object.keys(KIND_LABELS) as ApplianceKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`text-xs py-2 rounded-lg border ${newKind === k ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
                  >
                    {KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Min °C</label>
                <Input type="number" inputMode="decimal" value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Max °C</label>
                <Input type="number" inputMode="decimal" value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="none" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleAddAppliance} disabled={addAppliance.isPending || !newName.trim()}>
                {addAppliance.isPending ? "Adding…" : "Add"}
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        appliances.length > 0 && (
          <Button variant="outline" className="w-full" onClick={() => { setShowAdd(true); setKind("fridge"); }}>
            <Plus className="w-4 h-4 mr-1" /> Add something to check
          </Button>
        )
      )}
    </div>
  );
}
