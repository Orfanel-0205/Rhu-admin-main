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
//
// LAYOUT
// ------
// One row, not a card. The first version gave the date inputs `flex: 1 1 150px`
// and they grew to fill the width — two 700px-wide boxes holding ten characters
// each, turning a filter into a second banner above the table it filters. The
// inputs are now a fixed width and the row wraps only when it has to, so this
// reads as a control strip attached to the list rather than a panel competing
// with it.

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
    { key: "week", label: "7 days", range: { from: isoDay(-6), to: isoDay(0) } },
    { key: "month", label: "30 days", range: { from: isoDay(-29), to: isoDay(0) } },
  ];

  function matches(range: DateRange): boolean {
    return value.from === range.from && value.to === range.to;
  }

  return (
    <div style={wrapStyle}>
      <span style={labelStyle}>
        <CalendarDays size={15} />
        {label}
      </span>

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

      <span style={dividerStyle} />

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
          <X size={13} /> Clear
        </button>
      ) : null}

      {/* Pushed right so the row reads left-to-right as controls, then result. */}
      <span style={summaryStyle}>{describeRange(value)}</span>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
  padding: "10px 14px",
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
};

const labelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginRight: 3,
  fontSize: 12.5,
  fontWeight: 900,
  color: "#0F172A",
  whiteSpace: "nowrap",
};

const dividerStyle: CSSProperties = {
  width: 1,
  alignSelf: "stretch",
  minHeight: 22,
  margin: "0 4px",
  background: "#E2E8F0",
};

const summaryStyle: CSSProperties = {
  marginLeft: "auto",
  paddingLeft: 10,
  fontSize: 12,
  fontWeight: 700,
  color: "#047857",
  whiteSpace: "nowrap",
};

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 999,
    border: active ? "1px solid #047857" : "1px solid #E2E8F0",
    background: active ? "#047857" : "#FFFFFF",
    color: active ? "#FFFFFF" : "#334155",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const fieldStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  // Fixed, never grows. This is the whole point of the rewrite.
  flex: "0 0 auto",
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "#64748B",
};

const inputStyle: CSSProperties = {
  width: 142,
  padding: "6px 9px",
  borderRadius: 9,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 12.5,
};

const clearStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 11px",
  borderRadius: 999,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
