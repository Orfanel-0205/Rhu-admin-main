// src/components/ui/FilterToolbar.tsx
// Compact filter bar: search box + a row of select/date filters + actions.
// Declarative `fields` so every module configures filters the same way.

import type { CSSProperties, ReactNode } from "react";
import { Search } from "lucide-react";
import { color, inputStyle, radius, space, surfaceStyle } from "../../theme/tokens";

export interface FilterField {
  key: string;
  label: string;
  type: "select" | "date" | "text";
  value: string;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  width?: number;
}

interface FilterToolbarProps {
  search?: string;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  fields?: FilterField[];
  onFieldChange?: (key: string, value: string) => void;
  /** Right-aligned actions (Export, Refresh, etc.). */
  actions?: ReactNode;
  style?: CSSProperties;
}

export default function FilterToolbar({
  search,
  searchPlaceholder = "Search…",
  onSearch,
  fields = [],
  onFieldChange,
  actions,
  style,
}: FilterToolbarProps) {
  return (
    <div
      style={{
        ...surfaceStyle,
        borderRadius: radius.lg,
        padding: space.md,
        display: "flex",
        alignItems: "flex-end",
        gap: space.md,
        flexWrap: "wrap",
        ...style,
      }}
    >
      {onSearch ? (
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <Search
            size={16}
            color={color.textFaint}
            style={{ position: "absolute", left: 12, top: 11, pointerEvents: "none" }}
          />
          <input
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>
      ) : null}

      {fields.map((f) => (
        <label key={f.key} style={{ display: "grid", gap: 4, minWidth: f.width ?? 150 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: color.textMuted }}>{f.label}</span>

          {f.type === "select" ? (
            <select
              value={f.value}
              onChange={(e) => onFieldChange?.(f.key, e.target.value)}
              style={inputStyle}
              aria-label={f.label}
            >
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.type === "date" ? "date" : "text"}
              value={f.value}
              placeholder={f.placeholder}
              onChange={(e) => onFieldChange?.(f.key, e.target.value)}
              style={inputStyle}
              aria-label={f.label}
            />
          )}
        </label>
      ))}

      {actions ? (
        <div style={{ display: "flex", gap: space.sm, marginLeft: "auto", alignItems: "center" }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
