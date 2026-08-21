import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type Referral = Database["public"]["Tables"]["referrals"]["Row"];

export interface ReferralProgress {
  venue_name: string;
  tier: "free" | "pro" | "premium";
  pro_since: string | null;
}

export function useReferral(venueId: string | undefined) {
  return useQuery({
    queryKey: ["referral", venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("venue_id", venueId!)
        .maybeSingle();
      if (error) throw error;
      return data as Referral | null;
    },
    enabled: !!venueId,
  });
}

/** Peeks at the referred venue's tier / pro_since via a security-definer RPC (RLS-safe). */
export function useReferralProgress(referralId: string | undefined) {
  return useQuery({
    queryKey: ["referral-progress", referralId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_referral_progress", { p_referral_id: referralId! });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as ReferralProgress | null;
    },
    enabled: !!referralId,
  });
}

/** Opportunistically checks + marks a referral 'qualified' once the 30-day Pro streak is met. Returns the resulting status string ('pending' | 'qualified' | 'rewarded'). */
export function useCheckReferralQualification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (referralId: string) => {
      const { data, error } = await supabase.rpc("check_referral_qualification", { p_referral_id: referralId });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, referralId) => {
      queryClient.invalidateQueries({ queryKey: ["referral-progress", referralId] });
      queryClient.invalidateQueries({ queryKey: ["referral"] });
    },
  });
}
