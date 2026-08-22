// Business-level finances: money in/out at the venue level, plus what's payable.
// Deliberately generic so it fits any pub or bar — the category set is fixed and
// neutral (no pubco names); the supplier is free text the operator types.

export type FinanceDirection = "in" | "out";
export type FinanceStatus = "paid" | "due" | "received";

export interface FinanceEntry {
  id: string;
  venue_id: string;
  direction: FinanceDirection;
  entry_date: string;      // ISO date (YYYY-MM-DD)
  due_date: string | null;
  category: string;
  supplier: string | null;
  description: string | null;
  amount: number;
  status: FinanceStatus;
  reference: string | null;
  source: "manual" | "import";
  created_at?: string;
  updated_at?: string;
}

export const OUT_CATEGORIES: { value: string; label: string }[] = [
  { value: "rent", label: "Rent / tie" },
  { value: "stock", label: "Drinks & stock" },
  { value: "utilities", label: "Utilities" },
  { value: "wages", label: "Wages" },
  { value: "tax", label: "Tax & VAT" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" },
];

export const IN_CATEGORIES: { value: string; label: string }[] = [
  { value: "takings", label: "Takings" },
  { value: "events", label: "Functions & events" },
  { value: "other_income", label: "Other income" },
];

export function categoryLabel(direction: FinanceDirection, value: string): string {
  const set = direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;
  return set.find((c) => c.value === value)?.label ?? value;
}

// ---- Money parsing -------------------------------------------------------
/** Parse "£1,234.50", "(45.00)" (accounting negative), "1234", "" → number|null. */
export function parseMoney(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.includes("-")) negative = true;
  s = s.replace(/[£$€,\s]/g, "").replace(/-/g, "");
  if (s === "" || s === ".") return null;
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

// ---- Date parsing --------------------------------------------------------
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
/** Parse common UK date formats → ISO YYYY-MM-DD, or null. Assumes DD/MM/YYYY. */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Already ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [_, d, mo, y] = m;
    let yr = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    const dd = parseInt(d, 10), mm = parseInt(mo, 10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yr}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  // 12 Aug 2026 / 12 August 2026
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{2,4})$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let yr = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    if (!mm || dd < 1 || dd > 31) return null;
    return `${yr}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}

// ---- CSV parsing (handles quotes, commas, CRLF) --------------------------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushField(); pushRow();
    } else if (c === "\r") {
      // swallow; \n handles the row
    } else {
      field += c;
    }
  }
  // flush trailing field/row
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  // drop fully-empty rows
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type FinanceField = "entry_date" | "amount" | "category" | "supplier" | "description" | "reference" | "due_date" | "status" | "ignore";

/** Guess which finance field a spreadsheet header maps to. */
export function guessFieldForHeader(header: string): FinanceField {
  const h = header.toLowerCase().trim();
  if (/(^|\b)(date|day|when)\b/.test(h) && !/due/.test(h)) return "entry_date";
  if (/due/.test(h)) return "due_date";
  if (/(amount|total|value|cost|paid|payable|£|gbp|sum|price|net|gross)/.test(h)) return "amount";
  if (/(supplier|vendor|payee|to|from|company|account|brewery|pubco)/.test(h)) return "supplier";
  if (/(category|type|kind|class)/.test(h)) return "category";
  if (/(ref\b|reference|invoice|statement|number|\bno\.?\b)/.test(h)) return "reference";
  if (/(status|paid\?|state)/.test(h)) return "status";
  if (/(desc|detail|note|item|memo|narrative|particular)/.test(h)) return "description";
  return "ignore";
}

export interface ParsedFinanceRow {
  entry_date: string | null;
  amount: number | null;
  category: string | null;
  supplier: string | null;
  description: string | null;
  reference: string | null;
  due_date: string | null;
  status: string | null;
  valid: boolean;      // has at least a date and an amount
}

/** Apply a header→field mapping to CSV data rows, producing typed finance rows. */
export function mapRows(headerToField: FinanceField[], dataRows: string[][]): ParsedFinanceRow[] {
  return dataRows.map((cells) => {
    const get = (f: FinanceField): string => {
      const idx = headerToField.indexOf(f);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    const entry_date = parseDate(get("entry_date"));
    const amount = parseMoney(get("amount"));
    const out: ParsedFinanceRow = {
      entry_date,
      amount: amount == null ? null : Math.abs(amount),
      category: get("category") || null,
      supplier: get("supplier") || null,
      description: get("description") || null,
      reference: get("reference") || null,
      due_date: parseDate(get("due_date")),
      status: get("status") || null,
      valid: entry_date != null && amount != null,
    };
    return out;
  });
}

// ---- Summary -------------------------------------------------------------
export interface FinanceSummary {
  income: number;
  outgoings: number;
  net: number;
  payable: number;   // outgoings still 'due'
  count: number;
}

export function summarise(entries: FinanceEntry[]): FinanceSummary {
  let income = 0, outgoings = 0, payable = 0;
  for (const e of entries) {
    if (e.direction === "in") income += e.amount;
    else {
      outgoings += e.amount;
      if (e.status === "due") payable += e.amount;
    }
  }
  return { income, outgoings, net: income - outgoings, payable, count: entries.length };
}

export function withinRange(entries: FinanceEntry[], fromISO: string, toISO: string): FinanceEntry[] {
  return entries.filter((e) => e.entry_date >= fromISO && e.entry_date <= toISO);
}
