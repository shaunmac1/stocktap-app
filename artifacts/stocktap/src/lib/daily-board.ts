// Pure, testable logic for the Daily Board. No Supabase / React imports here so
// it can be unit-tested in isolation.

/** One nightly cash-up for a venue. Mirrors public.cash_ups. */
export interface CashUp {
  id: string;
  venue_id: string;
  business_date: string; // yyyy-mm-dd
  till_name: string | null;
  float_amount: number | null;
  z_read: number | null;
  cash_counted: number | null;
  card_taken: number | null;
  total_taken: number | null;
  variance: number | null;
  wet_sales: number | null;
  dry_sales: number | null;
  what_was_on: string | null;
  act_or_match: string | null;
  fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CashUpUpsert = { venue_id: string; business_date: string } & Partial<
  Omit<CashUp, "id" | "venue_id" | "business_date" | "created_at" | "updated_at">
>;

/** Shift a yyyy-mm-dd date by whole days, in UTC (DST-safe). */
export function shiftISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build a date -> total_taken lookup once, for reuse. */
function totalsByDate(cashUps: CashUp[]): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const c of cashUps) m.set(c.business_date, c.total_taken);
  return m;
}

export interface Comparisons {
  sameDayLastWeek: number | null;
  lastFourSameDays: number | null;
  yearsAgo: { years: number; total: number | null }[];
}

/**
 * Like-for-like comparisons for a given date, keeping the same weekday:
 * same day last week, the average of the last four same-weekdays, and the
 * same weekday roughly 1/2/3 years ago (52-week multiples).
 */
export function buildComparisons(cashUps: CashUp[], dateISO: string): Comparisons {
  const byDate = totalsByDate(cashUps);
  const at = (days: number) => byDate.get(shiftISO(dateISO, days)) ?? null;

  const sameDayLastWeek = at(-7);
  const fourVals = [-7, -14, -21, -28]
    .map((n) => at(n))
    .filter((v): v is number => v != null);
  const lastFourSameDays = fourVals.length
    ? fourVals.reduce((a, b) => a + b, 0) / fourVals.length
    : null;
  const yearsAgo = [1, 2, 3].map((y) => ({ years: y, total: at(-364 * y) }));

  return { sameDayLastWeek, lastFourSameDays, yearsAgo };
}

export interface EntertainmentRoi {
  baseline: number; // a normal same-weekday take (last-four average)
  uplift: number; // tonight minus baseline
  fee: number; // cost of the act
  net: number; // uplift minus fee — positive means it paid for itself
}

/**
 * Did the act pay for itself? Compares tonight's take against a normal
 * same-weekday night (the last-four-same-days average) and nets off the fee.
 * Returns null when there isn't enough history or no take/fee to judge.
 */
export function entertainmentRoi(
  cashUps: CashUp[],
  dateISO: string,
  total: number | null,
  fee: number | null,
): EntertainmentRoi | null {
  if (total == null || fee == null) return null;
  const avg = buildComparisons(cashUps, dateISO).lastFourSameDays;
  if (avg == null) return null;
  // Work in pennies so the figures on screen always add up.
  const baseline = round2(avg);
  const uplift = round2(total - baseline);
  return { baseline, uplift, fee, net: round2(uplift - fee) };
}

export interface TrendPoint {
  date: string;
  total: number | null;
}

/**
 * The last `days` days up to and including dateISO, oldest first, for a
 * simple trend chart. Missing days come back as null.
 */
export function recentTrend(cashUps: CashUp[], dateISO: string, days = 14): TrendPoint[] {
  const byDate = totalsByDate(cashUps);
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftISO(dateISO, -i);
    points.push({ date, total: byDate.get(date) ?? null });
  }
  return points;
}

// ─── Weeks and months ────────────────────────────────────────────────────────

/** The Sunday (weekStartsOn 0) or Monday (1) that starts the week holding dateISO. */
export function weekStartOf(dateISO: string, weekStartsOn: 0 | 1 = 0): string {
  const dow = new Date(dateISO + "T00:00:00Z").getUTCDay();
  return shiftISO(dateISO, -((dow - weekStartsOn + 7) % 7));
}

export interface WeekRow {
  start: string; // first day of the week
  total: number; // takings logged that week
  days: number; // days with takings logged
  lastYear: number | null; // same week last year (52 weeks back, same weekdays), when all 7 days are there
  lastYearSoFar: number | null; // same days last year as are logged this week
  wages: number | null; // wages logged against the week
  wagePct: number | null; // wages as a % of takings
}

/**
 * Weekly totals, newest first. `wagesByWeek` maps a week start to wages for that week.
 * Last year compares the same weekdays 52 weeks back, so a Saturday is always
 * compared with a Saturday.
 */
export function weekRows(
  cashUps: CashUp[],
  wagesByWeek: Map<string, number> = new Map(),
  weekStartsOn: 0 | 1 = 0,
  limit = 104,
): WeekRow[] {
  const byDate = totalsByDate(cashUps);
  const starts = new Set<string>();
  for (const c of cashUps) if (c.total_taken != null) starts.add(weekStartOf(c.business_date, weekStartsOn));
  const out: WeekRow[] = [];
  for (const start of [...starts].sort().reverse().slice(0, limit)) {
    let total = 0, days = 0, ly = 0, lyDays = 0, lySoFar = 0, lySoFarDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = shiftISO(start, i);
      const v = byDate.get(d);
      const past = byDate.get(shiftISO(d, -364));
      if (v != null) {
        total += v; days++;
        if (past != null) { lySoFar += past; lySoFarDays++; }
      }
      if (past != null) { ly += past; lyDays++; }
    }
    const wages = wagesByWeek.get(start) ?? null;
    out.push({
      start, total: round2(total), days,
      lastYear: lyDays === 7 ? round2(ly) : null,
      lastYearSoFar: lySoFarDays === days && days > 0 ? round2(lySoFar) : null,
      wages, wagePct: wages != null && total > 0 ? (wages / total) * 100 : null,
    });
  }
  return out;
}

export interface MonthRow { month: string; total: number; days: number; lastYear: number | null }

/** Calendar-month totals, newest first, with the same month a year earlier (when that month was fully logged). */
export function monthRows(cashUps: CashUp[], limit = 24): MonthRow[] {
  const sum = new Map<string, { total: number; days: number }>();
  for (const c of cashUps) {
    if (c.total_taken == null) continue;
    const m = c.business_date.slice(0, 7);
    const s = sum.get(m) ?? { total: 0, days: 0 };
    s.total += c.total_taken; s.days++; sum.set(m, s);
  }
  const daysIn = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
  return [...sum.keys()].sort().reverse().slice(0, limit).map(m => {
    const prev = `${+m.slice(0, 4) - 1}${m.slice(4)}`;
    const p = sum.get(prev);
    return { month: m, total: round2(sum.get(m)!.total), days: sum.get(m)!.days, lastYear: p && p.days === daysIn(prev) ? round2(p.total) : null };
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Bringing past takings in from a spreadsheet ─────────────────────────────

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** "29/09/2026", "29/9/26", "2026-09-29", "29 Sep 2026", "Tue 29 Sept 2026" → "2026-09-29" (UK day-first). */
export function parseUkDate(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/^"|"$/g, "").replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/[ t]\d{1,2}:\d{2}(:\d{2})?.*$/, "");
  let y: number, m: number, d: number;
  let r = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(t))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = /(\d{1,2})[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{2,4})/.exec(t)) && MONTHS[r[2].slice(0, r[2].startsWith("sept") ? 4 : 3)]) { d = +r[1]; m = MONTHS[r[2].slice(0, r[2].startsWith("sept") ? 4 : 3)]; y = +r[3]; }
  else return null;
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export interface TakingsImport { rows: { date: string; total: number }[]; skipped: string[]; duplicates: number }

/**
 * Reads pasted spreadsheet rows (tab, comma or spaces between cells): the first cell that
 * is a date and the next cell that is an amount. Headers, blank and total rows are skipped
 * and listed. If a date appears twice, the last one wins.
 */
/** Split one CSV line, honouring "quoted, cells". */
function csvCells(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

export function parseTakingsPaste(text: string): TakingsImport {
  const byDate = new Map<string, number>(); const skipped: string[] = []; let duplicates = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const comma = !line.includes("\t") && line.includes(",");
    const cells = line.includes("\t") ? line.split("\t") : comma ? csvCells(line) : line.split(/\s{2,}|\t/);
    let date: string | null = null, total: number | null = null;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!date) { date = parseUkDate(c); if (date) continue; }
      else {
        let raw = c;
        // Unquoted thousands in a comma file: "£1,100.00" arrives as "£1" + "100.00".
        if (comma && /^£?\s*\d{1,3}$/.test(c.trim()) && /^\d{3}(\.\d+)?$/.test((cells[i + 1] ?? "").trim()) && (c.trim().startsWith("£") || /^\d{3}\.\d\d$/.test((cells[i + 1] ?? "").trim()))) raw = c + cells[i + 1];
        const n = raw.replace(/[£,\s]/g, "");
        if (/^-?\d+(\.\d+)?$/.test(n)) { total = Number(n); break; }
      }
    }
    if (!date && cells.length === 1) { // "29/09/2026 1,234.56" with single spaces
      const m = /^(.*?\d{2,4})\s+£?\s*(-?[\d,]+(?:\.\d+)?)\s*$/.exec(line.trim());
      if (m) { date = parseUkDate(m[1]); total = date ? Number(m[2].replace(/,/g, "")) : null; }
    }
    if (!date || total == null || total < 0) { skipped.push(line.trim().slice(0, 60)); continue; }
    if (byDate.has(date)) duplicates++;
    byDate.set(date, Math.round(total * 100) / 100);
  }
  const rows = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total }));
  return { rows, skipped, duplicates };
}


// ─── Till exports with several columns (or days across the top) ─────────────

export interface TakingsColumn { label: string; rows: { date: string; total: number }[]; skipped: string[]; duplicates: number }
export interface TakingsTable { columns: TakingsColumn[]; best: number; across: boolean }

const splitCells = (line: string) =>
  line.includes("\t") ? line.split("\t").map(c => c.trim()) : line.includes(",") ? csvCells(line) : line.split(/\s{2,}/).map(c => c.trim());
const money = (c: string): number | null => {
  let n = (c ?? "").trim().replace(/^"|"$/g, "");
  const neg = /^\(.*\)$/.test(n) || /^-/.test(n);
  n = n.replace(/[()£,\s-]/g, "");
  return /^\d+(\.\d+)?$/.test(n) ? (neg ? -Number(n) : Number(n)) : null;
};
// Which column is "what you took": inc-VAT totals first. Square calls it Total collected;
// its "Gross sales" is before VAT, so it ranks below the inc-VAT names.
const PREFER = [/total collected/i, /(gross|total).*(inc|incl|including)\.? ?(vat|tax)/i, /sales.*(inc|incl)\.? ?(vat|tax)/i, /takings/i, /^total( sales)?$/i, /gross/i, /total/i, /sales/i];
const NOT_TAKINGS = /(count|qty|quantity|covers|transactions|orders|customers|guests|%|percent|average|avg|vat$|tax$|discount|refund|void|tip|service)/i;

/**
 * Reads a till export: one row per day (pick the column) or days across the top (pick the row).
 * Every number column becomes a choice; the best guess at the takings is pre-picked.
 */
export function parseTakingsTable(text: string): TakingsTable {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const grid = lines.map(splitCells);
  // Days across the top: a row with 3+ dates after its first cell, and few rows starting with a date.
  const dateRowIdx = grid.findIndex(r => r.slice(1).filter(c => parseUkDate(c)).length >= 3);
  const rowsStartingWithDate = grid.filter(r => r.slice(0, 2).some(c => parseUkDate(c))).length;
  if (dateRowIdx >= 0 && rowsStartingWithDate < 3) {
    const dates = grid[dateRowIdx].map(c => parseUkDate(c));
    const cols: TakingsColumn[] = [];
    for (const r of grid.slice(dateRowIdx + 1)) {
      const label = (r[0] ?? "").trim(); if (!label) continue;
      const rows: { date: string; total: number }[] = [];
      r.forEach((c, j) => { const d = dates[j]; const v = money(c); if (d && v != null && v >= 0) rows.push({ date: d, total: Math.round(v * 100) / 100 }); });
      if (rows.length) cols.push({ label, rows: rows.sort((a, b) => a.date.localeCompare(b.date)), skipped: [], duplicates: 0 });
    }
    return { columns: cols, best: pickBest(cols), across: true };
  }
  // One row per day. Header = the last row before the first dated row.
  const first = grid.findIndex(r => r.some(c => parseUkDate(c)));
  if (first < 0) return { columns: [], best: 0, across: false };
  const header = first > 0 ? grid[first - 1] : [];
  const width = Math.max(...grid.slice(first).map(r => r.length));
  const simple = parseTakingsPaste(text);
  // Ragged comma rows (unquoted thousands) or no header: fall back to the simple reader.
  const ragged = grid.slice(first).some(r => r.length !== grid[first].length);
  if (!header.length || ragged) return { columns: simple.rows.length ? [{ label: "Takings", ...simple }] : [], best: 0, across: false };
  const cols: TakingsColumn[] = [];
  for (let j = 0; j < width; j++) {
    const byDate = new Map<string, number>(); const skipped: string[] = []; let dup = 0; let nums = 0;
    for (const r of grid.slice(first)) {
      const di = r.findIndex(c => parseUkDate(c)); const d = di >= 0 ? parseUkDate(r[di]) : null;
      if (j === di) continue;
      const v = money(r[j] ?? "");
      if (!d || v == null) { skipped.push(r.join(" ").slice(0, 60)); continue; }
      nums++;
      if (v < 0) { skipped.push(r.join(" ").slice(0, 60)); continue; }
      if (byDate.has(d)) dup++;
      byDate.set(d, Math.round(v * 100) / 100);
    }
    if (nums >= Math.max(1, Math.ceil((grid.length - first) / 2)) && byDate.size) {
      cols.push({ label: (header[j] ?? "").trim() || `Column ${j + 1}`, rows: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total })), skipped, duplicates: dup });
    }
  }
  return { columns: cols, best: pickBest(cols), across: false };
}

function pickBest(cols: TakingsColumn[]): number {
  for (const re of PREFER) {
    const i = cols.findIndex(c => re.test(c.label) && !NOT_TAKINGS.test(c.label.replace(/(inc|incl|including)\.? ?(vat|tax)/i, "")));
    if (i >= 0) return i;
  }
  const i = cols.findIndex(c => !NOT_TAKINGS.test(c.label));
  return i >= 0 ? i : 0;
}
