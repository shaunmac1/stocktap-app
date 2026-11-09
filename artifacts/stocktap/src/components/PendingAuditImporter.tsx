import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useSaveStockAudit } from "@/hooks/useStockAudits";
import { useToast } from "@/hooks/use-toast";
import { clearPendingAudits, loadPendingAudits } from "@/lib/pending-audits";
import { ToastAction } from "@/components/ui/toast";

/** Saves audits read on the free audit check into the account, once, after sign-up or sign-in. */
export function PendingAuditImporter() {
  const { venue, role } = useAuth();
  const save = useSaveStockAudit();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !venue?.id || role === "staff") return;
    const pending = loadPendingAudits();
    if (!pending.length) return;
    done.current = true;
    (async () => {
      let ok = 0;
      for (const p of pending) {
        try { await save.mutateAsync({ venueId: venue.id, audit: p.audit, fileName: p.fileName }); ok++; } catch { /* left for the user to re-add */ }
      }
      clearPendingAudits();
      if (ok) toast({
        duration: 15000,
        title: ok === 1 ? "Your Venners audit is saved" : `Your ${ok} Venners audits are saved`,
        description: "Your order list and up and down are ready in Stock & Orders.",
        action: <ToastAction altText="Open Stock & Orders" onClick={() => setLocation("/orders")}>Open</ToastAction>,
      });
    })();
  }, [venue?.id, role]);
  return null;
}
