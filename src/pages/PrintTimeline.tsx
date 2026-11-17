import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Play } from "lucide-react";
import { PrinterPhoto } from "../components/ui";
import { cardUses } from "../lib/colors";
import { duration } from "../lib/format";
import { buildSchedule, printerAllowed, type ScheduleSlot } from "../lib/schedule";
import type { Filament, Part, PrintCard, Printer } from "../types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const SNAP = 15 * MINUTE;

export function PrintTimeline({
  cards,
  printers,
  filaments,
  parts,
  onOpen,
  onStart,
  onSchedule,
  printerId = "all",
}: {
  cards: PrintCard[];
  printers: Printer[];
  filaments: Filament[];
  parts: Part[];
  onOpen: (card: PrintCard) => void;
  onStart: (card: PrintCard) => void;
  onSchedule: (card: PrintCard, printerId: string, start: number) => void;
  printerId?: string;
}) {
  const phone = usePhone();
  const portrait = usePortrait();
  const namePx = portrait ? 118 : phone ? 104 : 168;
  const hourPx = portrait ? 96 : phone ? 128 : 240;
  const [now, setNow] = useState(() => Date.now());
  const [drag, setDrag] = useState<{ cardId: string; printerId: string; start: number } | null>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; originX: number; originY: number; moved: boolean; printerId: string; start: number } | null>(null);
  const skipClick = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const planned = useMemo(() => {
    if (!drag) return cards;
    const startedAt = new Date(drag.start).toISOString();
    return cards.map((card) => (card.id === drag.cardId ? { ...card, printer: drag.printerId, startedAt } : card));
  }, [cards, drag]);
  const schedule = useMemo(
    () => buildSchedule(planned, printers, now, drag?.cardId ?? "", parts),
    [planned, printers, now, drag?.cardId, parts],
  );
  const earliest = schedule.slots.reduce((min, slot) => Math.min(min, slot.start), now);
  const latest = schedule.slots.reduce((max, slot) => Math.max(max, slot.end), now + 10 * HOUR);
  const rangeStart = Math.floor(Math.min(now - HOUR, earliest) / HOUR) * HOUR;
  const rangeEnd = Math.max(Math.ceil(Math.max(latest, schedule.horizon, now + 10 * HOUR) / HOUR) * HOUR, rangeStart + HOUR);
  const span = rangeEnd - rangeStart;
  const ticks: number[] = [];
  for (let time = rangeStart; time <= rangeEnd; time += HOUR) ticks.push(time);
  const track = (ticks.length - 1) * hourPx;
  const nowX = namePx + ((now - rangeStart) / span) * track;
  const rows = printerId === "all" ? schedule.rows : schedule.rows.filter((row) => row.printer.id === printerId);
  const blocked = cards.filter((card) => card.column === "queue" && card.blocked);
  const uncolored = blocked.filter((card) => cardUses(card).length === 0).length;
  const short = blocked.length - uncolored;

  if (rows.length === 0) {
    return (
      <section className="cal">
        <p className="muted">Add a printer in Workshop and the queue will line up on it.</p>
      </section>
    );
  }

  return (
    <section className="cal" style={{ "--cal-name": `${namePx}px` } as CSSProperties}>
      <div className="cal-scroll">
        <div className="cal-sheet" style={{ width: namePx + track }}>
          <div className="cal-names">
            <div className="cal-corner" />
            {rows.map((row) => (
              <div key={row.printer.id} className="cal-printer">
                <PrinterPhoto printer={row.printer} size={28} />
                <strong>{row.printer.name}</strong>
              </div>
            ))}
          </div>
          <div className="cal-time" ref={timeRef} style={{ width: track }}>
            <div className="cal-axis">
              {ticks.map((time, index) => (
                <span key={time} className="cal-hour" data-edge={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "mid"} style={{ left: `${((time - rangeStart) / span) * 100}%` }}>
                  {clock(time)}
                </span>
              ))}
            </div>
            {rows.map((row) => (
              <div key={row.printer.id} className={drag?.printerId === row.printer.id ? "cal-lane over" : "cal-lane"} data-printer={row.printer.id}>
                {ticks.map((time) => (
                  <i key={time} className="cal-gridline" style={{ left: `${((time - rangeStart) / span) * 100}%` }} />
                ))}
                {row.slots.length === 0 ? <span className="cal-empty">Nothing to print</span> : null}
                {row.slots.map((slot) => {
                  const start = Math.max(slot.start, rangeStart);
                  const end = Math.max(Math.min(slot.end, rangeEnd), start + MINUTE);
                  const filament = filaments.find((item) => item.id === slot.card.filament);
                  const dragging = drag?.cardId === slot.card.id;
                  return (
                    <div
                      key={slot.card.id}
                      className={`cal-item${slot.printing ? " printing" : ""}${slot.card.blocked ? " blocked" : ""}${dragging ? " dragging" : ""}`}
                      style={{ left: `${((start - rangeStart) / span) * 100}%`, width: `${((end - start) / span) * 100}%` }}
                      title={itemTitle(slot, filament)}
                      onPointerDown={(event) => {
                        if (event.button !== 0 || (event.target as HTMLElement).closest(".cal-play")) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragRef.current = {
                          pointerId: event.pointerId,
                          originX: event.clientX,
                          originY: event.clientY,
                          moved: false,
                          printerId: slot.printerId,
                          start: slot.start,
                        };
                      }}
                      onPointerMove={(event) => {
                        const current = dragRef.current;
                        if (!current || current.pointerId !== event.pointerId) return;
                        if (!current.moved && Math.hypot(event.clientX - current.originX, event.clientY - current.originY) < 5) return;
                        current.moved = true;
                        const under = printerAt(event.clientY, current.printerId);
                        const printerId = printerAllowed(slot.card, under, parts) ? under : current.printerId;
                        const start = timeAt(event.clientX, rangeStart, rangeEnd, span);
                        current.printerId = printerId;
                        current.start = start;
                        setDrag({ cardId: slot.card.id, printerId, start });
                      }}
                      onPointerUp={(event) => {
                        const current = dragRef.current;
                        if (!current || current.pointerId !== event.pointerId) return;
                        dragRef.current = null;
                        setDrag(null);
                        if (!current.moved) return;
                        skipClick.current = true;
                        onSchedule(slot.card, current.printerId, current.start);
                      }}
                    >
                      {slot.printing || slot.card.blocked ? null : (
                        <button type="button" className="cal-play" aria-label={`Start ${slot.card.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onStart(slot.card)}>
                          <Play size={12} fill="currentColor" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="cal-open"
                        onClick={() => {
                          if (skipClick.current) {
                            skipClick.current = false;
                            return;
                          }
                          onOpen(slot.card);
                        }}
                      >
                        <b>{slot.card.name}</b>
                        <small>{slot.printing ? "Printing" : slot.card.blocked ? "Waiting" : duration((slot.end - slot.start) / MINUTE)}</small>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="cal-now" style={{ left: nowX }}>
            <b>Right now</b>
          </div>
        </div>
      </div>
      {uncolored > 0 ? (
        <p className="cal-held">
          {uncolored} {uncolored === 1 ? "card needs" : "cards need"} colors. Set the filaments on {uncolored === 1 ? "that card" : "each card"} before {uncolored === 1 ? "it" : "they"} can start.
        </p>
      ) : null}
      {short > 0 ? (
        <p className="cal-held">
          {short} {short === 1 ? "card is" : "cards are"} waiting on filament. {short === 1 ? "It stays" : "They stay"} on the calendar, and {short === 1 ? "it" : "they"} can't start until you restock.
        </p>
      ) : null}
    </section>
  );
}

function timeAt(clientX: number, rangeStart: number, rangeEnd: number, span: number) {
  const rect = document.querySelector(".cal-time")?.getBoundingClientRect();
  if (!rect || rect.width <= 0) return rangeStart;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const snapped = Math.round((rangeStart + ratio * span) / SNAP) * SNAP;
  return Math.min(rangeEnd - SNAP, Math.max(rangeStart, snapped));
}

function printerAt(clientY: number, fallback: string) {
  const lanes = document.querySelectorAll<HTMLElement>(".cal-lane");
  for (const lane of lanes) {
    const rect = lane.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) return lane.dataset.printer || fallback;
  }
  return fallback;
}

function itemTitle(slot: ScheduleSlot, filament: Filament | undefined) {
  const state = slot.printing ? "printing" : "planned";
  return `${slot.card.name}, ${state}${filament ? `, ${filament.color}` : ""}`;
}

function usePhone() {
  return useMedia("(max-width: 800px)");
}

function usePortrait() {
  return useMedia("(orientation: portrait)");
}

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
