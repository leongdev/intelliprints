import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { keepNumber, readWhole } from "../lib/format";
import { recordFileUrl } from "../lib/pb";
import type { Printer, Product } from "../types";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 97 97" aria-hidden="true">
      <path
        fill="#00df00"
        fillRule="evenodd"
        d="M0 0H97V97H0Z M25 0H72L48.5 24Z M0 25V72L24 48.5Z M97 25L73 48.5 97 72Z M25 97L48.5 73 72 97Z"
      />
    </svg>
  );
}

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.1" fill="currentColor" />
      <path d="M12 4.6v2.2M12 17.2v2.2M4.6 12h2.2M17.2 12h2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className={cn("modal", wide && "wide")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Meter({ value, tone = "orange" }: { value: number; tone?: "orange" | "green" | "red" | "amber" }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("meter", tone)} aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100} role="meter">
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="orb small" aria-hidden="true">
        <Logo />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segment" role="tablist">
      {options.map((option) => (
        <button key={option.id} type="button" className={value === option.id ? "on" : ""} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p className="form-error">{message}</p>;
}

export function DurationInput({ value, onChange }: { value: string; onChange: (minutes: string) => void }) {
  const initial = readWhole(value) ?? 0;
  const [hours, setHours] = useState(String(Math.floor(initial / 60)));
  const [minutes, setMinutes] = useState(String(initial % 60));

  function emit(nextHours: string, nextMinutes: string) {
    onChange(String((readWhole(nextHours) ?? 0) * 60 + (readWhole(nextMinutes) ?? 0)));
  }

  return (
    <div className="duration-input">
      <span className="duration-part">
        <input
          className="hours"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Hours"
          placeholder="0"
          value={hours}
          onChange={(event) => {
            const next = keepNumber(event.target.value, false).slice(0, 4);
            setHours(next);
            emit(next, minutes);
          }}
        />
        <span>h</span>
      </span>
      <span className="duration-part">
        <input
          className="mins"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Minutes"
          placeholder="0"
          value={minutes}
          onChange={(event) => {
            const cleaned = keepNumber(event.target.value, false).slice(0, 2);
            if (cleaned === "" || Number(cleaned) < 60) {
              setMinutes(cleaned);
              emit(hours, cleaned);
              return;
            }
            const extra = Math.floor(Number(cleaned) / 60);
            const rest = String(Number(cleaned) % 60);
            const nextHours = String((readWhole(hours) ?? 0) + extra);
            setHours(nextHours);
            setMinutes(rest);
            emit(nextHours, rest);
          }}
        />
        <span>m</span>
      </span>
    </div>
  );
}

export function NumericInput({
  value,
  onChange,
  decimal = false,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  decimal?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode">) {
  return (
    <input
      {...rest}
      inputMode={decimal ? "decimal" : "numeric"}
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(keepNumber(event.target.value, decimal))}
    />
  );
}

export function submit(handler: () => void) {
  return (event: FormEvent) => {
    event.preventDefault();
    handler();
  };
}

export function PrinterPhoto({
  printer,
  name,
  src,
  size = 40,
}: {
  printer?: Printer;
  name?: string;
  src?: string;
  size?: number;
}) {
  const label = printer?.name || name || "Printer";
  const url = src ?? (printer?.avatar ? recordFileUrl("printers", printer.id, printer.avatar, "200x200f") : "");
  const [failed, setFailed] = useState(false);
  const initial = label.trim().slice(0, 1).toUpperCase() || "P";

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <span className="printer-photo" style={{ width: size, height: size, minWidth: size }} aria-hidden="true">
      {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : initial}
    </span>
  );
}

export function ProductPhoto({ product, name, src, size = 44 }: { product?: Product; name?: string; src?: string; size?: number }) {
  const label = product?.name || name || "Product";
  const url = src ?? (product?.photo ? recordFileUrl("products", product.id, product.photo, "200x200f") : "");
  const [failed, setFailed] = useState(false);
  const initial = label.trim().slice(0, 1).toUpperCase() || "P";

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <span className="product-photo" style={{ width: size, height: size, minWidth: size }} aria-hidden="true">
      {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : initial}
    </span>
  );
}
