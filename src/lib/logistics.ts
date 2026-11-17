import type { ColorUse, ColumnId, Filament, Part, PartKind, PrintCard, Priority } from "../types";
import { cardUses, partSlots } from "./colors";
import { duration, gramUnits, grams, roundGrams } from "./format";
import { colorKey } from "./pools";

export interface SpoolInput {
  id: string;
  brand: string;
  material: string;
  color: string;
  remainingGrams: number;
}

export interface DemandLine {
  componentId: string;
  name: string;
  kind: PartKind;
  filamentId: string;
  gramsEach: number;
  minutesEach: number;
  piecesNeeded: number;
  colors: ColorUse[];
}

export interface PlanCard {
  componentId: string;
  filamentId: string;
  name: string;
  kind: PartKind;
  quantity: number;
  gramsEach: number;
  minutesEach: number;
  blocked: boolean;
  blockedReason: string;
  priority: Priority;
  sequence: number;
  strategyNote: string;
  colors: ColorUse[];
}

export interface SpoolSummary {
  filamentId: string;
  brand: string;
  material: string;
  color: string;
  available: number;
  demand: number;
  printableGrams: number;
  shortage: number;
  load: number;
}

export interface PlanResult {
  cards: PlanCard[];
  spools: SpoolSummary[];
  changeovers: number;
  notes: string[];
}

/**
 * Sequence plates so a workshop changes spools as rarely as possible and never
 * starts a job the current spool cannot finish.
 *
 * Scarcest spool first: demand / grams on hand. That surfaces a shortage
 * before the printer is busy with an easy material.
 * Inside a spool, longest plate first so the changeover is paid once and the
 * slow job is not left until the end of the load.
 * Pieces that do not fit become a blocked card instead of a half-started print.
 */
export function lineForPart(part: Part, piecesNeeded: number): DemandLine {
  const slots = partSlots(part);
  const gramsEach = roundGrams(slots.reduce((sum, slot) => sum + slot.grams, 0)) || part.grams;
  return {
    componentId: part.id,
    name: part.name,
    kind: part.kind,
    filamentId: "",
    gramsEach,
    minutesEach: part.minutes,
    piecesNeeded,
    colors: slots.length > 1 ? slots.map((slot) => ({ slot: slot.slot, filament: "", grams: slot.grams })) : [],
  };
}

function usesOf(line: DemandLine): ColorUse[] {
  if (line.colors.length > 1) return line.colors;
  return [{ filament: line.filamentId, grams: line.gramsEach }];
}

function groupKey(line: DemandLine, keyFor: (filamentId: string) => string) {
  const uses = usesOf(line);
  if (uses.length <= 1) return keyFor(uses[0]?.filament ?? line.filamentId);
  return uses
    .map((use) => keyFor(use.filament))
    .slice()
    .sort()
    .join("+");
}

export function planPrints(lines: DemandLine[], spools: SpoolInput[]): PlanResult {
  const spoolMap = new Map(spools.map((spool) => [spool.id, spool]));
  const active = lines.filter((line) => line.piecesNeeded > 0 && line.gramsEach > 0);
  const pending = active.filter((line) => usesOf(line).every((use) => !use.filament));
  const ready = active.filter((line) => usesOf(line).some((use) => use.filament));
  const demandByFilament = new Map<string, number>();
  for (const line of ready) {
    for (const use of usesOf(line)) {
      demandByFilament.set(use.filament, roundGrams((demandByFilament.get(use.filament) ?? 0) + line.piecesNeeded * use.grams));
    }
  }

  function keyFor(filamentId: string) {
    const spool = spoolMap.get(filamentId);
    return spool ? colorKey(spool) : filamentId;
  }

  const demandByPool = new Map<string, number>();
  for (const [filamentId, demand] of demandByFilament) {
    const key = keyFor(filamentId);
    demandByPool.set(key, roundGrams((demandByPool.get(key) ?? 0) + demand));
  }
  const poolGrams = new Map<string, number>();
  for (const spool of spools) {
    const key = colorKey(spool);
    poolGrams.set(key, roundGrams((poolGrams.get(key) ?? 0) + Math.max(0, spool.remainingGrams)));
  }

  const grouped = new Map<string, DemandLine[]>();
  for (const line of ready) {
    const key = groupKey(line, keyFor);
    const bucket = grouped.get(key) ?? [];
    bucket.push(line);
    grouped.set(key, bucket);
  }

  function tightness(filamentId: string) {
    const key = keyFor(filamentId);
    const demand = demandByPool.get(key) ?? 0;
    const available = poolGrams.get(key) ?? 0;
    return demand / Math.max(available, 1);
  }

  const groups = [...grouped.values()].map((groupLines) => {
    const filaments = [...new Set(groupLines.flatMap((line) => usesOf(line).map((use) => use.filament)))];
    const demand = roundGrams(groupLines.reduce((sum, line) => sum + line.piecesNeeded * line.gramsEach, 0));
    const score = filaments.reduce((max, filamentId) => Math.max(max, tightness(filamentId)), 0);
    return { groupLines, demand, score };
  });
  groups.sort((a, b) => b.score - a.score || b.demand - a.demand);

  const remaining = new Map<string, number>();
  for (const [key, gramsOnHand] of poolGrams) remaining.set(key, gramUnits(gramsOnHand));
  for (const filamentId of demandByFilament.keys()) {
    const key = keyFor(filamentId);
    if (!remaining.has(key)) remaining.set(key, 0);
  }

  const cards: PlanCard[] = [];
  const printedByPool = new Map<string, number>();
  const loadOf = new Map<string, number>();
  let sequence = 1;
  let loads = 0;

  for (const group of groups) {
    const ordered = [...group.groupLines].sort((a, b) => {
      const timeDelta = b.minutesEach * b.piecesNeeded - a.minutesEach * a.piecesNeeded;
      if (timeDelta !== 0) return timeDelta;
      const gramDelta = b.gramsEach * b.piecesNeeded - a.gramsEach * a.piecesNeeded;
      if (gramDelta !== 0) return gramDelta;
      return a.name.localeCompare(b.name);
    });

    let groupPrinted = false;
    const priority = priorityFor(group.score);

    for (const line of ordered) {
      const uses = usesOf(line);
      let affordable = line.piecesNeeded;
      for (const use of uses) {
        const each = gramUnits(use.grams);
        const left = remaining.get(keyFor(use.filament)) ?? 0;
        const fit = each <= 0 ? 0 : Math.floor(left / each);
        affordable = Math.min(affordable, Math.max(0, fit));
      }
      const can = affordable;
      const blockedPieces = line.piecesNeeded - can;
      const longest = line === ordered[0];
      const primary = uses[0];
      const primarySpool = primary ? spoolMap.get(primary.filament) : undefined;
      const colors = uses.length > 1 ? uses : [];

      if (can > 0 && primary) {
        for (const use of uses) {
          const key = keyFor(use.filament);
          remaining.set(key, (remaining.get(key) ?? 0) - can * gramUnits(use.grams));
          printedByPool.set(key, roundGrams((printedByPool.get(key) ?? 0) + can * use.grams));
          if (!loadOf.has(key)) loadOf.set(key, loads + 1);
        }
        groupPrinted = true;
        for (let plate = 0; plate < can; plate += 1) {
          const first = plate === 0;
          cards.push({
            componentId: line.componentId,
            filamentId: primary.filament,
            name: line.name,
            kind: line.kind,
            quantity: 1,
            gramsEach: roundGrams(line.gramsEach),
            minutesEach: line.minutesEach,
            blocked: false,
            blockedReason: "",
            priority,
            sequence,
            strategyNote:
              uses.length > 1
                ? multiNote(uses, spoolMap, loads + 1, longest && first, can, line)
                : printableNote(`${primarySpool?.color ?? "This color"} ${primarySpool?.material ?? ""}`.trim(), loads + 1, longest && first, can, line),
            colors,
          });
          sequence += 1;
        }
      }

      if (blockedPieces > 0 && primary) {
        for (let plate = 0; plate < blockedPieces; plate += 1) {
          cards.push({
            componentId: line.componentId,
            filamentId: primary.filament,
            name: line.name,
            kind: line.kind,
            quantity: 1,
            gramsEach: roundGrams(line.gramsEach),
            minutesEach: line.minutesEach,
            blocked: true,
            blockedReason:
              uses.length > 1
                ? multiShort(1, uses, remaining, spoolMap, keyFor)
                : `Short ${grams(roundGrams(primary.grams))} of ${primarySpool?.color ?? "this color"} ${primarySpool?.material ?? ""}. This plate stays in the queue until that color can finish it.`,
            priority: "high",
            sequence: 0,
            strategyNote: "Held back so the printer never starts a plate it cannot finish.",
            colors,
          });
        }
      }
    }

    if (groupPrinted) loads += 1;
  }

  const summaries: SpoolSummary[] = [...demandByPool.entries()]
    .map(([key, demand]) => {
      const members = spools.filter((spool) => colorKey(spool) === key);
      const spool = members.slice().sort((a, b) => b.remainingGrams - a.remainingGrams)[0];
      const available = poolGrams.get(key) ?? 0;
      return {
        filamentId: spool?.id ?? key,
        brand: spool?.brand ?? "Unknown spool",
        material: spool?.material ?? "",
        color: spool?.color ?? "",
        available,
        demand,
        printableGrams: printedByPool.get(key) ?? 0,
        shortage: roundGrams(Math.max(0, demand - available)),
        load: loadOf.get(key) ?? 0,
      };
    })
    .sort((a, b) => tightness(b.filamentId) - tightness(a.filamentId) || b.demand - a.demand);

  for (const line of pending) {
    for (let plate = 0; plate < line.piecesNeeded; plate += 1) {
      cards.push({
        componentId: line.componentId,
        filamentId: "",
        name: line.name,
        kind: line.kind,
        quantity: 1,
        gramsEach: line.gramsEach,
        minutesEach: line.minutesEach,
        blocked: true,
        blockedReason: assignReason(line),
        priority: "medium",
        sequence: 0,
        strategyNote: "The grams stay with Color A, Color B, and the rest. Pick the filament for this plate.",
        colors: line.colors,
      });
    }
  }

  const notes: string[] = [];
  if (loads === 0 && pending.length === 0) {
    notes.push("Nothing can start. Every plate is short of filament.");
  } else if (loads > 0) {
    const changeovers = Math.max(0, loads - 1);
    notes.push(
      `Print in ${loads} color load${loads === 1 ? "" : "s"} (${changeovers} changeover${changeovers === 1 ? "" : "s"}). Scarcest color runs first, then the longest plate in that color.`,
    );
  }
  const pendingPlates = pending.reduce((sum, line) => sum + line.piecesNeeded, 0);
  if (pendingPlates > 0) {
    notes.push(
      pendingPlates === 1
        ? "One plate needs its colors. Set them on that card."
        : `${pendingPlates} plates need their colors. Set them on each card so you can start one plate at a time.`,
    );
  }
  const shortages = summaries.filter((summary) => summary.shortage > 0);
  if (shortages.length > 0) {
    notes.push(
      `Buy ${shortages.map((summary) => `${grams(summary.shortage)} of ${summary.color} ${summary.material}`).join(", ")} to release the blocked plates.`,
    );
  }

  return {
    cards,
    spools: summaries,
    changeovers: Math.max(0, loads - 1),
    notes,
  };
}

function assignReason(line: DemandLine) {
  const slots = line.colors.length > 1 ? line.colors.map((item, index) => item.slot || String.fromCharCode(65 + index)) : ["A"];
  const names = slots.map((slot) => `Color ${slot}`);
  if (names.length === 1) return `Assign a filament to ${names[0]}.`;
  return `Assign a filament to ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`;
}

function priorityFor(tightness: number): Priority {
  if (tightness >= 0.85) return "high";
  if (tightness >= 0.45) return "medium";
  return "low";
}

function multiNote(
  uses: ColorUse[],
  spoolMap: Map<string, SpoolInput>,
  load: number,
  longest: boolean,
  can: number,
  line: DemandLine,
) {
  const mounted = uses
    .map((use) => {
      const spool = spoolMap.get(use.filament);
      return spool ? `${spool.color} ${spool.material}` : "spool";
    })
    .join(", ");
  const lead = longest
    ? `Print first in load ${load} with ${mounted} loaded together.`
    : `Same colors as the plate ahead — load ${load}, no changeover.`;
  const tail = can < line.piecesNeeded ? ` ${line.piecesNeeded - can} more stay blocked until you restock.` : "";
  return `${lead} ${duration(line.minutesEach)}, ${grams(line.gramsEach)}.${tail}`;
}

function multiShort(
  blockedPieces: number,
  uses: ColorUse[],
  remaining: Map<string, number>,
  spoolMap: Map<string, SpoolInput>,
  keyFor: (filamentId: string) => string,
) {
  const parts: string[] = [];
  for (const use of uses) {
    const have = (remaining.get(keyFor(use.filament)) ?? 0) / 100;
    const need = blockedPieces * use.grams;
    if (gramUnits(have) >= gramUnits(need)) continue;
    const spool = spoolMap.get(use.filament);
    const color = spool?.color ?? "this color";
    const material = spool?.material ?? "";
    parts.push(`${grams(roundGrams(need))} of ${color} ${material}`.trim());
  }
  const listed = parts.length > 0 ? parts.join(" and ") : "filament";
  return `Short ${listed}. This plate stays in the queue until every spool can finish it.`;
}

function printableNote(label: string, load: number, longest: boolean, can: number, line: DemandLine) {
  const lead = longest
    ? `Print first in load ${load} while ${label} is mounted.`
    : `Same color as the plate ahead — load ${load}, no changeover.`;
  const tail =
    can < line.piecesNeeded
      ? ` ${line.piecesNeeded - can} more stay blocked until you restock.`
      : "";
  return `${lead} ${duration(line.minutesEach)}, ${grams(line.gramsEach)}.${tail}`;
}

export function reservedGrams(filamentId: string, cards: PrintCard[]) {
  return cards
    .filter((card) => !card.blocked && (card.column === "queue" || card.column === "printing"))
    .reduce((sum, card) => {
      const use = cardUses(card).find((item) => item.filament === filamentId);
      return use ? roundGrams(sum + card.quantity * use.grams) : sum;
    }, 0);
}

export function stockForPlanning(filaments: Filament[], cards: PrintCard[]): SpoolInput[] {
  return filaments.map((filament) => ({
    id: filament.id,
    brand: filament.brand,
    material: filament.material,
    color: filament.color,
    remainingGrams: Math.max(0, filament.remainingGrams - reservedGrams(filament.id, cards)),
  }));
}

export function sortCards(cards: PrintCard[], column: ColumnId) {
  return cards
    .filter((card) => card.column === column)
    .sort((a, b) => {
      if (column === "printing") return a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id);
      return a.sequence - b.sequence || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
}
