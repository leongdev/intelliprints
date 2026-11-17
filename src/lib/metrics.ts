import type { Filament, Material, Milestone, Part, PrintCard, PrintEvent, ProductVersion, RangeKey } from "../types";
import { cardUses } from "./colors";
import { sameColor } from "./pools";
import { dayKey, gramUnits, inRange, lastDays, parsePbDate, roundGrams } from "./format";

export interface PartProgress {
  partId: string;
  name: string;
  needed: number;
  good: number;
  printing: number;
  pct: number;
}

export interface MilestoneProgress {
  assembled: number;
  partsPct: number;
  parts: PartProgress[];
}

function countOf(part: Pick<Part, "perProduct">) {
  const count = Math.round(part.perProduct);
  return count >= 1 ? count : 1;
}

/** A multiple plate prints `perProduct` copies at once. A single piece is its own plate. */
export function jobsFor(part: Pick<Part, "kind" | "perProduct">, products: number) {
  const qty = Math.max(0, products);
  const count = countOf(part);
  if (part.kind === "plate") return Math.ceil(qty / count);
  return qty * count;
}

export function productsFromJobs(part: Pick<Part, "kind" | "perProduct">, jobs: number) {
  const count = countOf(part);
  return part.kind === "plate" ? jobs * count : jobs / count;
}

export function gramsPerProduct(part: Pick<Part, "kind" | "perProduct" | "grams">) {
  const count = countOf(part);
  return part.kind === "plate" ? part.grams / count : part.grams * count;
}

export function minutesPerProduct(part: Pick<Part, "kind" | "perProduct" | "minutes">) {
  const count = countOf(part);
  return part.kind === "plate" ? part.minutes / count : part.minutes * count;
}

export function versionsOf(versions: ProductVersion[], productId: string) {
  return versions
    .filter((version) => version.product === productId)
    .sort((a, b) => a.created.localeCompare(b.created) || a.name.localeCompare(b.name));
}

export function currentVersion(versions: ProductVersion[], productId: string) {
  const mine = versionsOf(versions, productId);
  return mine.find((version) => version.active) ?? mine[mine.length - 1] ?? null;
}

export interface VersionRecipe {
  id: string;
  name: string;
  active: boolean;
  grams: number;
  minutes: number;
  components: Array<{ key: string; name: string; grams: number; minutes: number }>;
}

export function versionRecipes(productId: string, versions: ProductVersion[], parts: Part[]): VersionRecipe[] {
  return versionsOf(versions, productId).map((version) => {
    const grouped = new Map<string, { key: string; name: string; grams: number; minutes: number }>();
    for (const part of parts) {
      if (part.version !== version.id) continue;
      const key = part.name.trim().toLowerCase();
      const current = grouped.get(key) ?? { key, name: part.name, grams: 0, minutes: 0 };
      current.grams += gramsPerProduct(part);
      current.minutes += minutesPerProduct(part);
      grouped.set(key, current);
    }
    const components = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: version.id,
      name: version.name,
      active: version.active,
      grams: components.reduce((sum, item) => sum + item.grams, 0),
      minutes: components.reduce((sum, item) => sum + item.minutes, 0),
      components,
    };
  });
}

export function jobsNeeded(part: Pick<Part, "id" | "kind" | "perProduct">, milestone: Pick<Milestone, "targetQty" | "components">) {
  const slice = milestone.components.find((item) => item.id === part.id);
  return slice ? slice.jobs : jobsFor(part, milestone.targetQty);
}

export function milestoneParts(milestone: Pick<Milestone, "product" | "version" | "components">, parts: Part[]) {
  const mine = parts.filter((part) => part.product === milestone.product && (!milestone.version || part.version === milestone.version));
  const chosen = milestone.components.filter((item) => item.id.length > 0 && item.jobs > 0);
  if (chosen.length === 0) return mine;
  const ids = new Set(chosen.map((item) => item.id));
  return mine.filter((part) => ids.has(part.id));
}

export function milestoneProgress(
  milestone: Milestone,
  parts: Part[],
  events: PrintEvent[],
  cards: PrintCard[],
): MilestoneProgress {
  const mine = milestoneParts(milestone, parts);
  const stats = mine.map((part) => {
    const needed = jobsNeeded(part, milestone);
    const good = events
      .filter(
        (event) =>
          event.milestone === milestone.id &&
          event.component === part.id &&
          event.outcome === "success",
      )
      .reduce((sum, event) => sum + event.pieces, 0);
    const printing = cards
      .filter(
        (card) =>
          card.milestone === milestone.id && card.component === part.id && card.column === "printing",
      )
      .reduce((sum, card) => sum + card.quantity, 0);
    return {
      partId: part.id,
      name: part.name,
      needed,
      good,
      printing,
      pct: needed > 0 ? Math.min(100, (good / needed) * 100) : 0,
    };
  });
  const assembled =
    mine.length === 0
      ? 0
      : Math.min(
          milestone.targetQty,
          ...mine.map((part) => {
            const good = stats.find((item) => item.partId === part.id)?.good ?? 0;
            return productsFromJobs(part, good);
          }),
        );
  const partsPct = stats.length === 0 ? 0 : stats.reduce((sum, item) => sum + item.pct, 0) / stats.length;
  return { assembled, partsPct, parts: stats };
}

export interface FilamentPressure {
  demand: number;
  deficit: number;
  tone: "ok" | "low" | "short";
}

export function filamentPressure(filament: Filament, cards: PrintCard[], filaments: Filament[] = [filament]): FilamentPressure {
  const mates = sameColor(filaments, filament.id);
  const pile = mates.length > 0 ? mates : [filament];
  const ids = new Set(pile.map((item) => item.id));
  const onHand = roundGrams(pile.reduce((sum, item) => sum + item.remainingGrams, 0));
  const threshold = Math.max(0, ...pile.map((item) => item.lowThresholdGrams));
  const demand = cards
    .filter((card) => card.column === "queue" || card.column === "printing")
    .reduce((sum, card) => {
      const use = cardUses(card).find((item) => ids.has(item.filament));
      return use ? roundGrams(sum + card.quantity * use.grams) : sum;
    }, 0);
  const deficit = Math.max(0, roundGrams(demand - onHand));
  let tone: FilamentPressure["tone"] = "ok";
  if (onHand <= 0 || (demand > 0 && gramUnits(onHand) < gramUnits(demand))) tone = "short";
  else if (threshold > 0 && onHand <= threshold) tone = "low";
  return { demand, deficit, tone };
}

export interface AnalyticsSummary {
  goodPieces: number;
  badPieces: number;
  gramsUsed: number;
  gramsWasted: number;
  spent: number;
  wastedSpend: number;
  ratio: number | null;
  jobs: number;
}

export function summarize(events: PrintEvent[]): AnalyticsSummary {
  const goodPieces = events
    .filter((event) => event.outcome === "success")
    .reduce((sum, event) => sum + event.pieces, 0);
  const badPieces = events
    .filter((event) => event.outcome === "failed")
    .reduce((sum, event) => sum + event.pieces, 0);
  const gramsUsed = events.reduce((sum, event) => sum + event.gramsUsed, 0);
  const gramsWasted = events.reduce((sum, event) => sum + event.gramsWasted, 0);
  const spent = events.reduce((sum, event) => sum + event.cost, 0);
  const wastedSpend = events
    .filter((event) => event.outcome === "failed")
    .reduce((sum, event) => sum + event.cost, 0);
  const decided = goodPieces + badPieces;
  return {
    goodPieces,
    badPieces,
    gramsUsed,
    gramsWasted,
    spent,
    wastedSpend,
    ratio: decided > 0 ? goodPieces / decided : null,
    jobs: events.length,
  };
}

export interface DayBucket {
  date: Date;
  label: string;
  grams: number;
  good: number;
  bad: number;
}

export function dailyBuckets(events: PrintEvent[], days: number, now = new Date()): DayBucket[] {
  const window = lastDays(days, now);
  return window.map((date) => {
    const key = dayKey(date);
    const mine = events.filter((event) => {
      const parsed = parsePbDate(event.created);
      return parsed ? dayKey(parsed) === key : false;
    });
    return {
      date,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      grams: mine.reduce((sum, event) => sum + event.gramsUsed + event.gramsWasted, 0),
      good: mine.filter((event) => event.outcome === "success").reduce((sum, event) => sum + event.pieces, 0),
      bad: mine.filter((event) => event.outcome === "failed").reduce((sum, event) => sum + event.pieces, 0),
    };
  });
}

export function ratioDelta(events: PrintEvent[], now = Date.now()) {
  const current = summarize(events.filter((event) => inRange(event.created, "7d", now)));
  const previousEvents = events.filter((event) => {
    const date = parsePbDate(event.created);
    if (!date) return false;
    const age = now - date.getTime();
    return age > 7 * 86400000 && age <= 14 * 86400000;
  });
  const previous = summarize(previousEvents);
  if (current.ratio === null || previous.ratio === null) return null;
  return (current.ratio - previous.ratio) * 100;
}

export interface NamedTotal {
  key: string;
  label: string;
  grams: number;
  cost: number;
  good: number;
  bad: number;
  color: string;
}

const MATERIAL_COLORS: Record<Material, string> = {
  "PLA Basic": "#00AE42",
  "PLA Matte": "#61C680",
  "PETG Basic": "#FF671F",
  "PETG HF": "#F75403",
  "PETG Translucent": "#61B0FF",
  "PETG Matte": "#C0DF16",
  ABS: "#0A2CA5",
  ASA: "#2140B4",
  "TPU 95A HF": "#101820",
  "PLA Pure": "#F4C9D0",
  "PLA Silk+": "#F4A925",
  "PLA Silk Multi-Color": "#7B2D8E",
  "PLA Translucent": "#009FA1",
  "PLA Tough+": "#009BD8",
  "PLA-CF": "#4D5054",
  "PLA Basic Gradient": "#4A90A4",
  "PLA Sparkle": "#C5A059",
  "PLA Metal": "#C6A15B",
  "PLA Marble": "#A33B3B",
  "PLA Galaxy": "#5C2D91",
  "PLA Wood": "#A67C52",
  "PLA Glow": "#7DCE62",
  "PETG-CF": "#16B08E",
  "ABS-GF": "#0C3B95",
  "ASA Aero": "#FFFAF2",
  "ASA-CF": "#000000",
  PC: "#A8A8AA",
  "PC FR": "#A8A8AA",
  "TPU for AMS": "#5898DD",
  "TPU 85A": "#F68B1B",
  "TPU 90A": "#40B6E4",
  "PAHT-CF": "#000000",
  "PA6-CF": "#000000",
  "PA6-GF": "#FF4800",
  "PET-CF": "#000000",
  "PPA-CF": "#000000",
  "PPS-CF": "#000000",
  "Support for PLA": "#F3EDE4",
  "Support for PLA/PETG": "#F3EDE4",
  "Support for ABS": "#FFFFFF",
  "Support for PA/PET": "#00A651",
  PVA: "#F7F7F7",
};

export function materialColor(material: string) {
  if (material in MATERIAL_COLORS) return MATERIAL_COLORS[material as Material];
  return MATERIAL_COLORS["PLA Basic"];
}

export function groupEvents(
  events: PrintEvent[],
  keyOf: (event: PrintEvent) => string,
  labelOf: (event: PrintEvent) => string,
  colorOf: (event: PrintEvent) => string,
): NamedTotal[] {
  const map = new Map<string, NamedTotal>();
  for (const event of events) {
    const key = keyOf(event) || labelOf(event) || "unknown";
    const current = map.get(key) ?? {
      key,
      label: labelOf(event) || "Unknown",
      grams: 0,
      cost: 0,
      good: 0,
      bad: 0,
      color: colorOf(event),
    };
    current.grams += event.gramsUsed + event.gramsWasted;
    current.cost += event.cost;
    if (event.outcome === "success") current.good += event.pieces;
    else current.bad += event.pieces;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost || b.grams - a.grams);
}

export function filterEvents(events: PrintEvent[], range: RangeKey) {
  return events.filter((event) => inRange(event.created, range));
}

export function bomDemand(milestone: Milestone, parts: Part[]) {
  return milestoneParts(milestone, parts)
    .map((part) => {
      const jobs = jobsNeeded(part, milestone);
      return {
        part,
        pieces: jobs,
        grams: roundGrams(jobs * part.grams),
        minutes: jobs * part.minutes,
      };
    });
}
