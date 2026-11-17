import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RecordModel } from "pocketbase";
import { useAuth } from "./Auth";
import { plannedCardFields } from "../lib/cards";
import { cardUses, splitGrams } from "../lib/colors";
import { drawShares, sameColor } from "../lib/pools";
import { gramUnits, makeJoinCode, materialCost, newId, parsePbDate, roundGrams } from "../lib/format";
import { lineForPart, planPrints, sortCards, stockForPlanning, type PlanResult } from "../lib/logistics";
import { currentVersion, jobsFor } from "../lib/metrics";
import { buildSchedule } from "../lib/schedule";
import {
  mapCard,
  mapEvent,
  mapFilament,
  mapMember,
  mapMilestone,
  mapNotice,
  mapPart,
  mapPrinter,
  mapProduct,
  mapVersion,
  mapWorkspace,
} from "../lib/mappers";
import { errorMessage, pb, recordFileUrl } from "../lib/pb";
import { reconcile } from "../lib/reconcile";
import { commit, lock, tryLock, unlock } from "../lib/sync";
import { seedWorkshop } from "../lib/sample";
import type {
  ColorUse,
  Filament,
  FilamentInput,
  MemberProfile,
  Milestone,
  MilestoneSlice,
  Notice,
  Part,
  PartInput,
  PrintCard,
  PrintEvent,
  Printer,
  PrinterInput,
  Priority,
  Product,
  ProductVersion,
  User,
  Workspace,
} from "../types";

const STORAGE_KEY = "intelliprints.workspace.v2";
const HOME_WORKSHOP = "the droid foundry";

function orderWorkspaces(list: Workspace[]) {
  return [...list].sort((a, b) => {
    const rank = (name: string) => (name.trim().toLowerCase() === HOME_WORKSHOP ? 0 : 1);
    const byHome = rank(a.name) - rank(b.name);
    if (byHome !== 0) return byHome;
    return a.name.localeCompare(b.name);
  });
}
const LIVE = [
  "filaments",
  "products",
  "product_versions",
  "parts",
  "milestones",
  "print_cards",
  "print_events",
  "printers",
  "notifications",
  "member_profiles",
  "workspaces",
] as const;

interface Toast {
  id: string;
  text: string;
  tone: "info" | "good" | "bad";
}

interface WorkshopValue {
  ready: boolean;
  error: string;
  user: User;
  workspace: Workspace | null;
  workspaces: Workspace[];
  members: MemberProfile[];
  filaments: Filament[];
  products: Product[];
  versions: ProductVersion[];
  parts: Part[];
  milestones: Milestone[];
  cards: PrintCard[];
  events: PrintEvent[];
  printers: Printer[];
  notices: Notice[];
  unread: number;
  toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  refresh: () => Promise<void>;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string, currency: string) => Promise<void>;
  joinWorkspace: (code: string) => Promise<void>;
  leaveWorkspace: () => Promise<void>;
  deleteWorkspace: () => Promise<void>;
  updateWorkspace: (patch: { name?: string; currency?: string }) => Promise<void>;
  rotateJoinCode: () => Promise<void>;
  removeMember: (profile: MemberProfile) => Promise<void>;
  savePrinter: (input: PrinterInput, id?: string) => Promise<void>;
  deletePrinter: (id: string) => Promise<void>;
  saveFilament: (input: FilamentInput, id?: string) => Promise<void>;
  receiveFilament: (id: string, gramsIn: number) => Promise<void>;
  deleteFilament: (id: string) => Promise<void>;
  saveProduct: (input: { name: string; description: string; photo?: File | null; clearPhoto?: boolean }, id?: string) => Promise<string>;
  deleteProduct: (id: string) => Promise<void>;
  savePart: (input: PartInput, id?: string) => Promise<void>;
  deletePart: (id: string) => Promise<void>;
  ensureVersion: (productId: string) => Promise<string>;
  createVersion: (productId: string, sourceId: string, name: string) => Promise<string>;
  useVersion: (id: string) => Promise<void>;
  deleteVersion: (id: string) => Promise<void>;
  createMilestone: (input: { name: string; product: string; targetQty: number; notes: string; components: MilestoneSlice[] }) => Promise<PlanResult>;
  replanMilestone: (id: string) => Promise<PlanResult>;
  deleteMilestone: (id: string) => Promise<void>;
  startPrint: (card: PrintCard, printerId: string) => Promise<void>;
  scheduleCard: (card: PrintCard, printerId: string, start: number) => Promise<void>;
  cancelPrint: (card: PrintCard) => Promise<void>;
  finishPrint: (card: PrintCard, input: { piecesGood: number; gramsUsed: number; note: string }) => Promise<void>;
  undoDone: (card: PrintCard) => Promise<void>;
  failPrint: (
    card: PrintCard,
    input: { piecesGood: number; gramsWasted: number; gramsUsed: number; note: string },
  ) => Promise<void>;
  reprint: (card: PrintCard) => Promise<void>;
  splitCard: (card: PrintCard, take: number) => Promise<void>;
  deleteCard: (card: PrintCard) => Promise<void>;
  updateCard: (
    card: PrintCard,
    input: {
      name: string;
      quantity: number;
      minutesEach: number;
      gramsEach: number;
      priority: Priority;
      filament: string;
      colors: ColorUse[];
      printer: string;
    },
  ) => Promise<void>;
  freePrinters: (exceptCardId?: string) => Printer[];
  gramsFree: (filamentId: string, exceptCardId?: string) => number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadSample: () => Promise<void>;
}

class HandledError extends Error {}

async function renameOpenCards(componentId: string, name: string, list: PrintCard[]) {
  const related = list.filter((card) => card.component === componentId && card.column !== "done" && card.name !== name);
  await Promise.all(related.map((card) => pb.collection("print_cards").update(card.id, { name })));
}

const WorkshopContext = createContext<WorkshopValue | null>(null);

export function WorkshopProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const user = auth.user;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [versions, setVersions] = useState<ProductVersion[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [cards, setCards] = useState<PrintCard[]>([]);
  const [events, setEvents] = useState<PrintEvent[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const workspaceIdRef = useRef<string | null>(null);
  const lockGate = useRef({ pending: false, queued: false, settle: false });
  const holdingRef = useRef(false);
  const writeChain = useRef(Promise.resolve());

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = newId();
    setToasts((list) => [...list.slice(-4), { id, text, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const splittingRef = useRef(false);

  async function separatePlates(workspaceId: string, list: PrintCard[]) {
    const bundled = list.filter((card) => card.quantity > 1 && card.column !== "done");
    if (bundled.length === 0 || splittingRef.current) return list;
    splittingRef.current = true;
    try {
      for (const card of bundled) {
        const extra = Math.round(card.quantity) - 1;
        if (extra < 1) continue;
        await pb.collection("print_cards").update(card.id, { quantity: 1 });
        await Promise.all(
          Array.from({ length: extra }, () =>
            pb.collection("print_cards").create({
              workspace: workspaceId,
              milestone: card.milestone,
              product: card.product,
              component: card.component,
              ...(card.filament ? { filament: card.filament } : {}),
              ...(card.printer ? { printer: card.printer } : {}),
              ...(card.colors.length > 1 ? { colors: card.colors } : {}),
              name: card.name,
              kind: card.kind,
              column: card.column === "printing" ? "queue" : card.column,
              quantity: 1,
              gramsEach: card.gramsEach,
              minutesEach: card.minutesEach,
              priority: card.priority,
              sequence: card.sequence,
              blocked: card.column === "printing" ? false : card.blocked,
              blockedReason: card.column === "printing" ? "" : card.blockedReason,
              strategyNote: card.strategyNote,
            }),
          ),
        );
      }
      if (workspaceIdRef.current !== workspaceId) return list;
      const fresh = await pb.collection("print_cards").getFullList({ filter: `workspace = "${workspaceId}"` });
      return fresh.map(mapCard);
    } finally {
      splittingRef.current = false;
    }
  }

  const load = useCallback(async () => {
    if (!user) return null;
    const id = workspaceIdRef.current;
    if (!id) {
      setWorkspace(null);
      setReady(true);
      return null;
    }
    const filter = `workspace = "${id}"`;
    try {
      const [filamentRecs, productRecs, versionRecs, partRecs, milestoneRecs, cardRecs, eventRecs, printerRecs, noticeRecs, memberRecs, wsRec, wsList] =
        await Promise.all([
          pb.collection("filaments").getFullList({ filter, sort: "brand" }),
          pb.collection("products").getFullList({ filter, sort: "name" }),
          pb.collection("product_versions").getFullList({ filter, sort: "created" }),
          pb.collection("parts").getFullList({ filter, sort: "name" }),
          pb.collection("milestones").getFullList({ filter, sort: "-created" }),
          pb.collection("print_cards").getFullList({ filter }),
          pb.collection("print_events").getFullList({ filter, sort: "-created" }),
          pb.collection("printers").getFullList({ filter, sort: "name" }),
          pb.collection("notifications").getFullList({ filter, sort: "-created" }),
          pb.collection("member_profiles").getFullList({ filter, sort: "name" }),
          pb.collection("workspaces").getOne(id),
          pb.collection("workspaces").getFullList({ sort: "name" }),
        ]);
      if (workspaceIdRef.current !== id) return null;
      const nextFilaments = filamentRecs.map(mapFilament);
      const nextParts = partRecs.map(mapPart);
      const nextMilestones = milestoneRecs.map(mapMilestone);
      const nextCards = await separatePlates(id, cardRecs.map(mapCard));
      const nextEvents = eventRecs.map(mapEvent);
      setWorkspaces(orderWorkspaces(wsList.map(mapWorkspace)));
      setWorkspace(mapWorkspace(wsRec));
      setFilaments(nextFilaments);
      setProducts(productRecs.map(mapProduct));
      setVersions(versionRecs.map(mapVersion));
      setParts(nextParts);
      setMilestones(nextMilestones);
      setCards(nextCards);
      setEvents(nextEvents);
      setPrinters(printerRecs.map(mapPrinter));
      setNotices(noticeRecs.map(mapNotice));
      setMembers(memberRecs.map(mapMember));
      setError("");
      return {
        id,
        filaments: nextFilaments,
        parts: nextParts,
        milestones: nextMilestones,
        cards: nextCards,
        events: nextEvents,
      };
    } catch (err) {
      if (workspaceIdRef.current !== id) return null;
      setError(errorMessage(err));
      return null;
    } finally {
      if (workspaceIdRef.current === id) setReady(true);
    }
    return null;
  }, [user]);

  const loadRef = useRef(load);
  loadRef.current = load;

  const settleRef = useRef<
    (snapshot: {
      id: string;
      filaments: Filament[];
      parts: Part[];
      milestones: Milestone[];
      cards: PrintCard[];
      events: PrintEvent[];
    }) => Promise<void>
  >(async () => undefined);

  const refresh = useCallback(async (settleNow = false) => {
    if (lockGate.current.pending) {
      lockGate.current.queued = true;
      if (settleNow) lockGate.current.settle = true;
      return;
    }
    lockGate.current.pending = true;
    if (settleNow) lockGate.current.settle = true;
    try {
      do {
        const shouldSettle = lockGate.current.settle;
        lockGate.current.queued = false;
        lockGate.current.settle = false;
        const snapshot = await loadRef.current();
        if (shouldSettle && snapshot) await settleRef.current(snapshot);
      } while (lockGate.current.queued);
    } finally {
      lockGate.current.pending = false;
    }
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  settleRef.current = async (snapshot) => {
    const wrote = await reconcile(pb, {
      workspaceId: snapshot.id,
      filaments: snapshot.filaments,
      parts: snapshot.parts,
      milestones: snapshot.milestones,
      cards: snapshot.cards,
      events: snapshot.events,
    });
    if (!wrote || workspaceIdRef.current !== snapshot.id) return;
    const filter = `workspace = "${snapshot.id}"`;
    const [freshCards, freshMilestones, freshNotices] = await Promise.all([
      pb.collection("print_cards").getFullList({ filter }),
      pb.collection("milestones").getFullList({ filter, sort: "-created" }),
      pb.collection("notifications").getFullList({ filter, sort: "-created" }),
    ]);
    if (workspaceIdRef.current !== snapshot.id) return;
    setCards(freshCards.map(mapCard));
    setMilestones(freshMilestones.map(mapMilestone));
    setNotices(freshNotices.map(mapNotice));
  };

  const applyLive = useCallback((collection: string, action: string, record: RecordModel) => {
    const current = workspaceIdRef.current;
    if (!current) return;
    if (collection !== "workspaces" && record.workspace !== current) return;
    const patch = <T extends { id: string }>(setList: (update: (list: T[]) => T[]) => void, next: T) => {
      setList((list) => {
        if (action === "delete") return list.filter((item) => item.id !== next.id);
        const index = list.findIndex((item) => item.id === next.id);
        if (index < 0) return [...list, next];
        const copy = list.slice();
        copy[index] = next;
        return copy;
      });
    };
    if (collection === "parts") {
      const part = mapPart(record);
      patch(setParts, part);
      if (action !== "delete") {
        setCards((list) => list.map((card) => (card.component === part.id && card.column !== "done" ? { ...card, name: part.name } : card)));
      }
      return;
    }
    if (collection === "print_cards") patch(setCards, mapCard(record));
    else if (collection === "filaments") patch(setFilaments, mapFilament(record));
    else if (collection === "products") patch(setProducts, mapProduct(record));
    else if (collection === "product_versions") patch(setVersions, mapVersion(record));
    else if (collection === "milestones") patch(setMilestones, mapMilestone(record));
    else if (collection === "print_events") patch(setEvents, mapEvent(record));
    else if (collection === "printers") patch(setPrinters, mapPrinter(record));
    else if (collection === "notifications") patch(setNotices, mapNotice(record));
    else if (collection === "member_profiles") patch(setMembers, mapMember(record));
    else if (collection === "workspaces") {
      const next = mapWorkspace(record);
      setWorkspaces((list) => {
        const rest = list.filter((item) => item.id !== next.id);
        return orderWorkspaces(action === "delete" ? rest : [...rest, next]);
      });
      if (action !== "delete" && next.id === current) setWorkspace(next);
    }
  }, []);

  const applyRef = useRef(applyLive);
  applyRef.current = applyLive;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = orderWorkspaces((await pb.collection("workspaces").getFullList({ sort: "name" })).map(mapWorkspace));
        if (cancelled) return;
        setWorkspaces(list);
        const stored = localStorage.getItem(STORAGE_KEY);
        const pick =
          list.find((item) => item.name.trim().toLowerCase() === HOME_WORKSHOP) ??
          list.find((item) => item.id === stored) ??
          list[0] ??
          null;
        if (!pick) {
          workspaceIdRef.current = null;
          setWorkspaceId(null);
          setReady(true);
          return;
        }
        localStorage.setItem(STORAGE_KEY, pick.id);
        workspaceIdRef.current = pick.id;
        setWorkspaceId(pick.id);
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        void (async () => {
          await refreshRef.current(false);
          if (cancelled || holdingRef.current) return;
          const id = workspaceIdRef.current;
          if (!id) return;
          const got = await tryLock(id).catch(() => false);
          if (!got || cancelled || holdingRef.current) {
            if (got) await unlock(id).catch(() => undefined);
            return;
          }
          holdingRef.current = true;
          try {
            await refreshRef.current(true);
          } finally {
            holdingRef.current = false;
            await unlock(id).catch(() => undefined);
          }
        })();
      }, 220);
    };
    void refreshRef.current(false);
    for (const name of LIVE) {
      void pb.collection(name).subscribe("*", (event) => {
        applyRef.current(name, event.action, event.record);
        schedule();
      }).then((unsub) => {
        if (cancelled) unsub();
        else unsubs.push(unsub);
      });
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      for (const unsub of unsubs) unsub();
    };
  }, [workspaceId]);

  function raise(message: string): never {
    toast(message, "bad");
    throw new HandledError(message);
  }

  async function run<T>(action: () => Promise<T>) {
    const job = writeChain.current.then(async () => {
      const id = workspaceIdRef.current;
      let locked = false;
      try {
        if (id) {
          await lock(id);
          locked = true;
          holdingRef.current = true;
        }
        const result = await action();
        await refresh(true);
        return result;
      } finally {
        holdingRef.current = false;
        if (locked && id) await unlock(id).catch(() => undefined);
      }
    });
    writeChain.current = job.then(
      () => undefined,
      () => undefined,
    );
    return job.catch((err: unknown) => {
      if (!(err instanceof HandledError)) toast(errorMessage(err), "bad");
      throw err;
    });
  }

  function requireWorkspace() {
    const id = workspaceIdRef.current;
    const current = workspaces.find((item) => item.id === id) ?? workspace;
    if (!user || !id || !current) raise("Create or join a workshop first.");
    return { id, current, user };
  }

  function switchWorkspace(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    workspaceIdRef.current = id;
    setReady(false);
    setWorkspaceId(id);
  }

  async function createWorkspace(name: string, currency: string) {
    if (!user) raise("Sign in first.");
    const trimmed = name.trim();
    if (trimmed.length < 2) raise("Give the workshop a name.");
    return run(async () => {
      const code = makeJoinCode();
      const created = await pb.collection("workspaces").create({
        name: trimmed,
        owner: user.id,
        members: [user.id],
        joinCode: code,
        currency: currency || "USD",
      });
      await pb.collection("member_profiles").create({
        workspace: created.id,
        user: user.id,
        email: user.email,
        name: user.name || user.email,
        role: "owner",
      });
      await pb.collection("printers").create({
        workspace: created.id,
        name: "Printer 1",
        model: "",
        active: true,
      });
      localStorage.setItem(STORAGE_KEY, created.id);
      workspaceIdRef.current = created.id;
      setWorkspaceId(created.id);
    });
  }

  async function joinWorkspace(code: string) {
    return run(async () => {
      const result = await pb.send<{ workspaceId: string }>("/api/intelliprints/join", {
        method: "POST",
        body: { code: code.trim().toUpperCase() },
      });
      localStorage.setItem(STORAGE_KEY, result.workspaceId);
      workspaceIdRef.current = result.workspaceId;
      setWorkspaceId(result.workspaceId);
    });
  }

  async function leaveWorkspace() {
    const { id } = requireWorkspace();
    try {
      await pb.send("/api/intelliprints/leave", { method: "POST", body: { workspace: id } });
    } catch (err) {
      if (!(err instanceof HandledError)) toast(errorMessage(err), "bad");
      throw err;
    }
    const list = orderWorkspaces((await pb.collection("workspaces").getFullList({ sort: "name" })).map(mapWorkspace));
    setWorkspaces(list);
    const next = list.find((item) => item.name.trim().toLowerCase() === HOME_WORKSHOP) ?? list[0] ?? null;
    localStorage.setItem(STORAGE_KEY, next?.id ?? "");
    workspaceIdRef.current = next?.id ?? null;
    setWorkspace(null);
    setWorkspaceId(next?.id ?? null);
    if (!next) setReady(true);
    toast("You left the workshop.", "info");
  }

  async function deleteWorkspace() {
    const { id, current, user: actor } = requireWorkspace();
    if (current.owner !== actor.id) raise("Only the owner can delete the workshop.");
    try {
      await pb.collection("workspaces").delete(id);
      const list = orderWorkspaces((await pb.collection("workspaces").getFullList({ sort: "name" })).map(mapWorkspace));
      setWorkspaces(list);
      const next = list.find((item) => item.name.trim().toLowerCase() === HOME_WORKSHOP) ?? list[0] ?? null;
      workspaceIdRef.current = next?.id ?? null;
      if (next) localStorage.setItem(STORAGE_KEY, next.id);
      else localStorage.removeItem(STORAGE_KEY);
      setWorkspace(null);
      setWorkspaceId(next?.id ?? null);
      if (!next) setReady(true);
      toast("Workshop deleted.", "info");
    } catch (err) {
      toast(errorMessage(err), "bad");
      throw err;
    }
  }

  async function updateWorkspace(patch: { name?: string; currency?: string }) {
    const { id } = requireWorkspace();
    await run(() => pb.collection("workspaces").update(id, patch));
  }

  async function rotateJoinCode() {
    const { id } = requireWorkspace();
    await run(() => pb.collection("workspaces").update(id, { joinCode: makeJoinCode() }));
  }

  async function removeMember(profile: MemberProfile) {
    const { id, current } = requireWorkspace();
    if (profile.user === current.owner) raise("The owner stays on the workshop.");
    await run(async () => {
      await pb.collection("workspaces").update(id, {
        members: current.members.filter((memberId) => memberId !== profile.user),
      });
      await pb.collection("member_profiles").delete(profile.id);
    });
  }

  async function savePrinter(input: PrinterInput, id?: string) {
    const { id: ws } = requireWorkspace();
    const name = input.name.trim();
    if (!name) raise("Name the printer.");
    const body = new FormData();
    body.set("name", name);
    body.set("model", input.model.trim());
    body.set("active", input.active ? "true" : "false");
    body.set("workspace", ws);
    if (input.photo) body.set("avatar", input.photo);
    else if (input.clearPhoto) body.set("avatar", "");
    await run(() => (id ? pb.collection("printers").update(id, body) : pb.collection("printers").create(body)));
  }

  async function deletePrinter(id: string) {
    if (cards.some((card) => card.printer === id && card.column === "printing")) {
      raise("That printer is running a job.");
    }
    await run(() => pb.collection("printers").delete(id));
  }

  async function saveFilament(input: FilamentInput, id?: string) {
    const { id: ws } = requireWorkspace();
    if (!input.brand.trim() || !input.color.trim()) raise("Brand and color are required.");
    if (input.remainingGrams < 0 || input.spoolGrams <= 0) raise("Enter the grams on the spool.");
    const body = {
      ...input,
      brand: input.brand.trim(),
      color: input.color.trim(),
      notes: input.notes.trim(),
      remainingGrams: roundGrams(input.remainingGrams),
      spoolGrams: roundGrams(input.spoolGrams),
      pricePerKg: input.pricePerKg,
      lowThresholdGrams: roundGrams(input.lowThresholdGrams),
      workspace: ws,
    };
    await run(() => (id ? pb.collection("filaments").update(id, body) : pb.collection("filaments").create(body)));
  }

  async function receiveFilament(id: string, gramsIn: number) {
    if (gramsIn <= 0) raise("Enter the grams you received.");
    const filament = filaments.find((item) => item.id === id);
    if (!filament) raise("That spool is gone.");
    const grams = roundGrams(gramsIn);
    await run(() => commit(filament.workspace, [{ op: "addGrams", filament: id, remaining: grams, spool: grams }]));
  }

  async function deleteFilament(id: string) {
    if (parts.some((part) => part.filament === id || part.colors.some((use) => use.filament === id))) {
      raise("A part still uses this spool. Point that part at another filament first.");
    }
    if (cards.some((card) => card.column !== "done" && (card.filament === id || card.colors.some((use) => use.filament === id)))) {
      raise("This spool is still on an open kanban card.");
    }
    await run(() => pb.collection("filaments").delete(id));
  }

  async function saveProduct(
    input: { name: string; description: string; photo?: File | null; clearPhoto?: boolean },
    id?: string,
  ) {
    const { id: ws } = requireWorkspace();
    const name = input.name.trim();
    if (!name) raise("Name the product.");
    let savedId = id ?? "";
    await run(async () => {
      const body = new FormData();
      body.set("workspace", ws);
      body.set("name", name);
      body.set("description", input.description.trim());
      if (input.photo) body.set("photo", input.photo);
      else if (input.clearPhoto) body.set("photo", "");
      const record = id ? await pb.collection("products").update(id, body) : await pb.collection("products").create(body);
      savedId = record.id;
    });
    return savedId;
  }

  async function deleteProduct(id: string) {
    if (milestones.some((milestone) => milestone.product === id)) {
      raise("Delete this product's milestones first.");
    }
    const mine = parts.filter((part) => part.product === id);
    await run(async () => {
      for (const part of mine) await pb.collection("parts").delete(part.id);
      await pb.collection("products").delete(id);
    });
  }

  async function savePart(input: PartInput, id?: string) {
    const { id: ws } = requireWorkspace();
    if (!input.name.trim()) raise("Name the part.");
    const slots = input.colors
      .map((use, index) => ({ slot: use.slot || String.fromCharCode(65 + index), grams: roundGrams(use.grams) }))
      .filter((slot) => slot.grams > 0);
    if (slots.length < 1) raise("Add at least one color and its grams.");
    const slotNames = new Set<string>();
    for (const slot of slots) {
      if (slotNames.has(slot.slot)) raise("Each color slot can only be listed once.");
      slotNames.add(slot.slot);
    }
    const filament = "";
    const grams = roundGrams(slots.reduce((sum, slot) => sum + slot.grams, 0));
    if (grams <= 0 || input.minutes <= 0 || input.perProduct < 1) {
      raise("Grams, minutes, and how many per product all need to be above zero.");
    }
    if (!input.version) raise("Save the product version first.");
    const name = input.name.trim();
    const perProduct = Math.round(input.perProduct);
    const previousParts = parts;
    const previousCards = cards;
    if (id) {
      setParts((list) =>
        list.map((part) =>
          part.id === id
            ? {
                ...part,
                product: input.product,
                name,
                kind: input.kind,
                filament,
                grams,
                colors: slots.map((slot) => ({ slot: slot.slot, filament: "", grams: slot.grams })),
                minutes: input.minutes,
                perProduct,
                version: input.version,
                printers: input.printers,
                photo: input.clearPhoto && !input.photo ? "" : part.photo,
              }
            : part,
        ),
      );
      setCards((list) => list.map((card) => (card.component === id && card.column !== "done" ? { ...card, name } : card)));
    }
    const body = new FormData();
    body.set("workspace", ws);
    body.set("product", input.product);
    body.set("name", name);
    body.set("kind", input.kind);
    body.set("filament", "");
    body.set("grams", String(grams));
    body.set("colors", JSON.stringify(slots.map((slot) => ({ slot: slot.slot, grams: slot.grams }))));
    body.set("minutes", String(input.minutes));
    body.set("perProduct", String(perProduct));
    body.set("version", input.version);
    body.set("printers", JSON.stringify([...new Set(input.printers.filter((id) => id.length > 0))]));
    if (input.photo) body.set("photo", input.photo);
    else if (input.clearPhoto) body.set("photo", "");
    try {
      await run(async () => {
        if (!id) {
          await pb.collection("parts").create(body);
          return;
        }
        await pb.collection("parts").update(id, body);
        await renameOpenCards(id, name, previousCards);
      });
    } catch (err) {
      if (id) {
        setParts(previousParts);
        setCards(previousCards);
      }
      throw err;
    }
  }

  async function deletePart(id: string) {
    if (cards.some((card) => card.component === id)) {
      raise("This part is on the print board. Delete or finish that milestone first.");
    }
    await run(() => pb.collection("parts").delete(id));
  }

  async function ensureVersion(productId: string) {
    const { id: ws } = requireWorkspace();
    const existing = currentVersion(versions, productId);
    if (existing) return existing.id;
    let createdId = "";
    await run(async () => {
      const record = await pb.collection("product_versions").create({
        workspace: ws,
        product: productId,
        name: "v1",
        notes: "",
        active: true,
      });
      createdId = record.id;
      const untagged = parts.filter((part) => part.product === productId && !part.version);
      for (const part of untagged) await pb.collection("parts").update(part.id, { version: record.id });
    });
    return createdId;
  }

  async function createVersion(productId: string, sourceId: string, name: string) {
    const { id: ws } = requireWorkspace();
    const trimmed = name.trim();
    if (!trimmed) raise("Name the version.");
    const siblings = versions.filter((version) => version.product === productId);
    if (siblings.some((version) => version.name.toLowerCase() === trimmed.toLowerCase())) {
      raise("A version with that name already exists.");
    }
    const source = parts.filter((part) => part.version === sourceId);
    let createdId = "";
    await run(async () => {
      for (const sibling of siblings) {
        if (sibling.active) await pb.collection("product_versions").update(sibling.id, { active: false });
      }
      const record = await pb.collection("product_versions").create({
        workspace: ws,
        product: productId,
        name: trimmed,
        notes: "",
        active: true,
      });
      createdId = record.id;
      for (const part of source) {
        const body = new FormData();
        body.set("workspace", ws);
        body.set("product", productId);
        body.set("version", record.id);
        body.set("name", part.name);
        body.set("kind", part.kind);
        body.set("grams", String(part.grams));
        body.set(
          "colors",
          JSON.stringify(
            (part.colors.length > 0 ? part.colors : [{ slot: "A", grams: part.grams }]).map((use, index) => ({
              slot: use.slot || String.fromCharCode(65 + index),
              grams: use.grams,
            })),
          ),
        );
        body.set("minutes", String(part.minutes));
        body.set("perProduct", String(part.perProduct));
        body.set("printers", JSON.stringify(part.printers));
        if (part.photo) {
          try {
            const response = await fetch(recordFileUrl("parts", part.id, part.photo));
            if (response.ok) {
              const blob = await response.blob();
              body.set("photo", new File([blob], part.photo, { type: blob.type || "image/png" }));
            }
          } catch {
            // Grams, time, and the component list still copy.
          }
        }
        await pb.collection("parts").create(body);
      }
    });
    return createdId;
  }

  async function useVersion(id: string) {
    const version = versions.find((item) => item.id === id);
    if (!version) raise("That version is gone.");
    if (version.active) return;
    await run(async () => {
      for (const sibling of versions) {
        if (sibling.product === version.product && sibling.active && sibling.id !== id) {
          await pb.collection("product_versions").update(sibling.id, { active: false });
        }
      }
      await pb.collection("product_versions").update(id, { active: true });
    });
  }

  async function deleteVersion(id: string) {
    const version = versions.find((item) => item.id === id);
    if (!version) return;
    const siblings = versions.filter((item) => item.product === version.product && item.id !== id);
    if (siblings.length === 0) raise("Keep at least one version of this product.");
    const mine = parts.filter((part) => part.version === id);
    if (milestones.some((milestone) => milestone.version === id) || mine.some((part) => cards.some((card) => card.component === part.id))) {
      raise("This version is on a milestone. Delete that milestone before the version.");
    }
    await run(async () => {
      await pb.collection("product_versions").delete(id);
      if (version.active) {
        const fallback = siblings.sort((a, b) => a.created.localeCompare(b.created)).at(-1);
        if (fallback) await pb.collection("product_versions").update(fallback.id, { active: true });
      }
    });
  }

  function linesFor(
    productId: string,
    versionId: string,
    targetQty: number,
    alreadyGood: Map<string, number>,
    printing: Map<string, number>,
    components: MilestoneSlice[] = [],
  ) {
    const caps = new Map(components.filter((item) => item.id && item.jobs > 0).map((item) => [item.id, item.jobs]));
    return parts
      .filter((part) => part.product === productId && (!versionId || part.version === versionId))
      .filter((part) => caps.size === 0 || caps.has(part.id))
      .map((part) => {
        const cap = caps.get(part.id) ?? jobsFor(part, targetQty);
        return lineForPart(part, Math.max(0, cap - (alreadyGood.get(part.id) ?? 0) - (printing.get(part.id) ?? 0)));
      })
      .filter((line) => line.piecesNeeded > 0);
  }

  async function createMilestone(input: { name: string; product: string; targetQty: number; notes: string; components: MilestoneSlice[] }) {
    const { id: ws } = requireWorkspace();
    const name = input.name.trim();
    const product = products.find((item) => item.id === input.product);
    if (!product) raise("Pick a product.");
    if (!name) raise("Name the milestone.");
    if (!Number.isInteger(input.targetQty) || input.targetQty < 1) {
      raise("Use a whole number of products.");
    }
    const version = currentVersion(versions, product.id);
    const productParts = parts.filter((part) => part.product === product.id && (!version || part.version === version.id));
    if (productParts.length === 0) raise("Add at least one part before planning this product.");
    const stored = input.components.filter((item) => item.jobs > 0 && productParts.some((part) => part.id === item.id));
    if (input.components.length > 0 && stored.length === 0) raise("Keep at least one print.");
    return run(async () => {
      const milestone = await pb.collection("milestones").create({
        workspace: ws,
        product: product.id,
        name,
        targetQty: input.targetQty,
        status: "active",
        notes: input.notes.trim(),
        ...(version ? { version: version.id } : {}),
        ...(stored.length > 0 ? { components: stored } : {}),
      });
      const plan = planPrints(
        linesFor(product.id, version?.id ?? "", input.targetQty, new Map(), new Map(), stored),
        stockForPlanning(filaments, cards),
      );
      if (plan.cards.length === 0) {
        await pb.collection("milestones").delete(milestone.id);
        raise("Nothing to put on the board.");
      }
      await Promise.all(
        plan.cards.map((card) =>
          pb.collection("print_cards").create(plannedCardFields(ws, milestone.id, product.id, card)),
        ),
      );
      return plan;
    });
  }

  async function replanMilestone(id: string) {
    const { id: ws } = requireWorkspace();
    const milestone = milestones.find((item) => item.id === id);
    if (!milestone) raise("Milestone not found.");
    return run(async () => {
      const doomed = cards.filter(
        (card) => card.milestone === id && (card.column === "queue" || card.column === "failed"),
      );
      const remembered = new Map<string, PrintCard>();
      for (const card of doomed) {
        if (card.filament || card.colors.length > 1) remembered.set(card.component, card);
      }
      for (const card of doomed) await pb.collection("print_cards").delete(card.id);
      const kept = cards.filter((card) => !doomed.some((item) => item.id === card.id));
      const good = new Map<string, number>();
      for (const event of events) {
        if (event.milestone !== id || event.outcome !== "success") continue;
        good.set(event.component, (good.get(event.component) ?? 0) + event.pieces);
      }
      const printing = new Map<string, number>();
      for (const card of kept) {
        if (card.milestone !== id || card.column !== "printing") continue;
        printing.set(card.component, (printing.get(card.component) ?? 0) + card.quantity);
      }
      const lines = linesFor(milestone.product, milestone.version, milestone.targetQty, good, printing, milestone.components);
      if (lines.length === 0) {
        return {
          cards: [],
          spools: [],
          changeovers: 0,
          notes: ["Everything left is already on a printer or finished."],
        } satisfies PlanResult;
      }
      const plan = planPrints(lines, stockForPlanning(filaments, kept));
      await Promise.all(
        plan.cards.map((card) => {
          const previous = remembered.get(card.componentId);
          const kept =
            previous && (previous.filament || previous.colors.length > 1)
              ? {
                  ...card,
                  filamentId: previous.filament,
                  gramsEach: previous.gramsEach,
                  colors: previous.colors,
                  blocked: false,
                  blockedReason: "",
                }
              : card;
          return pb.collection("print_cards").create(plannedCardFields(ws, milestone.id, milestone.product, kept));
        }),
      );
      return plan;
    });
  }

  async function deleteMilestone(id: string) {
    const related = notices.filter((notice) => notice.milestone === id);
    await run(async () => {
      for (const notice of related) await pb.collection("notifications").delete(notice.id);
      await pb.collection("milestones").delete(id);
    });
  }

  function printerFits(card: PrintCard, printerId: string) {
    const part = parts.find((item) => item.id === card.component);
    const allowed = part?.printers.filter((id) => id.length > 0) ?? [];
    return allowed.length === 0 || allowed.includes(printerId);
  }

  function freePrinters(exceptCardId?: string) {
    return printers.filter((printer) => {
      if (!printer.active) return false;
      return !cards.some(
        (card) => card.column === "printing" && card.printer === printer.id && card.id !== exceptCardId,
      );
    });
  }

  function gramsFree(filamentId: string, exceptCardId?: string) {
    const mates = sameColor(filaments, filamentId);
    if (mates.length === 0) return 0;
    const ids = new Set(mates.map((item) => item.id));
    const onHand = mates.reduce((sum, item) => sum + item.remainingGrams, 0);
    const reserved = cards
      .filter((card) => card.column === "printing" && card.id !== exceptCardId)
      .reduce((sum, card) => {
        const use = cardUses(card).find((item) => ids.has(item.filament));
        return use ? sum + card.quantity * use.grams : sum;
      }, 0);
    return onHand - reserved;
  }

  async function startPrint(card: PrintCard, printerId: string) {
    if (card.blocked) raise(card.blockedReason || "Restock filament before starting this plate.");
    const printer = printers.find((item) => item.id === printerId);
    if (!printer?.active) raise("Pick an active printer.");
    if (!printerFits(card, printerId)) raise(`${printer.name} is not allowed to print this plate.`);
    if (cards.some((item) => item.column === "printing" && item.printer === printerId && item.id !== card.id)) {
      raise(`${printer.name} already has a job.`);
    }
    const uses = cardUses(card);
    if (uses.length === 0) raise(card.colors.length > 1 ? card.blockedReason || "Assign a filament to each color." : "Assign a filament to Color A.");
    for (const use of uses) {
      const filament = filaments.find((item) => item.id === use.filament);
      if (!filament) raise("The filament for this plate is missing.");
      const free = gramsFree(use.filament, card.id);
      const need = card.quantity * use.grams;
      if (gramUnits(free) < gramUnits(need)) {
        const mates = sameColor(filaments, use.filament);
        const pile = mates.length > 1 ? ` across ${mates.length} spools` : "";
        raise(`Only ${roundGrams(Math.max(0, free))} g of ${filament.color} ${filament.material} is free${pile}.`);
      }
    }
    await run(() =>
      commit(card.workspace, [
        {
          op: "claim",
          id: card.id,
          expect: card.column,
          set: {
            column: "printing",
            printer: printerId,
            startedAt: new Date().toISOString(),
            blocked: false,
            blockedReason: "",
          },
        },
      ]),
    );
  }

  async function scheduleCard(card: PrintCard, printerId: string, start: number) {
    if (card.column !== "queue" && card.column !== "printing") return;
    const machine = printers.find((item) => item.id === printerId);
    if (!machine) raise("That printer is no longer in the workshop.");
    if (!printerFits(card, printerId)) raise(`${machine.name} is not allowed to print this plate.`);
    if (
      card.column === "printing" &&
      cards.some((item) => item.column === "printing" && item.printer === printerId && item.id !== card.id)
    ) {
      raise(`${machine.name} already has a job.`);
    }
    const startedAt = new Date(start).toISOString();
    const draft = cards.map((item) => (item.id === card.id ? { ...item, printer: printerId, startedAt } : item));
    const planned = buildSchedule(draft, printers, Date.now(), card.id, parts);
    const updates: Array<{ id: string; printer: string; startedAt: string }> = [];
    for (const slot of planned.slots) {
      const current = cards.find((item) => item.id === slot.card.id);
      if (!current || (current.column !== "queue" && current.column !== "printing")) continue;
      const moved = current.id === card.id;
      if (!moved && !current.startedAt) continue;
      const nextStart = new Date(slot.start).toISOString();
      const previous = parsePbDate(current.startedAt)?.getTime();
      const sameTime = previous != null && Math.abs(previous - slot.start) < 1000;
      const samePrinter = current.printer === slot.printerId;
      if (!moved && sameTime && samePrinter) continue;
      if (moved && sameTime && current.printer === printerId && slot.printerId === printerId) continue;
      updates.push({ id: current.id, printer: slot.printerId, startedAt: nextStart });
    }
    if (updates.length === 0) return;
    const previousCards = cards;
    setCards((list) =>
      list.map((item) => {
        const update = updates.find((entry) => entry.id === item.id);
        return update ? { ...item, printer: update.printer, startedAt: update.startedAt } : item;
      }),
    );
    try {
      await run(() =>
        commit(
          card.workspace,
          updates.map((update) => ({
            op: "patch" as const,
            id: update.id,
            expect: ["queue", "printing"],
            set: { printer: update.printer, startedAt: update.startedAt },
          })),
        ),
      );
    } catch (err) {
      setCards(previousCards);
      throw err;
    }
  }

  async function cancelPrint(card: PrintCard) {
    await run(() =>
      commit(card.workspace, [
        { op: "claim", id: card.id, expect: "printing", set: { column: "queue", printer: "" } },
      ]),
    );
  }

  async function reprint(card: PrintCard) {
    await run(() =>
      commit(card.workspace, [
        {
          op: "claim",
          id: card.id,
          expect: card.column,
          set: { column: "queue", printer: "", blocked: false, blockedReason: "" },
        },
      ]),
    );
  }

  function noteOverdraw(overdraw: number) {
    if (gramUnits(overdraw) <= 0) return;
    toast(
      `The spool record hit 0 g and is still ${roundGrams(overdraw)} g short of what you logged. Correct the count if the roll was heavier.`,
      "bad",
    );
  }

  function eventBody(
    card: PrintCard,
    filament: Filament,
    outcome: "success" | "failed",
    pieces: number,
    gramsUsed: number,
    gramsWasted: number,
    note: string,
    costShares: { filament: string; grams: number }[],
  ) {
    const product = products.find((item) => item.id === card.product);
    return {
      workspace: card.workspace,
      milestone: card.milestone,
      product: card.product,
      component: card.component,
      filament: card.filament,
      card: card.id,
      ...(card.printer ? { printer: card.printer } : {}),
      outcome,
      pieces,
      gramsUsed: roundGrams(gramsUsed),
      gramsWasted: roundGrams(gramsWasted),
      cost: costShares.reduce((sum, share) => {
        const spool = filaments.find((item) => item.id === share.filament);
        return sum + (spool ? materialCost(share.grams, spool.pricePerKg) : 0);
      }, 0),
      note: note.trim(),
      partName: card.name,
      productName: product?.name ?? "",
      filamentLabel:
        card.colors.length > 1
          ? cardUses(card)
              .map((use) => filaments.find((item) => item.id === use.filament)?.color ?? "")
              .filter(Boolean)
              .join(", ")
              .slice(0, 160)
          : `${filament.brand} ${filament.material} ${filament.color}`.trim(),
    };
  }

  async function finishPrint(card: PrintCard, input: { piecesGood: number; gramsUsed: number; note: string }) {
    const piecesGood = Math.round(input.piecesGood);
    if (!Number.isInteger(piecesGood) || piecesGood < 1 || piecesGood > card.quantity) {
      raise(`Enter between 1 and ${card.quantity} good pieces.`);
    }
    if (input.gramsUsed < 0) raise("Grams used can't be negative.");
    const leftover = card.quantity - piecesGood;
    const filament = filaments.find((item) => item.id === card.filament);
    if (!filament || cardUses(card).some((use) => !filaments.some((item) => item.id === use.filament))) {
      raise("The filament for this plate is missing.");
    }
    const drawn = drawShares(
      filaments.map((item) => ({ ...item })),
      splitGrams(roundGrams(input.gramsUsed), cardUses(card)),
    );
    await run(async () => {
      const steps: Parameters<typeof commit>[1] = [
        {
          op: "claim",
          id: card.id,
          expect: card.column,
          set:
            leftover <= 0
              ? { column: "done", quantity: piecesGood, blocked: false, blockedReason: "" }
              : { column: "queue", quantity: leftover, printer: "", blocked: false, blockedReason: "" },
        },
        ...drawn.map((share) => ({ op: "addGrams" as const, filament: share.filament, remaining: -share.grams, spool: 0 })),
        { op: "create", collection: "print_events", fields: eventBody(card, filament, "success", piecesGood, input.gramsUsed, 0, input.note, drawn) },
      ];
      if (leftover > 0) {
        steps.push({
          op: "create",
          collection: "print_cards",
          fields: {
            milestone: card.milestone,
            product: card.product,
            component: card.component,
            filament: card.filament,
            ...(card.colors.length > 1 ? { colors: card.colors } : {}),
            name: card.name,
            kind: card.kind,
            column: "done",
            quantity: piecesGood,
            gramsEach: card.gramsEach,
            minutesEach: card.minutesEach,
            priority: card.priority,
            sequence: card.sequence,
            blocked: false,
            blockedReason: "",
            strategyNote: "Finished pieces split off this job.",
          },
        });
      }
      const saved = await commit(card.workspace, steps);
      noteOverdraw(saved.overdraw);
    });
  }

  async function undoDone(card: PrintCard) {
    if (card.column !== "done") raise("That plate is not finished.");
    await run(async () => {
      const logged = await pb.collection("print_events").getFullList({ filter: `card = "${card.id}" && outcome = "success"` });
      const uses = cardUses(card);
      for (const event of logged) {
        const gramsUsed = roundGrams(Number(event.gramsUsed) || 0);
        const filamentId = typeof event.filament === "string" ? event.filament : "";
        const shares = uses.length > 0 ? splitGrams(gramsUsed, uses) : filamentId ? [{ filament: filamentId, grams: gramsUsed }] : [];
        for (const share of shares) {
          if (share.grams <= 0 || !share.filament) continue;
          let spool;
          try {
            spool = await pb.collection("filaments").getOne(share.filament);
          } catch {
            continue;
          }
          await pb.collection("filaments").update(share.filament, {
            remainingGrams: roundGrams(Number(spool.remainingGrams) + share.grams),
          });
        }
        await pb.collection("print_events").delete(event.id);
      }
      await pb.collection("print_cards").update(card.id, {
        column: "queue",
        startedAt: null,
        blocked: false,
        blockedReason: "",
      });
    });
    toast(`${card.name} is back in the queue.`, "good");
  }

  async function failPrint(
    card: PrintCard,
    input: { piecesGood: number; gramsWasted: number; gramsUsed: number; note: string },
  ) {
    const piecesGood = Math.round(input.piecesGood);
    if (piecesGood < 0 || piecesGood >= card.quantity) {
      raise("Salvaged pieces have to be fewer than the whole job. Use Finish if they all came out.");
    }
    if (input.gramsWasted < 0 || input.gramsUsed < 0) raise("Grams can't be negative.");
    const failedPieces = card.quantity - piecesGood;
    const filament = filaments.find((item) => item.id === card.filament);
    if (!filament || cardUses(card).some((use) => !filaments.some((item) => item.id === use.filament))) {
      raise("The filament for this plate is missing.");
    }
    await run(async () => {
      const steps: Parameters<typeof commit>[1] = [
        {
          op: "claim",
          id: card.id,
          expect: card.column,
          set: { column: "failed", quantity: failedPieces, blocked: false, blockedReason: "" },
        },
      ];
      const scratch = filaments.map((item) => ({ ...item }));
      const used = drawShares(scratch, splitGrams(roundGrams(input.gramsUsed), cardUses(card)));
      const wasted = drawShares(scratch, splitGrams(roundGrams(input.gramsWasted), cardUses(card)));
      const spent = new Map<string, number>();
      for (const share of [...used, ...wasted]) spent.set(share.filament, roundGrams((spent.get(share.filament) ?? 0) + share.grams));
      for (const [id, gramsUsed] of spent) {
        if (gramsUsed > 0) steps.push({ op: "addGrams", filament: id, remaining: -gramsUsed, spool: 0 });
      }
      if (input.gramsWasted > 0 || failedPieces > 0) {
        steps.push({
          op: "create",
          collection: "print_events",
          fields: eventBody(card, filament, "failed", failedPieces, 0, input.gramsWasted, input.note, wasted),
        });
      }
      if (piecesGood > 0) {
        steps.push({
          op: "create",
          collection: "print_events",
          fields: eventBody(card, filament, "success", piecesGood, input.gramsUsed, 0, input.note, used),
        });
        steps.push({
          op: "create",
          collection: "print_cards",
          fields: {
            milestone: card.milestone,
            product: card.product,
            component: card.component,
            filament: card.filament,
            ...(card.colors.length > 1 ? { colors: card.colors } : {}),
            name: card.name,
            kind: card.kind,
            column: "done",
            quantity: piecesGood,
            gramsEach: card.gramsEach,
            minutesEach: card.minutesEach,
            priority: card.priority,
            sequence: card.sequence,
            blocked: false,
            blockedReason: "",
            strategyNote: "Salvaged from a failed plate.",
          },
        });
      }
      const saved = await commit(card.workspace, steps);
      noteOverdraw(saved.overdraw);
    });
  }

  async function deleteCard(card: PrintCard) {
    await run(async () => {
      const linked = await pb.collection("print_events").getFullList({ filter: `card = "${card.id}"` });
      for (const event of linked) await pb.collection("print_events").update(event.id, { card: null });
      await pb.collection("print_cards").delete(card.id);
    });
    toast(`${card.name} removed.`, "good");
  }

  async function updateCard(
    card: PrintCard,
    input: {
      name: string;
      quantity: number;
      minutesEach: number;
      gramsEach: number;
      priority: Priority;
      filament: string;
      colors: ColorUse[];
      printer: string;
    },
  ) {
    const name = input.name.trim();
    const quantity = Math.round(input.quantity);
    if (!name) raise("Name the job.");
    const minutesEach = Math.round(input.minutesEach);
    const colors = input.colors.length > 1 ? input.colors.map((use, index) => ({ slot: use.slot || String.fromCharCode(65 + index), filament: use.filament, grams: roundGrams(use.grams) })) : [];
    if (colors.length > 1) {
      const seen = new Set<string>();
      for (const use of colors) {
        if (seen.has(use.filament)) raise("Each color uses one spool.");
        seen.add(use.filament);
        if (!filaments.some((item) => item.id === use.filament)) raise("Pick a spool.");
        if (!(use.grams > 0)) raise("Enter the grams for each color.");
      }
    } else if (!filaments.some((item) => item.id === input.filament)) raise("Pick a spool.");
    const filament = colors[0]?.filament ?? input.filament;
    const gramsEach = colors.length > 1 ? roundGrams(colors.reduce((sum, use) => sum + use.grams, 0)) : roundGrams(input.gramsEach);
    if (!Number.isInteger(quantity) || quantity < 1) raise("Quantity has to be at least 1.");
    if (!Number.isFinite(input.minutesEach) || minutesEach < 1) raise("Enter the minutes for one piece.");
    if (!Number.isFinite(gramsEach) || gramsEach <= 0) raise("Enter the grams for one piece.");
    const printer = input.printer;
    if (card.column === "printing" && !printer) raise("A running job stays on a printer.");
    if (printer && printer !== card.printer && !printerFits(card, printer)) {
      const machine = printers.find((item) => item.id === printer);
      raise(`${machine?.name || "That printer"} is not allowed to print this plate.`);
    }
    if (
      printer &&
      printer !== card.printer &&
      cards.some((item) => item.column === "printing" && item.printer === printer && item.id !== card.id)
    ) {
      const machine = printers.find((item) => item.id === printer);
      raise(`${machine?.name || "That printer"} already has a job.`);
    }
    const part = parts.find((item) => item.id === card.component);
    const previousParts = parts;
    const previousCards = cards;
    setCards((list) =>
      list.map((item) => {
        if (item.id === card.id) {
          return { ...item, name, quantity, minutesEach, gramsEach, priority: input.priority, filament, colors, printer };
        }
        return part && item.component === part.id && item.column !== "done" ? { ...item, name } : item;
      }),
    );
    if (part && part.name !== name) setParts((list) => list.map((item) => (item.id === part.id ? { ...item, name } : item)));
    try {
      await run(async () => {
        const ordered = sortCards(cards, card.column);
        const counts = new Map<number, number>();
        for (const item of ordered) counts.set(item.sequence, (counts.get(item.sequence) ?? 0) + 1);
        if ([...counts.values()].some((count) => count > 1)) {
          await Promise.all(
            ordered.map((item, index) => {
              const sequence = index + 1;
              if (item.sequence === sequence) return Promise.resolve();
              return pb.collection("print_cards").update(item.id, { sequence });
            }),
          );
        }
        await pb.collection("print_cards").update(card.id, {
          name,
          quantity,
          minutesEach,
          gramsEach,
          priority: input.priority,
          filament,
          colors,
          printer: printer || null,
        });
        if (part && part.name !== name) {
          await pb.collection("parts").update(part.id, { name });
          await renameOpenCards(part.id, name, previousCards);
        }
      });
    } catch (err) {
      setParts(previousParts);
      setCards(previousCards);
      throw err;
    }
  }

  async function splitCard(card: PrintCard, take: number) {
    const pieces = Math.round(take);
    if (card.column !== "queue") raise("Only queued jobs can be split across printers.");
    if (pieces < 1 || pieces >= card.quantity) raise("Leave at least one piece on each card.");
    await run(() =>
      commit(card.workspace, [
        { op: "take", id: card.id, take: pieces, expect: "queue" },
        {
          op: "create",
          collection: "print_cards",
          fields: {
            milestone: card.milestone,
            product: card.product,
            component: card.component,
            filament: card.filament,
            ...(card.colors.length > 1 ? { colors: card.colors } : {}),
            name: card.name,
            kind: card.kind,
            column: "queue",
            quantity: pieces,
            gramsEach: card.gramsEach,
            minutesEach: card.minutesEach,
            priority: card.priority,
            sequence: card.sequence,
            blocked: card.blocked,
            blockedReason: card.blockedReason,
            strategyNote: card.strategyNote,
          },
        },
      ]),
    );
  }

  async function markRead(id: string) {
    await run(() => pb.collection("notifications").update(id, { read: true }));
  }

  async function markAllRead() {
    const unread = notices.filter((notice) => !notice.read);
    if (unread.length === 0) return;
    await run(async () => {
      for (const notice of unread) await pb.collection("notifications").update(notice.id, { read: true });
    });
  }

  async function loadSample() {
    const { id } = requireWorkspace();
    await run(() => seedWorkshop(pb, id));
    toast("Sample shop is on the board. PETG is short on purpose.", "good");
  }

  if (!user) return null;

  const value: WorkshopValue = {
    ready,
    error,
    user,
    workspace,
    workspaces,
    members,
    filaments,
    products,
    versions,
    parts,
    milestones,
    cards: cards.map((card) => {
      if (card.column === "done") return card;
      const part = parts.find((item) => item.id === card.component);
      return part && part.name !== card.name ? { ...card, name: part.name } : card;
    }),
    events,
    printers,
    notices,
    unread: notices.filter((notice) => !notice.read).length,
    toasts,
    toast,
    dismissToast,
    refresh,
    switchWorkspace,
    createWorkspace,
    joinWorkspace,
    leaveWorkspace,
    deleteWorkspace,
    updateWorkspace,
    rotateJoinCode,
    removeMember,
    savePrinter,
    deletePrinter,
    saveFilament,
    receiveFilament,
    deleteFilament,
    saveProduct,
    deleteProduct,
    savePart,
    deletePart,
    ensureVersion,
    createVersion,
    useVersion,
    deleteVersion,
    createMilestone,
    replanMilestone,
    deleteMilestone,
    startPrint,
    scheduleCard,
    cancelPrint,
    finishPrint,
    undoDone,
    failPrint,
    reprint,
    splitCard,
    deleteCard,
    updateCard,
    freePrinters,
    gramsFree,
    markRead,
    markAllRead,
    loadSample,
  };

  return <WorkshopContext.Provider value={value}>{children}</WorkshopContext.Provider>;
}

export function useWorkshop() {
  const value = useContext(WorkshopContext);
  if (!value) throw new Error("useWorkshop must be used inside the workshop.");
  return value;
}

export function useShop() {
  const value = useWorkshop();
  if (!value.workspace) throw new Error("No workshop selected.");
  return value as WorkshopValue & { workspace: Workspace };
}
