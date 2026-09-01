// src/components/ui/StatusBadge.tsx
// Pill badge that colors itself from the shared status tone map.

import type { CSSProperties, ReactNode } from "react";
import { radius, statusLabel, statusTone, TONE_STYLES, type Tone } from "../../theme/tokens";

interface StatusBadgeProps {
  status?: string | null;
  /** Override the auto-derived label. */
  label?: ReactNode;
  /** Force a tone instead of deriving from the status string. */
  tone?: Tone;
  icon?: ReactNode;
  size?: "sm" | "md";
  style?: CSSProperties;
}

export default function StatusBadge({
  status,
  label,
  tone,
  icon,
  size = "md",
  style,
}: StatusBadgeProps) {
  const t = tone ? TONE_STYLES[tone] : statusTone(status);
  const text = label ?? statusLabel(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        borderRadius: radius.pill,
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.fg,
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 800,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon}
      {text}
    </span>
  );
}
