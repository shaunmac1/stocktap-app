/**
 * Till sales import for old cash registers with no API (Sharp, Casio, or any till that
 * can save a CSV). Pure functions only: read the file text, give back product lines.
 *
 * What we know about the formats (8 Nov 2026):
 *
 * CASIO (SE-S100 / PCR-T285 family, SE-S400, SE-C450 and similar) — documented.
 *   The register writes one CSV per totalizer to the SD card under
 *   \CASIO\<model>\XZ\yyyy\mm\  named  <X|Z><file no>_<dd><a>.CSV
 *   File 004 is the PLU totalizer (so Z004_13.CSV is a Z read of PLUs on the 13th).
 *   Each file starts with key/value lines, then a record table:
 *     "MACHINE " , "MC#01   "
 *     "MODE " , "X     "
 *     "Z COUNTER " , "0000"
 *     "DATE " , "16-03-2015"
 *     "TIME " , "21:39"
 *     "RECORD " , "DESCRIPTOR " , "QUANTITY/No " , "AMOUNT       "
 *     "0001" , "GROSS " , "0" , "0.00"
 *   Casio's manual says the number of fields varies by totalizer, so columns are found by
 *   header name, not position. Source: Casio SE-S100 / PCR-T285 user manual appendix
 *   ("About sales data storage in an SD card"). We have NOT yet seen a real PLU file.
 *
 * SHARP (XE-A207 / A217 / A307 / A407 / A507 and similar) — partly documented.
 *   SD CARD mode > 1 SAVING > SALES DATA saves "Sales data (CSV format)". The manuals
 *   do not publish the column layout, so this parser is deliberately tolerant: it finds a
 *   PLU section (or a header row naming PLU / description / quantity / amount) and reads
 *   rows of code, text, quantity, amount. UNVERIFIED until we get a real SD-card file.
 *
 * GENERIC — any till's product-sales CSV, with a column mapper (remembered per pub).
 */

export type TillType = "sharp" | "casio" | "generic";

export interface TillLine {
  /** PLU number / product code from the till, if the file has one. */
  plu: string | null;
  /** The name the till prints for this PLU. */
  name: string;
  /** Items sold (refunds and voids already netted off, so it can be negative). */
  qty: number;
  /** Money taken for this line in £, if the file has it. */
  value: number | null;
}

export interface TillFileMeta {
  machine?: string;
  /** "X" (read, totals kept) or "Z" (reset) when the file says. */
  mode?: string;
  zCounter?: string;
  /** Report date as YYYY-MM-DD when the file says. */
  date?: string;
  time?: string;
}

export interface TillParseResult {
  type: TillType;
  lines: TillLine[];
  /** Rows we read but left out, for showing "left out 3 rows like ...". */
  skipped: string[];
  meta: TillFileMeta;
  /** Plain-English problems worth showing (wrong file picked, etc.). */
  warnings: string[];
}

// ─── CSV reading ────────────────────────────────────────────────────────────

/** Pick the delimiter that splits the most lines into the same number of fields. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 30);
  let best = ",", bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = sample.map(l => splitCsvLine(l, d).length);
    const multi = counts.filter(c => c > 1);
    if (!multi.length) continue;
    // Most common field count wins; ties go to the earlier delimiter.
    const freq = new Map<number, number>();
    for (const c of multi) freq.set(c, (freq.get(c) ?? 0) + 1);
    const score = Math.max(...freq.values()) + multi.length / 100;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/**
 * Split one CSV line. Copes with quotes, doubled quotes inside quotes and the spaces
 * Casio puts around its commas ( "MODE " , "X     " ).
 */
export function splitCsvLine(line: string, delim = ","): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;
  while (i <= n) {
    // skip leading blanks before a field
    while (i < n && (line[i] === " " || (line[i] === "\t" && delim !== "\t"))) i++;
    let field = "";
    if (line[i] === '"') {
      i++;
      while (i < n) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++; break;
        }
        field += line[i++];
      }
      // anything between the closing quote and the delimiter is ignored
      while (i < n && line[i] !== delim) i++;
    } else {
      while (i < n && line[i] !== delim) field += line[i++];
    }
    out.push(field.trim());
    if (i >= n) break;
    i++; // past the delimiter
    if (i === n) { out.push(""); break; }
  }
  return out;
}

/** Whole file to rows of trimmed cells. Strips a byte-order mark and blank lines. */
export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\u0000/g, "");
  const delim = detectDelimiter(clean);
  const rows: string[][] = [];
  // Join lines that end inside an open quote (a name with a line break in it).
  let pending = "";
  for (const raw of clean.split(/\r\n|\n|\r/)) {
    const line = pending ? pending + "\n" + raw : raw;
    const quotes = (line.match(/"/g) ?? []).length;
    if (quotes % 2 === 1) { pending = line; continue; }
    pending = "";
    if (!line.trim()) continue;
    const cells = splitCsvLine(line, delim);
    if (cells.every(c => c === "")) continue;
    rows.push(cells);
  }
  if (pending.trim()) rows.push(splitCsvLine(pending, delim));
  return rows;
}

// ─── Numbers ────────────────────────────────────────────────────────────────

/**
 * "£1,234.50" → 1234.5, "12.50-" → -12.5, "(3)" → -3, "−2" → -2, "1 234,5"? no (UK tills).
 * Returns null for anything that isn't a number.
 */
export function parseTillNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  s = s.replace(/[−–—]/g, "-"); // unicode minus / dashes
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1).trim(); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
  s = s.replace(/^(gbp|£|\$|€)\s*/i, "").replace(/\s*(gbp|£)$/i, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
  s = s.replace(/,(?=\d{3}(\D|$))/g, "").replace(/\s+/g, "");
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.$/.test(s)) return null;
  const v = parseFloat(s);
  if (!isFinite(v)) return null;
  return neg ? -v : v;
}

/** "16-03-2015", "16/03/2015", "16.03.15", "2015-03-16" → "2015-03-16". */
export function parseTillDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[2], +m[1]);
  }
  return null;
}
function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();

/** Rows that are report furniture, not products. */
const NOT_A_PRODUCT = /^(grand\s*)?(sub\s*)?totals?$|^gross$|^net$|^net\s*total|^cash(\s+in\s+drawer)?$|^caid$|^cheque|^card|^credit|^change$|^vat|^tax|^discount|^%|^no\s*sale|^void\s*mode|^refund\s*mode|^customer|^average|^items?\s*count$|^zero\s*skip/i;

function looksLikeTotal(name: string): boolean {
  return NOT_A_PRODUCT.test(name.trim());
}

/** Add up lines that are the same PLU (refunds and voids often come as their own rows). */
export function combineTillLines(lines: TillLine[]): TillLine[] {
  const out = new Map<string, TillLine>();
  for (const l of lines) {
    const key = l.plu ? `plu:${l.plu.replace(/^0+(?=\d)/, "")}` : `name:${norm(l.name)}`;
    const ex = out.get(key);
    if (!ex) { out.set(key, { ...l }); continue; }
    ex.qty = round3(ex.qty + l.qty);
    ex.value = ex.value == null && l.value == null ? null : round2((ex.value ?? 0) + (l.value ?? 0));
    if (!ex.name && l.name) ex.name = l.name;
  }
  return [...out.values()];
}
const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

// ─── Casio ──────────────────────────────────────────────────────────────────

const CASIO_META: Record<string, keyof TillFileMeta> = {
  machine: "machine", mode: "mode", "z counter": "zCounter", date: "date", time: "time",
};

export function parseCasioCsv(text: string): TillParseResult {
  const rows = parseCsvRows(text);
  const meta: TillFileMeta = {};
  const skipped: string[] = [];
  const warnings: string[] = [];
  let header: string[] | null = null;
  let iRec = 0, iName = 1, iQty = 2, iAmt = 3;
  const raw: TillLine[] = [];
  for (const r of rows) {
    const k = norm(r[0] ?? "");
    if (!header) {
      if (k === "record" || (r.some(c => /descriptor/i.test(c)) && r.some(c => /quantity|qty/i.test(c)))) {
        header = r.map(c => norm(c));
        const find = (re: RegExp) => header!.findIndex(h => re.test(h));
        iRec = Math.max(0, find(/^record|^plu|^no$|^code/));
        iName = find(/descriptor|description|name|text/);
        iQty = find(/quantity|qty|count/);
        iAmt = find(/amount|value|total|sales/);
        if (iName < 0) iName = 1;
        if (iQty < 0) iQty = 2;
        continue;
      }
      const field = CASIO_META[k];
      if (field && r.length >= 2) {
        const v = r[1].trim();
        meta[field] = field === "date" ? (parseTillDate(v) ?? v) : v;
      }
      continue;
    }
    const name = (r[iName] ?? "").trim();
    const qty = parseTillNumber(r[iQty]);
    const value = iAmt >= 0 ? parseTillNumber(r[iAmt]) : null;
    const plu = (r[iRec] ?? "").trim() || null;
    if (!name && !plu) continue;
    if (qty == null) { skipped.push(r.join(", ").slice(0, 60)); continue; }
    if (looksLikeTotal(name)) { skipped.push(name); continue; }
    // Casio writes every PLU, sold or not. Nothing sold and no money: not worth a line.
    if (qty === 0 && !value) continue;
    raw.push({ plu, name: name || `PLU ${plu}`, qty, value });
  }
  if (!header) warnings.push("This doesn't look like a Casio sales file. On the SD card, open CASIO, then XZ, the year and the month, and pick the file starting Z004 (the PLU file).");
  else if (!raw.length && skipped.some(s => /^(gross|net|caid)$/i.test(s.trim())))
    warnings.push("This is the grand total file, not the PLU file. Pick the file that starts Z004 (or X004) from the same folder.");
  if (meta.mode && /^x/i.test(meta.mode))
    warnings.push("This is an X read (totals not reset). Fine to use, but make sure it covers exactly the days between your two counts.");
  return { type: "casio", lines: combineTillLines(raw), skipped, meta, warnings };
}

// ─── Sharp ──────────────────────────────────────────────────────────────────

const PLU_SECTION = /^(plu|plu\/ean|plu\/upc|plu\s*(sales|report|totals?)|item\s*report)$/i;
const OTHER_SECTION = /^(dept|department|departments|group|clerk|clerks|hourly|transaction|general|financial|cash\s*declaration|tax|ej|daily\s*net)/i;

/**
 * Sharp XE-series SD-card sales CSV. Layout not published, so:
 *  1. if a row names the columns (PLU/code, text/description, quantity, amount) use that;
 *  2. else look for a "PLU" section and read code, text, qty, amount rows within it;
 *  3. else read any row shaped like code, text, number, number.
 */
export function parseSharpCsv(text: string): TillParseResult {
  const rows = parseCsvRows(text);
  const meta: TillFileMeta = {};
  const skipped: string[] = [];
  const warnings: string[] = [];
  const raw: TillLine[] = [];

  // 1. named columns
  const hdrIdx = rows.findIndex(r => {
    const h = r.map(norm);
    return h.some(c => /^(plu|plu no|plu code|code|item no|no)$/.test(c) || /plu/.test(c))
      && h.some(c => /(qty|quantity|count|counter)/.test(c));
  });
  let section: "plu" | "other" | "none" = "none";
  let cols: { code: number; name: number; qty: number; amt: number } | null = null;
  if (hdrIdx >= 0) {
    const h = rows[hdrIdx].map(norm);
    const find = (re: RegExp) => h.findIndex(c => re.test(c));
    cols = {
      code: find(/plu|code|^no$|item no/),
      name: find(/text|desc|name|item$/),
      qty: find(/qty|quantity|count/),
      amt: find(/amount|amt|value|total|sales|£/),
    };
    if (cols.name === cols.code) cols.name = -1;
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const first = (r[0] ?? "").trim();
    // date / machine lines that tend to sit at the top of report dumps
    if (!meta.date) { const d = r.map(parseTillDate).find(Boolean); if (d && r.filter(Boolean).length <= 3) { meta.date = d; continue; } }
    if (/^z\s*(1|counter|count)?$/i.test(first) && r[1]) { meta.mode = "Z"; meta.zCounter = r[1]; continue; }
    if (/^x\s*(1)?$/i.test(first) && r.length <= 2) { meta.mode = "X"; continue; }
    if (cols) {
      if (i <= hdrIdx) continue;
      if (r.filter(Boolean).length === 1 && OTHER_SECTION.test(first)) break; // next section
      pushRow(r[cols.code] ?? "", cols.name >= 0 ? r[cols.name] ?? "" : "", r[cols.qty], cols.amt >= 0 ? r[cols.amt] : undefined, r);
      continue;
    }
    // section headings are rows with one filled cell
    if (r.filter(Boolean).length === 1) {
      if (PLU_SECTION.test(first.replace(/[^a-z/ ]/gi, "").trim())) { section = "plu"; continue; }
      if (OTHER_SECTION.test(first)) { section = "other"; continue; }
    }
    if (section === "other") continue;
    // code, text, qty, amount — text may be missing on some dumps
    const nums = r.map(c => parseTillNumber(c));
    const textIdx = r.findIndex((c, k) => k > 0 && c && nums[k] == null);
    if (textIdx < 0) { if (section === "plu" && r.some(Boolean)) skipped.push(r.join(", ").slice(0, 60)); continue; }
    const after = r.slice(textIdx + 1).filter(c => parseTillNumber(c) != null);
    if (!after.length) { if (section === "plu") skipped.push(r.join(", ").slice(0, 60)); continue; }
    const code = textIdx > 0 ? r.slice(0, textIdx).filter(Boolean).join(" ") : "";
    if (section === "none" && !/^\d+$/.test(code.trim())) { continue; }
    pushRow(code, r[textIdx], after[0], after.length > 1 ? after[after.length - 1] : undefined, r);
  }

  function pushRow(code: string, name: string, q: string | undefined, a: string | undefined, r: string[]) {
    const qty = parseTillNumber(q);
    const value = a !== undefined ? parseTillNumber(a) : null;
    const plu = code.trim().replace(/^plu\s*/i, "") || null;
    const nm = name.trim();
    if (!nm && !plu) return;
    if (qty == null) { skipped.push(r.join(", ").slice(0, 60)); return; }
    if (looksLikeTotal(nm)) { skipped.push(nm); return; }
    if (qty === 0 && !value) return;
    raw.push({ plu, name: nm || `PLU ${plu}`, qty, value });
  }

  if (!raw.length) warnings.push("Couldn't find PLU sales in this file. On the till: SD CARD mode, 1 SAVING, SALES DATA, then pick the CSV it saved. If it still won't read, choose Other CSV and say which column is which.");
  return { type: "sharp", lines: combineTillLines(raw), skipped, meta, warnings };
}

// ─── Generic CSV with a column mapper ──────────────────────────────────────

export interface GenericMapping {
  /** Header text of each column (so the mapping survives column order changes). */
  plu?: string | null;
  name: string;
  qty: string;
  value?: string | null;
  /** Which row the headers are on (0-based). */
  headerRow?: number;
}

/** First row that looks like column headings: two or more text cells, and one sounds like a quantity. */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i];
    const textCells = r.filter(c => c && parseTillNumber(c) == null).length;
    if (textCells >= 2 && r.some(c => /qty|quant|sold|count|units|number|no\.? sold/i.test(c))) return i;
  }
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i];
    if (r.length >= 2 && r.filter(c => c && parseTillNumber(c) == null).length >= 2) return i;
  }
  return 0;
}

export function guessGenericMapping(headers: string[]): Partial<GenericMapping> {
  const m: Partial<GenericMapping> = {};
  const h = headers.map(x => x.toLowerCase());
  const pick = (re: RegExp, not?: RegExp) => {
    const i = h.findIndex((x, k) => re.test(x) && !(not?.test(x)) && ![m.plu, m.name, m.qty, m.value].includes(headers[k]));
    return i >= 0 ? headers[i] : undefined;
  };
  m.plu = pick(/^plu|plu\b|code|sku|barcode|^id$|item no|^no\.?$|product no/, /desc|name/) ?? null;
  m.name = pick(/desc|name|product|item|text|plu text/, /code|no\.?$|qty|quant/);
  m.qty = pick(/qty|quant|sold|count|units|number/, /£|value|amount|price/);
  // Prefer the money column including VAT (what the customer paid), as the Board does.
  m.value = pick(/gross|inc\.? ?vat|incl/, /qty|quant|count|%|discount|cost/)
    ?? pick(/amount|value|total|sales|revenue|£|takings/, /qty|quant|count|vat|tax|%|discount|cost|price each|unit price/) ?? null;
  return m;
}

export function parseGenericCsv(text: string, mapping: GenericMapping): TillParseResult {
  const rows = parseCsvRows(text);
  const headerRow = mapping.headerRow ?? findHeaderRow(rows);
  const headers = rows[headerRow] ?? [];
  const col = (name?: string | null) => (name ? headers.findIndex(h => h.trim().toLowerCase() === name.trim().toLowerCase()) : -1);
  const iPlu = col(mapping.plu), iName = col(mapping.name), iQty = col(mapping.qty), iVal = col(mapping.value);
  const skipped: string[] = [];
  const warnings: string[] = [];
  const raw: TillLine[] = [];
  if (iQty < 0 || (iName < 0 && iPlu < 0)) {
    warnings.push("Pick which column is the product name (or PLU) and which is the quantity sold.");
    return { type: "generic", lines: [], skipped, meta: {}, warnings };
  }
  for (const r of rows.slice(headerRow + 1)) {
    const name = iName >= 0 ? (r[iName] ?? "").trim() : "";
    const plu = iPlu >= 0 ? (r[iPlu] ?? "").trim() || null : null;
    if (!name && !plu) continue;
    const qty = parseTillNumber(r[iQty]);
    if (qty == null) { skipped.push(r.join(", ").slice(0, 60)); continue; }
    if (looksLikeTotal(name || "")) { skipped.push(name); continue; }
    if (qty === 0) continue;
    const value = iVal >= 0 ? parseTillNumber(r[iVal]) : null;
    raw.push({ plu, name: name || `PLU ${plu}`, qty, value });
  }
  return { type: "generic", lines: combineTillLines(raw), skipped, meta: {}, warnings };
}

/** Best guess at which till made a file, from its contents. */
export function detectTillType(text: string): TillType {
  const head = text.slice(0, 2000);
  if (/"?\s*MACHINE\s*"?\s*,/i.test(head) && /"?\s*RECORD\s*"?\s*,/i.test(text) && /DESCRIPTOR/i.test(text)) return "casio";
  if (/\bXE-?A\d{3}/i.test(head) || /^\s*"?PLU(\/EAN|\/UPC)?"?\s*$/im.test(head)) return "sharp";
  return "generic";
}

export function parseTillFile(type: TillType, text: string, mapping?: GenericMapping | null): TillParseResult {
  if (type === "casio") return parseCasioCsv(text);
  if (type === "sharp") return parseSharpCsv(text);
  if (!mapping) return { type: "generic", lines: [], skipped: [], meta: {}, warnings: ["Say which column is which first."] };
  return parseGenericCsv(text, mapping);
}
