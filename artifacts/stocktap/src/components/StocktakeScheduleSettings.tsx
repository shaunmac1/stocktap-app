import React from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Save, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { CADENCE_PRESETS, WEEKDAYS, cadenceLabel } from "@/lib/cadence";
import {
  useSaveStocktakeSchedule,
  useStocktakeCadenceStatus,
  type StocktakeCadenceRow,
} from "@/hooks/useStocktakeCadence";

interface CountingLocationLike {
  id: string;
  name: string;
}

interface VenueMemberOption {
  user_id: string;
  role: string;
  name: string;
}

function statusClasses(row: StocktakeCadenceRow | undefined): string {
  if (!row?.enabled) return "bg-muted text-muted-foreground";
  if (!row.last_counted_at) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
}

function ScheduleEditor({
  venueId,
  location,
  row,
  members,
}: {
  venueId: string;
  location: CountingLocationLike | null;
  row: StocktakeCadenceRow | undefined;
  members: VenueMemberOption[];
}) {
  const { toast } = useToast();
  const saveSchedule = useSaveStocktakeSchedule();
  const [enabled, setEnabled] = React.useState(row?.enabled ?? false);
  const [cadenceDays, setCadenceDays] = React.useState(String(row?.cadence_days ?? 7));
  const [preferredWeekday, setPreferredWeekday] = React.useState(
    row?.preferred_weekday == null ? "any" : String(row.preferred_weekday),
  );
  const [reminderTime, setReminderTime] = React.useState(row?.reminder_time?.slice(0, 5) ?? "09:00");
  const [assignedUserId, setAssignedUserId] = React.useState(row?.assigned_user_id ?? "any");

  React.useEffect(() => {
    setEnabled(row?.enabled ?? false);
    setCadenceDays(String(row?.cadence_days ?? 7));
    setPreferredWeekday(row?.preferred_weekday == null ? "any" : String(row.preferred_weekday));
    setReminderTime(row?.reminder_time?.slice(0, 5) ?? "09:00");
    setAssignedUserId(row?.assigned_user_id ?? "any");
  }, [row?.schedule_id, row?.enabled, row?.cadence_days, row?.preferred_weekday, row?.reminder_time, row?.assigned_user_id]);

  const save = async () => {
    try {
      await saveSchedule.mutateAsync({
        p_venue_id: venueId,
        p_count_location_id: location?.id ?? null,
        p_cadence_days: Number(cadenceDays),
        p_preferred_weekday: preferredWeekday === "any" ? null : Number(preferredWeekday),
        p_reminder_time: reminderTime || "09:00",
        p_assigned_user_id: assignedUserId === "any" ? null : assignedUserId,
        p_enabled: enabled,
      });
      toast({
        title: "Stocktake schedule saved",
        description: `${location?.name ?? "Whole venue"} · ${enabled ? cadenceLabel(Number(cadenceDays)) : "reminders off"}`,
      });
    } catch (error: any) {
      toast({ title: "Could not save schedule", description: error.message, variant: "destructive" });
    }
  };

  const lastCounted = row?.last_counted_at
    ? new Date(row.last_counted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <Card data-testid={`card-stocktake-schedule-${location?.id ?? "venue"}`}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{location?.name ?? "Whole venue"}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {lastCounted ? `Last completed ${lastCounted}` : "No completed count recorded yet"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={statusClasses(row)}>{row ? (row.enabled ? "Active" : "Off") : "Not set"}</Badge>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`Enable ${location?.name ?? "whole venue"} schedule`} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Frequency</Label>
            <Select value={cadenceDays} onValueChange={setCadenceDays} disabled={!enabled}>
              <SelectTrigger className="mt-1" data-testid={`select-cadence-${location?.id ?? "venue"}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CADENCE_PRESETS.map((preset) => (
                  <SelectItem key={preset.days} value={String(preset.days)}>{preset.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Preferred day</Label>
            <Select value={preferredWeekday} onValueChange={setPreferredWeekday} disabled={!enabled}>
              <SelectTrigger className="mt-1" data-testid={`select-weekday-${location?.id ?? "venue"}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any day</SelectItem>
                {WEEKDAYS.map((day) => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Reminder time</Label>
            <Input
              type="time"
              value={reminderTime}
              onChange={(event) => setReminderTime(event.target.value)}
              disabled={!enabled}
              className="mt-1"
              data-testid={`input-reminder-time-${location?.id ?? "venue"}`}
            />
          </div>

          <div>
            <Label>Responsible person</Label>
            <Select value={assignedUserId} onValueChange={setAssignedUserId} disabled={!enabled}>
              <SelectTrigger className="mt-1" data-testid={`select-assignee-${location?.id ?? "venue"}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anyone on the team</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name} · {member.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button className="w-full" onClick={save} disabled={saveSchedule.isPending} data-testid={`button-save-cadence-${location?.id ?? "venue"}`}>
          <Save className="w-4 h-4 mr-2" />
          {saveSchedule.isPending ? "Saving…" : "Save schedule"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function StocktakeScheduleSettings({
  venueId,
  countLocations,
}: {
  venueId: string;
  countLocations: CountingLocationLike[];
}) {
  const { data: schedules = [], isLoading } = useStocktakeCadenceStatus(venueId);
  const { data: members = [] } = useQuery({
    queryKey: ["stocktake-schedule-members", venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_members")
        .select("user_id, role, profiles(full_name)")
        .eq("venue_id", venueId);
      if (error) throw error;
      return (data ?? []).map((member: any) => ({
        user_id: member.user_id,
        role: member.role,
        name: member.profiles?.full_name || member.role,
      })) as VenueMemberOption[];
    },
    staleTime: 60_000,
  });

  const byLocation = React.useMemo(
    () => new Map(schedules.map((row) => [row.count_location_id ?? "venue", row])),
    [schedules],
  );

  return (
    <div className="space-y-3">
      <div className="pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <UserRound className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-primary">Stocktake schedule</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Show overdue and upcoming counts on the dashboard. Nothing is enabled until you save it.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading schedules…</p>
      ) : (
        <>
          <ScheduleEditor venueId={venueId} location={null} row={byLocation.get("venue")} members={members} />
          {countLocations.map((location) => (
            <ScheduleEditor
              key={location.id}
              venueId={venueId}
              location={location}
              row={byLocation.get(location.id)}
              members={members}
            />
          ))}
        </>
      )}
    </div>
  );
}
