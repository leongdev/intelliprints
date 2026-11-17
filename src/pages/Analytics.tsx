import { useMemo, useState } from "react";
import { useShop } from "../context/Workshop";
import { Bars, Donut } from "../components/Charts";
import { Empty, Segment } from "../components/ui";
import { ago, grams, money, weekday } from "../lib/format";
import { dailyBuckets, filterEvents, groupEvents, materialColor, summarize } from "../lib/metrics";
import type { RangeKey } from "../types";

const RANGES: Array<{ id: RangeKey; label: string }> = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All" },
];

export function Analytics() {
  const shop = useShop();
  const [range, setRange] = useState<RangeKey>("30d");
  const milestoneIds = useMemo(() => new Set(shop.milestones.map((milestone) => milestone.id)), [shop.milestones]);
  const finished = useMemo(
    () => shop.cards.filter((card) => card.column === "done" && milestoneIds.has(card.milestone)),
    [shop.cards, milestoneIds],
  );
  const logged = useMemo(
    () => shop.events.filter((event) => milestoneIds.has(event.milestone) && finished.some((card) => card.product === event.product)),
    [shop.events, milestoneIds, finished],
  );
  const hasData = finished.length > 0 && logged.length > 0;
  const events = useMemo(() => filterEvents(logged, range), [logged, range]);
  const summary = summarize(events);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 14;
  const buckets = dailyBuckets(events, Math.min(days, 14));
  const byProduct = groupEvents(
    events,
    (event) => event.product || event.productName,
    (event) => event.productName || "Unknown product",
    () => "#ff4d1a",
  );
  const byFilament = groupEvents(
    events,
    (event) => event.filament || event.filamentLabel,
    (event) => event.filamentLabel || "Unknown spool",
    (event) => {
      const filament = shop.filaments.find((item) => item.id === event.filament);
      return filament ? materialColor(filament.material) : "#9a9aa3";
    },
  );
  const byMaterial = groupEvents(
    events,
    (event) => shop.filaments.find((item) => item.id === event.filament)?.material || event.filamentLabel,
    (event) => shop.filaments.find((item) => item.id === event.filament)?.material || "Other",
    (event) => materialColor(shop.filaments.find((item) => item.id === event.filament)?.material || "Other"),
  );

  function download() {
    const header = ["when", "outcome", "product", "part", "pieces", "grams_used", "grams_wasted", "cost", "filament", "note"];
    const lines = events.map((event) =>
      [event.created, event.outcome, event.productName, event.partName, event.pieces, event.gramsUsed, event.gramsWasted, event.cost, event.filamentLabel, event.note]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "intelliprints-events.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      {hasData ? (
        <div className="page-head">
          <div className="actions" style={{ marginLeft: "auto" }}>
            <Segment value={range} onChange={setRange} options={RANGES} />
            <button className="btn ghost" type="button" onClick={download} disabled={events.length === 0}>
              Download CSV
            </button>
          </div>
        </div>
      ) : null}
      {!hasData ? (
        <div className="panel">
          <Empty title="Nothing finished yet" body="Analytics appears after a milestone has a card in Done." />
        </div>
      ) : events.length === 0 ? (
        <div className="panel">
          <Empty title="Nothing in this range" body="Finished milestone cards are outside the days selected above." />
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi label="Good / bad" value={summary.ratio === null ? "—" : `${Math.round(summary.ratio * 100)}%`} detail={`${summary.goodPieces} good · ${summary.badPieces} failed`} />
            <Kpi label="Plastic used" value={grams(summary.gramsUsed)} detail={`${summary.jobs} logs`} />
            <Kpi label="Plastic wasted" value={grams(summary.gramsWasted)} detail={money(summary.wastedSpend, shop.workspace.currency)} />
            <Kpi label="Material spend" value={money(summary.spent, shop.workspace.currency)} detail="Used plus wasted" />
          </div>
          <div className="grid-2">
            <section className="panel">
              <h2>Throughput</h2>
              <p className="note">Grams through the printers, recent days in this range.</p>
              <div style={{ height: 16 }} />
              <Bars
                values={buckets.map((bucket) => bucket.grams)}
                labels={buckets.map((bucket) => weekday(bucket.date))}
                captions={buckets.map((bucket) => `${bucket.good}/${bucket.good + bucket.bad || 0}`)}
              />
            </section>
            <section className="panel">
              <h2>Spend by material</h2>
              <Donut
                slices={byMaterial.map((item) => ({ label: item.label, value: item.cost, color: item.color }))}
                center={money(summary.spent, shop.workspace.currency).replace(/\.00$/, "")}
                caption="spend"
              />
            </section>
          </div>
          {byProduct.length > 0 ? (
            <section className="panel">
              <h2>By product</h2>
              <Report rows={byProduct} currency={shop.workspace.currency} />
            </section>
          ) : null}
          {byFilament.length > 0 ? (
            <section className="panel">
              <h2>By spool</h2>
              <Report rows={byFilament} currency={shop.workspace.currency} />
            </section>
          ) : null}
          {events.length > 0 ? (
          <section className="panel">
            <h2>Recent logs</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Result</th>
                    <th>Part</th>
                    <th>Pieces</th>
                    <th>Plastic</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 20).map((event) => (
                    <tr key={event.id}>
                      <td>{ago(event.created)}</td>
                      <td className={event.outcome === "success" ? "tone-ok" : "tone-short"}>{event.outcome}</td>
                      <td>
                        {event.partName}
                        <div className="muted">{event.productName}</div>
                      </td>
                      <td>{event.pieces}</td>
                      <td>{event.outcome === "success" ? grams(event.gramsUsed) : `${grams(event.gramsWasted)} wasted`}</td>
                      <td>{money(event.cost, shop.workspace.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="panel kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <p className="muted">{detail}</p>
    </article>
  );
}

function Report({ rows, currency }: { rows: Array<{ key: string; label: string; good: number; bad: number; grams: number; cost: number }>; currency: string }) {
  if (rows.length === 0) return <p className="muted">Nothing in this range.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Good</th>
            <th>Failed</th>
            <th>Ratio</th>
            <th>Plastic</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const decided = row.good + row.bad;
            return (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{row.good}</td>
                <td>{row.bad}</td>
                <td>{decided ? `${Math.round((row.good / decided) * 100)}%` : "—"}</td>
                <td>{grams(row.grams)}</td>
                <td>{money(row.cost, currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
