import { useEffect, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Pencil, Play, Sparkles, Trash2 } from "lucide-react";
import { useShop } from "../context/Workshop";
import { Field, FormError, Modal, NumericInput, PrinterPhoto, ProductPhoto, Segment, submit } from "../components/ui";
import { cardUses, slotsForCard } from "../lib/colors";
import { colorGroups } from "../lib/pools";
import { duration, grams, parsePbDate, readDecimal, readWhole, roundGrams } from "../lib/format";
import { errorMessage, recordFileUrl } from "../lib/pb";
import { sortCards } from "../lib/logistics";
import { buildSchedule, printerFor, printerUnavailable, type ScheduleSlot } from "../lib/schedule";
import type { ColumnId, PrintCard, Priority } from "../types";
import { PRIORITIES } from "../types";
import { PrintTimeline } from "./PrintTimeline";

const COLUMNS: Array<{ id: ColumnId; label: string; hint: string }> = [
  { id: "queue", label: "Queue", hint: "Optimized order" },
  { id: "printing", label: "Printing", hint: "One job per machine" },
  { id: "done", label: "Done", hint: "Counted toward the milestone" },
  { id: "failed", label: "Failed", hint: "Waste already logged" },
];

export function Board() {
  const shop = useShop();
  const [milestoneId, setMilestoneId] = useState("all");
  const [printerId, setPrinterId] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [finish, setFinish] = useState<PrintCard | null>(null);
  const [fail, setFail] = useState<PrintCard | null>(null);
  const [editing, setEditing] = useState<PrintCard | null>(null);
  const [removing, setRemoving] = useState<PrintCard | null>(null);
  const [undoing, setUndoing] = useState<PrintCard | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const cards = shop.cards.filter((card) => milestoneId === "all" || card.milestone === milestoneId);
  const scheduled = shop.cards.filter(
    (card) => card.column === "printing" || ((milestoneId === "all" || card.milestone === milestoneId) && card.column === "queue"),
  );
  const schedule = buildSchedule(scheduled, shop.printers, Date.now(), "", shop.parts);
  const shown = cards.filter((card) => printerId === "all" || printerForCard(card, schedule.slots) === printerId);
  const active = shown.find((card) => card.id === activeId) ?? null;
  useEffect(() => {
    if (printerId !== "all" && !shop.printers.some((printer) => printer.id === printerId)) setPrinterId("all");
  }, [printerId, shop.printers]);

  function move(card: PrintCard, column: ColumnId) {
    if (column === card.column) return;
    if (column === "printing") {
      if (card.blocked) {
        shop.toast(card.blockedReason || "Restock before starting this plate.", "bad");
        return;
      }
      const printerId = printerFor(card, scheduled, shop.printers, Date.now(), shop.parts);
      if (!printerId) {
        shop.toast(printerUnavailable(card, scheduled, shop.printers, shop.parts), "bad");
        return;
      }
      void shop.startPrint(card, printerId).catch(() => undefined);
      return;
    }
    if (column === "done") {
      setFinish(card);
      return;
    }
    if (column === "failed") {
      setFail(card);
      return;
    }
    if (card.column === "failed") void shop.reprint(card).catch(() => undefined);
    else void shop.cancelPrint(card).catch(() => undefined);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const card = shop.cards.find((item) => item.id === event.active.id);
    if (!card || !event.over) return;
    const over = String(event.over.id);
    const column = over.startsWith("col:")
      ? (over.slice(4) as ColumnId)
      : shop.cards.find((item) => item.id === over)?.column;
    if (!column) return;
    move(card, column);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-filters">
          <Segment
            value={milestoneId}
            onChange={setMilestoneId}
            options={[{ id: "all", label: "All" }, ...shop.milestones.map((milestone) => ({ id: milestone.id, label: milestone.name }))]}
          />
          <Segment
            value={printerId}
            onChange={setPrinterId}
            options={[{ id: "all", label: "All printers" }, ...shop.printers.map((printer) => ({ id: printer.id, label: printer.name }))]}
          />
        </div>
      </div>
      <PrintTimeline
        cards={scheduled}
        printers={shop.printers}
        filaments={shop.filaments}
        parts={shop.parts}
        onOpen={setEditing}
        onStart={(card) => move(card, "printing")}
        onSchedule={(card, nextPrinter, start) => {
          void shop.scheduleCard(card, nextPrinter, start).catch(() => undefined);
        }}
        printerId={printerId}
      />
      <DndContext sensors={sensors} onDragStart={(event) => setActiveId(String(event.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="board">
          {COLUMNS.map((column) => (
            <Column key={column.id} id={column.id} label={column.label} hint={column.hint} count={sortCards(shown, column.id).length}>
              {sortCards(shown, column.id).map((card) => (
                <Job
                  key={card.id}
                  card={card}
                  slot={schedule.slots.find((item) => item.card.id === card.id)}
                  onMove={move}
                  onEdit={setEditing}
                  onDelete={setRemoving}
                  onUndo={setUndoing}
                />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? <JobView card={active} slot={schedule.slots.find((item) => item.card.id === active.id)} dragging /> : null}
        </DragOverlay>
      </DndContext>
      {editing ? <CardEditor card={editing} onClose={() => setEditing(null)} onDelete={setRemoving} /> : null}
      {removing ? <DeleteCardDialog card={removing} onClose={() => setRemoving(null)} /> : null}
      {undoing ? <UndoDoneDialog card={undoing} onClose={() => setUndoing(null)} /> : null}
      {finish ? <FinishDialog card={finish} onClose={() => setFinish(null)} /> : null}
      {fail ? <FailDialog card={fail} onClose={() => setFail(null)} /> : null}
    </div>
  );
}

function printerForCard(card: PrintCard, slots: ScheduleSlot[]) {
  return slots.find((slot) => slot.card.id === card.id)?.printerId || card.printer;
}

function Column({ id, label, hint, count, children }: { id: ColumnId; label: string; hint: string; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });
  return (
    <section ref={setNodeRef} className={`kanban-col ${id}${isOver ? " over" : ""}`}>
      <div className="col-head">
        <span>{label}</span>
        <b>{count}</b>
      </div>
      <p className="kicker">{hint}</p>
      {children}
    </section>
  );
}

function Job({
  card,
  slot,
  onMove,
  onEdit,
  onDelete,
  onUndo,
}: {
  card: PrintCard;
  slot?: ScheduleSlot;
  onMove: (card: PrintCard, column: ColumnId) => void;
  onEdit: (card: PrintCard) => void;
  onDelete: (card: PrintCard) => void;
  onUndo: (card: PrintCard) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled: card.column === "done" });
  return (
    <div ref={setNodeRef} className={isDragging ? "job-slot job-drag" : "job-slot"} {...listeners} {...attributes}>
      <JobView card={card} slot={slot} onMove={onMove} onEdit={onEdit} onDelete={onDelete} onUndo={onUndo} />
    </div>
  );
}

function JobView({
  card,
  slot,
  onMove,
  onEdit,
  onDelete,
  onUndo,
  dragging,
}: {
  card: PrintCard;
  slot?: ScheduleSlot;
  onMove?: (card: PrintCard, column: ColumnId) => void;
  onEdit?: (card: PrintCard) => void;
  onDelete?: (card: PrintCard) => void;
  onUndo?: (card: PrintCard) => void;
  dragging?: boolean;
}) {
  const shop = useShop();
  const part = shop.parts.find((item) => item.id === card.component);
  const slots = slotsForCard(card, part);
  const uses = cardUses(card);
  const colorNames = uses
    .map((use) => shop.filaments.find((item) => item.id === use.filament)?.color)
    .filter((item) => item != null);
  const colorPills = uses.length === 0 ? (slots.length > 0 ? slots.map((slot) => `Color ${slot.slot}`) : ["Set color"]) : colorNames.length > 0 ? colorNames : ["Set color"];
  const product = shop.products.find((item) => item.id === card.product);
  const printer = shop.printers.find((item) => item.id === (slot?.printerId || card.printer));
  const canPlay = Boolean(onMove) && card.column !== "printing" && card.column !== "done";
  const [now, setNow] = useState(() => Date.now());
  const printing = card.column === "printing";
  useEffect(() => {
    if (!printing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 3000);
    return () => window.clearInterval(timer);
  }, [printing]);
  const progress = printProgress(card, now);
  return (
    <article className={`job${card.blocked ? " blocked" : ""}${dragging ? " dragging" : ""}`}>
      <header className="job-top">
        <div className="job-tags">
          <span className={`job-pill ${card.blocked ? "blocked" : card.priority}`}>{card.blocked ? "Blocked" : card.priority}</span>
          {colorPills.map((label, index) => (
            <span key={`${label}-${index}`} className="job-pill kind">
              {label}
            </span>
          ))}
        </div>
        <div className="job-tools">
          <span className="job-due">{progress.label}</span>
          {onDelete ? (
            <button
              type="button"
              className="job-pen"
              aria-label="Delete job"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onDelete(card)}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
          {onEdit && card.column !== "done" ? (
            <button
              type="button"
              className="job-pen"
              aria-label="Edit job"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onEdit(card)}
            >
              <Pencil size={15} />
            </button>
          ) : null}
        </div>
      </header>
      <div className="job-identity">
        <ProductPhoto name={card.name} src={part?.photo ? recordFileUrl("parts", part.id, part.photo, "200x200f") : ""} size={48} />
        <div>
          <h3>{card.name}</h3>
          {product ? <p className="job-product">{product.name}</p> : null}
        </div>
      </div>
      <div className="job-progress">
        <div className="job-progress-label">
          <Sparkles size={14} />
          <span>Progress</span>
          <b>{progress.percent}%</b>
        </div>
        <div className={`job-bar${progress.percent >= 100 ? " done" : ""}`} aria-hidden="true">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
      {card.blocked ? <p className="job-note">{card.blockedReason}</p> : null}
      <footer>
        <span className="job-who">
          {printer ? <PrinterPhoto printer={printer} size={26} /> : <span className="job-who-empty" aria-hidden="true" />}
          <span>{printer?.name || "No printer"}</span>
        </span>
        <span className="job-meta">
          <span>{card.quantity === 1 ? card.kind : `${card.quantity} ${card.kind}s`}</span>
          <span>{grams(card.gramsEach)}</span>
        </span>
        {card.column === "done" && onUndo ? (
          <button
            type="button"
            className="btn small ghost"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onUndo(card)}
          >
            Undo
          </button>
        ) : null}
        {canPlay ? (
          <button
            type="button"
            className="job-play"
            aria-label={card.column === "failed" ? "Reprint" : "Start"}
            disabled={card.blocked}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onMove?.(card, "printing")}
          >
            <Play size={14} fill="currentColor" />
          </button>
        ) : null}
      </footer>
    </article>
  );
}

function printProgress(card: PrintCard, now: number) {
  const totalMinutes = Math.max(1, card.quantity * card.minutesEach);
  if (card.column === "done") return { percent: 100, label: "Done" };
  if (card.column === "failed") return { percent: 0, label: "Failed" };
  if (card.column !== "printing") return { percent: 0, label: duration(totalMinutes) };
  const started = parsePbDate(card.startedAt)?.getTime();
  if (!started) return { percent: 0, label: duration(totalMinutes) };
  const totalMs = totalMinutes * 60_000;
  const elapsedMs = Math.max(0, now - started);
  const percent = Math.min(100, Math.round((elapsedMs / totalMs) * 100));
  const leftMs = totalMs - elapsedMs;
  return { percent, label: leftMs <= 0 ? "Finishing" : `${duration(Math.ceil(leftMs / 60_000))} left` };
}

function CardEditor({ card, onClose, onDelete }: { card: PrintCard; onClose: () => void; onDelete: (card: PrintCard) => void }) {
  const shop = useShop();
  const live = shop.cards.find((item) => item.id === card.id) ?? card;
  const [name, setName] = useState(live.name);
  const [minutesEach, setMinutesEach] = useState(String(live.minutesEach));
  const [priority, setPriority] = useState<Priority>(live.priority);
  const part = shop.parts.find((item) => item.id === live.component);
  const slots = slotsForCard(live, part);
  const groups = colorGroups(shop.filaments);
  const [chosen, setChosen] = useState(() =>
    slots.map((slot) => {
      const group = groups.find((item) => item.spools.some((spool) => spool.id === slot.filament));
      return group?.lead.id ?? "";
    }),
  );
  const allowedIds = (part?.printers ?? []).filter((id) => id.length > 0);
  const [printer, setPrinter] = useState(() => {
    if (allowedIds.length > 0 && live.printer && !allowedIds.includes(live.printer) && live.column !== "printing") return "";
    return live.printer;
  });
  const printing = live.column === "printing";
  const [error, setError] = useState("");

  return (
    <Modal title="Edit job" subtitle="The schedule updates as soon as you save." onClose={onClose}>
      <form
        className="stack"
        onSubmit={submit(() => {
          const minutes = readWhole(minutesEach);
          const uses = slots.map((slot, index) => ({ slot: slot.slot, filament: chosen[index] ?? "", grams: slot.grams }));
          const missing = uses.filter((use) => !use.filament);
          const weight = uses.reduce((sum, use) => sum + use.grams, 0);
          if (missing.length > 0) {
            setError(`Assign a filament to ${missing.map((use) => `Color ${use.slot}`).join(" and ")}.`);
            return;
          }
          if (new Set(uses.map((use) => use.filament)).size !== uses.length) {
            setError("Each color slot needs a different filament.");
            return;
          }
          if (minutes == null || minutes < 1 || weight <= 0) {
            setError("Enter the minutes for this print.");
            return;
          }
          setError("");
          void shop
            .updateCard(live, {
              name,
              quantity: 1,
              minutesEach: minutes,
              gramsEach: weight,
              priority,
              filament: uses[0].filament,
              colors: uses.length > 1 ? uses : [],
              printer: printing ? printer || live.printer : printer,
            })
            .then(onClose)
            .catch((err: unknown) => setError(errorMessage(err)));
        })}
      >
        <Field label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Minutes">
          <NumericInput value={minutesEach} onChange={setMinutesEach} required />
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span>{live.kind === "plate" ? "Filaments for this plate" : "Filaments for this item"}</span>
          <div className="color-slots">
            {slots.map((slot, index) => (
              <label key={slot.slot} className="color-slot">
                <span>
                  <strong>Color {slot.slot}</strong>
                  <small>{grams(slot.grams)} from the product</small>
                </span>
                <select
                  value={chosen[index] ?? ""}
                  onChange={(event) => setChosen((current) => current.map((value, itemIndex) => (itemIndex === index ? event.target.value : value)))}
                >
                  <option value="">Choose a filament</option>
                  {groups.map((group) => (
                    <option key={group.key} value={group.lead.id}>
                      {group.lead.color} · {group.lead.material}
                      {group.spools.length > 1 ? ` · ${group.spools.length} spools` : ""} · {grams(group.remainingGrams)} left
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <small>Color A, Color B, and the rest keep the grams from the product. Pick which filament each one is for this print.</small>
        </div>
        <Field label="Printer">
          <select value={printer} onChange={(event) => setPrinter(event.target.value)}>
            {printing ? null : <option value="">Automatic</option>}
            {shop.printers
              .filter((item) => {
                const allowed = allowedIds.length === 0 || allowedIds.includes(item.id) || (printing && item.id === live.printer);
                return allowed && (item.active || item.id === printer);
              })
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
        <FormError message={error} />
        <div className="actions">
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              onDelete(live);
              onClose();
            }}
          >
            Delete card
          </button>
          <button className="btn primary" type="submit">
            Save job
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UndoDoneDialog({ card, onClose }: { card: PrintCard; onClose: () => void }) {
  const shop = useShop();
  const [error, setError] = useState("");
  return (
    <Modal title={`Bring ${card.name} back?`} subtitle="It returns to the queue. The grams logged for this print go back on the spool, and it no longer counts as finished." onClose={onClose}>
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          Keep it done
        </button>
        <button
          className="btn primary"
          type="button"
          onClick={() => {
            setError("");
            void shop.undoDone(card).then(onClose).catch((err: unknown) => setError(errorMessage(err)));
          }}
        >
          Bring it back
        </button>
      </div>
      <FormError message={error} />
    </Modal>
  );
}

function DeleteCardDialog({ card, onClose }: { card: PrintCard; onClose: () => void }) {
  const shop = useShop();
  const [error, setError] = useState("");
  const detail =
    card.column === "printing"
      ? "It comes off the printer. Filament stays on the spool."
      : card.column === "done"
        ? "It leaves the board. The print already logged stays in the history."
        : card.column === "failed"
          ? "It leaves the board. The waste already logged stays in the history."
          : "It leaves the queue and will not be printed.";
  return (
    <Modal title={`Delete ${card.name}?`} subtitle={detail} onClose={onClose}>
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          Keep it
        </button>
        <button
          className="btn danger"
          type="button"
          onClick={() => {
            setError("");
            void shop.deleteCard(card).then(onClose).catch((err: unknown) => setError(errorMessage(err)));
          }}
        >
          Delete card
        </button>
      </div>
      <FormError message={error} />
    </Modal>
  );
}

function FinishDialog({ card, onClose }: { card: PrintCard; onClose: () => void }) {
  const shop = useShop();
  const [pieces, setPieces] = useState(String(card.quantity));
  const [weight, setWeight] = useState(String(roundGrams(card.quantity * card.gramsEach)));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal title="Finish print" subtitle={`${card.name} · ${card.colors.length > 1 ? "each spool loses its share of the grams you enter." : "the spool loses the grams you enter."}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={submit(() => {
          const good = card.quantity > 1 ? readWhole(pieces) : 1;
          const usedGrams = readDecimal(weight);
          if (good == null || usedGrams == null) {
            setError("Enter whole pieces and grams like 104.08.");
            return;
          }
          void shop
            .finishPrint(card, { piecesGood: good, gramsUsed: usedGrams, note })
            .then(() => {
              shop.toast("Print logged and the spool was updated.", "good");
              onClose();
            })
            .catch((err: unknown) => setError(errorMessage(err)));
        })}
      >
        {card.quantity > 1 ? (
          <Field label={`Good pieces (of ${card.quantity})`} hint="Fewer than the whole job sends the rest back to the queue.">
            <NumericInput value={pieces} onChange={setPieces} />
          </Field>
        ) : null}
        <Field label="Grams used">
          <NumericInput decimal value={weight} onChange={setWeight} />
        </Field>
        <Field label="Note">
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={error} />
        <div className="actions">
          <button className="btn primary" type="submit">
            Log success
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FailDialog({ card, onClose }: { card: PrintCard; onClose: () => void }) {
  const shop = useShop();
  const [salvaged, setSalvaged] = useState("0");
  const [wasted, setWasted] = useState(String(roundGrams(card.quantity * card.gramsEach)));
  const [used, setUsed] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal title="Print failed" subtitle="Waste is saved on the spool and in analytics. Reprint puts the remaining pieces back in the queue." onClose={onClose}>
      <form
        className="stack"
        onSubmit={submit(() => {
          const good = card.quantity > 1 ? readWhole(salvaged) : 0;
          const wastedGrams = readDecimal(wasted);
          const usedGrams = readDecimal(used);
          if (good == null || wastedGrams == null || usedGrams == null) {
            setError("Enter whole pieces and grams like 104.08.");
            return;
          }
          void shop
            .failPrint(card, {
              piecesGood: good,
              gramsWasted: wastedGrams,
              gramsUsed: usedGrams,
              note,
            })
            .then(() => {
              shop.toast("Failure logged. The wasted grams are off the spool.", "good");
              onClose();
            })
            .catch((err: unknown) => setError(errorMessage(err)));
        })}
      >
        {card.quantity > 1 ? (
          <Field label="Pieces still good" hint="These count as success. The rest need a reprint.">
            <NumericInput value={salvaged} onChange={setSalvaged} />
          </Field>
        ) : null}
        <Field label="Grams wasted">
          <NumericInput decimal value={wasted} onChange={setWasted} />
        </Field>
        {card.quantity > 1 ? (
          <Field label="Grams used on salvaged pieces">
            <NumericInput decimal value={used} onChange={setUsed} />
          </Field>
        ) : null}
        <Field label="What happened">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={error} />
        <div className="actions">
          <button className="btn danger" type="submit">
            Log failure
          </button>
        </div>
      </form>
    </Modal>
  );
}

