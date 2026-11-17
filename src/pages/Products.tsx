import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShop } from "../context/Workshop";
import { DurationInput, Empty, Field, FormError, Modal, NumericInput, ProductPhoto, Segment, submit } from "../components/ui";
import { letterFor, partSlots } from "../lib/colors";
import { duration, grams, plural, readDecimal, readWhole } from "../lib/format";
import { currentVersion, gramsPerProduct, minutesPerProduct, versionsOf } from "../lib/metrics";
import { recordFileUrl } from "../lib/pb";
import type { Part, PartInput, PartKind, Product, ProductVersion } from "../types";

export function Products() {
  const shop = useShop();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const visible = shop.products.filter((product) => {
    const haystack = `${product.name} ${product.description}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });

  if (editing) {
    return <ProductForm product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <input className="search" placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="spool-filters">
          <button className="btn dark" type="button" onClick={() => setEditing("new")}>
            <Plus size={16} />
            Add product
          </button>
        </div>
      </div>
      {shop.products.length === 0 ? (
        <div className="panel">
          <Empty title="No products yet" body="Create one, then add every single item or plate of multiple items that goes into a finished unit." />
        </div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <p className="muted">No products match.</p>
        </div>
      ) : (
        <div className="spool-list">
          {visible.map((product) => (
            <ProductRow key={product.id} product={product} onEdit={() => setEditing(product)} />
          ))}
        </div>
      )}
    </div>
  );
}

function useProductFacts(productId: string) {
  const shop = useShop();
  const version = currentVersion(shop.versions, productId);
  const items = shop.parts.filter((part) => part.product === productId && (version ? part.version === version.id : !part.version));
  const gramsEach = items.reduce((sum, part) => sum + gramsPerProduct(part), 0);
  const minutesEach = items.reduce((sum, part) => sum + minutesPerProduct(part), 0);
  return { items, gramsEach, minutesEach, version, versionCount: versionsOf(shop.versions, productId).length };
}

function ProductRow({ product, onEdit }: { product: Product; onEdit: () => void }) {
  const { items, gramsEach, minutesEach, version, versionCount } = useProductFacts(product.id);
  return (
    <article className="panel spool-row">
      <ProductPhoto product={product} size={36} />
      <div className="spool-id">
        <strong>{product.name}</strong>
        {product.description ? <p className="muted">{product.description}</p> : null}
      </div>
      <div className="spool-row-stock">
        <strong>{grams(gramsEach)}</strong>
      </div>
      <p className="muted spool-row-detail">
        {duration(minutesEach)} · {items.length === 0 ? "No items yet" : plural(items.length, "item")}
        {versionCount > 1 && version ? ` · ${version.name}` : ""}
      </p>
      <div className="actions">
        <button className="btn small ghost" type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
    </article>
  );
}

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const shop = useShop();
  const [id, setId] = useState(product?.id ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState("");
  const [itemOpen, setItemOpen] = useState<Part | "new" | null>(null);
  const [versionId, setVersionId] = useState("");
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionName, setVersionName] = useState("");
  const live = shop.products.find((item) => item.id === id) ?? product;
  const productVersions = versionsOf(shop.versions, id);
  const active = currentVersion(shop.versions, id);
  const selectedId = productVersions.some((version) => version.id === versionId) ? versionId : (active?.id ?? "");
  const selected = productVersions.find((version) => version.id === selectedId) ?? null;
  const items = shop.parts.filter((part) => (selectedId ? part.version === selectedId : part.product === id && !part.version));
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  const savedPhoto = !cleared && live?.photo && live.id ? recordFileUrl("products", live.id, live.photo, "200x200f") : "";
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function persist() {
    const savedId = await shop.saveProduct({ name, description, photo, clearPhoto: cleared && !photo }, id || undefined);
    setId(savedId);
    setPhoto(null);
    setCleared(false);
    setError("");
    return savedId;
  }

  return (
    <div className="stack product-screen">
      <div className="product-screen-head">
        <button className="btn ghost" type="button" onClick={onClose}>
          <ArrowLeft size={16} />
          Back
        </button>
        <div>
          <h2>{id ? "Edit product" : "New product"}</h2>
          <p className="muted">Single is one product on one plate. Multiple repeats that product on a single plate.</p>
        </div>
      </div>
      <form
        className="panel stack"
        onSubmit={submit(() => {
          void persist().catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save."));
        })}
      >
        <div className="printer-photo-field">
          <ProductPhoto name={name || "Product"} src={preview || savedPhoto} size={72} />
          <div className="stack" style={{ gap: 8 }}>
            <label className="btn small ghost">
              {preview || savedPhoto ? "Change photo" : "Add photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    setError("Use a photo under 5 MB.");
                    event.target.value = "";
                    return;
                  }
                  setError("");
                  setPhoto(file);
                  setCleared(false);
                }}
              />
            </label>
            {preview || savedPhoto ? (
              <button
                className="btn small ghost"
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setCleared(true);
                }}
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>
        <Field label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <FormError message={error} />
        <div className="actions">
          {id ? (
            <button
              className="btn danger"
              type="button"
              onClick={() => void shop.deleteProduct(id).then(onClose).catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't delete."))}
            >
              Delete
            </button>
          ) : null}
          <button className="btn primary" type="submit">
            Save product
          </button>
        </div>
      </form>
      <section className="editor-split">
        <div className="page-head">
          <div className="stack" style={{ gap: 6 }}>
            <strong>Items</strong>
            {productVersions.length > 0 ? (
              <select className="version-select" value={selectedId} onChange={(event) => setVersionId(event.target.value)}>
                {productVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name}
                    {version.active ? " · current" : ""}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="spool-filters">
            {id && selected ? (
              <>
                {selected.active ? null : (
                  <button className="btn small ghost" type="button" onClick={() => void shop.useVersion(selected.id).catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't switch version."))}>
                    Use for planning
                  </button>
                )}
                {productVersions.length > 1 ? (
                  <button
                    className="btn small ghost"
                    type="button"
                    onClick={() => {
                      void shop
                        .deleteVersion(selected.id)
                        .then(() => setVersionId(""))
                        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't delete the version."));
                    }}
                  >
                    Delete version
                  </button>
                ) : null}
                <button
                  className="btn small ghost"
                  type="button"
                  onClick={() => {
                    setVersionName(nextVersionName(productVersions));
                    setVersionOpen(true);
                  }}
                >
                  New version
                </button>
              </>
            ) : null}
            <button
              className="btn dark"
              type="button"
              onClick={() => {
                void persist()
                  .then(async (savedId) => {
                    const ensured = selectedId && productVersions.some((version) => version.id === selectedId) ? selectedId : await shop.ensureVersion(savedId);
                    setVersionId(ensured);
                    setItemOpen("new");
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save."));
              }}
            >
              <Plus size={16} />
              Add item
            </button>
          </div>
        </div>
        {selected ? <p className="note">{selected.active ? `${selected.name} is the version planning uses.` : `${selected.name} is kept for comparison. Planning uses ${active?.name ?? "the current version"}.`}</p> : null}
        {items.length === 0 ? (
          <p className="note">No items yet. Add one product on its own plate, or several copies of it on a single plate.</p>
        ) : (
          <div className="spool-list editor-list">
            {items.map((part) => (
              <ItemRow key={part.id} part={part} onEdit={() => setItemOpen(part)} />
            ))}
          </div>
        )}
        {itemOpen ? (
          <Modal
            title={itemOpen === "new" ? "Add item" : "Edit item"}
            subtitle="Single is one product on one plate. Multiple repeats that product on a single plate."
            onClose={() => setItemOpen(null)}
          >
            <ItemForm productId={id} versionId={itemOpen === "new" ? selectedId : itemOpen.version || selectedId} part={itemOpen === "new" ? null : itemOpen} onClose={() => setItemOpen(null)} />
          </Modal>
        ) : null}
        {versionOpen ? (
          <Modal title="New version" subtitle={`Copies the items from ${selected?.name ?? "this version"}. The copy becomes the one planning uses.`} onClose={() => setVersionOpen(false)}>
            <form
              className="stack"
              onSubmit={submit(() => {
                if (!id || !selectedId) return;
                void shop
                  .createVersion(id, selectedId, versionName)
                  .then((created) => {
                    setVersionId(created);
                    setVersionOpen(false);
                    setError("");
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't create the version."));
              })}
            >
              <Field label="Name">
                <input value={versionName} onChange={(event) => setVersionName(event.target.value)} required />
              </Field>
              <FormError message={error} />
              <div className="actions">
                <button className="btn primary" type="submit">
                  Create version
                </button>
              </div>
            </form>
          </Modal>
        ) : null}
      </section>
    </div>
  );
}

function itemLabel(kind: PartKind) {
  return kind === "plate" ? "Multiple" : "Single";
}

function ItemRow({ part, onEdit }: { part: Part; onEdit: () => void }) {
  const shop = useShop();
  const photo = part.photo ? recordFileUrl("parts", part.id, part.photo, "200x200f") : "";
  const slots = partSlots(part);
  const printerNames = part.printers
    .map((id) => shop.printers.find((printer) => printer.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return (
    <article className="panel spool-row">
      {photo ? <ProductPhoto name={part.name} src={photo} size={36} /> : <span className="spool-orb" />}
      <div className="spool-id">
        <strong>{part.name}</strong>
        <p className="muted">{slots.map((slot) => `Color ${slot.slot} ${grams(slot.grams)}`).join(" · ")}</p>
      </div>
      <div className="spool-row-stock">
        <strong>{grams(part.grams)}</strong>
      </div>
      <p className="muted spool-row-detail">
        {itemLabel(part.kind)} · {duration(part.minutes)}
        {part.kind === "plate" ? ` · ${plural(part.perProduct, "copy")} on the plate` : ""}
        {printerNames.length > 0 ? ` · ${printerNames.join(", ")}` : ""}
      </p>
      <div className="actions">
        <button className="btn small ghost" type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
    </article>
  );
}

function nextVersionName(list: ProductVersion[]) {
  const numbers = list.map((version) => Number(/^v(\d+)$/i.exec(version.name)?.[1])).filter((value) => Number.isInteger(value));
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : list.length + 1;
  return `v${next}`;
}

function ItemForm({ productId, versionId, part, onClose }: { productId: string; versionId: string; part: Part | null; onClose: () => void }) {
  const shop = useShop();
  const [form, setForm] = useState<Omit<PartInput, "grams" | "minutes" | "perProduct" | "photo" | "clearPhoto" | "version" | "colors" | "filament" | "printers"> & { minutes: string; perProduct: string }>({
    product: productId,
    name: part?.name ?? "",
    kind: part?.kind ?? "piece",
    minutes: part ? String(part.minutes) : "45",
    perProduct: part ? String(part.perProduct) : "1",
  });
  const [slots, setSlots] = useState(() => {
    const saved = part ? partSlots(part) : [{ slot: "A", grams: 20 }];
    return saved.map((slot) => ({ slot: slot.slot, grams: String(slot.grams) }));
  });
  const [colorCount, setColorCount] = useState(String(slots.length));
  const [picked, setPicked] = useState<string[]>(() => {
    const saved = (part?.printers ?? []).filter((id) => shop.printers.some((printer) => printer.id === id));
    return saved.length > 0 ? saved : shop.printers.map((printer) => printer.id);
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState("");
  const multiple = form.kind === "plate";
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  const savedPhoto = !cleared && part?.photo ? recordFileUrl("parts", part.id, part.photo, "200x200f") : "";
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);
  return (
    <form
      className="stack"
      onSubmit={submit(() => {
        const minutes = readWhole(form.minutes);
        const perProduct = multiple ? readWhole(form.perProduct) : 1;
        const uses = slots.map((slot, index) => ({ slot: letterFor(index), filament: "", grams: readDecimal(slot.grams) ?? 0 }));
        if (uses.some((slot) => slot.grams <= 0)) {
          setError("Enter the grams for each color, like 12.5.");
          return;
        }
        if (minutes == null || minutes < 1 || perProduct == null || perProduct < 1) {
          setError(multiple ? "Enter a printing time and how many copies are on the plate." : "Enter a printing time.");
          return;
        }
        const chosen = picked.filter((id) => shop.printers.some((printer) => printer.id === id));
        if (shop.printers.length > 0 && chosen.length === 0) {
          setError("Choose at least one printer for this plate.");
          return;
        }
        setError("");
        void shop
          .savePart(
            {
              ...form,
              product: productId,
              version: versionId,
              filament: "",
              grams: uses.reduce((sum, slot) => sum + slot.grams, 0),
              minutes,
              perProduct,
              colors: uses,
              printers: chosen.length === shop.printers.length ? [] : chosen,
              photo,
              clearPhoto: cleared && !photo,
            },
            part?.id,
          )
          .then(onClose)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save."));
      })}
    >
      <div className="printer-photo-field">
        <ProductPhoto name={form.name || "Item"} src={preview || savedPhoto} size={72} />
        <div className="stack" style={{ gap: 8 }}>
          <label className="btn small ghost">
            {preview || savedPhoto ? "Change photo" : "Add photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > 5 * 1024 * 1024) {
                  setError("Use a photo under 5 MB.");
                  event.target.value = "";
                  return;
                }
                setError("");
                setPhoto(file);
                setCleared(false);
              }}
            />
          </label>
          {preview || savedPhoto ? (
            <button
              className="btn small ghost"
              type="button"
              onClick={() => {
                setPhoto(null);
                setCleared(true);
              }}
            >
              Remove photo
            </button>
          ) : null}
        </div>
      </div>
      <Field label="Name">
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </Field>
      <div className="field">
        <span>Items</span>
        <Segment
          value={form.kind}
          onChange={(kind) =>
            setForm({
              ...form,
              kind,
              perProduct: kind === "piece" ? "1" : form.perProduct === "1" ? "2" : form.perProduct,
            })
          }
          options={[
            { id: "piece", label: "Single" },
            { id: "plate", label: "Multiple" },
          ]}
        />
        <small>
          {multiple
            ? "The same product, repeated on one plate. Set how many colors this plate uses and the grams for each. The print assigns Color A, Color B, and the rest to real filaments."
            : "One product on its own plate. Set how many colors this item uses and the grams for each. The print assigns Color A, Color B, and the rest to real filaments."}
        </small>
      </div>
      <div className="grid-2">
        {multiple ? (
          <Field label="Copies on plate">
            <NumericInput value={form.perProduct} onChange={(perProduct) => setForm({ ...form, perProduct })} />
          </Field>
        ) : null}
        <Field label="Printing time">
          <DurationInput value={form.minutes} onChange={(minutes) => setForm({ ...form, minutes })} />
        </Field>
      </div>
      <Field label="Colors" hint="How many colors this plate or item uses. Grams are set here. Each print chooses which filament is Color A, Color B, and the rest.">
        <NumericInput
          value={colorCount}
          onChange={(value) => {
            setColorCount(value);
            const count = readWhole(value);
            if (count == null) return;
            const next = Math.min(8, Math.max(1, count));
            if (String(next) !== value) setColorCount(String(next));
            setSlots((current) => {
              const copy = current.slice(0, next).map((slot, index) => ({ ...slot, slot: letterFor(index) }));
              while (copy.length < next) copy.push({ slot: letterFor(copy.length), grams: "" });
              return copy;
            });
          }}
        />
      </Field>
      <div className="color-slots">
        {slots.map((slot, index) => (
          <Field key={slot.slot} label={`Color ${slot.slot} grams`}>
            <NumericInput
              value={slot.grams}
              onChange={(grams) => setSlots((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, grams } : item)))}
              required
            />
          </Field>
        ))}
      </div>
      <div className="field">
        <span>Printers</span>
        <small>Only the printers you leave on can print this plate. Leave them all on to allow every printer.</small>
        {shop.printers.length === 0 ? (
          <small>Add a printer in Workshop first.</small>
        ) : (
          <div className="printer-picks">
            {shop.printers.map((printer) => {
              const on = picked.includes(printer.id);
              return (
                <label key={printer.id} className={on ? "printer-pick on" : "printer-pick"}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setPicked((current) => (on ? current.filter((id) => id !== printer.id) : [...current, printer.id]))}
                  />
                  <span className="printer-pick-name">{printer.name}</span>
                  <span className="muted">{printer.active ? printer.model : "Off"}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
      <FormError message={error} />
      <div className="actions">
        {part ? (
          <button className="btn danger" type="button" onClick={() => void shop.deletePart(part.id).then(onClose).catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't delete."))}>
            Delete
          </button>
        ) : null}
        <button className="btn primary" type="submit">
          Save item
        </button>
      </div>
    </form>
  );
}
