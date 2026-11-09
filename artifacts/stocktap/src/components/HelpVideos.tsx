import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { PlayCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { helpPoster, helpSrc, videosForRoute, type HelpVideo } from "@/lib/help-videos";

/**
 * A small "How to" button on every screen that has videos. Opens the screen's how-to videos,
 * the first one playing. Hidden while any other sheet or dialog is open.
 */
export function HelpVideos() {
  const [location] = useLocation();
  const videos = videosForRoute(location);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<HelpVideo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Pixels from the bottom. Lifted above any fixed or sticky bar near the bottom of the
  // screen (a Start button, a save bar) so the button never covers one.
  const [lift, setLift] = useState(76);
  // On a wide screen the app sits in a centred column; keep the button inside it.
  const [left, setLeft] = useState(12);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Out of the way while typing (the keyboard is up), and shrunk to an icon once you scroll,
  // so it never sits over a field or a figure you're reading.
  const [typing, setTyping] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setCompact(false);
    const isField = (el: EventTarget | null) => el instanceof HTMLElement && el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, select, [contenteditable="true"]');
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTimeout(() => setTyping(isField(document.activeElement)), 50);
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | Document;
      const y = t instanceof HTMLElement ? t.scrollTop : window.scrollY;
      if (t instanceof HTMLElement && t.closest('[role="dialog"]')) return;
      setCompact(y > 80);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    document.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); document.removeEventListener("scroll", onScroll, true); };
  }, [location]);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = window.innerHeight;
        const nav = document.querySelector("nav.fixed");
        let top = nav ? nav.getBoundingClientRect().top : h;
        // Only the left third matters: that's where the button sits.
        const zoneRight = Math.min(window.innerWidth, 200);
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(".fixed, .sticky"))) {
          if (el === btnRef.current || el.contains(btnRef.current) || el === nav || nav?.contains(el)) continue;
          const pos = getComputedStyle(el).position;
          if (pos !== "fixed" && pos !== "sticky") continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || r.left > zoneRight || r.top < h * 0.55 || r.top >= top) continue;
          if (el.closest('[role="dialog"]') || el.closest("[data-radix-portal]") || el.closest("ol")) continue;
          top = r.top;
        }
        setLift(Math.max(76, Math.round(h - top + 12)));
        const col = document.querySelector("main");
        setLeft(col ? Math.max(12, Math.round(col.getBoundingClientRect().left + 12)) : 12);
      });
    };
    measure();
    const t = window.setInterval(measure, 800);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { cancelAnimationFrame(raf); window.clearInterval(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [location]);

  useEffect(() => { setOpen(false); setPlaying(null); }, [location]);
  useEffect(() => {
    const check = () => setDialogOpen(!open && !!document.querySelector('[role="dialog"][data-state="open"]'));
    const mo = new MutationObserver(check); mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
    check();
    return () => mo.disconnect();
  }, [open]);

  if (!videos.length) return null;
  const current = playing ?? videos[0];
  return (
    <>
      {!dialogOpen && !typing && (
        <button
          ref={btnRef}
          type="button"
          onClick={() => { setPlaying(videos[0]); setOpen(true); }}
          className={`fixed z-40 left-3 bottom-[76px] h-9 rounded-full bg-card/95 border border-border shadow-md flex items-center gap-1.5 text-xs font-semibold text-primary transition-all ${compact ? "w-9 justify-center px-0" : "pl-2 pr-3"}`}
          style={{ bottom: lift > 76 ? `${lift}px` : "calc(env(safe-area-inset-bottom, 0px) + 76px)", left: `${left}px` }}
          aria-label="How-to videos for this screen"
          data-testid="button-help-videos"
        >
          <PlayCircle className="w-5 h-5" />{!compact && " How to"}
        </button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] overflow-y-auto p-4" data-testid="help-videos-sheet">
          <SheetHeader className="mb-2 text-left">
            <SheetTitle>{current.title}</SheetTitle>
            <p className="text-xs text-muted-foreground">{current.blurb}</p>
          </SheetHeader>
          <video
            key={current.id}
            src={helpSrc(current.id)}
            poster={helpPoster(current.id)}
            controls autoPlay playsInline
            className="w-full max-w-[300px] mx-auto rounded-xl bg-black aspect-[9/16] block"
            data-testid="help-video-player"
          />
          {videos.length > 1 && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">More for this screen</div>
              <div className="grid grid-cols-1 gap-2">
                {videos.filter(v => v.id !== current.id).map(v => (
                  <button key={v.id} type="button" onClick={() => setPlaying(v)} className="flex items-center gap-3 text-left rounded-xl border border-border p-2" data-testid={`help-video-${v.id}`}>
                    <img src={helpPoster(v.id)} alt="" className="w-12 h-20 object-cover rounded-md bg-muted shrink-0" loading="lazy" />
                    <span className="min-w-0"><span className="block text-sm font-semibold">{v.title}</span><span className="block text-xs text-muted-foreground">{v.blurb}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <a href="/videos/" className="block text-center text-sm font-semibold text-primary mt-4 mb-2" data-testid="link-all-videos">All how-to videos →</a>
        </SheetContent>
      </Sheet>
    </>
  );
}
