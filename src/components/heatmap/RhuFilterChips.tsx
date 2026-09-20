// src/components/heatmap/RhuFilterChips.tsx
//
// Shared RHU focus filter for the Heatmap Analytics page. One state drives the
// whole page (chips in the hero AND above the operational maps render this same
// component), so changing focus anywhere updates every map and ranking at once.
//
// The chips are built from the live facility list: open a third RHU and a third
// chip appears here, with its own count, without touching this file.

import type { CSSProperties } from "react";

import { useRhuOptions } from "../../hooks/useRhuOptions";

/** "all", or a facility id. */
export type RhuFocus = "all" | number;

export interface RhuFocusCounts {
  all: number;
  /** Barangays with active case signals, keyed by facility id. */
  byRhu: Record<number, number>;
}

export default function RhuFilterChips({
  value,
  onChange,
  counts,
  compact = false,
}: {
  value: RhuFocus;
  onChange: (next: RhuFocus) => void;
  counts: RhuFocusCounts;
  /** Smaller paddings for use inside section headers. */
  compact?: boolean;
}) {
  const facilities = useRhuOptions();

  const options: { key: RhuFocus; label: string; count: number }[] = [
    { key: "all", label: "All RHUs", count: counts.all },
    ...facilities.map((facility) => ({
      key: facility.id as RhuFocus,
      label: facility.label,
      count: counts.byRhu[facility.id] ?? 0,
    })),
  ];

  return (
    <div style={rowStyle} role="tablist" aria-label="Focus RHU">
      {options.map((option) => {
        const active = option.key === value;

        return (
          <button
            key={String(option.key)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.key)}
            style={{
              ...chipStyle,
              padding: compact ? "8px 13px" : "10px 16px",
              fontSize: compact ? 12.5 : 13.5,
              background: active ? "#0F766E" : "#FFFFFF",
              color: active ? "#FFFFFF" : "#0F172A",
              borderColor: active ? "#0F766E" : "#CBD5E1",
            }}
          >
            {option.label}
            <span
              style={{
                ...badgeStyle,
                background: active ? "rgba(255,255,255,0.22)" : "#F1F5F9",
                color: active ? "#FFFFFF" : "#475569",
              }}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #CBD5E1",
  borderRadius: 999,
  fontWeight: 800,
  cursor: "pointer",
  lineHeight: 1,
};

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 900,
};
