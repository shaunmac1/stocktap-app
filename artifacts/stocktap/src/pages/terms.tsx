import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-[#111316] text-[#F3F1EC]" style={{ fontFeatureSettings: "'tnum'" }}>
      <header className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
        <button
          onClick={() => setLocation("/")}
          className="w-9 h-9 rounded-lg border border-[#2A2E34] flex items-center justify-center hover:bg-[#1A1D21]"
          data-testid="button-terms-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold tracking-tight text-[15px]">Terms of Service</span>
      </header>

      <div className="max-w-2xl mx-auto px-6 pb-20 space-y-6 text-sm text-[#8A9099] leading-relaxed">
        <p className="text-xs text-[#8A9099]">Last updated: 3 July 2026. Written in plain English — if anything's unclear, email us.</p>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">1. What StockTap is</h2>
          <p>StockTap is a stock-taking tool for UK pubs, bars and restaurants. It helps you weigh stock, calculate ml remaining, tenths, GP% and till variance. It's a decision-support tool, not an accounting or legal service, and it doesn't replace your own record-keeping obligations.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">2. Your account</h2>
          <p>You need an account to use StockTap. You're responsible for keeping your login secure and for what happens under your account. One venue may have multiple team members with different roles (owner, manager, staff) — the venue owner controls who has access.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">3. Plans, pricing and billing</h2>
          <p>Plan prices are in pounds sterling and no VAT is added (StockTap is not VAT registered). Your own stock costs and pour prices inside the app are entered ex-VAT so GP% is right. Free, Pro and Premium plans and their features are listed in Settings &gt; Plan. Subscriptions renew automatically until cancelled; you can cancel any time from Settings and you'll keep access until the end of the period you've already paid for. We don't offer pro-rata refunds for early cancellation, but if something's gone wrong, contact support and we'll sort it out fairly.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">4. Your data and the numbers StockTap gives you</h2>
          <p>StockTap's calculations (ml remaining, tenths, measures, GP%, variance) are based on the weights, prices and till figures you enter. They're only as accurate as that input — check your scale is calibrated and your cost/pour prices are up to date. Variance figures are a prompt to investigate, not proof of any specific cause; please don't treat a variance report as a formal disciplinary finding on its own.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">5. Fair use</h2>
          <p>Don't use StockTap to store data you don't have the right to hold, try to break or reverse-engineer the service, or resell access without our agreement. We can suspend accounts that abuse the service or don't pay for a paid plan.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">6. The Lock-In founding landlord programme</h2>
          <p>Early venues receive a permanent "Founding Landlord" badge. This is a goodwill recognition, not a contractual guarantee of future pricing, features or exclusivity.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">7. Liability</h2>
          <p>We work hard to keep the maths right and the service reliable, but StockTap is provided "as is". We're not liable for indirect losses (like lost profits) arising from use of the app, beyond what's required by UK law. Nothing in these terms limits liability for things that can't legally be limited, such as death or personal injury caused by negligence.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">8. Changes</h2>
          <p>We may update these terms from time to time. If we make a material change, we'll let you know in the app.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[#F3F1EC] mb-2">9. Contact</h2>
          <p>Questions about these terms: <a href="mailto:hello@stocktap.net" className="text-[#E0A343]">hello@stocktap.net</a></p>
        </section>
      </div>
    </div>
  );
}
