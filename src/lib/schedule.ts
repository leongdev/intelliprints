import type { Part, PrintCard, Printer } from "../types";
import { parsePbDate } from "./format";
import { sortCards } from "./logistics";

export interface ScheduleSlot {
  card: PrintCard;
  printerId: string;
  start: number;
  end: number;
  printing: boolean;
  next: boolean;
}

export interface ScheduleRow {
  printer: Printer;
  slots: ScheduleSlot[];
}

export interface Schedule {
  rows: ScheduleRow[];
  slots: ScheduleSlot[];
  now: number;
  horizon: number;
}

const MINUTE = 60_000;

function jobMinutes(card: PrintCard) {
  return Math.max(1, card.quantity * card.minutesEach);
}

function durationMs(card: PrintCard) {
  return jobMinutes(card) * MINUTE;
}

function plannedStart(card: PrintCard) {
  return parsePbDate(card.startedAt)?.getTime() ?? null;
}

interface Lane {
  printer: Printer;
  filament: string;
  slots: ScheduleSlot[];
}

/** First moment `duration` fits without covering a job already on the lane. */
function fit(lane: Lane, start: number, duration: number) {
  let cursor = start;
  const taken = [...lane.slots].sort((a, b) => a.start - b.start);
  for (const slot of taken) {
    if (slot.end <= cursor) continue;
    if (cursor + duration <= slot.start) break;
    cursor = slot.end;
  }
  return cursor;
}

function place(lane: Lane, card: PrintCard, start: number) {
  lane.slots.push({
    card,
    printerId: lane.printer.id,
    start,
    end: start + durationMs(card),
    printing: false,
    next: false,
  });
  lane.filament = card.filament;
}

/** Empty means every printer. A list means only those printers. */
function allowedIds(card: PrintCard, parts: Part[]) {
  const part = parts.find((item) => item.id === card.component);
  const ids = part?.printers.filter(Boolean) ?? [];
  return ids.length > 0 ? new Set(ids) : null;
}

export function printerAllowed(card: PrintCard, printerId: string, parts: Part[]) {
  const allowed = allowedIds(card, parts);
  return allowed == null || allowed.has(printerId);
}

function openLanes(card: PrintCard, lanes: Map<string, Lane>, parts: Part[]) {
  return [...lanes.values()].filter((lane) => printerAllowed(card, lane.printer.id, parts));
}

function pickLane(card: PrintCard, lanes: Map<string, Lane>, parts: Part[], now: number) {
  const preferred =
    card.printer && lanes.has(card.printer) && printerAllowed(card, card.printer, parts) ? lanes.get(card.printer)! : null;
  if (preferred) return preferred;
  return openLanes(card, lanes, parts).sort((a, b) => {
    const aFree = fit(a, now, durationMs(card));
    const bFree = fit(b, now, durationMs(card));
    if (aFree !== bFree) return aFree - bFree;
    const filament = Number(b.filament === card.filament) - Number(a.filament === card.filament);
    if (filament !== 0) return filament;
    return a.printer.name.localeCompare(b.printer.name);
  })[0];
}

/**
 * Lay every open job on the active printers. A card with a printer and a
 * start time keeps both. Other queued jobs fill the gaps that remain, and
 * blocked jobs sit after the work that can actually run.
 */
export function buildSchedule(cards: PrintCard[], printers: Printer[], now = Date.now(), preferId = "", parts: Part[] = []): Schedule {
  const lanes = new Map<string, Lane>();
  const visible = printers.filter(
    (printer) => printer.active || cards.some((card) => card.column === "printing" && card.printer === printer.id),
  );
  for (const printer of visible) lanes.set(printer.id, { printer, filament: "", slots: [] });

  for (const card of cards) {
    if (card.column !== "printing") continue;
    const lane = lanes.get(card.printer);
    if (!lane) continue;
    const start = plannedStart(card) ?? now;
    const slotEnd = Math.max(now, start + durationMs(card));
    lane.slots.push({ card, printerId: lane.printer.id, start, end: slotEnd, printing: true, next: false });
    lane.filament = card.filament;
  }

  const queued = sortCards(cards, "queue");
  const timed = queued
    .filter((card) => !card.blocked && card.printer && lanes.has(card.printer) && plannedStart(card) != null)
    .sort((a, b) => Number(b.id === preferId) - Number(a.id === preferId) || (plannedStart(a) ?? 0) - (plannedStart(b) ?? 0));
  for (const card of timed) {
    if (!printerAllowed(card, card.printer, parts)) {
      const lane = pickLane(card, lanes, parts, now);
      if (!lane) continue;
      place(lane, card, fit(lane, now, durationMs(card)));
      continue;
    }
    const lane = lanes.get(card.printer)!;
    const wanted = plannedStart(card) ?? now;
    const duration = durationMs(card);
    const hitsPrinting = lane.slots.some((slot) => slot.printing && wanted < slot.end && wanted + duration > slot.start);
    const start = card.id === preferId && !hitsPrinting ? wanted : fit(lane, wanted, duration);
    place(lane, card, start);
  }

  const held = queued
    .filter((card) => card.blocked && plannedStart(card) != null)
    .sort((a, b) => Number(b.id === preferId) - Number(a.id === preferId) || (plannedStart(a) ?? 0) - (plannedStart(b) ?? 0));
  for (const card of held) {
    const lane = pickLane(card, lanes, parts, now);
    if (!lane) continue;
    const wanted = plannedStart(card) ?? now;
    const duration = durationMs(card);
    const hitsPrinting = lane.slots.some((slot) => slot.printing && wanted < slot.end && wanted + duration > slot.start);
    const start = card.id === preferId && !hitsPrinting ? wanted : fit(lane, wanted, duration);
    place(lane, card, start);
  }

  const pinned = queued.filter((card) => !card.blocked && card.printer && lanes.has(card.printer) && plannedStart(card) == null);
  const floating = queued.filter((card) => !card.blocked && !(card.printer && lanes.has(card.printer)));
  for (const card of [...pinned, ...floating]) {
    const lane = pickLane(card, lanes, parts, now);
    if (!lane) continue;
    place(lane, card, fit(lane, now, durationMs(card)));
  }

  for (const card of queued.filter((item) => item.blocked && plannedStart(item) == null)) {
    const preferred = card.printer && lanes.has(card.printer) && printerAllowed(card, card.printer, parts) ? lanes.get(card.printer)! : null;
    const lane = preferred ?? openLanes(card, lanes, parts).sort((a, b) => a.printer.name.localeCompare(b.printer.name))[0];
    if (!lane) continue;
    const wanted = lane.slots.reduce((max, slot) => Math.max(max, slot.end), now);
    place(lane, card, fit(lane, wanted, durationMs(card)));
  }

  const rows = [...lanes.values()].map((lane) => {
    lane.slots.sort((a, b) => a.start - b.start);
    const next = lane.slots.find((slot) => !slot.printing && !slot.card.blocked);
    if (next) next.next = true;
    return { printer: lane.printer, slots: lane.slots };
  });
  const slots = rows.flatMap((row) => row.slots);
  const latest = slots.reduce((max, slot) => Math.max(max, slot.end), now + 4 * 60 * MINUTE);
  const horizon = Math.ceil(latest / (60 * MINUTE)) * 60 * MINUTE;
  return { rows, slots, now, horizon: Math.max(horizon, now + 60 * MINUTE) };
}

export function printerFor(card: PrintCard, cards: PrintCard[], printers: Printer[], now = Date.now(), parts: Part[] = []) {
  const free = printers.filter(
    (printer) =>
      printer.active &&
      printerAllowed(card, printer.id, parts) &&
      !cards.some((item) => item.column === "printing" && item.printer === printer.id && item.id !== card.id),
  );
  if (free.length === 0) return "";
  const planned = buildSchedule(cards, printers, now, "", parts).slots.find((slot) => slot.card.id === card.id);
  if (planned && free.some((printer) => printer.id === planned.printerId)) return planned.printerId;
  if (card.printer && free.some((printer) => printer.id === card.printer)) return card.printer;
  return free[0].id;
}

export function printerUnavailable(card: PrintCard, cards: PrintCard[], printers: Printer[], parts: Part[]) {
  const allowed = allowedIds(card, parts);
  const pool = printers.filter((printer) => printer.active && (allowed == null || allowed.has(printer.id)));
  if (pool.length === 0) return "No active printer is allowed to print this plate.";
  const busy = pool.every((printer) =>
    cards.some((item) => item.column === "printing" && item.printer === printer.id && item.id !== card.id),
  );
  return busy ? "Every printer allowed for this plate already has a job." : "No printer is free for this plate.";
}
