// src/components/ui/StatStrip.tsx
// Compact horizontal metric strip — replaces scattered metric cards.
// One row of dividers on wide screens; wraps cleanly on tablets.

import type { CSSProperties, ReactNode } from "react";
import { color, radius, shadow, space, TONE_STYLES, type Tone } from "../../theme/tokens";

export interface StatItem {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
  onClick?: () => void;
}

interface StatStripProps {
  items: StatItem[];
  /** Minimum column width before wrapping. */
  minColWidth?: number;
  style?: CSSProperties;
}

export default function StatStrip({ items, minColWidth = 180, style }: StatStripProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minColWidth}px, 1fr))`,
        background: color.surface,
        border: `1px solid ${color.line}`,
        borderRadius: radius.xl,
        boxShadow: shadow.card,
        overflow: "hidden",
        ...style,
      }}
    >
      {items.map((item, i) => {
        const tone = item.tone ? TONE_STYLES[item.tone] : null;
        return (
          <div
            key={i}
            onClick={item.onClick}
            role={item.onClick ? "button" : undefined}
            tabIndex={item.onClick ? 0 : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: space.md,
              padding: `${space.lg}px ${space.xl}px`,
              borderLeft: i === 0 ? "none" : `1px solid ${color.lineSoft}`,
              cursor: item.onClick ? "pointer" : "default",
              minWidth: 0,
            }}
          >
            {item.icon ? (
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  background: tone ? tone.bg : color.brandTintBg,
                  border: `1px solid ${tone ? tone.border : color.brandBorder}`,
                  color: tone ? tone.fg : color.brandDark,
                }}
              >
                {item.icon}
              </div>
            ) : null}

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: color.ink,
                  lineHeight: 1.1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.value}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: color.textMuted, marginTop: 2 }}>
                {item.label}
              </div>
              {item.hint ? (
                <div style={{ fontSize: 11, color: color.textFaint, marginTop: 1 }}>{item.hint}</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
