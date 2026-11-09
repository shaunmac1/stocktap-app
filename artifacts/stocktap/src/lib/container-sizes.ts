/**
 * Container sizes a pub can pick from in one tap. Anything else goes in the
 * "Other size" box. These are shortcuts only; nothing assumes a line is one of them.
 */
export type ContainerKind = "keg" | "cask" | "bag_in_box" | "postmix";

export interface ContainerPreset { label: string; value: number }

export const CONTAINER_PRESETS: Record<ContainerKind, ContainerPreset[]> = {
  keg: [
    { label: "20L", value: 20 },
    { label: "30L", value: 30 },
    { label: "50L (11 gal)", value: 50 },
    { label: "100L (22 gal)", value: 100 },
  ],
  cask: [
    { label: "Pin 4.5 gal (20.5L)", value: 20.5 },
    { label: "Firkin 9 gal (40.9L)", value: 40.9 },
    { label: "Kilderkin 18 gal (81.8L)", value: 81.8 },
    { label: "Barrel 36 gal (163.7L)", value: 163.7 },
    { label: "Hogshead 54 gal (245.5L)", value: 245.5 },
  ],
  bag_in_box: [
    { label: "10L", value: 10 },
    { label: "18L", value: 18 },
    { label: "20L", value: 20 },
  ],
  postmix: [
    { label: "7L", value: 7 },
    { label: "10L", value: 10 },
    { label: "12L", value: 12 },
    { label: "20L", value: 20 },
  ],
};

export function presetsFor(kind: string | null | undefined): ContainerPreset[] {
  return CONTAINER_PRESETS[(kind ?? "keg") as ContainerKind] ?? CONTAINER_PRESETS.keg;
}

const LITRES_PER_GALLON = 4.54609;

/**
 * Read a keg, cask or box size out of a product name, e.g. "Riversider 30L Keg" → 30,
 * "Firkin" → 40.9, "11 gal" → 50. Returns null when the name doesn't say.
 */
export function containerSizeFromName(name: string): { litres: number; type?: "keg" | "cask" | "bag_in_box" } | null {
  const n = name.toLowerCase();
  const bib = /\bbib\b|bag[- ]in[- ]box/.test(n);
  const litres = n.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|litre|litres|liter)\b/);
  if (litres) {
    const v = parseFloat(litres[1]);
    if (v >= 5 && v <= 300) return { litres: v, type: bib ? "bag_in_box" : undefined };
  }
  const gal = n.match(/(\d+(?:\.\d+)?)\s*(?:gal|gall|gallon|gallons)\b/);
  if (gal) {
    const g = parseFloat(gal[1]);
    if (g >= 1 && g <= 60) {
      // 11 and 22 gallon kegs are sold as 50L and 100L.
      if (g === 11) return { litres: 50, type: "keg" };
      if (g === 22) return { litres: 100, type: "keg" };
      return { litres: Math.round(g * LITRES_PER_GALLON * 10) / 10 };
    }
  }
  if (/\bpin\b/.test(n)) return { litres: 20.5, type: "cask" };
  if (/\bfirkin\b/.test(n)) return { litres: 40.9, type: "cask" };
  if (/\bkilderkin\b/.test(n)) return { litres: 81.8, type: "cask" };
  return null;
}

/** "30L keg", "Firkin 9 gal (40.9L)", "12L box" */
export function containerSizeLabel(litres: number | null | undefined, kind: string | null | undefined): string {
  if (!litres) return "";
  const preset = presetsFor(kind).find(p => Math.abs(p.value - litres) < 0.05);
  const noun = kind === "cask" ? "cask" : kind === "bag_in_box" || kind === "postmix" ? "box" : "keg";
  if (preset && kind === "cask") return preset.label;
  return `${Math.round(litres * 10) / 10}L ${noun}`;
}
