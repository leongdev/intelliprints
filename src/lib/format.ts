import type { RangeKey } from "../types";

export function roundGrams(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Hundredths of a gram, so 104.08 compares without float noise. */
export function gramUnits(value: number) {
  return Math.round(roundGrams(value) * 100);
}

export function grams(value: number) {
  const n = Number.isFinite(value) ? value : 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}${(roundGrams(abs) / 1000).toFixed(2)} kg`;
  const rounded = roundGrams(abs);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${sign}${text} g`;
}

export function keepNumber(raw: string, decimal: boolean) {
  const text = raw.replace(/,/g, ".");
  if (!decimal) return text.replace(/\D/g, "");
  let out = "";
  let dot = false;
  let frac = 0;
  for (const char of text) {
    if (char >= "0" && char <= "9") {
      if (dot) {
        if (frac >= 2) continue;
        frac += 1;
      }
      out += char;
    } else if (char === "." && !dot) {
      dot = true;
      out += ".";
    }
  }
  return out;
}

export function readDecimal(value: string) {
  const text = value.trim().replace(",", ".");
  if (!text || text === ".") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return roundGrams(n);
}

export function readWhole(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

export function money(value: number, currency = "USD") {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function materialCost(weightGrams: number, pricePerKg: number) {
  return Math.round((weightGrams / 1000) * pricePerKg * 10000) / 10000;
}

export function duration(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function plural(count: number, word: string) {
  return `${count} ${word}${Math.abs(count) === 1 ? "" : "s"}`;
}

export function parsePbDate(value: string) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ago(value: string) {
  const date = parsePbDate(value);
  if (!date) return "";
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function elapsed(value: string, now = Date.now()) {
  const date = parsePbDate(value);
  if (!date) return "0m";
  return duration((now - date.getTime()) / 60000);
}

export function inRange(value: string, range: RangeKey, now = Date.now()) {
  if (range === "all") return true;
  const date = parsePbDate(value);
  if (!date) return false;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return now - date.getTime() <= days * 86400000;
}

export function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function lastDays(count: number, now = new Date()) {
  const days: Date[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - index);
    days.push(date);
  }
  return days;
}

export function weekday(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function makeJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

/** New id that still works on http://192.168.x.x, where randomUUID is missing. */
export function newId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function percent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
