import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Staff-facing clock hooks. These call SECURITY DEFINER RPCs only — staff have
// NO direct read/write access to the staff / shifts / cash_ups tables (that is
// enforced in the database via RLS). The RPCs never return wages or takings, so
// a staff phone can clock in/out but can never see the money.

export interface ShiftStatus {
  linked: boolean;
  on_shift?: boolean;
  since?: string | null; // ISO clock-in time of the current open shift
  name?: string | null; // the staff member's own name (for a friendly greeting)
  venue?: string | null; // venue name
}

/** The signed-in staff member's own live shift status. */
export function useMyShiftStatus() {
  return useQuery({
    queryKey: ["my_shift_status"],
    queryFn: async (): Promise<ShiftStatus> => {
      const { data, error } = await supabase.rpc("my_shift_status" as any);
      if (error) throw error;
      return (data ?? { linked: false }) as ShiftStatus;
    },
    // Keep the greeting/status fresh without hammering the server.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Clock the signed-in staff member IN. Idempotent server-side. */
export function useStaffClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("clock_in" as any);
      if (error) throw error;
      return data as { on_shift: boolean; since?: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my_shift_status"] }),
  });
}

/** Clock the signed-in staff member OUT. */
export function useStaffClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("clock_out" as any);
      if (error) throw error;
      return data as { on_shift: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my_shift_status"] }),
  });
}

/** Redeem a venue link code to join a team as staff. Returns the venue id. */
export function useRedeemStaffCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("redeem_staff_code" as any, {
        p_code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      return data as { venue_id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my_shift_status"] }),
  });
}

/** Turn a Supabase RPC error into a short, human message for staff. */
export function staffClockErrorMessage(err: any): string {
  const raw = (err?.message || String(err) || "").toLowerCase();
  if (raw.includes("not_linked")) return "Your phone isn't linked to a venue yet. Ask your manager for a code.";
  if (raw.includes("not_authenticated")) return "Please sign in again.";
  if (raw.includes("invalid_code")) return "That code isn't right. Double-check it with your manager.";
  if (raw.includes("code_used")) return "That code is already linked to another phone.";
  return "Something went wrong. Try again in a moment.";
}
