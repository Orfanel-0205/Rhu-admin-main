// src/components/DateRangeFilter.tsx
//
// "Who did we see on the fourteenth?"
//
// The long record lists — consultations, prescriptions, telemedicine — are
// ordered newest first, which is right for today and useless for last month.
// Staff looking for a particular clinic day had to page backwards through
// everything until they reached it.
//
// The shortcuts are the answer to the question actually being asked. Somebody
// hunting a specific day usually wants today, yesterday, or the last week; the
// two date boxes are there for the rarer case where they want a stretch. "All
// dates" is a real option rather than an empty state, because browsing the
// whole history newest-first is still a legitimate thing to do.

import type { CSSProperties } from "react";
import { CalendarDays, X } from "lucide-react";

export interface DateRange {
  /** YYYY-MM-DD, or "" for unbounded. */
  from: string;
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: "", to: "" };

function isoDay(offsetDays = 0): string {
  const date = new Date();

  date.setDate(date.getDate() + offsetDays);

  return date.toISOString().slice(0, 10);
}

/** Describes the current selection in the words someone would say out loud. */
export function describeRange(range: DateRange): string {
  if (!range.from && !range.to) return "All dates, newest first";
  if (range.from && range.from === range.to) return `On ${range.from}`;
  if (range.from && range.to) return `${range.from} to ${range.to}`;
  if (range.from) return `From ${range.from}`;

  return `Up to ${range.to}`;
}

export default function DateRangeFilter({
  value,
  onChange,
  label = "Dates",
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  label?: string;
}) {
  const active = !!(value.from || value.to);

  const shortcuts: Array<{ key: string; label: string; range: DateRange }> = [
    { key: "today", label: "Today", range: { from: isoDay(0), to: isoDay(0) } },
    { key: "yesterday", label: "Yesterday", range: { from: isoDay(-1), to: isoDay(-1) } },
    { key: "week", label: "Last 7 days", range: { from: isoDay(-6), to: isoDay(0) } },
    { key: "month", label: "Last 30 days", range: { from: isoDay(-29), to: isoDay(0) } },
  ];

  function matches(range: DateRange): boolean {
    return value.from === range.from && value.to === range.to;
  }

  return (
    <div style={wrapStyle}>
      <div style={headRowStyle}>
        <span style={labelStyle}>
          <CalendarDays size={15} />
          {label}
        </span>

        <span style={summaryStyle}>{describeRange(value)}</span>
      </div>

      <div style={chipRowStyle}>
        <button
          type="button"
          onClick={() => onChange(EMPTY_RANGE)}
          style={chipStyle(!active)}
        >
          All dates
        </button>

        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.key}
            type="button"
            onClick={() => onChange(shortcut.range)}
            style={chipStyle(matches(shortcut.range))}
          >
            {shortcut.label}
          </button>
        ))}
      </div>

      <div style={inputRowStyle}>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>From</span>
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>To</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
            style={inputStyle}
          />
        </label>

        {active ? (
          <button type="button" onClick={() => onChange(EMPTY_RANGE)} style={clearStyle}>
            <X size={14} /> Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: "14px 16px",
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 16,
};

const headRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const labelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  fontWeight: 900,
  color: "#0F172A",
};

const summaryStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "#047857",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
};

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "7px 13px",
    borderRadius: 999,
    border: active ? "1px solid #047857" : "1px solid #E2E8F0",
    background: active ? "#047857" : "#FFFFFF",
    color: active ? "#FFFFFF" : "#334155",
    fontSize: 12.5,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const inputRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "flex-end",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 150,
  flex: "1 1 150px",
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "#64748B",
};

const inputStyle: CSSProperties = {
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 13.5,
  width: "100%",
};

const clearStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "9px 13px",
  borderRadius: 999,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
};
