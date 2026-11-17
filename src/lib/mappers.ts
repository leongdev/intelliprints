import type { RecordModel } from "pocketbase";
import type {
  ColumnId,
  Filament,
  Material,
  MemberProfile,
  MemberRole,
  Milestone,
  MilestoneStatus,
  Notice,
  NotifyKind,
  Outcome,
  MilestoneSlice,
  Part,
  PartKind,
  PrintCard,
  PrintEvent,
  Printer,
  Priority,
  Product,
  ProductVersion,
  Workspace,
} from "../types";
import { COLUMNS, MATERIALS, PART_KINDS, PRIORITIES } from "../types";
import { parseColors } from "./colors";

function str(record: RecordModel, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function num(record: RecordModel, key: string) {
  const value = record[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(record: RecordModel, key: string) {
  return record[key] === true;
}

function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function parseComponents(value: unknown): MilestoneSlice[] {
  if (!Array.isArray(value)) return [];
  const slices: MilestoneSlice[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = "id" in item && typeof item.id === "string" ? item.id : "";
    const jobs = "jobs" in item ? Math.round(Number(item.jobs)) : 0;
    if (id && Number.isInteger(jobs) && jobs > 0) slices.push({ id, jobs });
  }
  return slices;
}

function ids(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "id" in item && typeof item.id === "string") return item.id;
      return "";
    })
    .filter(Boolean);
}

function oneOf<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function mapWorkspace(record: RecordModel): Workspace {
  return {
    id: record.id,
    name: str(record, "name"),
    owner: str(record, "owner"),
    members: ids(record.members),
    joinCode: str(record, "joinCode"),
    currency: str(record, "currency") || "USD",
  };
}

export function mapMember(record: RecordModel): MemberProfile {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    user: str(record, "user"),
    email: str(record, "email"),
    name: str(record, "name"),
    role: oneOf(str(record, "role"), ["owner", "member"] as const, "member") as MemberRole,
  };
}

export function mapFilament(record: RecordModel): Filament {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    brand: str(record, "brand"),
    material: oneOf(str(record, "material"), MATERIALS, "PETG Basic") as Material,
    color: str(record, "color"),
    colorHex: str(record, "colorHex") || "#d4d4d8",
    remainingGrams: num(record, "remainingGrams"),
    spoolGrams: num(record, "spoolGrams"),
    pricePerKg: num(record, "pricePerKg"),
    lowThresholdGrams: num(record, "lowThresholdGrams"),
    notes: str(record, "notes"),
  };
}

export function mapProduct(record: RecordModel): Product {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    name: str(record, "name"),
    description: str(record, "description"),
    photo: str(record, "photo"),
  };
}

export function mapVersion(record: RecordModel): ProductVersion {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    product: str(record, "product"),
    name: str(record, "name"),
    notes: str(record, "notes"),
    active: bool(record, "active"),
    created: str(record, "created"),
  };
}

export function mapPart(record: RecordModel): Part {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    product: str(record, "product"),
    name: str(record, "name"),
    kind: oneOf(str(record, "kind"), PART_KINDS, "piece") as PartKind,
    filament: str(record, "filament"),
    grams: num(record, "grams"),
    minutes: num(record, "minutes"),
    perProduct: num(record, "perProduct"),
    photo: str(record, "photo"),
    version: str(record, "version"),
    colors: parseColors(record.colors),
    printers: parseIds(record.printers),
  };
}

export function mapMilestone(record: RecordModel): Milestone {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    product: str(record, "product"),
    name: str(record, "name"),
    targetQty: num(record, "targetQty"),
    status: oneOf(str(record, "status"), ["active", "done"] as const, "active") as MilestoneStatus,
    notes: str(record, "notes"),
    version: str(record, "version"),
    components: parseComponents(record.components),
  };
}

export function mapPrinter(record: RecordModel): Printer {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    name: str(record, "name"),
    model: str(record, "model"),
    active: record.active !== false,
    avatar: str(record, "avatar"),
  };
}

export function mapCard(record: RecordModel): PrintCard {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    milestone: str(record, "milestone"),
    product: str(record, "product"),
    component: str(record, "component"),
    filament: str(record, "filament"),
    printer: str(record, "printer"),
    name: str(record, "name"),
    kind: oneOf(str(record, "kind"), PART_KINDS, "piece") as PartKind,
    column: oneOf(str(record, "column"), COLUMNS, "queue") as ColumnId,
    quantity: num(record, "quantity"),
    gramsEach: num(record, "gramsEach"),
    minutesEach: num(record, "minutesEach"),
    priority: oneOf(str(record, "priority"), PRIORITIES, "medium") as Priority,
    sequence: num(record, "sequence"),
    blocked: bool(record, "blocked"),
    blockedReason: str(record, "blockedReason"),
    strategyNote: str(record, "strategyNote"),
    startedAt: str(record, "startedAt"),
    colors: parseColors(record.colors),
  };
}

export function mapEvent(record: RecordModel): PrintEvent {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    milestone: str(record, "milestone"),
    product: str(record, "product"),
    component: str(record, "component"),
    filament: str(record, "filament"),
    card: str(record, "card"),
    printer: str(record, "printer"),
    outcome: oneOf(str(record, "outcome"), ["success", "failed"] as const, "success") as Outcome,
    pieces: num(record, "pieces"),
    gramsUsed: num(record, "gramsUsed"),
    gramsWasted: num(record, "gramsWasted"),
    cost: num(record, "cost"),
    note: str(record, "note"),
    partName: str(record, "partName"),
    productName: str(record, "productName"),
    filamentLabel: str(record, "filamentLabel"),
    created: typeof record.created === "string" ? record.created : "",
  };
}

export function mapNotice(record: RecordModel): Notice {
  return {
    id: record.id,
    workspace: str(record, "workspace"),
    kind: oneOf(str(record, "kind"), ["low", "short", "milestone"] as const, "low") as NotifyKind,
    title: str(record, "title"),
    body: str(record, "body"),
    read: bool(record, "read"),
    dedupeKey: str(record, "dedupeKey"),
    filament: str(record, "filament"),
    milestone: str(record, "milestone"),
    created: typeof record.created === "string" ? record.created : "",
  };
}
