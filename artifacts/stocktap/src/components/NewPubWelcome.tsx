import { Link } from "wouter";

/**
 * Home for a pub that hasn't finished a count yet. Instead of an empty stock value
 * and a GP% worked out from placeholder prices, it walks them to their first number:
 * check the list, count the draught, count again next week.
 */
export function NewPubWelcome({ draughtLines, totalLines }: { draughtLines: number; totalLines: number }) {
  const hasDraught = draughtLines > 0;
  const steps: { title: string; body: string; done?: boolean }[] = [
    {
      title: "Check your list.",
      body: totalLines === 0
        ? "Add your products first, or import your stocktaker's list."
        : hasDraught
          ? `${draughtLines} draught ${draughtLines === 1 ? "line is" : "lines are"} loaded. Hide any you don't stock and check the keg sizes.`
          : `${totalLines} products loaded, but no draught yet. Add your kegs and casks.`,
      done: hasDraught,
    },
    { title: "Count the cellar.", body: "Full kegs, then the open one off your gauge in gallons and pints." },
    { title: "Count again next week.", body: "The second count shows what went missing in between." },
  ];

  return (
    <div className="space-y-4 pb-16" data-testid="new-pub-welcome">
      <section className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center text-center gap-3">
        <svg width="88" height="88" viewBox="0 0 96 96" fill="none" aria-hidden="true" className="text-primary">
          <circle cx="48" cy="48" r="46" className="fill-primary/10" />
          <rect x="30" y="26" width="36" height="46" rx="8" stroke="currentColor" strokeWidth="3" />
          <path d="M30 40h36M30 58h36" stroke="currentColor" strokeWidth="3" />
          <path d="M42 33h12M42 65h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <h2 className="text-xl font-bold leading-tight">Your first number is 20 minutes away</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Count your draught first. Your stock value, GP% and what's going missing all start from that count.
        </p>
      </section>

      <ol className="space-y-2.5" aria-label="Getting started">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3" data-testid={`welcome-step-${i + 1}`}>
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? "bg-primary text-primary-foreground" : i === (hasDraught ? 1 : 0) ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
              aria-hidden="true"
            >{s.done ? "✓" : i + 1}</span>
            <span className="text-sm">
              <b>{s.title}</b> {s.body}
              {i === 0 && (
                <> <Link href="/library" className="font-semibold text-primary underline" data-testid="link-welcome-library">Open your list</Link></>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="space-y-2.5">
        <Link
          href={hasDraught ? "/stocktake?draught=1" : "/library"}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-md"
          data-testid="button-count-my-draught"
        >
          {hasDraught ? "Count my draught" : "Add my draught lines"}
        </Link>
        <a
          href="/videos/stocktap-barrels-guide.mp4"
          target="_blank"
          rel="noopener"
          className="flex h-11 w-full items-center justify-center text-sm font-semibold text-primary"
          data-testid="link-welcome-guide"
        >
          Watch the 2-minute guide
        </a>
        <Link href="/first-count" className="block text-center text-xs text-muted-foreground underline" data-testid="link-welcome-first-count">
          Rather start with spirits? Count your 20 biggest sellers instead
        </Link>
      </div>
    </div>
  );
}
