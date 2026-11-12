import React from "react";
import { CheckCircle2 } from "lucide-react";
import { useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { TodaysCountCard } from "@/components/TodaysCountCard";
import Stocktake from "@/pages/stocktake";

/**
 * The staff count: "Today's count" and nothing else to work out. Tapping Start opens the
 * same counting screens the landlord uses, with every price and value left off.
 */
export default function StaffCount() {
  const { venue } = useAuth();
  const search = useSearch();
  const params = new URLSearchParams(search);
  // ?group= starts (or carries on) a count: hand over to the count screens and stay there
  // until they send us back with ?done=1 or the count is left.
  const [counting, setCounting] = React.useState(() => params.has("group"));
  React.useEffect(() => {
    const p = new URLSearchParams(search);
    if (p.has("group")) setCounting(true);
    else if (p.has("done") || p.has("home")) setCounting(false);
  }, [search]);
  const done = params.get("done") === "1";
  if (counting) return <Stocktake />;
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card">
        <h1 className="text-xl font-bold text-primary">Stock count</h1>
        <p className="text-xs text-muted-foreground">{venue?.name}. Works with no signal: it saves on this phone and uploads later.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {done && (
          <div className="rounded-xl border-2 border-green-600/40 bg-green-600/5 p-4" data-testid="staff-count-done">
            <div className="flex items-center gap-2 font-bold text-green-700 dark:text-green-400"><CheckCircle2 className="w-5 h-5" /> Count finished. Thank you.</div>
            <div className="text-xs text-muted-foreground mt-1">The manager can see it now.</div>
          </div>
        )}
        <TodaysCountCard base="/count" staff />
      </div>
    </div>
  );
}
