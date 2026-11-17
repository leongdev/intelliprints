import { MATERIALS } from "./lib/bambu";

export { MATERIALS };
export type Material = (typeof MATERIALS)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const COLUMNS = ["queue", "printing", "done", "failed"] as const;
export type ColumnId = (typeof COLUMNS)[number];

export const PART_KINDS = ["piece", "plate"] as const;
export type PartKind = (typeof PART_KINDS)[number];

export type Outcome = "success" | "failed";
export type NotifyKind = "low" | "short" | "milestone";
export type MemberRole = "owner" | "member";
export type MilestoneStatus = "active" | "done";
export type RangeKey = "7d" | "30d" | "90d" | "all";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  owner: string;
  members: string[];
  joinCode: string;
  currency: string;
}

export interface MemberProfile {
  id: string;
  workspace: string;
  user: string;
  email: string;
  name: string;
  role: MemberRole;
}

export interface Filament {
  id: string;
  workspace: string;
  brand: string;
  material: Material;
  color: string;
  colorHex: string;
  remainingGrams: number;
  spoolGrams: number;
  pricePerKg: number;
  lowThresholdGrams: number;
  notes: string;
}

export interface Product {
  id: string;
  workspace: string;
  name: string;
  description: string;
  photo: string;
}

export interface ProductVersion {
  id: string;
  workspace: string;
  product: string;
  name: string;
  notes: string;
  active: boolean;
  created: string;
}

export interface ColorUse {
  filament: string;
  grams: number;
  slot?: string;
}

export interface Part {
  id: string;
  workspace: string;
  product: string;
  name: string;
  kind: PartKind;
  filament: string;
  grams: number;
  minutes: number;
  perProduct: number;
  photo: string;
  version: string;
  colors: ColorUse[];
  printers: string[];
}

export interface MilestoneSlice {
  id: string;
  jobs: number;
}

export interface Milestone {
  id: string;
  workspace: string;
  product: string;
  name: string;
  targetQty: number;
  status: MilestoneStatus;
  notes: string;
  version: string;
  components: MilestoneSlice[];
}

export interface Printer {
  id: string;
  workspace: string;
  name: string;
  model: string;
  active: boolean;
  avatar: string;
}

export interface PrintCard {
  id: string;
  workspace: string;
  milestone: string;
  product: string;
  component: string;
  filament: string;
  printer: string;
  name: string;
  kind: PartKind;
  column: ColumnId;
  quantity: number;
  gramsEach: number;
  minutesEach: number;
  priority: Priority;
  sequence: number;
  blocked: boolean;
  blockedReason: string;
  strategyNote: string;
  startedAt: string;
  colors: ColorUse[];
}

export interface PrintEvent {
  id: string;
  workspace: string;
  milestone: string;
  product: string;
  component: string;
  filament: string;
  card: string;
  printer: string;
  outcome: Outcome;
  pieces: number;
  gramsUsed: number;
  gramsWasted: number;
  cost: number;
  note: string;
  partName: string;
  productName: string;
  filamentLabel: string;
  created: string;
}

export interface Notice {
  id: string;
  workspace: string;
  kind: NotifyKind;
  title: string;
  body: string;
  read: boolean;
  dedupeKey: string;
  filament: string;
  milestone: string;
  created: string;
}

export interface FilamentInput {
  brand: string;
  material: Material;
  color: string;
  colorHex: string;
  remainingGrams: number;
  spoolGrams: number;
  pricePerKg: number;
  lowThresholdGrams: number;
  notes: string;
}

export interface PartInput {
  product: string;
  name: string;
  kind: PartKind;
  filament: string;
  grams: number;
  minutes: number;
  perProduct: number;
  version: string;
  colors: ColorUse[];
  printers: string[];
  photo?: File | null;
  clearPhoto?: boolean;
}

export interface PrinterInput {
  name: string;
  model: string;
  active: boolean;
  photo?: File | null;
  clearPhoto?: boolean;
}
