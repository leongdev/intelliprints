import type { ColorUse } from "../types";
import { roundGrams } from "./format";

export function letterFor(index: number) {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

export function parseColors(value: unknown): ColorUse[] {
  let raw = value;
  if (typeof raw === "string" && raw.trim()) {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const parsed: ColorUse[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const filament = "filament" in item && typeof item.filament === "string" ? item.filament : "";
    const named = "slot" in item && typeof item.slot === "string" ? item.slot.trim().toUpperCase() : "";
    const grams = "grams" in item ? Number(item.grams) : NaN;
    if (!Number.isFinite(grams) || grams <= 0) continue;
    const slot = named || letterFor(parsed.length);
    if (seen.has(slot)) continue;
    seen.add(slot);
    parsed.push({ filament, grams: roundGrams(grams), slot });
  }
  return parsed;
}

export function partSlots(part: { grams: number; colors?: ColorUse[] }) {
  const colors = (part.colors ?? []).filter((item) => item.grams > 0);
  if (colors.length > 0) {
    return colors.map((item, index) => ({ slot: item.slot || letterFor(index), grams: roundGrams(item.grams) }));
  }
  if (part.grams > 0) return [{ slot: "A", grams: roundGrams(part.grams) }];
  return [];
}

export function cardSlots(card: { filament: string; gramsEach: number; colors?: ColorUse[] }) {
  const colors = (card.colors ?? []).filter((item) => item.grams > 0);
  if (colors.length > 0) {
    return colors.map((item, index) => ({
      slot: item.slot || letterFor(index),
      grams: roundGrams(item.grams),
      filament: item.filament || "",
    }));
  }
  if (card.gramsEach > 0) return [{ slot: "A", grams: roundGrams(card.gramsEach), filament: card.filament || "" }];
  return [];
}

export function partUses(part: { filament: string; grams: number; colors?: ColorUse[] }): ColorUse[] {
  const slots = cardSlots({ filament: part.filament, gramsEach: part.grams, colors: part.colors });
  if (slots.length === 0 || slots.some((slot) => !slot.filament)) return [];
  return slots.map((slot) => ({ filament: slot.filament, grams: slot.grams, slot: slot.slot }));
}

export function cardUses(card: { filament: string; gramsEach: number; colors?: ColorUse[] }): ColorUse[] {
  const slots = cardSlots(card);
  if (slots.length === 0 || slots.some((slot) => !slot.filament)) return [];
  return slots.map((slot) => ({ filament: slot.filament, grams: slot.grams, slot: slot.slot }));
}

/** Cards planned before color slots still only store a total. The product recipe supplies Color A, Color B, and the rest until the card is saved. */
export function slotsForCard(
  card: { filament: string; gramsEach: number; colors?: ColorUse[] },
  part?: { grams: number; colors?: ColorUse[] } | null,
) {
  if ((card.colors?.length ?? 0) > 1) return cardSlots(card);
  const recipe = part ? partSlots(part) : [];
  if (recipe.length > 1 && !card.filament && (card.colors?.length ?? 0) === 0) {
    return recipe.map((slot) => ({ slot: slot.slot, grams: slot.grams, filament: "" }));
  }
  return cardSlots(card);
}

export function splitGrams(total: number, uses: ColorUse[]) {
  const amount = roundGrams(Math.max(0, total));
  if (uses.length === 0 || amount <= 0) return [];
  if (uses.length === 1) return [{ filament: uses[0].filament, grams: amount }];
  const planned = uses.reduce((sum, item) => sum + item.grams, 0);
  if (planned <= 0) return [{ filament: uses[0].filament, grams: amount }];
  let allocated = 0;
  return uses.map((item, index) => {
    if (index === uses.length - 1) {
      return { filament: item.filament, grams: roundGrams(Math.max(0, amount - allocated)) };
    }
    const share = roundGrams(amount * (item.grams / planned));
    allocated = roundGrams(allocated + share);
    return { filament: item.filament, grams: share };
  });
}

export function colorPaint(hexes: string[]) {
  const colors = hexes.filter(Boolean);
  if (colors.length === 0) return "#444";
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  const stops = colors.map((hex, index) => `${hex} ${index * step}% ${(index + 1) * step}%`).join(", ");
  return `conic-gradient(${stops})`;
}
