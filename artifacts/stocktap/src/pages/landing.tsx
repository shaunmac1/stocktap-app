import React, { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Scale,
  TrendingUp,
  ShieldCheck,
  Zap,
  Check,
  X,
  Minus,
  Upload,
  ListChecks,
  UserPlus,
  ShieldQuestion,
} from "lucide-react";
import HeroCarousel from "@/components/HeroCarousel";
import { useFoundingLandlordCount } from "@/hooks/api";

const FOUNDING_LANDLORD_CAP = 50;

const PLANS = [
  {
    name: "Free",
    price: "£0",
    note: "for ever",
    items: ["50 products, 1 location", "Stocktakes by weight", "Valuation and GP% reports"],
    cta: "Start free",
    best: false,
  },
  {
    name: "Premium",
    price: "£39",
    note: "a month",
    items: [
      "Unlimited products and locations",
      "Daily spot checks against the till",
      "Order guide, dead-stock and coverage alerts",
      "Team, rota and daily checks",
      "Insight alerts: GP drift, variance trends",
      "Scan delivery notes into stock and prices",
      "Offline in the cellar, CSV export",
      "Priority support",
    ],
    cta: "Start 14-day free trial",
    best: true,
  },
];

const FEATURES = [
  {
    icon: Scale,
    title: "Weigh, don't guess",
    body: "Put the bottle on the scale, key in the grams. StockTap does the ml, tenths and £ maths instantly — no clipboards, no spreadsheets.",
  },
  {
    icon: Zap,
    title: "Daily spot checks",
    body: "Weigh a handful of bottles each shift and compare against the till in seconds. Catch variance before it becomes a pattern.",
  },
  {
    icon: TrendingUp,
    title: "GP% that's actually right",
    body: "Every stocktake rolls up into a valuation and GP% report, calculated from real weight data — not stock you assume is still there.",
  },
  {
    icon: ShieldCheck,
    title: "Built for the cellar",
    body: "Offline-first, one-handed, big tap targets for cold hands. Runs on the phone already in your apron.",
  },
];

const FEARS = [
  {
    q: "Won't this feel like I'm accusing my staff of stealing?",
    a: "No — StockTap never names a person as the cause of a variance. It only ever shows shifts and numbers, never blame. Variance is often over-pouring, spillage or a till entry slip, not theft. Think of it as a smoke alarm, not a courtroom.",
  },
  {
    q: "What if my team gets defensive or the mood turns sour?",
    a: "Spot checks take under five minutes and become routine fast — like checking the float. Frame it as 'we check everything, every day', not 'we're watching you'.",
  },
  {
    q: "I barely have time to do a stocktake once a month — how do I find time for this?",
    a: "A full stocktake still happens on your schedule. Daily spot checks replace the guesswork you're already doing when something feels off — they're a five-minute habit, not an extra job, and they're what stops small drift turning into a big end-of-month shock.",
  },
];

const COMPARISON_ROWS: { label: string; stocktaker: string | boolean; clipboard: string | boolean; stocktap: string | boolean }[] = [
  { label: "Cost", stocktaker: "Paid per visit", clipboard: true, stocktap: "From free" },
  { label: "Frequency", stocktaker: "Monthly, by appointment", clipboard: "As often as you can face it", stocktap: "Daily, in minutes" },
  { label: "Accuracy of ml/tenths maths", stocktaker: true, clipboard: false, stocktap: true },
  { label: "Works with cold, wet hands in a cellar", stocktaker: true, clipboard: false, stocktap: true },
  { label: "Instant GP% and variance, no waiting for a report", stocktaker: false, clipboard: false, stocktap: true },
  { label: "Local knowledge & face-to-face trust built over years", stocktaker: true, clipboard: false, stocktap: false },
  { label: "Works with zero setup or a phone at all", stocktaker: true, clipboard: true, stocktap: false },
];

function ComparisonCell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="w-4 h-4 text-[#3FAE74] mx-auto" strokeWidth={2.5} />;
  if (value === false) return <X className="w-4 h-4 text-[#8A9099] mx-auto" strokeWidth={2.5} />;
  return <span className="text-xs text-[#F3F1EC]">{value}</span>;
}

const CONFIGURATOR_STEPS = [
  { icon: ShieldQuestion, title: "Tell us where the leak is", body: "Spirits behind the bar, draught lines, wine, or all of the above — we'll set your library up to match." },
  { icon: Upload, title: "Bring your lines in", body: "Import a CSV, start from our UK pub catalogue (over 2,400 spirits, liqueurs and wines plus common bottled beers and softs), or add products manually as you go." },
  { icon: UserPlus, title: "Create your account", body: "Free to start, no card required. You can have your first line counted in about ten minutes. No scale? Count in tenths and weigh later." },
];

const PROBLEMS = [
  { slug: "what-to-order", title: "I never know what to order", body: "Guessing the order on a Sunday night, then running out of the one thing that sells." },
  { slug: "stocktake-down", title: "My stocktake says I'm down", body: "A loss on the report and no idea which line, which week or why." },
  { slug: "busy-weekends", title: "Busy weekends catch me short", body: "Bank holidays, big matches and Christmas need a bigger order than a normal week." },
  { slug: "checking-deliveries", title: "Deliveries take ages to check", body: "Fifty lines on a delivery email and every one typed in by hand." },
  { slug: "postmix", title: "Postmix never adds up", body: "Litres, boxes, syrup and yield. The numbers never match what you actually use." },
  { slug: "venners-audit", title: "Got a Venners audit?", body: "If you use Venners, drop the PDF in and see what it actually says about your bar." },
];

const IMPORT_OPTIONS = ["Import CSV", "UK pub catalogue (2,400+ lines)", "Add manually"];

export default function Landing() {
  const [, setLocation] = useLocation();
  const [weeklySales, setWeeklySales] = useState(6000);
  const [lossPct, setLossPct] = useState(3);
  const [importChoice, setImportChoice] = useState(IMPORT_OPTIONS[1]);
  const [tourOpen, setTourOpen] = useState(false);
  React.useEffect(() => {
    if (window.location.hash === "#tour") setTourOpen(true);
  }, []);
  const reduceMotion = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const { data: foundingCount } = useFoundingLandlordCount();

  const weeklyLoss = useMemo(() => (weeklySales * lossPct) / 100, [weeklySales, lossPct]);
  const annualLoss = weeklyLoss * 52;

  const remaining = typeof foundingCount === "number" ? Math.max(FOUNDING_LANDLORD_CAP - foundingCount, 0) : null;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FEARS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "StockTap",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description:
      "Mobile-first stock-taking app for UK pubs, bars and restaurants. Weigh bottles by weight to catch stock losses, calculate GP% and reconcile daily till variance.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
    author: { "@type": "Person", name: "Shaun McManus", jobTitle: "Licensee, Washington" },
  };

  return (
    <div className="min-h-[100dvh] bg-[#111316] text-[#F3F1EC]" style={{ fontFeatureSettings: "'tnum'" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Nav */}
      <header className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#E0A343] flex items-center justify-center">
            <Scale className="w-4 h-4 text-[#111316]" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight text-[15px]">StockTap</span>
        </div>
        <nav className="flex items-center gap-1 sm:gap-2 text-sm">
          <a href="/guides/" className="hidden sm:inline-block px-3 py-2 text-[#8A9099] hover:text-[#F3F1EC]" data-testid="link-nav-guides">Guides</a>
          <a href="/tools/" className="hidden sm:inline-block px-3 py-2 text-[#8A9099] hover:text-[#F3F1EC]" data-testid="link-nav-tools">Free tools</a>
          <a href="#pricing" className="hidden sm:inline-block px-3 py-2 text-[#8A9099] hover:text-[#F3F1EC]" data-testid="link-nav-pricing">Pricing</a>
          <a href="/videos/" className="hidden sm:inline-block px-3 py-2 text-[#8A9099] hover:text-[#F3F1EC]" data-testid="link-nav-videos">How it works</a>
          <Button
            variant="ghost"
            className="text-[#F3F1EC] hover:text-[#111316] hover:bg-[#F3F1EC] h-9 px-4"
            onClick={() => setLocation("/auth")}
            data-testid="button-nav-signin"
          >
            Sign in
          </Button>
        </nav>
      </header>


      {/* Hero */}
      <section className="relative overflow-hidden" data-testid="hero">
        {!reduceMotion && (
          <video
            className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
            src="/media/hero-bg.mp4" poster="/media/poster-hero-bg.jpg"
            autoPlay muted loop playsInline aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#111316]/70 via-[#111316]/80 to-[#111316]" aria-hidden="true" />
        <div className="relative max-w-5xl mx-auto px-6 pt-8 pb-16 grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_300px] gap-10 items-center">
          <div className="text-center md:text-left min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[#E0A343] bg-[#E0A343]/10 border border-[#E0A343]/25 rounded-full px-3 py-1 mb-6">
              Built by a licensee, for pubs and bars
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.08] mb-5">
              Find the money your bar is losing before the auditor does.
            </h1>
            <p className="text-base sm:text-lg text-[#B9BEC6] max-w-xl mx-auto md:mx-0 mb-7 leading-relaxed">
              Weigh every bottle on your phone, check it against the till, and see your real GP% today, not at the end of the month.
            </p>
            <div className="flex flex-col sm:flex-row items-center md:justify-start justify-center gap-3">
              <a
                href="/tools/pub-gp-profit-leak-calculator"
                className="inline-flex items-center justify-center rounded-md min-h-12 py-3 px-8 text-base font-semibold bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90 w-full sm:w-auto text-center"
                data-testid="button-hero-calculator"
              >
                Check your GP leak free
              </a>
              <Button
                variant="outline"
                className="h-12 px-6 text-base font-semibold border-[#E0A343]/60 bg-[#111316]/60 text-[#F3F1EC] hover:bg-[#1A1D21] w-full sm:w-auto"
                onClick={() => setLocation("/auth?mode=signup")}
                data-testid="button-hero-start"
              >
                Start 14 days free
              </Button>
            </div>
            <p className="text-sm text-[#F3F1EC] mt-4" data-testid="hero-risk-line">
              If StockTap doesn't help you catch at least one variance you'd have missed in your first 30 days, we refund that month in full.
            </p>
            <p className="text-xs text-[#8A9099] mt-3">
              Built by a working licensee after a £755 audit chargeback. Our free GP calculator was{" "}
              <a href="https://www.morningadvertiser.co.uk/Article/2026/09/30/licensee-launches-free-gross-profit-calculator-for-pubs/" target="_blank" rel="noopener" className="text-[#E0A343] underline underline-offset-2" data-testid="link-press-ma">covered by The Morning Advertiser</a>.
            </p>
            <p className="text-xs text-[#8A9099] mt-2">
              <button className="underline underline-offset-2 hover:text-[#F3F1EC]" onClick={() => setTourOpen(true)} data-testid="button-hero-tour">Watch the tour</button>
              {" · "}
              <button className="underline underline-offset-2 hover:text-[#F3F1EC]" onClick={() => setLocation("/auth")} data-testid="button-hero-signin">I already have an account</button>
            </p>
          </div>
          <div className="mx-auto w-[240px] sm:w-[280px]">
            <div className="rounded-[34px] border-[6px] border-[#2A2E34] bg-black shadow-[0_30px_80px_-20px_rgba(224,163,67,0.35)] overflow-hidden aspect-[9/16]">
              <video
                className="w-full h-full object-cover"
                src="/media/hero-loop.mp4" poster="/media/poster-hero.jpg"
                autoPlay={!reduceMotion} muted loop playsInline preload="metadata"
                aria-label="StockTap in use: order list, busy-night ordering and up and down"
                data-testid="video-hero"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Problems we fix */}
      <section className="max-w-5xl mx-auto px-6 pb-16" data-testid="problem-grid">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-2">What's costing you?</h2>
        <p className="text-sm text-[#8A9099] text-center mb-6">Pick the one that sounds like your week. Each has a short video of StockTap sorting it.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROBLEMS.map(pr => (
            <a key={pr.slug} href={`/problems/${pr.slug}`} className="group rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-5 hover:border-[#E0A343]/50 transition-colors" data-testid={`problem-${pr.slug}`}>
              <div className="font-semibold mb-1">{pr.title}</div>
              <div className="text-sm text-[#8A9099] leading-relaxed">{pr.body}</div>
              <div className="text-sm font-semibold text-[#E0A343] mt-3">See how it's fixed →</div>
            </a>
          ))}
        </div>
      </section>

      {/* Free audit check */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <a href="/free-audit-check" className="block rounded-2xl border border-[#E0A343]/40 bg-gradient-to-br from-[#E0A343]/15 to-transparent p-6 sm:p-8 hover:border-[#E0A343]/70 transition-colors" data-testid="link-free-audit-check">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#E0A343] mb-2">Free, no sign-up</div>
          <div className="text-2xl font-bold tracking-tight mb-2">Use Venners? Check your audit in 30 seconds.</div>
          <p className="text-sm text-[#B9BEC6] max-w-2xl">Drop the PDF in and see your result, what's up and down by category, the lines costing you most and likely till-button mix-ups. It's read on your own device and nothing is uploaded.</p>
          <div className="mt-4 inline-block bg-[#E0A343] text-[#111316] font-semibold rounded-lg px-5 py-3">Check my audit free →</div>
        </a>
      </section>

      {tourOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setTourOpen(false)} data-testid="tour-modal">
          <div className="relative w-full max-w-[380px]" onClick={e => e.stopPropagation()}>
            <button className="absolute -top-10 right-0 text-[#F3F1EC] text-sm font-semibold" onClick={() => setTourOpen(false)} data-testid="button-tour-close">Close ✕</button>
            <video className="w-full rounded-2xl bg-black aspect-[9/16]" src="/media/stocktap-tour.mp4" poster="/media/poster-tour.jpg" controls autoPlay playsInline data-testid="video-tour" />
            <Button className="mt-4 w-full h-12 font-semibold bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90" onClick={() => setLocation("/auth?mode=signup")} data-testid="button-tour-start">
              Start free: 14 days with everything on, no card
            </Button>
          </div>
        </div>
      )}

      {/* Everything you need */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-6 grid sm:grid-cols-3 gap-5 text-center">
          <div>
            <div className="text-2xl font-bold text-[#E0A343]">1</div>
            <div className="font-semibold mt-1">Your phone</div>
            <p className="text-xs text-[#8A9099] mt-1">iPhone or Android. Nothing to install, add it to your home screen and it works in the cellar with no signal.</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-[#E0A343]">2</div>
            <div className="font-semibold mt-1">A kitchen scale</div>
            <p className="text-xs text-[#8A9099] mt-1">Any scale that reads grams to 2kg. About £15 online. That is the only kit you will ever need.</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-[#E0A343]">3</div>
            <div className="font-semibold mt-1">Ten minutes</div>
            <p className="text-xs text-[#8A9099] mt-1">Pick your lines from the catalogue, weigh your first open bottle, and you have a number you can trust.</p>
          </div>
        </div>
      </section>

      {/* Hero carousel */}
      <section className="max-w-lg mx-auto px-6 pb-16">
        <HeroCarousel />
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-5">
              <div className="w-9 h-9 rounded-lg bg-[#E0A343]/12 flex items-center justify-center mb-3">
                <f.icon className="w-4.5 h-4.5 text-[#E0A343]" strokeWidth={2} />
              </div>
              <div className="font-semibold mb-1.5">{f.title}</div>
              <div className="text-sm text-[#8A9099] leading-relaxed">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Loss calculator */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight mb-1.5 text-center">What's your bar actually losing?</h2>
          <p className="text-sm text-[#8A9099] text-center mb-8 max-w-lg mx-auto">
            There's no trustworthy published UK average for unexplained wet-stock loss, so we won't make one up. Drag the sliders and try 1%, 2% and 3% to see what each would cost your venue.
          </p>

          <div className="space-y-7 max-w-md mx-auto">
            <div>
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-[#8A9099]">Weekly wet-stock sales (ex-VAT)</span>
                <span className="font-mono font-semibold tabular-nums">£{weeklySales.toLocaleString("en-GB")}</span>
              </div>
              <Slider
                value={[weeklySales]}
                min={1000}
                max={30000}
                step={500}
                onValueChange={(v) => setWeeklySales(v[0])}
                data-testid="slider-weekly-sales"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-[#8A9099]">Estimated loss rate</span>
                <span className="font-mono font-semibold tabular-nums">{lossPct.toFixed(1)}%</span>
              </div>
              <Slider
                value={[lossPct]}
                min={1}
                max={5}
                step={0.5}
                onValueChange={(v) => setLossPct(v[0])}
                data-testid="slider-loss-pct"
              />
              <p className="text-xs text-[#8A9099] mt-2">Rough estimate, not a measurement. Your own first two counts will tell you your real number.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-8 max-w-md mx-auto">
            <div className="rounded-lg bg-[#111316] border border-[#2A2E34] p-4 text-center">
              <div className="text-xs text-[#8A9099] uppercase tracking-widest mb-1">Per week</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[#E5544B]" data-testid="text-weekly-loss">
                £{weeklyLoss.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="rounded-lg bg-[#111316] border border-[#2A2E34] p-4 text-center">
              <div className="text-xs text-[#8A9099] uppercase tracking-widest mb-1">Per year</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[#E5544B]" data-testid="text-annual-loss">
                £{annualLoss.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Accusation-audit / fears block */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-2">"But will this feel like an accusation?"</h2>
        <p className="text-sm text-[#8A9099] text-center mb-8 max-w-lg mx-auto">
          Fair question — every landlord asks it. Here's how StockTap keeps this about numbers, not blame.
        </p>
        <div className="space-y-3">
          {FEARS.map((f) => (
            <div key={f.q} className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-5">
              <div className="font-semibold mb-2 flex items-start gap-2">
                <ShieldQuestion className="w-4.5 h-4.5 text-[#E0A343] shrink-0 mt-0.5" />
                {f.q}
              </div>
              <p className="text-sm text-[#8A9099] leading-relaxed pl-6.5">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-2">How it stacks up</h2>
        <p className="text-sm text-[#8A9099] text-center mb-8 max-w-lg mx-auto">
          We're not going to pretend StockTap wins on everything — here's the honest comparison.
        </p>
        <div className="rounded-xl border border-[#2A2E34] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1A1D21] border-b border-[#2A2E34]">
                <th className="text-left font-semibold p-3 w-2/5">&nbsp;</th>
                <th className="text-center font-semibold p-3 text-[#8A9099]">Stocktaker visit</th>
                <th className="text-center font-semibold p-3 text-[#8A9099]">Clipboard &amp; spreadsheet</th>
                <th className="text-center font-semibold p-3 text-[#E0A343]">StockTap</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? "bg-[#111316]" : "bg-[#15181c]"}>
                  <td className="p-3 text-[#F3F1EC] font-medium">{row.label}</td>
                  <td className="p-3 text-center"><ComparisonCell value={row.stocktaker} /></td>
                  <td className="p-3 text-center"><ComparisonCell value={row.clipboard} /></td>
                  <td className="p-3 text-center"><ComparisonCell value={row.stocktap} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#8A9099] text-center mt-3 flex items-center justify-center gap-1.5">
          <Minus className="w-3 h-3" /> We've kept the two rows above where a stocktaker or a free spreadsheet genuinely still win.
        </p>
      </section>

      {/* Guarantee */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="rounded-xl border border-[#3FAE74]/30 bg-[#3FAE74]/5 p-6 sm:p-8 text-center">
          <ShieldCheck className="w-8 h-8 text-[#3FAE74] mx-auto mb-3" />
          <h2 className="text-xl font-bold tracking-tight mb-2">Our guarantee</h2>
          <p className="text-sm text-[#8A9099] max-w-lg mx-auto leading-relaxed">
            Start free, no card required. If StockTap doesn't help you catch at least one variance you'd have otherwise missed in your first 30 days, tell us and we'll refund that month in full — no questions, no forms.
          </p>
        </div>
      </section>

      {/* EEAT author box */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-6 flex gap-4 items-start">
          <div className="w-14 h-14 rounded-full bg-[#E0A343]/15 border border-[#E0A343]/30 flex items-center justify-center shrink-0 font-bold text-[#E0A343] text-lg">
            SM
          </div>
          <div>
            <div className="font-semibold">Shaun McManus</div>
            <div className="text-xs text-[#8A9099] mb-2">Licensee, Washington, Tyne &amp; Wear</div>
            <p className="text-sm text-[#8A9099] leading-relaxed">
              "I built StockTap after one too many end-of-month stocktakes that didn't add up, with no way to work out where the leak actually was.
              It's the tool I wanted running behind my own bar — built by a licensee, for licensees, not by an accountancy firm that's never pulled a pint."
            </p>
          </div>
        </div>
      </section>

      {/* 3-step configurator */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-2">Get set up in three steps</h2>
        <p className="text-sm text-[#8A9099] text-center mb-8">About ten minutes, most of it spent weighing your first bottle.</p>

        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          {CONFIGURATOR_STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-5 relative">
              <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-[#E0A343] text-[#111316] text-xs font-bold flex items-center justify-center">
                {i + 1}
              </div>
              <s.icon className="w-5 h-5 text-[#E0A343] mb-3" />
              <div className="font-semibold mb-1.5 text-sm">{s.title}</div>
              <div className="text-xs text-[#8A9099] leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-5 mb-6">
          <div className="text-xs font-bold uppercase tracking-widest text-[#8A9099] mb-3 flex items-center gap-2">
            <ListChecks className="w-4 h-4" /> Step 2 — how do you want to bring your lines in?
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {IMPORT_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setImportChoice(opt)}
                data-testid={`button-import-${opt.replace(/\s+/g, "-").toLowerCase()}`}
                className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                  importChoice === opt
                    ? "border-[#E0A343] bg-[#E0A343]/10 text-[#E0A343]"
                    : "border-[#2A2E34] bg-[#111316] text-[#F3F1EC] hover:bg-[#15181c]"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="text-center">
          <Button
            className="h-auto min-h-12 py-3 px-8 text-base font-semibold bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90 whitespace-normal max-w-full"
            onClick={() => setLocation("/auth?mode=signup")}
            data-testid="button-configurator-start"
          >
            Create my account — {importChoice}
          </Button>
          <div className="mt-3">
            <button
              onClick={() => setLocation("/auth?mode=signup")}
              className="text-xs text-[#8A9099] hover:text-[#F3F1EC] underline underline-offset-2"
              data-testid="link-configurator-skip"
            >
              Skip setup, I'll explore first
            </button>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-2">Plain pricing</h2>
        <p className="text-sm text-[#8A9099] text-center mb-8">
          Every new venue gets 14 days free with everything switched on, no card. After that it's £39 a month, or stay on Free. No VAT added, StockTap is not VAT registered.
        </p>
        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={`rounded-xl border p-6 flex flex-col ${plan.best ? "border-[#E0A343]/50 bg-[#E0A343]/5" : "border-[#2A2E34] bg-[#1A1D21]"}`}
              data-testid={`pricing-${plan.name.toLowerCase()}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{plan.name}</span>
                {plan.best && (
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-[#E0A343] text-[#111316] rounded-full px-2 py-0.5">Recommended</span>
                )}
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold">{plan.price}</span> <span className="text-xs text-[#8A9099]">{plan.note}</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-[#F3F1EC]/90 flex-1">
                {plan.items.map(item => (
                  <li key={item} className="flex gap-2">
                    <Check className="w-4 h-4 text-[#3FAE74] shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button
                className={`mt-5 h-11 font-semibold ${plan.best ? "bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90" : "bg-[#2A2E34] text-[#F3F1EC] hover:bg-[#3A3E44]"}`}
                onClick={() => setLocation("/auth?mode=signup")}
                data-testid={`button-pricing-${plan.name.toLowerCase()}`}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#8A9099] text-center mt-4">Cancel any time from Settings. Our guarantee above still applies.</p>
      </section>

      {/* CTA footer */}
      <section className="max-w-3xl mx-auto px-6 pb-16 text-center">
        <div className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-8">
          <h2 className="text-2xl font-bold tracking-tight mb-2">Try it on your next stocktake</h2>
          <p className="text-sm text-[#8A9099] mb-6">Free trial, no card required. Cancel anytime.</p>
          <Button
            className="h-12 px-8 text-base font-semibold bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90"
            onClick={() => setLocation("/auth?mode=signup")}
            data-testid="button-footer-start"
          >
            Start free trial
          </Button>
        </div>
      </section>

      <footer className="border-t border-[#2A2E34] py-6">
        <div className="max-w-5xl mx-auto px-6 grid sm:grid-cols-4 gap-6 text-xs text-[#8A9099]">
          <div>
            <div className="font-semibold text-[#F3F1EC] mb-2">Learn</div>
            <div className="flex flex-col gap-1.5">
              <a href="/guides/" className="hover:text-[#F3F1EC]" data-testid="link-footer-guides">Guides and articles</a>
              <a href="/guides/stocktaking-software-for-pubs" className="hover:text-[#F3F1EC]" data-testid="link-footer-software-guide">Pub stocktaking software: how to pick</a>
              <a href="/videos/" className="hover:text-[#F3F1EC]" data-testid="link-footer-videos">How-to videos</a>
              <a href="/problems/" className="hover:text-[#F3F1EC]" data-testid="link-footer-problems">Problems we fix</a>
              <a href="/tools/" className="hover:text-[#F3F1EC]" data-testid="link-footer-tools">Free tools</a>
              <a href="/downloads/gp-cheat-sheet.pdf" className="hover:text-[#F3F1EC]">GP cheat sheet (PDF)</a>
            </div>
          </div>
          <div>
            <div className="font-semibold text-[#F3F1EC] mb-2">Product</div>
            <div className="flex flex-col gap-1.5">
              <a href="#pricing" className="hover:text-[#F3F1EC]">Pricing</a>
              <Link href="/help" className="hover:text-[#F3F1EC]" data-testid="link-footer-help">Help &amp; FAQ</Link>
              <Link href="/auth?mode=signup" className="hover:text-[#F3F1EC]">Start free</Link>
              <Link href="/auth" className="hover:text-[#F3F1EC]">Sign in</Link>
            </div>
          </div>
          <div>
            <div className="font-semibold text-[#F3F1EC] mb-2">Contact</div>
            <div className="flex flex-col gap-1.5">
              <a href="mailto:hello@stocktap.net" className="hover:text-[#F3F1EC]" data-testid="link-footer-contact">hello@stocktap.net</a>
              <a href="/about" className="hover:text-[#F3F1EC]">About StockTap</a>
              <a href="https://www.linkedin.com/in/shaun-macmarketing" className="hover:text-[#F3F1EC]" rel="me noopener" target="_blank">Shaun on LinkedIn</a>
            </div>
          </div>
          <div>
            <div className="font-semibold text-[#F3F1EC] mb-2">Legal</div>
            <div className="flex flex-col gap-1.5">
              <Link href="/terms" className="hover:text-[#F3F1EC]" data-testid="link-footer-terms">Terms</Link>
              <Link href="/privacy" className="hover:text-[#F3F1EC]" data-testid="link-footer-privacy">Privacy</Link>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 mt-6 text-xs text-[#8A9099]">StockTap · Built by a working licensee for pubs, bars and restaurants · UK first, works anywhere</div>
      </footer>
    </div>
  );
}
