import React, { useEffect, useState } from "react";
import { TrendingDown } from "lucide-react";

// Founder video slot: set this to a real video URL when ready and it will
// automatically appear as a fourth slide in the carousel. Leave null to ship
// screenshot-only, no code changes required later.
const FOUNDER_VIDEO_URL: string | null = null;

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[260px] sm:w-[280px]">
      <div className="relative rounded-[2.25rem] border-[6px] border-[#2A2E34] bg-[#0B0C0E] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] overflow-hidden aspect-[9/19.5]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#0B0C0E] rounded-b-xl z-10" />
        <div className="absolute inset-0">{children}</div>
      </div>
    </div>
  );
}

function WeighSlide() {
  return (
    <div className="h-full w-full bg-[#111316] px-4 pt-9 pb-4 flex flex-col">
      <div className="text-[10px] uppercase tracking-widest text-[#8A9099] mb-1">Grey Goose Vodka · 70cl</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-4xl font-bold tabular-nums leading-none text-[#F3F1EC] mb-1">6.4</div>
          <div className="text-[9px] text-[#8A9099] uppercase tracking-widest">tenths</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums leading-none text-[#F3F1EC] mb-1">
            448<span className="text-[10px] text-[#8A9099]">ml</span>
          </div>
          <div className="text-[9px] text-[#8A9099] uppercase tracking-widest">remaining</div>
        </div>
      </div>
      <div className="rounded-lg border border-[#2A2E34] bg-[#1A1D21] p-3 mb-3">
        <div className="text-[9px] text-[#8A9099] uppercase tracking-widest mb-1">Sold since last check</div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold tabular-nums text-[#F3F1EC]">3.6 measures</span>
          <span className="text-sm font-semibold tabular-nums text-[#3FAE74]">£18.20</span>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1.5">
        {["7", "8", "9"].map((n) => (
          <div key={n} className="rounded-md bg-[#1A1D21] border border-[#2A2E34] text-center text-xs font-medium text-[#F3F1EC] py-2">
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

function VarianceSlide() {
  return (
    <div className="h-full w-full bg-[#111316] px-4 pt-9 pb-4 flex flex-col">
      <div className="text-[10px] uppercase tracking-widest text-[#8A9099] mb-1">Daily spot check</div>
      <div className="text-xs text-[#F3F1EC] font-medium mb-4">Hendrick's Gin · 70cl</div>
      <div className="rounded-lg border border-[#E5544B]/40 bg-[#E5544B]/10 p-4 mb-3">
        <div className="flex items-center gap-1.5 text-[#E5544B] mb-2">
          <TrendingDown className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span className="text-[9px] uppercase tracking-widest font-medium">Variance vs till</span>
        </div>
        <div className="text-3xl font-bold tabular-nums text-[#E5544B] leading-none mb-1">-4.2 measures</div>
        <div className="text-lg font-semibold tabular-nums text-[#E5544B]">-£21.00</div>
      </div>
      <div className="text-[9px] text-[#8A9099] leading-relaxed">
        Weight-derived sales don't match the till. Check pours and till entries for this line.
      </div>
    </div>
  );
}

function LibrarySlide() {
  const rows = [
    { name: "Absolut Vodka 70cl", value: "£16.40" },
    { name: "Bacardi Carta Blanca 70cl", value: "£14.10" },
    { name: "Bombay Sapphire 70cl", value: "£19.80" },
    { name: "Captain Morgan Spiced 70cl", value: "£13.20" },
    { name: "Courvoisier VS 70cl", value: "£22.50" },
  ];
  return (
    <div className="h-full w-full bg-[#111316] px-4 pt-9 pb-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-[#F3F1EC]">Library</div>
        <div className="text-[10px] text-[#8A9099]">76 products</div>
      </div>
      <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
        {rows.map((r) => (
          <div key={r.name} className="rounded-md border border-[#2A2E34] bg-[#1A1D21] px-2.5 py-2 flex items-center justify-between">
            <span className="text-[10px] text-[#F3F1EC] truncate pr-2">{r.name}</span>
            <span className="text-[10px] font-medium tabular-nums text-[#8A9099] shrink-0">{r.value}</span>
          </div>
        ))}
        <div className="text-center text-[9px] text-[#8A9099] pt-1">+ 71 more</div>
      </div>
    </div>
  );
}

function VideoSlide({ url }: { url: string }) {
  return (
    <video
      src={url}
      className="h-full w-full object-cover"
      autoPlay
      loop
      muted
      playsInline
      data-testid="video-founder"
    />
  );
}

const SLIDE_LABELS = ["Weigh readout", "Spot-check variance", "Product library"];

export default function HeroCarousel() {
  const slides: React.ReactNode[] = [<WeighSlide key="weigh" />, <VarianceSlide key="variance" />, <LibrarySlide key="library" />];
  const labels = [...SLIDE_LABELS];

  if (FOUNDER_VIDEO_URL) {
    slides.push(<VideoSlide key="video" url={FOUNDER_VIDEO_URL} />);
    labels.push("Founder introduction");
  }

  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((a) => (a + 1) % slides.length);
    }, 4000);
    return () => clearInterval(id);
  }, [slides.length]);

  return (
    <div data-testid="carousel-hero">
      <PhoneFrame>{slides[active]}</PhoneFrame>
      <div className="flex items-center justify-center gap-2 mt-5" data-testid="carousel-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={labels[i]}
            data-testid={`button-carousel-dot-${i}`}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-6 bg-[#E0A343]" : "w-1.5 bg-[#2A2E34]"
            }`}
          />
        ))}
      </div>
      <div className="text-center text-xs text-[#8A9099] mt-2" data-testid="text-carousel-label">
        {labels[active]}
      </div>
    </div>
  );
}
