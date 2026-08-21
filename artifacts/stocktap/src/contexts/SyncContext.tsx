import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { syncDown, syncUp, getPendingCount, flushPendingLineEntries } from "@/lib/sync";

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  syncNow: () => Promise<void>;
  notifyWrite: () => void;
}

const SyncContext = createContext<SyncContextType>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  syncNow: async () => {},
  notifyWrite: () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { venue } = useAuth();
  const qc = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const running = useRef(false);

  const refreshPending = useCallback(async () => {
    setPendingCount(await getPendingCount());
  }, []);

  const doSync = useCallback(
    async (venueId: string) => {
      if (running.current) return;
      running.current = true;
      setIsSyncing(true);
      try {
        const flushed = (await syncUp()) + (await flushPendingLineEntries());
        await syncDown(venueId);
        setLastSyncAt(new Date());
        await refreshPending();
        // Invalidate React Query cache so components re-read from Dexie
        if (flushed > 0) {
          qc.invalidateQueries();
        } else {
          qc.invalidateQueries({ queryKey: ["products", venueId] });
          qc.invalidateQueries({ queryKey: ["locations", venueId] });
          qc.invalidateQueries({ queryKey: ["stocktakes", venueId] });
          qc.invalidateQueries({ queryKey: ["latest-readings", venueId] });
        }
      } catch (err) {
        console.error("[Sync] error:", err);
      } finally {
        running.current = false;
        setIsSyncing(false);
      }
    },
    [qc, refreshPending]
  );

  const syncNow = useCallback(async () => {
    if (!venue?.id || !navigator.onLine) return;
    await doSync(venue.id);
  }, [venue?.id, doSync]);

  // Called by mutations so the pending count badge updates immediately
  const notifyWrite = useCallback(() => {
    refreshPending();
  }, [refreshPending]);

  // Initial sync once venue is known
  useEffect(() => {
    if (!venue?.id) return;
    refreshPending();
    if (navigator.onLine) doSync(venue.id);
  }, [venue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any queued offline write dispatches this event so the pending badge is
  // always honest (a queued change never looks like it fully saved).
  useEffect(() => {
    const onPendingChanged = () => refreshPending();
    window.addEventListener("stocktap:pending-changed", onPendingChanged);
    return () => window.removeEventListener("stocktap:pending-changed", onPendingChanged);
  }, [refreshPending]);

  // Online / offline events + sync on reconnect
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (venue?.id) doSync(venue.id);
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [venue?.id, doSync]);

  // Background sync every 3 minutes when online
  useEffect(() => {
    if (!venue?.id) return;
    const id = setInterval(() => {
      if (navigator.onLine && venue?.id) doSync(venue.id);
    }, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [venue?.id, doSync]);

  return (
    <SyncContext.Provider
      value={{ isOnline, isSyncing, pendingCount, lastSyncAt, syncNow, notifyWrite }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
