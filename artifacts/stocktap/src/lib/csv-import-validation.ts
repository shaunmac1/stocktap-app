import {
  CATEGORY_METHODS,
  type CountingMethod,
  type ProductCategory,
} from "./calculations";

export const CSV_CATEGORY_MAP: Record<string, ProductCategory> = {
  "draught lager": "draught_lager",
  lager: "draught_lager",
  "draught ale": "draught_ale",
  ale: "draught_ale",
  "draught cider": "draught_cider",
  cider: "draught_cider",
  "draught stout": "draught_stout",
  stout: "draught_stout",
  minerals: "minerals",
  "soft drinks": "minerals",
  packaged: "packaged",
  "bottled beer": "packaged",
  postmix: "postmix",
  spirits: "spirits",
  spirit: "spirits",
  wines: "wines",
  wine: "wines",
};

export interface CsvImportRowLike {
  name: string;
  category?: ProductCategory | null;
  countingMethod?: CountingMethod | null;
  externalId?: string | null;
}

export function parseCsvCategory(raw: string | null | undefined): ProductCategory | null {
  const normalized = (raw ?? "").trim().toLowerCase();
  return normalized ? (CSV_CATEGORY_MAP[normalized] ?? null) : null;
}

export function legacyCategoryForType(type: string): ProductCategory {
  if (type === "wine" || type === "sparkling" || type === "vermouth") return "wines";
  if (type === "packaged") return "packaged";
  return "spirits";
}

export function validateCsvImportRows(rows: CsvImportRowLike[]): string[] {
  const errors: string[] = [];
  const seenExternalIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (!row.name.trim()) errors.push(`Row ${rowNumber}: product name is required.`);
    if (!row.category) {
      errors.push(`Row ${rowNumber}${row.name.trim() ? ` (${row.name.trim()})` : ""}: category is required.`);
      return;
    }

    if (!row.countingMethod) {
      errors.push(`Row ${rowNumber} (${row.name.trim()}): counting method is required.`);
    } else if (!CATEGORY_METHODS[row.category].methods.includes(row.countingMethod)) {
      errors.push(
        `Row ${rowNumber} (${row.name.trim()}): ${row.countingMethod} is not valid for ${row.category}.`,
      );
    }

    const externalId = (row.externalId ?? "").trim().toLowerCase();
    if (externalId) {
      if (seenExternalIds.has(externalId)) {
        errors.push(`Row ${rowNumber} (${row.name.trim()}): duplicate Product_ID ${row.externalId}.`);
      }
      seenExternalIds.add(externalId);
    }
  });

  return errors;
}

export function assertCsvImportRows(rows: CsvImportRowLike[]): void {
  const errors = validateCsvImportRows(rows);
  if (errors.length === 0) return;
  const shown = errors.slice(0, 5).join(" ");
  const remainder = errors.length > 5 ? ` ${errors.length - 5} more error(s).` : "";
  throw new Error(`${shown}${remainder}`);
}
