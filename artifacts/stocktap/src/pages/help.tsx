import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, Mail } from "lucide-react";

const SUPPORT_EMAIL = "mac_tattoo@hotmail.co.uk";

interface FAQ {
  q: string;
  a: string;
  category: string;
}

const FAQS: FAQ[] = [
  {
    category: "Getting started",
    q: "How do I weigh my first bottle?",
    a: "Go to Stocktake, pick a location, then follow the on-screen prompt to put the bottle on your scale and key in the grams shown. StockTap works out the ml remaining, tenths and £ value for you — there's nothing to calculate by hand.",
  },
  {
    category: "Getting started",
    q: "What scale do I need?",
    a: "Any digital kitchen or bar scale that reads to 1 gram and can hold at least 2kg is fine. We link a recommended one in Settings > Referral > Affiliate Kit, but you don't need to buy anything specific.",
  },
  {
    category: "Measures & weights",
    q: "What are 'tenths' and why do you use them?",
    a: "Tenths is a 0–10 scale showing how much of a bottle is left, the same way bar staff have always eyeballed a bottle: 'that's about 7 tenths full'. It's quicker to read at a glance than a raw ml number, and you can switch to exact ml/measures any time in Settings.",
  },
  {
    category: "Measures & weights",
    q: "Can I change my venue's default measure size (25ml, 35ml, 50ml, etc.)?",
    a: "Yes — Settings > Defaults > Measure System lets you pick UK (25/35/50ml), Ireland (35.5ml), US (fl oz), EU (20/40ml) or free-pour. This drives measures-remaining, GP% and variance maths across the whole app.",
  },
  {
    category: "Measures & weights",
    q: "A product needs a different measure to the rest of my venue — can I override it?",
    a: "Yes. Set a measure size on the individual product in the Library and it will always be used for that product instead of your venue default — useful for double-shots or premium spirits sold in a different measure.",
  },
  {
    category: "Measures & weights",
    q: "Does StockTap handle draught lines, kegs and casks, not just spirit bottles?",
    a: "Yes — set a product's category to a draught type and choose a counting method (dipstick, keg weight, or tenths/pints). Postmix, wines, minerals and packaged stock each have their own appropriate counting method too.",
  },
  {
    category: "Spot checks & variance",
    q: "What's the difference between a stocktake and a spot check?",
    a: "A stocktake weighs every product in a location and gives you a full valuation. A spot check is a quick daily habit — weigh a handful of lines and compare the weight-derived sales against what the till says, so you catch drift before it becomes a monthly surprise.",
  },
  {
    category: "Spot checks & variance",
    q: "How is variance calculated?",
    a: "We work out how many measures should have been sold based on the drop in weight since your last reading, then compare that to the measures your till says were sold. The difference — in measures and in £ — is your variance. Negative (red) means money is missing; positive (green) means you've likely over-poured or the till is under-recording.",
  },
  {
    category: "Spot checks & variance",
    q: "A product was on a happy-hour or special offer — does that affect variance?",
    a: "Yes. If you've set up a special offer for a product with a date range in Settings > Offers, StockTap automatically uses the offer price (not the standard price) to value any variance that falls inside that window, and flags the affected rows so you know why the £ figure looks different.",
  },
  {
    category: "Spot checks & variance",
    q: "A spot check shows a big variance — does that mean someone's stealing?",
    a: "No — treat it as a starting point, not an accusation. The most common causes are over-pouring, spillage, promotional pours not rung through the till, training gaps, or a simple till entry mistake. Use the Shifts to Review feature to see who was on, then have a normal conversation, not a confrontation.",
  },
  {
    category: "Reports & GP%",
    q: "How is GP% calculated?",
    a: "GP% = (selling price − cost per measure) ÷ selling price × 100, all ex-VAT. Cost per measure is your bottle's cost price divided by how many measures it yields at your venue's measure size.",
  },
  {
    category: "Reports & GP%",
    q: "Can I export my stocktake and reports data?",
    a: "Yes — Reports has a CSV export for any date range, so you can hand figures to your accountant, area manager or brewery rep without retyping anything.",
  },
  {
    category: "Account & billing",
    q: "Is there a free trial and do I need a card to start?",
    a: "Yes — you can start free with no card required. Settings > Plan shows exactly what's included on Free vs Pro vs Premium, and you can upgrade or cancel any time.",
  },
  {
    category: "Account & billing",
    q: "What is 'The Lock-In' founding landlord badge?",
    a: "The first 20 venues ever to sign up get a permanent 'Founding Landlord' badge as a thank-you for backing us early. It's automatic — there's nothing to apply for — and the remaining spots are shown live on our homepage.",
  },
  {
    category: "Account & billing",
    q: "Does StockTap work if my pub loses signal or Wi-Fi?",
    a: "Yes — StockTap is offline-first. Readings and stocktakes save to your phone immediately and sync to the cloud the moment you're back online, so a dodgy cellar signal never loses your work.",
  },
];

export default function Help() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, FAQ[]>();
    for (const f of filtered) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="min-h-[100dvh] bg-[#111316] text-[#F3F1EC]" style={{ fontFeatureSettings: "'tnum'" }}>
      <header className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
        <button
          onClick={() => setLocation("/")}
          className="w-9 h-9 rounded-lg border border-[#2A2E34] flex items-center justify-center hover:bg-[#1A1D21]"
          data-testid="button-help-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold tracking-tight text-[15px]">Help &amp; FAQ</span>
      </header>

      <div className="max-w-3xl mx-auto px-6 pb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8A9099] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions — e.g. 'variance', 'offline', 'measure'"
            className="pl-10 h-11 bg-[#1A1D21] border-[#2A2E34] text-[#F3F1EC] placeholder:text-[#8A9099]"
            data-testid="input-help-search"
          />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-16 space-y-8">
        {grouped.length === 0 && (
          <p className="text-sm text-[#8A9099] text-center py-10">No questions matched "{query}".</p>
        )}
        {grouped.map(([category, faqs]) => (
          <div key={category}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#E0A343] mb-3">{category}</h2>
            <div className="space-y-3">
              {faqs.map((f) => (
                <details key={f.q} className="group rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-4">
                  <summary className="font-medium text-sm cursor-pointer list-none flex justify-between items-center gap-3">
                    {f.q}
                    <span className="text-[#8A9099] group-open:rotate-180 transition-transform">▾</span>
                  </summary>
                  <p className="text-sm text-[#8A9099] leading-relaxed mt-3">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-[#2A2E34] bg-[#1A1D21] p-6 text-center">
          <p className="text-sm text-[#8A9099] mb-4">Can't find what you're after? We reply within 1 business day.</p>
          <Button
            variant="outline"
            className="border-[#2A2E34] text-[#F3F1EC] hover:bg-[#111316]"
            onClick={() => (window.location.href = `mailto:${SUPPORT_EMAIL}?subject=StockTap%20help`)}
            data-testid="button-help-email"
          >
            <Mail className="w-4 h-4 mr-2" /> Email {SUPPORT_EMAIL}
          </Button>
        </div>
      </div>
    </div>
  );
}
