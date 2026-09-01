// src/components/heatmap/RhuFilterChips.tsx
//
// Shared RHU focus filter for the Heatmap Analytics page. One state drives the
// whole page (chips in the hero AND above the operational maps render this same
// component), so changing focus anywhere updates every map and ranking at once.

import type { CSSProperties } from "react";

export type RhuFocus = "all" | 1 | 2;

export default function RhuFilterChips({
  value,
  onChange,
  counts,
  compact = false,
}: {
  value: RhuFocus;
  onChange: (next: RhuFocus) => void;
  /** Badge counts: barangays with active case signals per scope. */
  counts: { all: number; rhu1: number; rhu2: number };
  /** Smaller paddings for use inside section headers. */
  compact?: boolean;
}) {
  const options: { key: RhuFocus; label: string; count: number }[] = [
    { key: "all", label: "All RHUs", count: counts.all },
    { key: 1, label: "RHU 1", count: counts.rhu1 },
    { key: 2, label: "RHU 2", count: counts.rhu2 },
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
              ...(active ? activeChipStyle : {}),
            }}
          >
            {option.label}
            <span style={{ ...badgeStyle, ...(active ? activeBadgeStyle : {}) }}>
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
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 999,
  fontFamily: "inherit",
  fontWeight: 900,
  cursor: "pointer",
  minHeight: 38,
  boxShadow: "0 6px 16px rgba(15,23,42,.04)",
};

const activeChipStyle: CSSProperties = {
  background: "#0F766E",
  borderColor: "#0F766E",
  color: "#FFFFFF",
  boxShadow: "0 10px 22px rgba(15,118,110,.22)",
};

const badgeStyle: CSSProperties = {
  background: "#F1F5F9",
  color: "#334155",
  borderRadius: 999,
  padding: "1px 8px",
  fontSize: 11.5,
  fontWeight: 950,
};

const activeBadgeStyle: CSSProperties = {
  background: "rgba(255,255,255,.22)",
  color: "#FFFFFF",
};
