/**
 * Reads a Venners "Site Audit Report" (Liquor) from the text items of its PDF, as pdf.js
 * gives them: { page, x, y (from the top), text }. Returns the header figures and every line
 * of the "Stock Count Variance" pages in one base unit per line (pints, units, litres,
 * bottles or ml) so periods can be compared and orders worked out.
 */

export interface PdfTextItem { p: number; x: number; y: number; s: string }

export type AuditBase = "pints" | "units" | "litres" | "bottles" | "ml";

export interface AuditLine {
  name: string;
  category: string;
  unit: string;
  base: AuditBase;
  open: number;
  del: number;
  ret: number;
  tin: number;
  tout: number;
  adj: number;
  waste: number;
  /** positive = sold */
  sold: number;
  expected: number;
  counted: number;
  variance: number;
  retail: number;
  delist: boolean;
}

export interface AuditSummary {
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;
  days: number | null;
  openingStock: number | null;
  closingStock: number | null;
  revenue: number | null;
  purchases: number | null;
  result: number | null;
  resultPct: number | null;
  gp: number | null;
  optimumGp: number | null;
  wastage: number | null;
  categories: Array<{ name: string; value: number }>;
  adjustments: Array<{ product: string; qty: number; value: number }>;
}

export interface ParsedAudit {
  summary: AuditSummary;
  lines: AuditLine[];
  /** lines whose figures don't add up — should be empty */
  problems: string[];
}

const money = (s: string): number | null => {
  const m = s.replace(/[£,\s]/g, "").match(/^(-?)(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return Number(m[1] + m[2]);
};
const pct = (s: string): number | null => { const m = s.match(/(-?\d+(?:\.\d+)?)%/); return m ? Number(m[1]) : null; };
const ukDate = (s: string): string | null => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const num = (t: string): number => (t === "-" || t === "" ? 0 : Number(t.replace(/,/g, "")));

function rowsOf(items: PdfTextItem[], tol = 2.5): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= tol) last.push(it);
    else rows.push([it]);
  }
  return rows.map(r => r.sort((a, b) => a.x - b.x));
}

function valueRightOf(items: PdfTextItem[], label: RegExp, page?: number): string | null {
  const l = items.find(i => (page == null || i.p === page) && label.test(i.s.trim()));
  if (!l) return null;
  const same = items
    .filter(i => i.p === l.p && Math.abs(i.y - l.y) <= 3 && i.x > l.x + 5)
    .sort((a, b) => a.x - b.x);
  return same[0]?.s.trim() ?? null;
}

function parseSummary(items: PdfTextItem[]): AuditSummary {
  const p1 = items.filter(i => i.p <= 2);
  const s: AuditSummary = {
    periodStart: ukDate(valueRightOf(p1, /^Start Date$/) ?? ""),
    periodEnd: ukDate(valueRightOf(p1, /^End Date$/) ?? ""),
    days: null,
    openingStock: money(valueRightOf(p1, /^Opening Stock$/) ?? ""),
    closingStock: money(valueRightOf(p1, /^Closing Stock$/) ?? ""),
    revenue: money(valueRightOf(p1, /^Revenue inc VAT$/) ?? ""),
    purchases: money(valueRightOf(p1, /^Purchases$/) ?? ""),
    result: money(valueRightOf(p1, /^Beanstore Result$/) ?? ""),
    resultPct: pct(valueRightOf(p1, /^Result % of Revenue$/) ?? ""),
    gp: pct(valueRightOf(p1, /^Gross Profit$/) ?? ""),
    optimumGp: pct(valueRightOf(p1, /^Optimum$/) ?? ""),
    wastage: money(valueRightOf(p1, /^Wastage Reported through Beanstore$/) ?? ""),
    categories: [],
    adjustments: [],
  };
  // Days covered on the variance pages is the per-line basis; fall back to the page 1 figure.
  const dc = items.find(i => /^Days Covered:?$/.test(i.s.trim()));
  if (dc) {
    const v = items.find(i => i.p === dc.p && Math.abs(i.y - dc.y) <= 3 && i.x > dc.x && /^\d+$/.test(i.s.trim()));
    if (v) s.days = Number(v.s.trim());
  }
  if (s.days == null) { const d = valueRightOf(p1, /^Days$/); if (d && /^\d+$/.test(d)) s.days = Number(d); }
  // Stock period on the variance page, when page 1 is missing
  if (!s.periodStart) {
    const from = items.find(i => /Date From:?$/.test(i.s.trim()));
    if (from) {
      const same = items.filter(i => i.p === from.p && Math.abs(i.y - from.y) <= 3 && i.x > from.x).sort((a, b) => a.x - b.x);
      s.periodStart = ukDate(same[0]?.s ?? "");
      const to = same.find(i => /^To:?$/.test(i.s.trim()));
      if (to) s.periodEnd = ukDate(same[same.indexOf(to) + 1]?.s ?? "");
    }
  }
  // Category variances (page 2, right-hand table)
  const catHead = p1.find(i => i.s.trim() === "Category Variances");
  if (catHead) {
    for (const row of rowsOf(p1.filter(i => i.p === catHead.p && i.x > 430 && i.y > catHead.y + 20 && i.y < catHead.y + 220))) {
      const name = row.filter(i => i.x < 700).map(i => i.s.trim()).join(" ");
      const val = row.find(i => i.x >= 700 && money(i.s) != null);
      if (name && val && name !== "Category" && !/^Liquor Testing/.test(name)) s.categories.push({ name, value: money(val.s)! });
    }
  }
  // Adjustments (page 2, left-hand table under "Adjustments")
  const adjHead = p1.find(i => i.s.trim() === "Adjustments");
  if (adjHead) {
    for (const row of rowsOf(p1.filter(i => i.p === adjHead.p && i.x < 430 && i.y > adjHead.y + 25 && i.y < adjHead.y + 260))) {
      const product = row.filter(i => i.x < 200).map(i => i.s.trim()).join(" ");
      const q = row.find(i => i.x >= 200 && i.x < 330);
      const v = row.find(i => i.x >= 330);
      if (product && q && v && money(v.s) != null && !isNaN(Number(q.s))) s.adjustments.push({ product, qty: Number(q.s), value: money(v.s)! });
    }
  }
  return s;
}

const SEQ: Array<keyof Cols> = ["open", "del", "ret", "tin", "tout", "adj", "waste", "sales", "theo", "act", "var", "retail", "days"];
type Cols = { open: WP; del: WP; ret: WP; tin: WP; tout: WP; adj: WP; waste: WP; sales: WP; theo: WP; act: WP; var: WP; retail: WP; days: WP };
type WP = { w: number; p: number };

const SINGLE_UNITS = /^(Litre|Millilitre|Each)$/i;

interface ColStart { key: keyof Cols | "hold"; x: number }

/**
 * Where each column starts on a variance page, from its heading. Venners moved the columns
 * between report versions (older ones have a "Stock Holding (days)" column), so read them.
 */
function columnStarts(pageItems: PdfTextItem[], headY: number): ColStart[] | null {
  const near = pageItems.filter(i => i.y >= headY - 16 && i.y <= headY + 6);
  const at = (re: RegExp, nth = 0) => near.filter(i => re.test(i.s.trim())).sort((a, b) => a.x - b.x)[nth]?.x;
  const cols: Array<[ColStart["key"], number | undefined]> = [
    ["open", at(/^Opening$/)], ["del", at(/^Deliveries$/)], ["ret", at(/^Returns$/)],
    ["tin", at(/^Transfers$/, 0)], ["tout", at(/^Transfers$/, 1)], ["adj", at(/^Adjustments$/)],
    ["waste", at(/^Wastage$/)], ["sales", at(/^Sales$/)], ["theo", at(/^Theoretical$/)],
    ["act", at(/^Actual( SOH)?$/)], ["var", at(/^Variance( Qty)?$/)], ["retail", at(/^Retail$/)],
    ["hold", at(/^Holding$/)], ["days", at(/^Days$/)],
  ];
  if (cols.some(([k, x]) => k !== "hold" && x == null)) return null;
  // Headings sit a little right of the numbers under them; start each column 12pt before its heading.
  return cols.filter(([, x]) => x != null).map(([key, x]) => ({ key, x: (x as number) - 12 })).sort((a, b) => a.x - b.x);
}

function baseFor(unit: string): AuditBase {
  if (/^Gallon/i.test(unit)) return "pints";
  if (/^Dozen/i.test(unit) || /^Each$/i.test(unit)) return "units";
  if (/^Litre$/i.test(unit)) return "litres";
  if (/^Millilitre$/i.test(unit)) return "ml";
  return "bottles";
}

export function parseVennersAudit(items: PdfTextItem[]): ParsedAudit {
  const summary = parseSummary(items);
  const firstVar = Math.min(...items.filter(i => i.s.startsWith("Stock Count Variance")).map(i => i.p));
  const lines: AuditLine[] = [];
  const problems: string[] = [];
  if (!isFinite(firstVar)) return { summary, lines, problems: ["No Stock Count Variance pages found"] };

  let category = "";
  const pages = [...new Set(items.filter(i => i.p >= firstVar).map(i => i.p))].sort((a, b) => a - b);
  for (const page of pages) {
    const pageItems = items.filter(i => i.p === page);
    // Data starts under the column headings ("Product Name" row)
    const head = pageItems.filter(i => /^(Product Name|Covered|Variance)$/.test(i.s.trim())).reduce((m, i) => Math.max(m, i.y), 0);
    const foot = pageItems.filter(i => /^(Copyright|Page \d+ of|Total$)/.test(i.s.trim()) && i.y > head + 40).reduce((m, i) => Math.min(m, i.y), Infinity);
    const body = pageItems.filter(i => i.y > head + 2 && i.y < foot - 1);
    const headItem = pageItems.filter(i => i.s.trim() === "Product Name").sort((a, b) => a.y - b.y)[0];
    const starts = headItem ? columnStarts(pageItems, headItem.y) : null;
    if (!starts) { if (body.some(i => i.x >= 772)) problems.push(`Page ${page}: couldn't find the column headings`); continue; }
    const wholeX = pageItems.filter(i => i.s.trim() === "Whole" && Math.abs(i.y - (headItem?.y ?? 0)) < 16)[0]?.x ?? 102;
    const unitStart = wholeX - 3;
    const partX = pageItems.filter(i => i.s.trim() === "Part" && Math.abs(i.y - (headItem?.y ?? 0)) < 16)[0]?.x ?? wholeX + 30;
    const colOf = (x: number) => { let k: ColStart["key"] | null = null; for (const c of starts) if (x >= c.x) k = c.key; return k; };
    const seqKeys = starts.map(c => c.key);
    const rows = rowsOf(body);
    // Numeric rows carry a "days covered" value at the far right
    const numericRows = rows.filter(r => r.some(i => i.x >= 772 && i.x < 800 && /^-?\d+$/.test(i.s.trim())));
    const numericYs = numericRows.map(r => r[0].y);
    // Name / category lines are the text at the left (x < 100)
    const nameRows = rows
      .map(r => ({ y: r[0].y, text: r.filter(i => i.x < unitStart).map(i => i.s.trim()).join(" ").trim(), isNum: numericRows.includes(r) }))
      .filter(r => r.text);
    const namesFor = new Map<number, string[]>();
    const catLines: Array<{ y: number; text: string }> = [];
    let catOpen: { y: number } | null = null;
    for (const nr of nameRows) {
      if (/^Category:/.test(nr.text)) { catLines.push({ y: nr.y, text: nr.text.replace(/^Category:\s*/, "") }); catOpen = { y: nr.y }; continue; }
      // A line just under "Category:" with no numeric row in between continues the category name
      // One wrapped line under "Category: 35 Draught" finishes the name ("Ale"); never more.
      if (catOpen && !nr.isNum && nr.y - catOpen.y < 14 && !numericYs.some(y => y > catOpen!.y && y < nr.y + 6)) {
        catLines[catLines.length - 1].text += " " + nr.text; catOpen = null; continue;
      }
      catOpen = null;
      let best = -1, bestD = Infinity;
      numericYs.forEach((y, k) => { const d = Math.abs(y - nr.y); if (d < bestD) { bestD = d; best = k; } });
      if (best >= 0 && bestD < 16) {
        const key = numericYs[best];
        if (!namesFor.has(key)) namesFor.set(key, []);
        namesFor.get(key)!.push(nr.text);
      }
    }
    for (const r of numericRows) {
      const y = r[0].y;
      const cat = [...catLines].filter(c => c.y < y).pop();
      if (cat) category = cat.text;
      // Unit (whole unit at x≈103, part unit at x≈133) and the part divisor from nearby lines
      const unitItems = body.filter(i => i.x >= unitStart && i.x < starts[0].x && Math.abs(i.y - y) <= 2.5);
      const unitWhole = unitItems.filter(i => i.x < partX - 2).map(i => i.s.trim()).join(" ");
      const unitPart = unitItems.filter(i => i.x >= partX - 2).map(i => i.s.trim()).join(" ");
      let unit = [unitWhole, unitPart].filter(Boolean).join(" ").trim();
      // Merged name+unit items ("70cl70cl") leave the unit in the name column
      let nameParts = (namesFor.get(y) ?? []).slice();
      if (!unitWhole) {
        const m = (nameParts.join(" ")).match(/(\d+(?:cl|ml))\1$/i);
        if (m) { unit = m[1]; nameParts = nameParts.map(t => t.replace(new RegExp(`${m[1]}$`, "i"), "")); }
      }
      const partLabel = body.filter(i => i.x >= partX - 2 && i.x < starts[0].x && Math.abs(i.y - y) <= 8).map(i => i.s.trim()).join(" ");
      const div = (() => {
        if (/^Gallon/i.test(unit)) return 8;
        if (/^Dozen/i.test(unit)) return 12;
        const m = partLabel.match(/^(\d+)\b/);
        return m ? Number(m[1]) : 10;
      })();
      const name = nameParts.join(" ").replace(/\s+/g, " ").trim();
      const nums = r.filter(i => i.x >= starts[0].x);
      const cols = Object.fromEntries(SEQ.map(k => [k, { w: 0, p: 0 }])) as Cols;
      const single = SINGLE_UNITS.test(unitWhole || unit);
      if (single) {
        // One value per column, right-aligned, so take them in order
        const toks = nums.map(i => i.s.trim());
        if (toks.length === seqKeys.length) {
          seqKeys.forEach((k, idx) => { if (k !== "hold") cols[k].w = num(toks[idx]); });
        } else {
          // A blank cell: place each value by where it ends (numbers are right-aligned, ~4.6pt a character)
          const ends = starts.map((c, k) => ({ key: c.key, from: c.x + 8, to: (starts[k + 1]?.x ?? 820) + 8 }));
          let ok = true;
          for (const it of nums) {
            const right = it.x + it.s.trim().length * 4.6;
            const col = ends.find(e => right >= e.from && right < e.to);
            if (!col) { ok = false; break; }
            if (col.key !== "hold") cols[col.key].w = num(it.s.trim());
          }
          if (!ok) { problems.push(`${name}: couldn't place ${toks.length} values`); continue; }
        }
      } else {
        // Whole then part in each column; a lone "-" means nothing
        const seen = new Map<string, number>();
        for (const it of nums) {
          const k = colOf(it.x);
          if (!k || k === "hold") continue;
          const t = it.s.trim();
          if (t === "-") continue;
          const n = seen.get(k) ?? 0;
          cols[k][n === 0 ? "w" : "p"] = num(t);
          seen.set(k, n + 1);
        }
      }
      const base = baseFor(unitWhole || unit);
      const conv = (v: WP) => base === "pints" || (base === "units" && /^Dozen/i.test(unit)) ? v.w * div + v.p : base === "bottles" ? v.w + v.p / div : v.w;
      const line: AuditLine = {
        name: name.replace(/\s*\b(DELIST|OOS)\b/g, "").trim(),
        category: friendlyCategory(category),
        unit: unit || unitWhole,
        base,
        open: conv(cols.open), del: conv(cols.del), ret: conv(cols.ret), tin: conv(cols.tin), tout: conv(cols.tout),
        adj: conv(cols.adj), waste: conv(cols.waste), sold: -conv(cols.sales), expected: conv(cols.theo),
        counted: conv(cols.act), variance: conv(cols.var), retail: cols.retail.w,
        delist: /\bDELIST\b/.test(name),
      };
      const round = (x: number) => Math.round(x * 10000) / 10000;
      (Object.keys(line) as Array<keyof AuditLine>).forEach(k => { if (typeof line[k] === "number") (line as any)[k] = round(line[k] as number); });
      const chk1 = line.open + line.del + line.ret + line.tin + line.tout + line.adj + line.waste - line.sold - line.expected;
      const chk2 = line.expected + line.variance - line.counted;
      if (Math.abs(chk1) > 0.02 || Math.abs(chk2) > 0.02) problems.push(`${line.name}: figures don't add up (${chk1.toFixed(3)}, ${chk2.toFixed(3)})`);
      lines.push(line);
    }
    // A category heading at the foot of a page belongs to the lines on the next page
    const lastCat = catLines[catLines.length - 1];
    if (lastCat && lastCat.y > (numericYs[numericYs.length - 1] ?? -1)) category = lastCat.text;
  }
  return { summary, lines, problems };
}

/** Venners category ("22 Draught", "8151 Post Mix") to a plain name. The codes are what tell cider, lager and stout apart. */
const CATEGORY_CODES: Record<string, string> = {
  "35": "Draught ale", "22": "Draught cider", "31": "Draught lager", "51": "Draught stout", "26": "Minerals",
  "60": "Packaged", "8151": "Postmix", "50": "Spirits", "63": "Sundry", "24": "Wines",
};
export function friendlyCategory(venners: string): string {
  const t = venners.trim();
  const code = t.match(/^(\d+)\b/)?.[1];
  if (code && CATEGORY_CODES[code]) return CATEGORY_CODES[code];
  const name = t.replace(/^\d+\s*/, "").toLowerCase();
  if (/post ?mix/.test(name)) return "Postmix";
  return name.replace(/\b\w/g, m => m.toUpperCase()) || "Other";
}
