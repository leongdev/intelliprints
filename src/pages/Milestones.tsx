import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useShop } from "../context/Workshop";
import { Empty, Field, FormError, Meter, Modal, NumericInput, submit } from "../components/ui";
import { duration, grams, money, percent, readWhole, roundGrams } from "../lib/format";
import { cardUses } from "../lib/colors";
import { colorKey, sameColor } from "../lib/pools";
import { lineForPart, planPrints, reservedGrams, stockForPlanning } from "../lib/logistics";
import { currentVersion, jobsFor, milestoneProgress } from "../lib/metrics";

export function Milestones() {
  const shop = useShop();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <div className="stack">
      <div className="page-head">
        <button className="btn dark" type="button" style={{ marginLeft: "auto" }} disabled={shop.products.length === 0} onClick={() => setOpen(true)}>
          <Plus size={16} />
          Add Milestone
        </button>
      </div>
      {message ? <p className="banner">{message}</p> : null}
      {shop.milestones.length === 0 ? (
        <div className="panel">
          <Empty title="No milestones" body="Create a product with parts, then set how many you want. The board fills itself." />
        </div>
      ) : (
        shop.milestones.map((milestone) => {
          const product = shop.products.find((item) => item.id === milestone.product);
          const progress = milestoneProgress(milestone, shop.parts, shop.events, shop.cards);
          const byColor = new Map<string, { filamentId: string; weight: number }>();
          let unset = 0;
          for (const card of shop.cards) {
            if (card.milestone !== milestone.id || card.column === "failed") continue;
            const uses = cardUses(card);
            if (uses.length === 0) {
              unset += 1;
              continue;
            }
            for (const use of uses) {
              const filament = shop.filaments.find((item) => item.id === use.filament);
              const key = filament ? colorKey(filament) : use.filament;
              const current = byColor.get(key) ?? { filamentId: use.filament, weight: 0 };
              current.weight = roundGrams(current.weight + card.quantity * use.grams);
              byColor.set(key, current);
            }
          }
          return (
            <article key={milestone.id} className="panel stack">
              <div className="panel-head">
                <div>
                  <p className="kicker">{milestone.status === "done" ? "Complete" : "Active"} · {product?.name}</p>
                  <h2>{milestone.name}</h2>
                </div>
                <div className="actions">
                  <button
                    className="btn small ghost"
                    type="button"
                    onClick={() => {
                      void shop.replanMilestone(milestone.id).then((plan) => setMessage(plan.notes.join(" "))).catch(() => undefined);
                    }}
                  >
                    Replan queue
                  </button>
                  <button className="btn small danger" type="button" onClick={() => void shop.deleteMilestone(milestone.id).catch(() => undefined)}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="mile-line">
                <strong>
                  {Math.floor(progress.assembled)} / {milestone.targetQty} assembled
                </strong>
                <span className="muted">{Math.round(progress.partsPct)}% of parts</span>
              </div>
              <Meter value={percent(progress.partsPct)} tone={milestone.status === "done" ? "green" : "orange"} />
              <div className="grid-2">
                <div>
                  {progress.parts.map((part) => (
                    <p key={part.partId} className="note">
                      {part.name}: {part.good}/{part.needed} good{part.printing ? ` · ${part.printing} printing` : ""}
                    </p>
                  ))}
                </div>
                <div>
                  {[...byColor.values()].map(({ filamentId, weight }) => {
                    const filament = shop.filaments.find((item) => item.id === filamentId);
                    const mates = filament ? sameColor(shop.filaments, filament.id) : [];
                    const onHand = mates.reduce((sum, spool) => sum + spool.remainingGrams, 0);
                    const others = shop.cards.filter((card) => card.milestone !== milestone.id);
                    const held = mates.reduce((sum, spool) => sum + reservedGrams(spool.id, others), 0);
                    const pile = mates.length > 1 ? ` across ${mates.length} spools` : "";
                    return (
                      <p key={filamentId} className="note">
                        {filament ? `${filament.color} ${filament.material}` : "Missing color"} needs {grams(weight)}. {filament ? `${grams(onHand)} on hand${pile}` : ""}
                        {held > 0 ? `, ${grams(held)} held by other jobs` : ""}.
                      </p>
                    );
                  })}
                  {byColor.size === 0 ? (
                    <p className="note">
                      {unset > 0
                        ? "Set the colors on each print. A plate and a single item can each use their own filaments."
                        : "No colored prints on this milestone yet."}
                    </p>
                  ) : null}
                </div>
              </div>
              {milestone.notes ? <p className="note">{milestone.notes}</p> : null}
            </article>
          );
        })
      )}
      {open ? <Planner onClose={() => setOpen(false)} onPlanned={setMessage} /> : null}
    </div>
  );
}

function Planner({ onClose, onPlanned }: { onClose: () => void; onPlanned: (message: string) => void }) {
  const shop = useShop();
  const [productId, setProductId] = useState(shop.products[0]?.id ?? "");
  const [qty, setQty] = useState("10");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState<Record<string, number>>({});
  const target = readWhole(qty) ?? 0;
  const product = shop.products.find((item) => item.id === productId);
  const version = product ? currentVersion(shop.versions, product.id) : null;
  const productParts = useMemo(
    () =>
      shop.parts
        .filter((part) => part.product === productId && (!version || part.version === version.id))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [shop.parts, productId, version],
  );
  const plan = useMemo(() => {
    if (!product || !Number.isInteger(target) || target < 1) return null;
    const lines = productParts
      .map((part) => lineForPart(part, Math.max(0, jobsFor(part, target) - (removed[part.id] ?? 0))))
      .filter((line) => line.piecesNeeded > 0);
    if (lines.length === 0) return null;
    return planPrints(lines, stockForPlanning(shop.filaments, shop.cards));
  }, [product, productParts, removed, shop.filaments, shop.cards, target]);
  const trimmed = productParts.some((part) => target >= 1 && (removed[part.id] ?? 0) > 0);
  const kept = trimmed
    ? productParts
        .map((part) => ({ id: part.id, jobs: Math.max(0, jobsFor(part, target) - (removed[part.id] ?? 0)) }))
        .filter((item) => item.jobs > 0)
    : [];
  const suggested = product ? `${target || 0} × ${product.name}` : "";

  return (
    <Modal title="Plan a milestone" subtitle={version ? `Planning ${version.name}. Grams stay on Color A, Color B, and the rest. Assign the filament for each one on the card.` : "Grams stay on Color A, Color B, and the rest. Assign the filament for each one on the card."} wide onClose={onClose}>
      <form
        className="stack"
        onSubmit={submit(() => {
          void shop
            .createMilestone({
              name: name.trim() || suggested,
              product: productId,
              targetQty: target,
              notes,
              components: kept,
            })
            .then((result) => {
              onPlanned(result.notes.join(" "));
              onClose();
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't plan."));
        })}
      >
        <div className="grid-2">
          <Field label="Product">
            <select
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setRemoved({});
              }}
            >
              {shop.products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How many">
            <NumericInput
              value={qty}
              onChange={(value) => {
                setQty(value);
                setRemoved({});
              }}
            />
          </Field>
        </div>
        <Field label="Milestone name" hint={suggested ? `Leave blank to use “${suggested}”.` : undefined}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={suggested} />
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {productParts.length === 0 ? (
          <p className="note">Add parts to this product before a plan can be built.</p>
        ) : target < 1 ? (
          <p className="note">Enter how many you want.</p>
        ) : (
          <div className="grid-2">
            <div className="stack">
              {plan ? (
                <>
                  {plan.notes.map((note) => (
                    <p key={note} className="note">{note}</p>
                  ))}
                  {plan.spools.map((spool) => {
                    const filament = shop.filaments.find((item) => item.id === spool.filamentId);
                    const cost = filament ? (spool.demand / 1000) * filament.pricePerKg : 0;
                    return (
                      <div key={spool.filamentId} className="spool-plan">
                        <strong>
                          {spool.brand} {spool.material}
                        </strong>
                        <p className="note">
                          Needs {grams(spool.demand)} · {grams(spool.available)} free for this plan
                          {spool.shortage > 0 ? ` · short ${grams(spool.shortage)}` : ""} · {money(cost, shop.workspace.currency)}
                        </p>
                        <Meter value={spool.demand === 0 ? 0 : Math.min(100, (spool.available / spool.demand) * 100)} tone={spool.shortage > 0 ? "red" : "orange"} />
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className="note">Keep at least one print.</p>
              )}
            </div>
            <div className="plan-list">
              {productParts.map((part) => {
                const full = jobsFor(part, target);
                const count = Math.max(0, full - (removed[part.id] ?? 0));
                return (
                  <div key={part.id} className={count === 0 ? "plan-pick off" : "plan-pick"}>
                    <div>
                      <strong>
                        {count} × {part.name}
                      </strong>
                      <p className="note">
                        {count === 0 ? "Left out" : `${grams(count * part.grams)} · ${duration(count * part.minutes)}`}
                      </p>
                    </div>
                    <div className="plan-step">
                      <button
                        className="btn small ghost"
                        type="button"
                        aria-label={`Fewer ${part.name}`}
                        disabled={count === 0}
                        onClick={() => setRemoved((current) => ({ ...current, [part.id]: Math.min(full, (current[part.id] ?? 0) + 1) }))}
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        className="btn small ghost"
                        type="button"
                        aria-label={`More ${part.name}`}
                        disabled={count >= full}
                        onClick={() =>
                          setRemoved((current) => {
                            const next = Math.max(0, (current[part.id] ?? 0) - 1);
                            if (next === 0) {
                              const copy = { ...current };
                              delete copy[part.id];
                              return copy;
                            }
                            return { ...current, [part.id]: next };
                          })
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <FormError message={error} />
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!plan}>
            Create milestone and fill the board
          </button>
        </div>
      </form>
    </Modal>
  );
}
