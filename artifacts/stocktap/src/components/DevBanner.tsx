import { DEV_BYPASS } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";

export function DevBanner() {
  if (!DEV_BYPASS) return null;
  return <DevBannerInner />;
}

function DevBannerInner() {
  const { bypassError, retryBypass, loading } = useAuth();

  if (bypassError) {
    return (
      <div className="w-full bg-red-600 text-white text-xs font-medium px-3 py-2 shrink-0">
        <div className="font-bold uppercase tracking-widest mb-1">DEV BYPASS FAILED</div>
        <div className="font-mono opacity-90 break-all mb-2">{bypassError}</div>
        <div className="text-[11px] opacity-80 mb-2">
          Set VITE_DEV_EMAIL + VITE_DEV_PASSWORD in Replit Secrets, then:
        </div>
        <button
          onClick={retryBypass}
          className="bg-white text-red-700 font-bold text-xs px-3 py-1 rounded"
        >
          Retry bypass
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-amber-400 text-amber-950 text-[11px] font-bold text-center py-1 px-2 tracking-widest uppercase shrink-0 select-none">
      {loading ? "DEV MODE — signing in…" : "DEV MODE — RLS on"}
    </div>
  );
}
