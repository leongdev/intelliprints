import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShop } from "../context/Workshop";
import { useDraft, useDrafts } from "../context/Drafts";
import { Field, FormError, Modal, PrinterPhoto, submit } from "../components/ui";
import { recordFileUrl } from "../lib/pb";
import type { Printer } from "../types";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "BRL", "MXN"];

export function WorkspacePage() {
  const shop = useShop();
  const drafts = useDrafts();
  const draftKey = `workspace:${shop.workspace.id}`;
  const [name, setName] = useState(() => drafts.peek<{ name: string; currency: string }>(draftKey)?.name ?? shop.workspace.name);
  const [currency, setCurrency] = useState(() => drafts.peek<{ name: string; currency: string }>(draftKey)?.currency ?? shop.workspace.currency);
  const [printer, setPrinter] = useState<Printer | "new" | null>(null);
  const [error, setError] = useState("");
  const draftValue = useMemo(() => ({ name, currency }), [name, currency]);
  const dirty = name.trim() !== shop.workspace.name || currency !== shop.workspace.currency;

  useEffect(() => {
    const stored = drafts.peek<{ name: string; currency: string }>(draftKey);
    setName(stored?.name ?? shop.workspace.name);
    setCurrency(stored?.currency ?? shop.workspace.currency);
    // Only when the active workshop changes. Saved values are read from that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useDraft(draftKey, draftValue, dirty, async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      shop.toast("Name the workshop.", "bad");
      throw new Error("Name the workshop.");
    }
    await shop.updateWorkspace({ name: trimmed, currency });
  });

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="panel-head">
          <div>
            <p className="kicker">Workshop</p>
            <h2>{shop.workspace.name}</h2>
          </div>
        </div>
        <form
          className="grid-2"
          onSubmit={submit(() => {
            if (!dirty) return;
            void drafts.saveAll().catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save."));
          })}
        >
          <Field label="Name">
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {CURRENCIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </form>
        <FormError message={error} />
      </section>
      <section className="panel stack">
        <div className="panel-head">
          <div>
            <h2>Printers</h2>
            <p>Each machine can run one card. Split a queued job if you want the same part on two printers.</p>
          </div>
          <button className="btn dark" type="button" onClick={() => setPrinter("new")}>
            <Plus size={16} />
            Add Printer
          </button>
        </div>
        {shop.printers.map((item) => {
          const busy = shop.cards.some((card) => card.column === "printing" && card.printer === item.id);
          return (
            <div key={item.id} className="part-row printer-row">
              <PrinterPhoto printer={item} />
              <div className="printer-id">
                <strong>{item.name}</strong>
                <p className="muted">
                  {item.model || "No model"} · {item.active ? (busy ? "Printing" : "Idle") : "Disabled"}
                </p>
              </div>
              <button className="btn small ghost" type="button" onClick={() => setPrinter(item)}>
                Edit
              </button>
            </div>
          );
        })}
      </section>
      {printer ? <PrinterForm printer={printer === "new" ? null : printer} onClose={() => setPrinter(null)} /> : null}
    </div>
  );
}

function PrinterForm({ printer, onClose }: { printer: Printer | null; onClose: () => void }) {
  const shop = useShop();
  const [name, setName] = useState(printer?.name ?? "");
  const [model, setModel] = useState(printer?.model ?? "");
  const [active, setActive] = useState(printer?.active ?? true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  const saved = !cleared && printer?.avatar ? recordFileUrl("printers", printer.id, printer.avatar, "200x200f") : "";

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <Modal title={printer ? "Edit printer" : "Add printer"} onClose={onClose}>
      <form
        className="stack"
        onSubmit={submit(() => {
          void shop
            .savePrinter({ name, model, active, photo, clearPhoto: cleared && !photo }, printer?.id)
            .then(onClose)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save."));
        })}
      >
        <div className="printer-photo-field">
          <PrinterPhoto name={name || "Printer"} src={preview || saved} />
          <div className="stack" style={{ gap: 8 }}>
            <label className="btn small ghost">
              {preview || saved ? "Change photo" : "Add photo"}
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
            {preview || saved ? (
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
        <Field label="Model">
          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Bambu P1S" />
        </Field>
        <label className="note">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active and available for new jobs
        </label>
        <FormError message={error} />
        <div className="actions">
          {printer ? (
            <button className="btn danger" type="button" onClick={() => void shop.deletePrinter(printer.id).then(onClose).catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't delete."))}>
              Delete
            </button>
          ) : null}
          <button className="btn primary" type="submit">
            Save printer
          </button>
        </div>
      </form>
    </Modal>
  );
}
