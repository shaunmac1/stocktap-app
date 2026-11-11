import type { AuditLine, AuditBase, AuditSummary } from "./venners-audit";
import { nameTokens, VARIANTS } from "./delivery-note";
import { postmixDrinkLitresPerBox } from "./calculations";
import { caseSizeOf } from "./packaged";

/**
 * Order suggestions and busy-period patterns from Venners audits: how fast each line sells in
 * each audit period, what's in stock now (the last count, less what's sold since, plus
 * deliveries added in StockTap since), and what to order to last a chosen number of days.
 */

export interface StoredAudit {
  id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  days: number;
  summary: AuditSummary;
  lines: AuditLine[];
}

export const ML_PER_PINT = 568.26125;

export function lineKey(name: string): string {
  return name.toLowerCase()
    .replace(/\b(delist|oos|new abv%?|case only)\b/g, " ")
    .replace(/[^a-z0-9%.&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string) { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; }
export function periodLabel(a: { period_start: string; period_end: string }): string {
  return `${shortDate(a.period_start)} – ${shortDate(a.period_end)}`;
}
/** A name people recognise for a period, where there is one. */
export function periodTag(a: { period_start: string; period_end: string }): string | null {
  const s = new Date(a.period_start + "T12:00:00"), e = new Date(a.period_end + "T12:00:00");
  for (let y = s.getFullYear(); y <= e.getFullYear(); y++) {
    const xmas = new Date(`${y}-12-25T12:00:00`);
    if (xmas >= s && xmas <= e) return "Christmas";
  }
  return null;
}

export function revenuePerDay(a: StoredAudit): number | null {
  const d = a.summary?.days ?? a.days;
  return a.summary?.revenue != null && d ? a.summary.revenue / d : null;
}

export interface LinePattern {
  key: string;
  name: string;
  category: string;
  base: AuditBase;
  /** units sold per day in each audit (null when the line wasn't in that audit) */
  rates: Array<number | null>;
}

export function buildPatterns(audits: StoredAudit[]): { order: StoredAudit[]; lines: Map<string, LinePattern> } {
  const order = [...audits].sort((a, b) => a.period_end.localeCompare(b.period_end));
  const lines = new Map<string, LinePattern>();
  order.forEach((a, idx) => {
    const days = a.days || a.summary?.days || 1;
    for (const l of a.lines) {
      const key = lineKey(l.name);
      let lp = lines.get(key);
      if (!lp) { lp = { key, name: l.name, category: l.category, base: l.base, rates: order.map(() => null) }; lines.set(key, lp); }
      lp.rates[idx] = Math.max(0, l.sold) / days;
      lp.name = l.name; lp.category = l.category;
    }
  });
  return { order, lines };
}

export type Basis = { kind: "latest" } | { kind: "average" } | { kind: "busiest" } | { kind: "period"; auditId: string };

export function basisRate(p: LinePattern, order: StoredAudit[], basis: Basis): number {
  const latestIdx = order.length - 1;
  const latest = p.rates[latestIdx] ?? 0;
  if (basis.kind === "latest") return latest;
  if (basis.kind === "average") {
    let sold = 0, days = 0;
    p.rates.forEach((r, i) => { if (r != null) { const d = order[i].days || 1; sold += r * d; days += d; } });
    return days ? sold / days : latest;
  }
  if (basis.kind === "busiest") return Math.max(0, ...p.rates.map(r => r ?? 0));
  const i = order.findIndex(a => a.id === basis.auditId);
  return i >= 0 && p.rates[i] != null ? (p.rates[i] as number) : latest;
}

// ─── Pack sizes to order in ────────────────────────────────────────────────

export interface OrderProductLike {
  id: string;
  name: string;
  category?: string | null;
  counting_method?: string | null;
  size_ml?: number | null;
  pack_size?: number | null;
  container_l?: number | null;
  container_type?: string | null;
}

export interface Pack { size: number; one: string; many: string }

export function packFor(line: { name: string; base: AuditBase; unit: string; category: string }, product?: OrderProductLike | null): Pack {
  const n = line.name;
  if (line.base === "pints") {
    const g = n.match(/\b(\d+)\s*G\b/i), l = n.match(/\b(\d+(?:\.\d+)?)\s*L\b/i);
    const cask = /\bcask\b/i.test(n) || /\b9G\b/i.test(n) || product?.container_type === "cask";
    let pints = 88;
    if (g) pints = Number(g[1]) === 11 ? 50000 / ML_PER_PINT : Number(g[1]) * 8;
    else if (l) pints = (Number(l[1]) * 1000) / ML_PER_PINT;
    else if (product?.container_l) pints = (product.container_l * 1000) / ML_PER_PINT;
    return { size: pints, one: cask ? "cask" : "keg", many: cask ? "casks" : "kegs" };
  }
  if (line.base === "litres") {
    if (/post ?mix/i.test(line.category)) {
      const litres = product ? postmixDrinkLitresPerBox(product) : 72;
      return { size: litres, one: "box", many: "boxes" };
    }
    if (/12x1L/i.test(n) || /^juice\b/i.test(n)) return { size: 12, one: "case of 12 × 1L", many: "cases of 12 × 1L" };
    return { size: 1, one: "bottle", many: "bottles" };
  }
  if (line.base === "units") {
    // Bottles and cans counted each: the case size the pub has set, whatever the audit sheet's
    // unit says. Not set yet → single units, same as the Library (it never assumes 12).
    const isEach = !!product && (product.counting_method === "each" || product.counting_method === "count");
    const cs = isEach ? caseSizeOf(product!) : null;
    if (cs) return { size: cs, one: `case of ${cs}`, many: `cases of ${cs}` };
    if (/^Dozen/i.test(line.unit) && !isEach) {
      const n = product?.pack_size && product.pack_size > 1 && product.counting_method === "dozen" ? product.pack_size : 12;
      return { size: n, one: `case of ${n}`, many: `cases of ${n}` };
    }
    return { size: 1, one: "unit", many: "units" };
  }
  if (line.base === "ml") {
    const m = n.match(/(\d+)\s*ml\b/i);
    return { size: m ? Number(m[1]) : 250, one: "cartridge", many: "cartridges" };
  }
  return { size: 1, one: "bottle", many: "bottles" };
}

export function packLabel(p: Pack, n: number): string {
  return `${n} ${n === 1 ? p.one : p.many}`;
}

// ─── Matching audit lines to products in the library ───────────────────────

function compatible(line: { base: AuditBase; category: string }, p: OrderProductLike): boolean {
  const draught = (p.category ?? "").startsWith("draught_") || ["keg_weight", "dipstick", "tenths_pints"].includes(p.counting_method ?? "");
  if (line.base === "pints") return draught;
  if (draught) return false;
  if (/post ?mix/i.test(line.category)) return p.category === "postmix";
  if (p.category === "postmix") return false;
  return true;
}

/** "Mixer Britvic Orange 200ml" → 200, "Gin 70cl" → 700, "Cordial 12x1L" → 1000 */
export function sizeMlFromName(name: string): number | null {
  const all = [...name.matchAll(/(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/gi)];
  const m = all[all.length - 1];
  if (!m) return null;
  const n = Number(m[1]); const u = m[2].toLowerCase();
  return u === "ml" ? n : u === "cl" ? n * 10 : n * 1000;
}

/** Tokens match when equal, or share the first five letters (Vanilla / Vanilia). */
function tokenHit(t: string, set: Set<string>): boolean {
  if (set.has(t)) return true;
  if (t.length < 5) return false;
  for (const x of set) if (x.length >= 5 && x.slice(0, 5) === t.slice(0, 5)) return true;
  return false;
}

export function matchAuditLine(line: { name: string; base: AuditBase; category: string }, products: OrderProductLike[]): OrderProductLike | null {
  const a = nameTokens(line.name);
  if (!a.length) return null;
  const as = new Set(a);
  const lineSize = sizeMlFromName(line.name);
  const key = lineKey(line.name);
  let best: OrderProductLike | null = null, bestScore = 0;
  for (const p of products) {
    if (!compatible(line, p)) continue;
    if (lineKey(p.name) === key) return p;
    const b = nameTokens(p.name);
    if (!b.length) continue;
    const bs = new Set(b);
    const hitA = a.filter(t => tokenHit(t, bs)).length, hitB = b.filter(t => tokenHit(t, as)).length;
    if (!hitA) continue;
    let score = 0.5 * (hitA / a.length) + 0.5 * (hitB / b.length);
    if (as.has("zero") !== bs.has("zero")) score -= 0.4;
    // Different variants on each side (Rosso vs Dry, Max vs Diet) are different products
    const onlyA = a.filter(t => !bs.has(t) && VARIANTS.has(t)), onlyB = b.filter(t => !as.has(t) && VARIANTS.has(t));
    if (onlyA.length && onlyB.length) score -= 0.3;
    const pSize = p.size_ml ?? sizeMlFromName(p.name);
    if (lineSize && pSize && line.base !== "pints" && line.base !== "litres") score += Math.abs(lineSize - pSize) < 1 ? 0.1 : -0.35;
    // Strength or version in the name ("3.4%") must agree when both say
    const pctA = line.name.match(/(\d+(?:\.\d+)?)%/)?.[1], pctB = p.name.match(/(\d+(?:\.\d+)?)%/)?.[1];
    if (pctA && pctB && pctA !== pctB) score -= 0.3;
    if (pctA && pctB && pctA === pctB) score += 0.05;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 0.75 ? best : null;
}

// ─── Deliveries since the count, in each line's base unit ──────────────────

export interface DeliveryLike { product_id: string; quantity: number; quantity_ml: number | null; delivered_at: string }

export function deliveredBase(d: DeliveryLike, base: AuditBase, p: OrderProductLike): number {
  const ml = d.quantity_ml ?? 0;
  switch (base) {
    case "pints": return ml / ML_PER_PINT;
    case "litres": return p.category === "postmix" ? d.quantity * postmixDrinkLitresPerBox(p) : ml / 1000;
    case "ml": return ml;
    case "units":
      if (p.counting_method === "dozen") return d.quantity * (p.pack_size ?? 12);
      if (p.counting_method === "each" || p.counting_method === "count") return d.quantity;
      return p.size_ml ? ml / p.size_ml : d.quantity;
    case "bottles": return p.size_ml ? ml / p.size_ml : d.quantity;
  }
}

// ─── The order list ────────────────────────────────────────────────────────

export interface OrderOptions {
  basis: Basis;
  /** percent more (or less) than the basis, e.g. 25 for a busy week */
  busyPct: number;
  coverDays: number;
  /** days since the count */
  sinceDays: number;
}

export interface OrderRow {
  key: string;
  name: string;
  category: string;
  base: AuditBase;
  pack: Pack;
  /** per day, basis × busy */
  rate: number;
  /** what's there now: count − used since + delivered since */
  now: number;
  delivered: number;
  daysLeft: number;
  suggested: number; // packs
  group: "out" | "low" | "top";
  pattern: LinePattern;
}

export function orderList(
  audits: StoredAudit[],
  opts: OrderOptions,
  extras: {
    delivered?: Map<string, number>;
    /** deliveries since the count with the day they came (days after the count), in base units */
    deliveredOn?: Map<string, Array<{ day: number; qty: number }>>;
    productFor?: (key: string) => OrderProductLike | null;
    /**
     * A newer real count of the line than the audit (in the line's base unit), with days since
     * it and deliveries after it. Used instead of the audit's closing count when given.
     */
    startFor?: (key: string) => { counted: number; sinceDays: number; deliveredOn: Array<{ day: number; qty: number }> } | null;
    /**
     * The pub's own sales speed for the line from its counts (base units a day), when there is
     * one: `recent` for running stock down since the count, `rate` to order for. Keeps this
     * list and the Library's "lasts X days" on the same figure.
     */
    rateFor?: (key: string) => { recent: number; rate: number } | null;
    /** Lines the pub has hidden in its Library (no longer stocked): left off every list. */
    skip?: (key: string) => boolean;
  } = {},
): { rows: OrderRow[]; slow: Array<{ key: string; name: string; category: string; soldPerWeek: number; base: AuditBase }>; covered: CoveredRow[]; latest: StoredAudit | null; order: StoredAudit[] } {
  const { order, lines } = buildPatterns(audits);
  const latest = order[order.length - 1] ?? null;
  if (!latest) return { rows: [], slow: [], covered: [], latest: null, order };
  const rows: OrderRow[] = [];
  const covered: CoveredRow[] = [];
  const slow: Array<{ key: string; name: string; category: string; soldPerWeek: number; base: AuditBase }> = [];
  for (const l of latest.lines) {
    if (l.delist) continue;
    const key = lineKey(l.name);
    if (extras.skip?.(key)) continue;
    const pattern = lines.get(key)!;
    const own = extras.rateFor?.(key) ?? null;
    const recent = own ? own.recent : pattern.rates[order.length - 1] ?? 0;
    const rate = own ? own.rate : basisRate(pattern, order, opts.basis) * (1 + opts.busyPct / 100);
    if (rate <= 0) continue;
    const product = extras.productFor?.(key) ?? null;
    const pack = packFor(l, product);
    const start = extras.startFor?.(key) ?? null;
    const dated = start ? start.deliveredOn : extras.deliveredOn?.get(key);
    const delivered = dated ? dated.reduce((s, d) => s + d.qty, 0) : extras.delivered?.get(key) ?? 0;
    // Stock since the count goes down at the recent rate, whatever basis is chosen to order for.
    // It can't be sold while there's none, so a line that ran out before a delivery starts
    // again from what came in.
    const now = start
      ? stockNow(start.counted, recent, start.sinceDays, dated ?? [])
      : stockNow(l.counted, recent, opts.sinceDays, dated ?? (delivered ? [{ day: 0, qty: delivered }] : []));
    if (rate * 30 < pack.size && now <= 0) { slow.push({ key, name: l.name, category: l.category, soldPerWeek: rate * 7, base: l.base }); continue; }
    const need = rate * opts.coverDays - Math.max(0, now);
    const daysLeft = Math.max(0, now) / rate;
    if (need <= 0.01) { covered.push({ key, name: l.name, category: l.category, base: l.base, now, rate, delivered, daysLeft }); continue; }
    rows.push({
      key, name: l.name, category: l.category, base: l.base, pack, rate, now, delivered, daysLeft,
      suggested: Math.ceil(need / pack.size - 1e-9),
      group: now <= 0.001 ? "out" : daysLeft < Math.min(7, opts.coverDays) ? "low" : "top",
      pattern,
    });
  }
  rows.sort((a, b) => a.daysLeft - b.daysLeft || b.rate - a.rate);
  covered.sort((a, b) => a.daysLeft - b.daysLeft || b.rate - a.rate);
  return { rows, slow, covered, latest, order };
}

/** A selling line with enough in for the cover period, so nothing to order this time. */
export interface CoveredRow { key: string; name: string; category: string; base: AuditBase; now: number; rate: number; delivered: number; daysLeft: number }

/**
 * Stock now, from the count, the sales rate and deliveries since (day = days after the count).
 * Stock never goes below nothing before a delivery: you can't sell what isn't there.
 */
export function stockNow(counted: number, perDay: number, sinceDays: number, deliveries: Array<{ day: number; qty: number }>): number {
  let stock = counted, t = 0;
  for (const d of [...deliveries].sort((a, b) => a.day - b.day)) {
    const day = Math.min(Math.max(0, d.day), sinceDays);
    stock = Math.max(0, stock - perDay * (day - t)) + d.qty;
    t = day;
  }
  return stock - perDay * (sinceDays - t);
}

// ─── Showing amounts ───────────────────────────────────────────────────────

export function formatBase(x: number, base: AuditBase, signed = false): string {
  const s = signed && x > 0.0005 ? "+" : x < -0.0005 ? "−" : "";
  const a = Math.abs(x);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  if (base === "pints") {
    if (a < 8) return `${s}${r1(a)} pt`;
    let g = Math.floor(a / 8 + 1e-9), p = r1(a - g * 8);
    if (p >= 8) { g++; p = 0; }
    return `${s}${g} gal ${p} pt`;
  }
  if (base === "bottles") return `${s}${Math.round(a * 100) / 100} btl`;
  if (base === "litres") return `${s}${r1(a)} L`;
  if (base === "ml") return `${s}${Math.round(a)} ml`;
  return `${s}${r1(a)}`;
}

/** Plain text for pasting into an email or message to the rep. */
export function orderText(rows: Array<{ name: string; category: string; pack: Pack; qty: number }>, coverDays: number): string {
  const byCat = new Map<string, typeof rows>();
  rows.filter(r => r.qty > 0).forEach(r => { byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]); });
  return `Order for ${coverDays} days\n` + [...byCat.keys()].sort().map(c =>
    `\n${c}\n` + byCat.get(c)!.map(r => `- ${r.name}: ${packLabel(r.pack, r.qty)}`).join("\n")).join("\n");
}

/**
 * Lines in the same category that moved opposite ways by a lot — the sort of pattern a
 * wrong till button leaves (lemonade poured, rung through as Pepsi Max).
 */
export function offsettingPairs(lines: AuditLine[], minPounds = 150): Array<{ down: AuditLine; ups: AuditLine[] }> {
  const out: Array<{ down: AuditLine; ups: AuditLine[] }> = [];
  const used = new Set<AuditLine>();
  const downs = lines.filter(l => l.retail <= -minPounds).sort((a, b) => a.retail - b.retail);
  for (const d of downs) {
    // Each "up" line is only offered once, against the biggest loss it could explain.
    const ups = lines
      .filter(l => !used.has(l) && l.category === d.category && l.retail >= minPounds / 2 && l.base === d.base && l.variance <= Math.abs(d.variance) * 2.5)
      .sort((a, b) => b.retail - a.retail)
      .slice(0, 2);
    const upSum = ups.reduce((s, u) => s + u.variance, 0);
    if (ups.length && upSum >= Math.abs(d.variance) * 0.5) {
      ups.forEach(u => used.add(u));
      out.push({ down: d, ups });
    }
  }
  return out;
}
