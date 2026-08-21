import { useSync } from "@/contexts/SyncContext";
import { CloudOff, RefreshCw } from "lucide-react";

export function SyncBanner() {
  const { isOnline, isSyncing, pendingCount, syncNow } = useSync();

  // Nothing to show when online, synced, and quiet
  if (isOnline && !isSyncing && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="w-full bg-[#E5544B] text-white text-[11px] font-semibold flex items-center justify-between px-3 py-1.5 shrink-0 z-[9998]">
        <div className="flex items-center gap-1.5">
          <CloudOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            Offline{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount === 1 ? "" : "s"} pending` : " — readings saved locally"}
          </span>
        </div>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="w-full bg-[#E0A343] text-amber-950 text-[11px] font-semibold flex items-center gap-1.5 px-3 py-1.5 shrink-0 z-[9998]">
        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
        <span>Syncing…</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="w-full bg-[#E0A343] text-amber-950 text-[11px] font-semibold flex items-center justify-between px-3 py-1.5 shrink-0 z-[9998]">
        <div className="flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span>{pendingCount} change{pendingCount === 1 ? "" : "s"} pending sync</span>
        </div>
        <button
          onClick={syncNow}
          className="underline underline-offset-2 font-bold ml-2"
        >
          Sync now
        </button>
      </div>
    );
  }

  return null;
}
