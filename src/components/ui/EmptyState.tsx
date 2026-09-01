// src/components/ui/EmptyState.tsx
// Friendly empty placeholder used inside tables, panels and drawers.

import type { CSSProperties, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { color, radius, space } from "../../theme/tokens";

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
  bordered?: boolean;
  style?: CSSProperties;
}

export default function EmptyState({
  title = "Nothing here yet",
  message,
  icon,
  action,
  bordered = true,
  style,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: `${space["3xl"]}px ${space.xl}px`,
        background: color.surface,
        border: bordered ? `1px dashed ${color.slateBorder}` : "none",
        borderRadius: bordered ? radius.xl : 0,
        ...style,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: color.surfaceSunken,
          color: color.textFaint,
          display: "grid",
          placeItems: "center",
          marginBottom: space.md,
        }}
      >
        {icon ?? <Inbox size={22} />}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: color.ink }}>{title}</div>
      {message ? (
        <div style={{ fontSize: 13, color: color.textMuted, marginTop: 4, maxWidth: 420 }}>{message}</div>
      ) : null}
      {action ? <div style={{ marginTop: space.lg }}>{action}</div> : null}
    </div>
  );
}
