import type { Filament } from "../types";
import { gramUnits, roundGrams } from "./format";

/** Spools of the same material and color are one pile of filament. */
export function colorKey(filament: { material: string; color: string }) {
  return `${filament.material}\u0000${filament.color.trim().toLowerCase()}`;
}

export function sameColor<T extends { id: string; material: string; color: string }>(filaments: T[], filamentId: string) {
  const filament = filaments.find((item) => item.id === filamentId);
  if (!filament) return [] as T[];
  const key = colorKey(filament);
  return filaments.filter((item) => colorKey(item) === key);
}

export interface ColorGroup {
  key: string;
  lead: Filament;
  spools: Filament[];
  remainingGrams: number;
  spoolGrams: number;
  lowThresholdGrams: number;
}

export function colorGroups(filaments: Filament[]): ColorGroup[] {
  const grouped = new Map<string, Filament[]>();
  for (const filament of filaments) {
    const key = colorKey(filament);
    const list = grouped.get(key) ?? [];
    list.push(filament);
    grouped.set(key, list);
  }
  return [...grouped.entries()]
    .map(([key, spools]) => {
      const ordered = spools.slice().sort((a, b) => b.remainingGrams - a.remainingGrams || a.brand.localeCompare(b.brand));
      return {
        key,
        lead: ordered[0],
        spools: ordered,
        remainingGrams: roundGrams(ordered.reduce((sum, spool) => sum + spool.remainingGrams, 0)),
        spoolGrams: roundGrams(ordered.reduce((sum, spool) => sum + spool.spoolGrams, 0)),
        lowThresholdGrams: roundGrams(Math.max(0, ...ordered.map((spool) => spool.lowThresholdGrams))),
      };
    })
    .sort((a, b) => a.lead.color.localeCompare(b.lead.color) || a.lead.material.localeCompare(b.lead.material));
}

export function drawFromColor(stock: Filament[], filamentId: string, grams: number) {
  const mates = sameColor(stock, filamentId);
  const ordered = mates.slice().sort((a, b) => {
    if (a.id === filamentId) return -1;
    if (b.id === filamentId) return 1;
    return a.remainingGrams - b.remainingGrams;
  });
  let left = roundGrams(Math.max(0, grams));
  const shares: { filament: string; grams: number }[] = [];
  for (const spool of ordered) {
    if (gramUnits(left) <= 0) break;
    const take = roundGrams(Math.min(Math.max(0, spool.remainingGrams), left));
    if (gramUnits(take) <= 0) continue;
    shares.push({ filament: spool.id, grams: take });
    left = roundGrams(left - take);
  }
  if (gramUnits(left) > 0) {
    const target = ordered.find((spool) => spool.id === filamentId)?.id ?? ordered[0]?.id;
    if (target) {
      const existing = shares.find((share) => share.filament === target);
      if (existing) existing.grams = roundGrams(existing.grams + left);
      else shares.push({ filament: target, grams: left });
    }
  }
  return shares.filter((share) => gramUnits(share.grams) > 0);
}

/** Take grams for each color, spilling onto other spools of that same color. Updates `stock` so a later draw sees what is left. */
export function drawShares(stock: Filament[], shares: { filament: string; grams: number }[]) {
  const drawn: { filament: string; grams: number }[] = [];
  for (const share of shares) {
    if (gramUnits(share.grams) <= 0) continue;
    for (const take of drawFromColor(stock, share.filament, share.grams)) {
      const spool = stock.find((item) => item.id === take.filament);
      if (spool) spool.remainingGrams = roundGrams(spool.remainingGrams - take.grams);
      drawn.push(take);
    }
  }
  const merged = new Map<string, number>();
  for (const take of drawn) {
    if (gramUnits(take.grams) <= 0) continue;
    merged.set(take.filament, roundGrams((merged.get(take.filament) ?? 0) + take.grams));
  }
  return [...merged.entries()].map(([filament, grams]) => ({ filament, grams }));
}
