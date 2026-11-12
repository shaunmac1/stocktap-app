import { useState } from "react";
import { NumberPad } from "@/components/NumberPad";
import {
  CASE_SIZE_CHOICES, caseSizeOf, needsCaseSizeAnswer, suggestedCaseSize, unitNoun,
  type PackagedProductLike,
} from "@/lib/packaged";

/**
 * Bottles, cans and bags sold whole, counted the way they're stored: full cases in the
 * cellar, loose ones on the bar. The first time a line is counted it asks how it comes
 * (cases of 24, another size, or singles only) and remembers the answer.
 */
export function PackagedEntry({
  product,
  cases,
  onCases,
  loose,
  onLoose,
  onSetCaseSize,
  locked = false,
}: {
  product: PackagedProductLike;
  cases: string;
  onCases: (v: string) => void;
  loose: string;
  onLoose: (v: string) => void;
  onSetCaseSize: (size: number) => void;
  /** Staff count: the landlord sets case sizes, so no question and no change link. */
  locked?: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const [other, setOther] = useState("");
  const caseSize = caseSizeOf(product);
  const suggested = suggestedCaseSize(product);
  const asking = !locked && (needsCaseSizeAnswer(product) || choosing);
  const casesN = Math.max(0, Math.floor(parseFloat(cases) || 0));
  const many = unitNoun(product, 2);

  const pick = (size: number) => {
    setChoosing(false); setOther("");
    if (size <= 1) onCases("0");
    onSetCaseSize(size);
  };

  if (asking) {
    return (
      <div className="space-y-3 rounded-xl border border-border p-4" data-testid="case-size-question">
        <div>
          <div className="text-base font-semibold">How do these come in?</div>
          <div className="text-sm text-muted-foreground">Asked once. You can change it any time on this screen.</div>
        </div>
        {suggested && (
          <button
            type="button"
            className="h-14 w-full rounded-xl bg-primary text-lg font-bold text-primary-foreground"
            onClick={() => pick(suggested)}
            data-testid={`button-case-suggested-${suggested}`}
          >Cases of {suggested}</button>
        )}
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {suggested ? "Different case size" : "Case size"}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {CASE_SIZE_CHOICES.filter(n => n !== suggested).map(n => (
            <button
              key={n}
              type="button"
              className={`h-12 rounded-xl border text-lg font-semibold ${caseSize === n ? "border-primary bg-primary/10" : "border-border bg-muted"}`}
              onClick={() => pick(n)}
              data-testid={`button-case-${n}`}
            >{n}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={2}
            placeholder="Other"
            aria-label="Other case size"
            className="h-12 w-full rounded-xl border border-border bg-background px-3 text-lg"
            value={other}
            onChange={e => setOther(e.target.value)}
            data-testid="input-case-other"
          />
          <button
            type="button"
            disabled={!(parseInt(other, 10) > 1)}
            className="h-12 shrink-0 rounded-xl border border-border bg-muted px-4 font-semibold disabled:opacity-40"
            onClick={() => pick(parseInt(other, 10))}
            data-testid="button-case-other"
          >Use</button>
        </div>
        <button
          type="button"
          className="h-12 w-full rounded-xl border border-border text-base font-semibold"
          onClick={() => pick(1)}
          data-testid="button-case-singles"
        >No cases, I count them one by one</button>
        {choosing && (
          <button type="button" className="w-full text-sm text-muted-foreground underline" onClick={() => setChoosing(false)}>
            Keep {caseSize ? `cases of ${caseSize}` : "one by one"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="packaged-entry">
      {caseSize ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground" data-testid="label-full-cases">Full cases ({caseSize})</div>
            {!locked && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setChoosing(true)} data-testid="button-change-case-size">
              Not {caseSize} to a case?
            </button>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="One fewer full case"
              className="h-12 w-12 rounded-xl border border-border bg-muted text-2xl font-bold"
              onClick={() => onCases(String(Math.max(0, casesN - 1)))}
              data-testid="button-cases-minus"
            >−</button>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              aria-label="Full cases"
              className="h-12 w-16 rounded-xl border border-border bg-background text-center text-3xl font-bold tabular-nums"
              value={casesN}
              onChange={e => onCases(String(Math.max(0, Math.floor(parseFloat(e.target.value) || 0))))}
              onFocus={e => e.currentTarget.select()}
              data-testid="input-full-cases"
            />
            <button
              type="button"
              aria-label="One more full case"
              className="h-12 w-12 rounded-xl border border-border bg-muted text-2xl font-bold"
              onClick={() => onCases(String(casesN + 1))}
              data-testid="button-cases-plus"
            >+</button>
          </div>
        </div>
      ) : (
        <button type="button" className="w-full text-sm text-muted-foreground underline" onClick={() => setChoosing(true)} data-testid="button-set-case-size">
          These come in cases? Set the case size
        </button>
      )}
      <NumberPad
        value={loose}
        onChange={onLoose}
        label={caseSize ? `Loose ${many} (not in a full case)` : `${many[0].toUpperCase()}${many.slice(1)}`}
      />
    </div>
  );
}
