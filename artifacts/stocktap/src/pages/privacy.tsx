import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-[#111316] text-[#F3F1EC]" style={{ fontFeatureSettings: "'tnum'" }}>
      <header className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
        <button
          onClick={() => setLocation("/")}
          className="w-9 h-9 rounded-lg border border-[#2A2E34] flex items-center justify-center hover:bg-[#1A1D21]"
          data-testid="button-privacy-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold tracking-tight text-[15px]">Privacy Policy</span>
      </header>

      <div className="max-w-2xl mx-auto px-6 pb-20 space-y-6 text-sm text-[#8A9099] leading-relaxed">
        <p className="text-xs text-[#8A9099]">Last updated: 3 July 2026. We follow UK GDPR. Plain English, no legal jargon we can avoid.</p>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">What we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account details: email address, name (if given), venue name.</li>
            <li>Stock data you enter: products, weights, readings, stocktakes, till figures, special offers.</li>
            <li>Team data: who's on your venue and their role — used so the right people see the right data, and (for shift reviews) which staff were on shift, never to single anyone out.</li>
            <li>Billing details, handled by our payment processor (Stripe) — we don't store your card number.</li>
            <li>Basic technical data (device type, error logs) to keep the app working reliably.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">Why we collect it</h2>
          <p>To run the stock-taking features you signed up for, to bill you correctly, to provide support when you ask for it, and to improve the app. We don't sell your data, and we don't use your stock or variance data for advertising.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">Shift and variance data — no-accusation policy</h2>
          <p>Readings can record which staff were on shift at the time (`staff_on`), purely so a manager can have an informed, fair conversation about a pattern — never as an automatic accusation. StockTap never labels a specific person as responsible for a variance; it only ever shows shifts, not blame.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">Who we share it with</h2>
          <p>Only the processors we need to run the service: our database/hosting provider (Supabase), payment processor (Stripe), and email delivery for support replies. We don't sell or rent your data to third parties.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">Your rights (UK GDPR)</h2>
          <p>You can ask us at any time to: see a copy of your data, correct anything wrong, delete your account and data, or export your data (most of this you can already do yourself — Reports has a CSV export, and Settings lets you edit or remove most records directly). Email us and we'll action requests within 30 days.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">How long we keep data</h2>
          <p>We keep your account and stock data for as long as your account is active, plus a reasonable period afterwards in case you want to reactivate or need a record for accounting purposes. Ask us to delete it sooner and we will, subject to any legal retention requirements (e.g. billing records).</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">Security</h2>
          <p>Data is protected with row-level security so venues can only ever see their own data, encrypted in transit, and access is restricted to the team members you invite.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">Contact</h2>
          <p>Privacy questions or requests: <a href="mailto:hello@stocktap.net" className="text-[#E0A343]">hello@stocktap.net</a>. You can also complain to the UK Information Commissioner's Office (ico.org.uk) if you're unhappy with how we've handled your data.</p>
        </section>
      </div>
    </div>
  );
}
