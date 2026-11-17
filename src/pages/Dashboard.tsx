import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import { Empty, Meter } from "../components/ui";
import { useShop } from "../context/Workshop";
import { grams, materialCost, money, percent } from "../lib/format";
import { filamentPressure, milestoneProgress } from "../lib/metrics";
import { colorGroups } from "../lib/pools";
import { printerFor, printerUnavailable } from "../lib/schedule";
import type { PrintCard } from "../types";
import { PrintTimeline } from "./PrintTimeline";

type ShellContext = { query: string };

export function Dashboard() {
  const shop = useShop();
  const navigate = useNavigate();
  const { query } = useOutletContext<ShellContext>();
  const boardRef = useRef<HTMLDivElement>(null);
  const sawFullscreen = useRef(false);
  const [kiosk, setKiosk] = useState(false);
  const needle = query.trim().toLowerCase();
  const matches = (...parts: Array<string | undefined>) =>
    needle.length === 0 || parts.some((part) => part?.toLowerCase().includes(needle));

  const scheduled = shop.cards.filter((card) => {
    if (card.column !== "printing" && card.column !== "queue") return false;
    return matches(card.name, productName(shop, card.product));
  });

  function toggleKiosk() {
    const node = boardRef.current;
    const next = !kiosk;
    setKiosk(next);
    if (!node) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const el = node as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    if (next) {
      const request = node.requestFullscreen?.bind(node) ?? el.webkitRequestFullscreen?.bind(el);
      if (request) void Promise.resolve(request()).catch(() => undefined);
      return;
    }
    const active = document.fullscreenElement === node || doc.webkitFullscreenElement === node;
    if (!active) return;
    const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(doc);
    if (exit) void Promise.resolve(exit()).catch(() => undefined);
  }

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const sync = () => {
      const active = document.fullscreenElement === boardRef.current || doc.webkitFullscreenElement === boardRef.current;
      if (active) {
        sawFullscreen.current = true;
        return;
      }
      if (!sawFullscreen.current) return;
      sawFullscreen.current = false;
      setKiosk(false);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!kiosk) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setKiosk(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kiosk]);

  const shelfGrams = shop.filaments.reduce((sum, filament) => sum + filament.remainingGrams, 0);
  const shelfValue = shop.filaments.reduce((sum, filament) => sum + materialCost(filament.remainingGrams, filament.pricePerKg), 0);
  const pressures = colorGroups(shop.filaments)
    .map((group) => ({ group, pressure: filamentPressure(group.lead, shop.cards, shop.filaments) }))
    .filter((item) => matches(item.group.lead.color, item.group.lead.material, ...item.group.spools.map((spool) => spool.brand)))
    .sort((a, b) => toneRank(a.pressure.tone) - toneRank(b.pressure.tone) || a.group.remainingGrams / Math.max(1, a.group.spoolGrams) - b.group.remainingGrams / Math.max(1, b.group.spoolGrams));
  const byMaterial = new Map<string, number>();
  for (const filament of shop.filaments) byMaterial.set(filament.material, (byMaterial.get(filament.material) ?? 0) + filament.remainingGrams);
  const materialTotal = [...byMaterial.values()].reduce((sum, value) => sum + value, 0);
  const materialRows = [...byMaterial.entries()].sort((a, b) => b[1] - a[1]);
  const milestones = shop.milestones.filter((milestone) => matches(milestone.name, productName(shop, milestone.product), milestone.notes));

  function startPlanned(card: PrintCard) {
    if (card.blocked) {
      shop.toast(card.blockedReason || "Choose the colors before starting this plate.", "bad");
      return;
    }
    const printerId = printerFor(card, scheduled, shop.printers, Date.now(), shop.parts);
    if (!printerId) {
      shop.toast(printerUnavailable(card, scheduled, shop.printers, shop.parts), "bad");
      return;
    }
    void shop.startPrint(card, printerId).catch((err: unknown) => {
      shop.toast(err instanceof Error ? err.message : "Couldn't start that print.", "bad");
    });
  }

  if (shop.filaments.length === 0 && shop.products.length === 0 && shop.printers.length === 0) {
    return (
      <div className="panel">
        <Empty
          title="The bench is empty"
          body="Add the spools and printers you actually have, then build a product."
          action={
            <div className="actions" style={{ justifyContent: "center" }}>
              <Link className="btn ghost" to="/app/filaments">Add a spool</Link>
              <button className="btn primary" type="button" onClick={() => void shop.loadSample()}>Load sample shop</button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className={kiosk ? "home kiosk" : "home"} ref={boardRef}>
      <div className="kiosk-bar">
        <div className="kiosk-title">
          <strong>{shop.workspace.name}</strong>
          <p>Live workshop status</p>
        </div>
        <button className="btn ghost" type="button" aria-pressed={kiosk} onClick={toggleKiosk}>
          {kiosk ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {kiosk ? "Exit" : "Full screen"}
        </button>
      </div>
      <section className="home-timeline">
        <PrintTimeline
          cards={scheduled}
          printers={shop.printers}
          filaments={shop.filaments}
          parts={shop.parts}
          onOpen={() => navigate("/app/board")}
          onStart={startPlanned}
          onSchedule={(card, nextPrinter, start) => {
            void shop.scheduleCard(card, nextPrinter, start).catch((err: unknown) => {
              shop.toast(err instanceof Error ? err.message : "Couldn't move that print.", "bad");
            });
          }}
        />
      </section>
      <section className="home-miles">
        {milestones.length === 0 ? (
          <div className="panel">
            <p className="muted">No milestones yet.</p>
          </div>
        ) : null}
        {milestones.map((milestone) => {
          const progress = milestoneProgress(milestone, shop.parts, shop.events, shop.cards);
          return (
            <Link key={milestone.id} className="panel mile-card" to="/app/milestones">
              <div>
                <p className="kicker">{milestone.status === "done" ? "Complete" : "Active"} · {productName(shop, milestone.product)}</p>
                <h2>{milestone.name}</h2>
              </div>
              <div className="mile-line">
                <strong>
                  {Math.floor(progress.assembled)} / {milestone.targetQty} assembled
                </strong>
                <span className="muted">{Math.round(progress.partsPct)}% of parts</span>
              </div>
              <Meter value={percent(progress.partsPct)} tone={milestone.status === "done" ? "green" : "orange"} />
              <p className="note">
                {progress.parts.map((part) => `${part.name} ${part.good}/${part.needed}`).join(" · ") || "No parts on this milestone."}
              </p>
            </Link>
          );
        })}
      </section>

      <div className="home-lower">
        <section className="panel chart-card">
          <div className="chart-head">
            <div>
              <strong>{grams(shelfGrams)}</strong>
              <p>{money(shelfValue, shop.workspace.currency)} of plastic on the shelf</p>
            </div>
            <Link className="pill" to="/app/filaments">{shop.filaments.length} spools</Link>
          </div>
          <div className="dash-list">
            {pressures.length === 0 ? <p className="muted">No spools match.</p> : null}
            {pressures.map(({ group, pressure }) => (
              <div key={group.key} className="goal shelf-row">
                <span className="spool-orb" style={{ background: group.lead.colorHex }} aria-hidden="true" />
                <div className="shelf-copy">
                  <strong>{group.lead.color}</strong>
                  <span>
                    {group.lead.material}
                    {group.spools.length > 1 ? ` · ${group.spools.length} spools` : ""}
                    {pressure.tone === "short" ? ` · short ${grams(pressure.deficit)}` : pressure.tone === "low" ? " · reorder" : ""}
                  </span>
                  <div className="shelf-meter">
                    <Meter value={percent((group.remainingGrams / Math.max(1, group.spoolGrams)) * 100)} tone={pressure.tone === "short" ? "red" : pressure.tone === "low" ? "amber" : "green"} />
                    <b>{grams(group.remainingGrams)}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Plastic by material</h2>
              <p>What is actually on the shelf</p>
            </div>
          </div>
          {materialRows.length === 0 ? <p className="muted">No spools yet.</p> : (
            <>
              <div className="mix-bar">
                {materialRows.map(([label, value], index) => (
                  <span key={label} style={{ flex: value, background: MIX[index % MIX.length] }} />
                ))}
              </div>
              <ul className="mix-list">
                {materialRows.map(([label, value], index) => (
                  <li key={label}>
                    <i style={{ background: MIX[index % MIX.length] }} />
                    <span>{label}</span>
                    <strong>{grams(value)} · {shareLabel(value, materialTotal)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const MIX = ["#f0a04b", "#e3c15a", "#b7d96a", "#7dce62", "#5dae4c", "#8fd0c6", "#c9cdd4"];

function toneRank(tone: "ok" | "low" | "short") {
  if (tone === "short") return 0;
  if (tone === "low") return 1;
  return 2;
}

function shareLabel(value: number, total: number) {
  if (total <= 0 || value <= 0) return "0%";
  const pct = (value / total) * 100;
  if (pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

function productName(shop: ReturnType<typeof useShop>, productId: string) {
  return shop.products.find((item) => item.id === productId)?.name;
}

