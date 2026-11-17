import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShop } from "../context/Workshop";
import { Field, FormError, Meter, Modal, NumericInput, Segment, submit } from "../components/ui";
import { BAMBU_LINES, bambuColorLabel, colorsFor, matchBambuColor } from "../lib/bambu";
import { grams, money, readDecimal } from "../lib/format";
import { filamentPressure } from "../lib/metrics";
import { colorGroups, type ColorGroup } from "../lib/pools";
import { MATERIALS, type Filament, type FilamentInput, type Material, type PrintCard } from "../types";

type SpoolSort = "color" | "alpha" | "grams";

function compareGroups(a: ColorGroup, b: ColorGroup, sort: SpoolSort) {
  if (sort === "grams") return b.remainingGrams - a.remainingGrams || a.lead.color.localeCompare(b.lead.color);
  if (sort === "color") {
    const aRank = colorRank(a.lead.colorHex);
    const bRank = colorRank(b.lead.colorHex);
    if (aRank.neutral !== bRank.neutral) return aRank.neutral - bRank.neutral;
    if (aRank.neutral === 1 && aRank.light !== bRank.light) return aRank.light - bRank.light;
    if (aRank.hue !== bRank.hue) return aRank.hue - bRank.hue;
  }
  return a.lead.color.localeCompare(b.lead.color) || a.lead.material.localeCompare(b.lead.material);
}

function colorRank(hex: string) {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw.padEnd(6, "0").slice(0, 6);
  const channel = (start: number) => parseInt(full.slice(start, start + 2), 16) / 255;
  const red = channel(0);
  const green = channel(2);
  const blue = channel(4);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { neutral: 1, hue: 0, light };
  const saturation = delta / (1 - Math.abs(2 * light - 1) || 1);
  if (saturation < 0.15) return { neutral: 1, hue: 0, light };
  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { neutral: 0, hue, light };
}

const firstPla = colorsFor("PLA Basic")[0];

const empty: FilamentInput = {
  brand: "Bambu Lab",
  material: "PLA Basic",
  color: bambuColorLabel(firstPla),
  colorHex: firstPla.hex,
  remainingGrams: 1000,
  spoolGrams: 1000,
  pricePerKg: 20,
  lowThresholdGrams: 200,
  notes: "",
};

export function Filaments() {
  const shop = useShop();
  const [query, setQuery] = useState("");
  const [material, setMaterial] = useState<Material | "all">("all");
  const [editing, setEditing] = useState<Filament | "new" | null>(null);
  const [delivery, setDelivery] = useState<Filament | null>(null);
  const [gramsIn, setGramsIn] = useState("1000");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [sort, setSort] = useState<SpoolSort>("alpha");
  const [inventory, setInventory] = useState<string | null>(null);
  const present = MATERIALS.filter((item) => shop.filaments.some((filament) => filament.material === item));
  const groups = colorGroups(shop.filaments)
    .filter((group) => {
      if (material !== "all" && group.lead.material !== material) return false;
      if (!query) return true;
      const haystack = [group.lead.color, group.lead.material, ...group.spools.flatMap((spool) => [spool.brand, spool.notes])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.toLowerCase());
    })
    .map((group) => ({
      ...group,
      spools: group.spools.slice().sort((a, b) => {
        if (sort === "grams") return b.remainingGrams - a.remainingGrams || a.brand.localeCompare(b.brand);
        return a.brand.localeCompare(b.brand) || a.color.localeCompare(b.color);
      }),
    }))
    .sort((a, b) => compareGroups(a, b, sort));

  return (
    <div className="stack">
      <div className="page-head">
        <input className="search" placeholder="Search brand or color" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="spool-filters">
          <Segment
            value={sort}
            onChange={setSort}
            options={[
              { id: "color", label: "Color" },
              { id: "alpha", label: "A–Z" },
              { id: "grams", label: "Grams" },
            ]}
          />
          <Segment value={view} onChange={setView} options={[{ id: "cards", label: "Cards" }, { id: "list", label: "List" }]} />
          {present.length > 1 ? (
            <Segment
              value={material}
              onChange={setMaterial}
              options={[{ id: "all", label: "All" }, ...present.map((item) => ({ id: item, label: item }))]}
            />
          ) : null}
          <button className="btn dark" type="button" onClick={() => setEditing("new")}>
            <Plus size={16} />
            Add spool
          </button>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="panel">
          <p className="muted">No spools match. Load the sample shop from the dashboard if the bench is still empty.</p>
        </div>
      ) : view === "cards" ? (
        <div className="spool-grid">
          {groups.map((group) => {
            const pressure = filamentPressure(group.lead, shop.cards, shop.filaments);
            const ratio = group.spoolGrams > 0 ? (group.remainingGrams / group.spoolGrams) * 100 : 0;
            const single = group.spools.length === 1 ? group.spools[0] : null;
            return (
              <article key={group.key} className="panel spool-card">
                <header>
                  <span className="spool-orb" style={{ background: group.lead.colorHex }} />
                  <div className="spool-id">
                    <strong>{group.lead.color}</strong>
                    <p className="muted">{single ? `${single.brand} · ${group.lead.material}` : `${group.lead.material} · ${group.spools.length} spools`}</p>
                  </div>
                </header>
                <div className="spool-card-stat">
                  <div className="grams-xl">{grams(group.remainingGrams)}</div>
                  <SpoolStatus tone={pressure.tone} />
                </div>
                <Meter value={ratio} tone={pressure.tone === "short" ? "red" : pressure.tone === "low" ? "amber" : "orange"} />
                <p className="muted">
                  of {grams(group.spoolGrams)}
                  {single ? ` · ${money(single.pricePerKg, shop.workspace.currency)}/kg` : ""}
                  {group.lowThresholdGrams > 0 ? ` · reorder at ${grams(group.lowThresholdGrams)}` : ""}
                </p>
                {pressure.demand > 0 ? <p className="note">Queue wants {grams(pressure.demand)} of this color.</p> : null}
                {single ? (
                  <div className="actions">
                    <button className="btn small ghost" type="button" onClick={() => setDelivery(single)}>Log delivery</button>
                    <button className="btn small ghost" type="button" onClick={() => setEditing(single)}>Edit</button>
                  </div>
                ) : (
                  <ul className="color-spools">
                    {group.spools.map((spool) => (
                      <li key={spool.id}>
                        <span>{spool.brand}</span>
                        <strong>{grams(spool.remainingGrams)}</strong>
                        <span className="muted">of {grams(spool.spoolGrams)}</span>
                        <div className="actions">
                          <button className="btn small ghost" type="button" onClick={() => setDelivery(spool)}>Log delivery</button>
                          <button className="btn small ghost" type="button" onClick={() => setEditing(spool)}>Edit</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="spool-list">
          {groups.map((group) => {
            const pressure = filamentPressure(group.lead, shop.cards, shop.filaments);
            const ratio = group.spoolGrams > 0 ? (group.remainingGrams / group.spoolGrams) * 100 : 0;
            const single = group.spools.length === 1 ? group.spools[0] : null;
            return (
              <article key={group.key} className="panel spool-row">
                <span className="spool-orb" style={{ background: group.lead.colorHex }} />
                <div className="spool-id">
                  <strong>{group.lead.color}</strong>
                  <p className="muted">{single ? `${single.brand} · ${group.lead.material}` : `${group.lead.material} · ${group.spools.length} spools`}</p>
                </div>
                <div className="spool-row-stock">
                  <strong>{grams(group.remainingGrams)}</strong>
                  <Meter value={ratio} tone={pressure.tone === "short" ? "red" : pressure.tone === "low" ? "amber" : "orange"} />
                </div>
                <p className="muted spool-row-detail">
                  of {grams(group.spoolGrams)}
                  {single ? ` · ${money(single.pricePerKg, shop.workspace.currency)}/kg` : ""}
                  {group.lowThresholdGrams > 0 ? ` · reorder at ${grams(group.lowThresholdGrams)}` : ""}
                  {pressure.demand > 0 ? ` · queue wants ${grams(pressure.demand)}` : ""}
                </p>
                <SpoolStatus tone={pressure.tone} />
                {single ? (
                  <div className="actions">
                    <button className="btn small ghost" type="button" onClick={() => setDelivery(single)}>Log delivery</button>
                    <button className="btn small ghost" type="button" onClick={() => setEditing(single)}>Edit</button>
                  </div>
                ) : (
                  <div className="actions">
                    <button className="btn small ghost" type="button" onClick={() => setInventory(group.key)}>
                      {group.spools.length} rolls
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {inventory ? (
        <InventoryModal
          groups={colorGroups(shop.filaments).sort((a, b) => compareGroups(a, b, sort))}
          focusKey={inventory}
          currency={shop.workspace.currency}
          cards={shop.cards}
          filaments={shop.filaments}
          onEdit={(spool) => {
            setInventory(null);
            setEditing(spool);
          }}
          onDelivery={(spool) => {
            setInventory(null);
            setGramsIn("1000");
            setDelivery(spool);
          }}
          onClose={() => setInventory(null)}
        />
      ) : null}
      {editing ? <FilamentForm initial={editing === "new" ? empty : editing} id={editing === "new" ? undefined : editing.id} onClose={() => setEditing(null)} /> : null}
      {delivery ? (
        <Modal title={`Delivery · ${delivery.brand}`} subtitle="Adds grams to what's left and to the spool size, so the bar stays honest." onClose={() => setDelivery(null)}>
          <form
            className="stack"
            onSubmit={submit(() => {
              const added = readDecimal(gramsIn);
              if (added == null || added <= 0) return;
              void shop.receiveFilament(delivery.id, added).then(() => setDelivery(null)).catch(() => undefined);
            })}
          >
            <Field label="Grams received">
              <NumericInput decimal value={gramsIn} onChange={setGramsIn} />
            </Field>
            <div className="actions">
              <button className="btn primary" type="submit">
                Add to spool
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function SpoolStatus({ tone }: { tone: "ok" | "low" | "short" }) {
  const label = tone === "ok" ? "Stocked" : tone === "low" ? "Low" : "Short";
  const kind = tone === "short" ? "high" : tone === "low" ? "medium" : "done";
  return (
    <span className={`chip ${kind}`}>
      <i />
      {label}
    </span>
  );
}

const KILO = 1000;

function InventoryModal({
  groups,
  focusKey,
  currency,
  cards,
  filaments,
  onEdit,
  onDelivery,
  onClose,
}: {
  groups: ColorGroup[];
  focusKey: string;
  currency: string;
  cards: PrintCard[];
  filaments: Filament[];
  onEdit: (spool: Filament) => void;
  onDelivery: (spool: Filament) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    document.getElementById(`pool-${encodeURIComponent(focusKey)}`)?.scrollIntoView({ block: "nearest" });
  }, [focusKey]);
  const rolls = groups.reduce((sum, group) => sum + group.spools.length, 0);
  const onHand = groups.reduce((sum, group) => sum + group.remainingGrams, 0);
  return (
    <Modal wide title="Inventory" subtitle={`${groups.length} colors · ${rolls} rolls · ${grams(onHand)} on hand`} onClose={onClose}>
      <div className="inventory-pools">
        {groups.map((group) => {
          const pressure = filamentPressure(group.lead, cards, filaments);
          return (
            <section key={group.key} id={`pool-${encodeURIComponent(group.key)}`} className={group.key === focusKey ? "inventory-pool on" : "inventory-pool"}>
              <header>
                <span className="spool-orb" style={{ background: group.lead.colorHex }} />
                <div className="spool-id">
                  <strong>{group.lead.color}</strong>
                  <p className="muted">
                    {group.lead.material} · {group.spools.length} {group.spools.length === 1 ? "roll" : "rolls"} · {grams(group.remainingGrams)} of {grams(group.spoolGrams)}
                    {pressure.demand > 0 ? ` · queue wants ${grams(pressure.demand)}` : ""}
                  </p>
                </div>
                <SpoolStatus tone={pressure.tone} />
              </header>
              <ul>
                {group.spools.map((spool) => {
                  const value = Math.round((spool.remainingGrams / KILO) * 10000) / 100;
                  const worth = (spool.remainingGrams / KILO) * spool.pricePerKg;
                  return (
                    <li key={spool.id}>
                      <div className="inventory-roll-head">
                        <strong>{spool.brand}</strong>
                        <span>{grams(spool.remainingGrams)}</span>
                      </div>
                      <Meter value={Math.min(100, value)} tone={spool.remainingGrams <= 0 ? "red" : spool.lowThresholdGrams > 0 && spool.remainingGrams <= spool.lowThresholdGrams ? "amber" : "green"} />
                      <div className="inventory-scale">
                        <span>0</span>
                        <span>1 kg</span>
                      </div>
                      <p className="muted">
                        {money(spool.pricePerKg, currency)}/kg · {money(worth, currency)} left
                        {spool.lowThresholdGrams > 0 ? ` · reorder at ${grams(spool.lowThresholdGrams)}` : ""}
                        {spool.notes ? ` · ${spool.notes}` : ""}
                      </p>
                      <div className="actions">
                        <button className="btn small ghost" type="button" onClick={() => onDelivery(spool)}>
                          Log delivery
                        </button>
                        <button className="btn small ghost" type="button" onClick={() => onEdit(spool)}>
                          Edit
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

function FilamentForm({ initial, id, onClose }: { initial: FilamentInput; id?: string; onClose: () => void }) {
  const shop = useShop();
  const matched = matchBambuColor(initial.color, initial.colorHex, initial.material);
  const starting = matched ?? colorsFor(initial.material)[0] ?? firstPla;
  const [form, setForm] = useState<FilamentInput>({
    ...initial,
    brand: initial.brand || "Bambu Lab",
    material: (matched?.material ?? (MATERIALS.includes(initial.material) ? initial.material : "PLA Basic")) as Material,
    color: bambuColorLabel(starting),
    colorHex: starting.hex,
  });
  const [code, setCode] = useState(starting.code);
  const [remaining, setRemaining] = useState(String(initial.remainingGrams));
  const [spool, setSpool] = useState(String(initial.spoolGrams));
  const [price, setPrice] = useState(String(initial.pricePerKg));
  const [low, setLow] = useState(String(initial.lowThresholdGrams));
  const [error, setError] = useState("");
  const title = id ? "Edit spool" : "New spool";
  const palette = colorsFor(form.material);
  const selected = palette.find((item) => item.code === code) ?? palette[0];
  const patch = useMemo(() => form, [form]);

  function set<K extends keyof FilamentInput>(key: K, value: FilamentInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function choose(next: (typeof palette)[number]) {
    setCode(next.code);
    setForm((current) => ({ ...current, color: bambuColorLabel(next), colorHex: next.hex }));
  }

  function chooseMaterial(material: Material) {
    const nextPalette = colorsFor(material);
    const next = nextPalette.find((item) => item.code === code) ?? nextPalette[0];
    setCode(next.code);
    setForm((current) => ({ ...current, material, color: bambuColorLabel(next), colorHex: next.hex }));
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={submit(() => {
          if (!selected) {
            setError("Pick a Bambu Lab color.");
            return;
          }
          const remainingGrams = readDecimal(remaining);
          const spoolGrams = readDecimal(spool);
          const pricePerKg = readDecimal(price);
          const lowThresholdGrams = readDecimal(low);
          if (remainingGrams == null || spoolGrams == null || pricePerKg == null || lowThresholdGrams == null) {
            setError("Enter grams and price with up to two decimals, like 104.08.");
            return;
          }
          setError("");
          void shop
            .saveFilament(
              {
                ...patch,
                brand: patch.brand.trim() || "Bambu Lab",
                material: form.material,
                color: bambuColorLabel(selected),
                colorHex: selected.hex,
                remainingGrams,
                spoolGrams,
                pricePerKg,
                lowThresholdGrams,
              },
              id,
            )
            .then(onClose)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save."));
        })}
      >
        <div className="grid-2">
          <Field label="Brand">
            <input value={form.brand} onChange={(event) => set("brand", event.target.value)} required />
          </Field>
          <Field label="Material">
            <select value={form.material} onChange={(event) => chooseMaterial(event.target.value as Material)}>
              {BAMBU_LINES.map((line) => (
                <option key={line.material}>{line.material}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="color-picker">
          <p className="color-picker-label">
            Color : <strong>{bambuColorLabel(selected)}</strong>
          </p>
          <div className="color-swatches">
            {palette.map((item) => (
              <button
                key={item.code}
                type="button"
                className={item.code === selected.code ? "color-swatch on" : "color-swatch"}
                style={{ background: item.hex }}
                aria-label={`${form.material} ${bambuColorLabel(item)}`}
                aria-pressed={item.code === selected.code}
                onClick={() => choose(item)}
              />
            ))}
          </div>
        </div>
        <div className="grid-2">
          <Field label="Grams left">
            <NumericInput decimal value={remaining} onChange={setRemaining} />
          </Field>
          <Field label="Full spool grams">
            <NumericInput decimal value={spool} onChange={setSpool} />
          </Field>
          <Field label={`Price / kg (${shop.workspace.currency})`}>
            <NumericInput decimal value={price} onChange={setPrice} />
          </Field>
          <Field label="Reorder below (g)" hint="You'll be notified at or under this. Use 0 to skip the low warning.">
            <NumericInput decimal value={low} onChange={setLow} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        </Field>
        <p className="note">About {money(((readDecimal(remaining) ?? 0) / 1000) * (readDecimal(price) ?? 0), shop.workspace.currency)} of plastic is on this spool now ({grams(readDecimal(remaining) ?? 0)}).</p>
        <FormError message={error} />
        <div className="actions">
          {id ? (
            <button
              className="btn danger" type="button"
              onClick={() => {
                void shop.deleteFilament(id).then(onClose).catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't delete."));
              }}
            >
              Delete
            </button>
          ) : null}
          <button className="btn primary" type="submit">
            Save spool
          </button>
        </div>
      </form>
    </Modal>
  );
}
