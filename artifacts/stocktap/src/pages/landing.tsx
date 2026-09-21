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

const FOUNDING_LANDLORD_CAP = 20;

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
    name: "Pro",
    price: "£19",
    note: "a month, £190 a year",
    items: [
      "Unlimited products and locations",
      "Daily spot checks against the till",
      "Order guide, dead-stock and coverage alerts",
      "Team, rota and daily checks",
      "Offline in the cellar, CSV export",
    ],
    cta: "Start 14-day trial",
    best: true,
  },
  {
    name: "Premium",
    price: "£39",
    note: "a month, £390 a year",
    items: ["Everything in Pro", "Insight alerts: GP drift, variance trends", "Scan delivery notes into stock and prices", "Priority support"],
    cta: "Start 14-day trial",
    best: false,
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
    a: "No — StockTap never names a person as the cause of a variance. It only ever shows shifts and numbers, never blame. Most variance turns out to be over-pouring, spillage or a till entry slip, not theft. Think of it as a smoke alarm, not a courtroom.",
  },
  {
    q: "What if my team gets defensive or the mood turns sour?",
    a: "Spot checks take under five minutes and become routine fast — like checking the float. Frame it as 'we check everything, every day', not 'we're watching you'. Venues using StockTap report it actually reduces suspicion, because everyone can see the same honest numbers.",
  },
  {
    q: "I barely have time to do a stocktake once a month — how do I find time for this?",
    a: "A full stocktake still happens on your schedule. Daily spot checks replace the guesswork you're already doing when something feels off — they're a five-minute habit, not an extra job, and they're what stops small drift turning into a big end-of-month shock.",
  },
];

const COMPARISON_ROWS: { label: string; stocktaker: string | boolean; clipboard: string | boolean; stocktap: string | boolean }[] = [
  { label: "Cost", stocktaker: "£150–£300 per visit", clipboard: true, stocktap: "From free" },
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
  { icon: Upload, title: "Bring your lines in", body: "Import a CSV, start from our full UK pub catalogue (80 pre-weighed bottles plus 60 common packaged lines), or add products manually as you go." },
  { icon: UserPlus, title: "Create your account", body: "Free to start, no card required. You're weighing your first bottle in under two minutes." },
];

const IMPORT_OPTIONS = ["Import CSV", "Starter catalogue (140+ products)", "Add manually"];

export default function Landing() {
  const [, setLocation] = useLocation();
  const [weeklySales, setWeeklySales] = useState(6000);
  const [lossPct, setLossPct] = useState(3);
  const [importChoice, setImportChoice] = useState(IMPORT_OPTIONS[1]);
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

      {/* Lock-In founder banner */}
      {remaining !== null && remaining > 0 && (
        <div className="max-w-5xl mx-auto px-6 mb-2">
          <div
            className="rounded-xl border border-[#E0A343]/30 bg-[#E0A343]/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
            data-testid="banner-lock-in"
          >
            <span className="text-sm font-medium">
              <span className="text-[#E0A343] font-bold">The Lock-In:</span> the first 20 venues get a permanent Founding Landlord badge — locked-in early-adopter recognition, forever.
            </span>
            <span className="text-xs font-bold uppercase tracking-widest bg-[#E0A343] text-[#111316] rounded-full px-3 py-1 whitespace-nowrap" data-testid="text-lock-in-remaining">
              {remaining} of {FOUNDING_LANDLORD_CAP} spots left
            </span>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[#E0A343] bg-[#E0A343]/10 border border-[#E0A343]/25 rounded-full px-3 py-1 mb-6">
          Stock-taking by weight, for pubs, bars and restaurants
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
          Catch the losses before<br className="hidden sm:block" /> they become a problem.
        </h1>
        <p className="text-base sm:text-lg text-[#8A9099] max-w-xl mx-auto mb-9 leading-relaxed">
          Put the bottle on a kitchen scale, type the grams. StockTap tells you what is left, what it is worth and what went missing since the till last rang. Every day, not once a month.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            className="h-12 px-8 text-base font-semibold bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90 w-full sm:w-auto"
            onClick={() => setLocation("/auth?mode=signup")}
            data-testid="button-hero-start"
          >
            Start free: 14 days of Pro, no card
          </Button>
          <Button
            variant="outline"
            className="h-12 px-8 text-base font-semibold border-[#2A2E34] text-[#F3F1EC] hover:bg-[#1A1D21] w-full sm:w-auto"
            onClick={() => setLocation("/auth")}
            data-testid="button-hero-signin"
          >
            I already have an account
          </Button>
        </div>
        <p className="text-xs text-[#8A9099] mt-4">Set up in under ten minutes. Works on the phone in your pocket. Cancel in two taps.</p>
      </section>

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
            The trade average for unexplained wet-stock loss is 2–5% of sales. Drag the sliders for a rough estimate of what that could mean for your venue.
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
                min={2}
                max={5}
                step={0.5}
                onValueChange={(v) => setLossPct(v[0])}
                data-testid="slider-loss-pct"
              />
              <p className="text-xs text-[#8A9099] mt-2">Rough estimate — not exact. 2% is a tight, well-run bar; 5% is typical for venues that don't track weight at all.</p>
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
        <div className="rounded-xl border border-[#2A2E34] overflow-hidden">
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
            Start free, no card required. If StockTap doesn't help you catch at least one variance you'd have otherwise missed in your first 30 days on Pro, tell us and we'll refund that month in full — no questions, no forms.
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
        <p className="text-sm text-[#8A9099] text-center mb-8">Two minutes, most of it spent weighing your first bottle.</p>

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
            className="h-12 px-8 text-base font-semibold bg-[#E0A343] text-[#111316] hover:bg-[#E0A343]/90"
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
          Every new venue gets 14 days of Pro free, no card. After that, pick one. No VAT added, StockTap is not VAT registered.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={`rounded-xl border p-6 flex flex-col ${plan.best ? "border-[#E0A343]/50 bg-[#E0A343]/5" : "border-[#2A2E34] bg-[#1A1D21]"}`}
              data-testid={`pricing-${plan.name.toLowerCase()}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{plan.name}</span>
                {plan.best && (
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-[#E0A343] text-[#111316] rounded-full px-2 py-0.5">Most pubs</span>
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
        <p className="text-xs text-[#8A9099] text-center mt-4">Cancel any time from Settings, two taps. Our guarantee above still applies.</p>
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
              <a href="/videos/" className="hover:text-[#F3F1EC]" data-testid="link-footer-videos">How-to videos</a>
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
