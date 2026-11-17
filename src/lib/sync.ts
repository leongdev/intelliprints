import { newId } from "./format";
import { pb } from "./pb";

const CLIENT_KEY = "intelliprints.client";

export function clientId() {
  const existing = sessionStorage.getItem(CLIENT_KEY);
  if (existing) return existing;
  const next = newId();
  sessionStorage.setItem(CLIENT_KEY, next);
  return next;
}

function statusOf(err: unknown) {
  if (typeof err === "object" && err && "status" in err) return (err as { status?: number }).status ?? 0;
  return 0;
}

export async function tryLock(workspace: string) {
  try {
    await pb.send("/api/intelliprints/lock", {
      method: "POST",
      body: { workspace, holder: clientId() },
    });
    return true;
  } catch (err) {
    if (statusOf(err) === 409) return false;
    throw err;
  }
}

export async function lock(workspace: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await tryLock(workspace)) return;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  throw new Error("Another screen is still saving. Try again in a moment.");
}

export async function unlock(workspace: string) {
  await pb.send("/api/intelliprints/unlock", {
    method: "POST",
    body: { workspace, holder: clientId() },
  });
}

export type CommitStep =
  | { op: "addGrams"; filament: string; remaining: number; spool: number }
  | { op: "claim"; id: string; expect: string; set: Record<string, string | number | boolean> }
  | { op: "patch"; id: string; expect: string[]; set: Record<string, string | number | boolean> }
  | { op: "take"; id: string; take: number; expect: string }
  | { op: "create"; collection: string; fields: Record<string, unknown> };

export async function commit(workspace: string, steps: CommitStep[]) {
  return pb.send<{ overdraw: number }>("/api/intelliprints/commit", {
    method: "POST",
    body: { workspace, steps },
  });
}
