// src/components/ui/ModuleTabs.tsx
// Horizontal tab switcher for in-page sections (e.g. Active | History,
// or History categories). Keyboard accessible.
//
// Panelist follow-up round: restyled from the old underline look to the
// SEGMENTED-PILL pattern the panelist pointed to as the system-wide standard
// (the "RHU Queue Monitoring / Barangay Disease Cluster" toggle on the
// Heatmap page): active = filled teal pill, inactive = white outline pill.
// API is unchanged — every consumer (Reports, Analytics, Dashboard, SMS)
// picks the new look up automatically with zero logic changes.

import type { CSSProperties, ReactNode } from "react";
import { color, radius, space } from "../../theme/tokens";

export interface TabItem {
  key: string;
  label: ReactNode;
  /** Optional count / badge shown after the label. */
  badge?: ReactNode;
  icon?: ReactNode;
}

interface ModuleTabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  style?: CSSProperties;
}

export default function ModuleTabs({ tabs, active, onChange, style }: ModuleTabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: space.sm,
        flexWrap: "wrap",
        alignItems: "center",
        ...style,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 14px",
              minHeight: 40,
              border: `1px solid ${on ? color.brandDark : color.line}`,
              borderRadius: radius.md,
              background: on ? color.brandDark : color.surface,
              color: on ? "#FFFFFF" : color.slateFg,
              fontFamily: "inherit",
              fontSize: 13.5,
              fontWeight: on ? 900 : 800,
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: on
                ? "0 10px 22px rgba(15,118,110,.22)"
                : "0 6px 14px rgba(15,23,42,.04)",
            }}
          >
            {t.icon}
            {t.label}
            {t.badge != null ? (
              <span
                style={{
                  marginLeft: 2,
                  minWidth: 20,
                  height: 20,
                  padding: "0 6px",
                  borderRadius: radius.pill,
                  background: on ? "rgba(255,255,255,.22)" : color.surfaceSunken,
                  color: on ? "#FFFFFF" : color.textMuted,
                  fontSize: 11,
                  fontWeight: 800,
                  display: "inline-grid",
                  placeItems: "center",
                }}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
