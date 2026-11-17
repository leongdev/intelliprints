import type PocketBase from "pocketbase";
import type { Filament, Milestone, Notice, PrintCard } from "../types";
import { cardUses, slotsForCard } from "./colors";
import { gramUnits, grams, roundGrams } from "./format";
import { colorGroups, colorKey } from "./pools";
import { milestoneProgress } from "./metrics";
import { mapNotice } from "./mappers";
import type { Part, PrintEvent } from "../types";

interface Snapshot {
  workspaceId: string;
  filaments: Filament[];
  parts: Part[];
  milestones: Milestone[];
  cards: PrintCard[];
  events: PrintEvent[];
}

export async function reconcile(pb: PocketBase, snapshot: Snapshot) {
  let changed = false;
  const cards = snapshot.cards.map((card) => ({ ...card }));
  const groups = colorGroups(snapshot.filaments);
  const pool = new Map<string, number>();
  for (const group of groups) {
    const ids = new Set(group.spools.map((spool) => spool.id));
    const printing = cards
      .filter((card) => card.column === "printing")
      .reduce((sum, card) => {
        const use = cardUses(card).find((item) => ids.has(item.filament));
        return use ? sum + card.quantity * use.grams : sum;
      }, 0);
    pool.set(group.key, roundGrams(group.remainingGrams - printing));
  }

  const queue = cards
    .filter((card) => card.column === "queue")
    .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const sequenceCount = new Map<number, number>();
  for (const card of queue) sequenceCount.set(card.sequence, (sequenceCount.get(card.sequence) ?? 0) + 1);
  if ([...sequenceCount.values()].some((count) => count > 1)) {
    for (let index = 0; index < queue.length; index += 1) {
      const next = index + 1;
      const card = queue[index];
      if (card.sequence === next) continue;
      await pb.collection("print_cards").update(card.id, { sequence: next });
      card.sequence = next;
      changed = true;
    }
  }

  for (const card of queue) {
    const uses = cardUses(card);
    const shorts: string[] = [];
    let missingSpool = false;
    for (const use of uses) {
      const filament = snapshot.filaments.find((item) => item.id === use.filament);
      const key = filament ? colorKey(filament) : use.filament;
      const need = roundGrams(card.quantity * use.grams);
      const have = roundGrams(pool.get(key) ?? 0);
      if (!filament) {
        missingSpool = true;
        continue;
      }
      if (gramUnits(have) < gramUnits(need)) shorts.push(`${grams(Math.max(0, need - have))} of ${filament.color} ${filament.material}`);
    }
    const part = snapshot.parts.find((item) => item.id === card.component);
    const missing = slotsForCard(card, part).filter((slot) => !slot.filament);
    const noColor = missing.length > 0;
    const blocked = noColor || missingSpool || shorts.length > 0;
    const names = missing.map((slot) => `Color ${slot.slot}`);
    const reason = noColor
      ? names.length === 1
        ? `Assign a filament to ${names[0]}.`
        : `Assign a filament to ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`
      : missingSpool
        ? "The filament for this plate was removed."
        : `Short ${shorts.join(" and ")}. Restock before starting it.`;
    if (!blocked) {
      for (const use of uses) {
        const filament = snapshot.filaments.find((item) => item.id === use.filament);
        const key = filament ? colorKey(filament) : use.filament;
        const have = pool.get(key) ?? 0;
        pool.set(key, roundGrams(have - card.quantity * use.grams));
      }
    }

    if (card.blocked !== blocked || (blocked && card.blockedReason !== reason)) {
      await pb.collection("print_cards").update(card.id, {
        blocked,
        blockedReason: blocked ? reason : "",
      });
      card.blocked = blocked;
      card.blockedReason = blocked ? reason : "";
      changed = true;
    }
  }

  const milestoneStatus = new Map<string, "active" | "done">();
  for (const milestone of snapshot.milestones) {
    const progress = milestoneProgress(milestone, snapshot.parts, snapshot.events, cards);
    const done = milestone.targetQty > 0 && progress.assembled >= milestone.targetQty - 1e-6;
    const status = done ? "done" : "active";
    milestoneStatus.set(milestone.id, status);
    if (milestone.status !== status) {
      await pb.collection("milestones").update(milestone.id, { status });
      changed = true;
    }
  }

  const filter = `workspace = "${snapshot.workspaceId}"`;
  const notices = (await pb.collection("notifications").getFullList({ filter, sort: "-created" })).map(mapNotice);
  const desired = new Map<string, { kind: "low" | "short" | "milestone"; title: string; body: string; filament: string; milestone: string }>();

  for (const group of groups) {
    const ids = new Set(group.spools.map((spool) => spool.id));
    const name = `${group.lead.color} ${group.lead.material}`;
    const pile = group.spools.length > 1 ? `${name} (${group.spools.length} spools)` : name;
    const related = cards.filter(
      (card) =>
        (card.column === "queue" || card.column === "printing") &&
        cardUses(card).some((use) => ids.has(use.filament)),
    );
    const demand = related.reduce((sum, card) => {
      const use = cardUses(card).find((item) => ids.has(item.filament));
      return use ? roundGrams(sum + card.quantity * use.grams) : sum;
    }, 0);
    const deficit = roundGrams(demand - group.remainingGrams);
    const blockedNames = related.filter((card) => card.blocked).map((card) => card.name);
    const stockKey = encodeURIComponent(group.key);
    if (group.remainingGrams <= 0) {
      desired.set(`stock:${stockKey}:short`, {
        kind: "short",
        title: `${name} is empty`,
        body:
          demand > 0
            ? `Queued prints still need ${grams(demand)}. ${blockedNames.slice(0, 3).join(", ") || pile} cannot start.`
            : `${pile} has no usable filament left.`,
        filament: group.lead.id,
        milestone: "",
      });
    } else if (gramUnits(deficit) > 0) {
      desired.set(`stock:${stockKey}:short`, {
        kind: "short",
        title: `${name} can't cover the queue`,
        body: `${grams(deficit)} short${blockedNames.length ? ` for ${blockedNames.slice(0, 3).join(", ")}` : ""}. ${grams(group.remainingGrams)} is on the shelf.`,
        filament: group.lead.id,
        milestone: "",
      });
    } else if (group.lowThresholdGrams > 0 && group.remainingGrams <= group.lowThresholdGrams) {
      desired.set(`stock:${stockKey}:low`, {
        kind: "low",
        title: `${name} is getting low`,
        body: `${grams(group.remainingGrams)} left${group.spools.length > 1 ? ` across ${group.spools.length} spools` : ""}. Reorder before the next milestone.`,
        filament: group.lead.id,
        milestone: "",
      });
    }
  }

  for (const milestone of snapshot.milestones) {
    if (milestoneStatus.get(milestone.id) !== "done") continue;
    desired.set(`milestone:${milestone.id}`, {
      kind: "milestone",
      title: `${milestone.name} is complete`,
      body: `All ${milestone.targetQty} are covered by finished parts.`,
      filament: "",
      milestone: milestone.id,
    });
  }

  for (const notice of notices) {
    const stock = notice.dedupeKey.startsWith("stock:");
    const orphanMilestone = notice.dedupeKey.startsWith("milestone:") && !desired.has(notice.dedupeKey);
    if ((stock && !desired.has(notice.dedupeKey)) || orphanMilestone) {
      await pb.collection("notifications").delete(notice.id);
      changed = true;
    }
  }

  const stillThere = new Set(
    notices.filter((notice) => desired.has(notice.dedupeKey)).map((notice) => notice.dedupeKey),
  );
  for (const [key, item] of desired) {
    if (stillThere.has(key)) continue;
    const payload: Record<string, unknown> = {
      workspace: snapshot.workspaceId,
      kind: item.kind,
      title: item.title,
      body: item.body,
      read: false,
      dedupeKey: key,
    };
    if (item.filament) payload.filament = item.filament;
    if (item.milestone) payload.milestone = item.milestone;
    await pb.collection("notifications").create(payload);
    changed = true;
  }

  return changed;
}

export type { Notice };
