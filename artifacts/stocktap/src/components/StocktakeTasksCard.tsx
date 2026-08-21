import React from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { decorateStocktakeCadenceRows, useStocktakeCadenceStatus } from "@/hooks/useStocktakeCadence";

function healthClasses(health: string): string {
  if (health === "overdue") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (health === "not_started" || health === "due_soon") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
}

export function StocktakeTasksCard({ venueId }: { venueId: string }) {
  const { data: rawSchedules = [], isLoading } = useStocktakeCadenceStatus(venueId);
  const schedules = React.useMemo(() => decorateStocktakeCadenceRows(rawSchedules), [rawSchedules]);
  const enabled = schedules.filter((row) => row.enabled);
  const actionable = enabled.filter((row) => row.health === "overdue" || row.health === "not_started" || row.health === "due_soon");
  const visible = (actionable.length > 0 ? actionable : enabled).slice(0, 3);

  if (isLoading) return null;

  if (rawSchedules.length === 0) {
    return (
      <Card className="border-dashed" data-testid="card-stocktake-schedule-empty">
        <CardContent className="p-4 flex items-start gap-3">
          <CalendarClock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Never miss a stocktake</div>
            <p className="text-xs text-muted-foreground mt-1">Set a weekly, fortnightly or monthly schedule for the whole venue or individual counting areas.</p>
            <Link href="/settings?tab=counting">
              <Button variant="outline" size="sm" className="mt-3">Set schedule</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (enabled.length === 0) return null;

  return (
    <Card data-testid="card-stocktake-tasks">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">Stocktake tasks</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {actionable.length > 0 ? `${actionable.length} count${actionable.length === 1 ? "" : "s"} need attention` : "All scheduled counts are on track"}
            </p>
          </div>
          {actionable.length > 0 ? <AlertTriangle className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-green-600" />}
        </div>

        <div className="space-y-2">
          {visible.map((row) => (
            <Link key={row.schedule_id} href="/stocktake" className="block">
              <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-muted/40 transition-colors" data-testid={`row-stocktake-task-${row.schedule_id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{row.scope_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {row.last_counted_at ? `Last counted ${new Date(row.last_counted_at).toLocaleDateString("en-GB")}` : "No completed count yet"}
                  </div>
                </div>
                <Badge className={healthClasses(row.health)}>{row.statusLabel}</Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>

        <div className="flex gap-2">
          <Link href="/stocktake" className="flex-1">
            <Button className="w-full">Start stocktake</Button>
          </Link>
          <Link href="/settings?tab=counting">
            <Button variant="outline">Schedules</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
