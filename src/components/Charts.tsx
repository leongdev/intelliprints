import { materialColor } from "../lib/metrics";

export function StackedBars({
  rows,
  labels,
  tips,
}: {
  rows: Array<Array<{ value: number; color: string }>>;
  labels: string[];
  tips: string[];
}) {
  const totals = rows.map((parts) => parts.reduce((sum, part) => sum + part.value, 0));
  const max = Math.max(1, ...totals);
  return (
    <div className="bars tall" style={{ gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))` }} aria-hidden="true">
      {rows.map((parts, index) => {
        const total = totals[index] ?? 0;
        return (
          <div key={labels[index] ?? index} className="bar-col" title={tips[index]}>
            <div className="bar-track">
              {total <= 0 ? (
                <div className="bar-fill ghost" />
              ) : (
                <div className="bar-stack" style={{ height: `${Math.max(18, (total / max) * 100)}%` }}>
                  {parts.map((part) =>
                    part.value <= 0 ? null : (
                      <span key={part.color} style={{ flex: part.value, background: part.color }} />
                    ),
                  )}
                </div>
              )}
            </div>
            <span>{labels[index]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Gauge({ value, caption }: { value: number; caption: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 68;
  const length = Math.PI * radius;
  const filled = (clamped / 100) * length;
  return (
    <div className="gauge">
      <svg viewBox="0 0 180 108" role="img" aria-label={caption}>
        <defs>
          <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d7f5a8" />
            <stop offset="55%" stopColor="#8ed36a" />
            <stop offset="100%" stopColor="#5dae4c" />
          </linearGradient>
        </defs>
        <path d="M18 96 A72 72 0 0 1 162 96" fill="none" stroke="#eef1f4" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M18 96 A72 72 0 0 1 162 96"
          fill="none"
          stroke="url(#gauge-fill)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${length}`}
        />
        <text x="90" y="86" textAnchor="middle" className="gauge-value">
          {Math.round(clamped)}%
        </text>
      </svg>
      <p>{caption}</p>
    </div>
  );
}

export function Bars({
  values,
  labels,
  captions,
}: {
  values: number[];
  labels: string[];
  captions: string[];
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="bars" style={{ gridTemplateColumns: `repeat(${Math.max(values.length, 1)}, minmax(0, 1fr))` }} aria-hidden="true">
      {values.map((value, index) => (
        <div key={labels[index] ?? index} className="bar-col">
          <div className="bar-track">
            <div className={value > 0 ? "bar-fill" : "bar-fill empty"} style={{ height: value > 0 ? `${Math.max(8, (value / max) * 100)}%` : "100%" }} />
          </div>
          <strong>{captions[index]}</strong>
          <span>{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({
  slices,
  center,
  caption,
}: {
  slices: Array<{ label: string; value: number; color?: string }>;
  center: string;
  caption: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const painted = total > 0 ? slices : [{ label: "Empty", value: 1, color: "#2a2a30" }];
  const paintedTotal = painted.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={caption}>
        {painted.map((slice) => {
          const length = (slice.value / paintedTotal) * circumference;
          const dash = `${length} ${circumference - length}`;
          const element = (
            <circle
              key={slice.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={slice.color || materialColor(slice.label)}
              strokeWidth="12"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += length;
          return element;
        })}
        <text x="60" y="58" textAnchor="middle" className="donut-center">
          {center}
        </text>
        <text x="60" y="74" textAnchor="middle" className="donut-caption">
          {caption}
        </text>
      </svg>
      <ul className="legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <i style={{ background: slice.color || materialColor(slice.label) }} />
            <span>{slice.label}</span>
            <strong>{total > 0 ? `${Math.round((slice.value / total) * 100)}%` : "0%"}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
