// src/components/ui/HistoryDrawer.tsx
// Right-side slide-over panel for record details / history timelines.
// Generic: pass any content. Includes a labeled detail-list helper and a
// timeline helper for status-change history.

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { color, radius, shadow, space } from "../../theme/tokens";
import StatusBadge from "./StatusBadge";

interface HistoryDrawerProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  /** Sticky action bar at the bottom of the drawer. */
  footer?: ReactNode;
  width?: number;
}

export default function HistoryDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 480,
}: HistoryDrawerProps) {
  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.42)" }} />

      <aside
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "100%",
          maxWidth: width,
          background: color.surface,
          boxShadow: shadow.drawer,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: space.md,
            padding: space.xl,
            borderBottom: `1px solid ${color.line}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: color.ink }}>{title}</h3>
            {subtitle ? (
              <div style={{ marginTop: 4, fontSize: 13, color: color.textMuted }}>{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              border: `1px solid ${color.line}`,
              borderRadius: radius.sm,
              background: color.surface,
              color: color.slateFg,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: space.xl }}>{children}</div>

        {footer ? (
          <footer
            style={{
              borderTop: `1px solid ${color.line}`,
              padding: space.lg,
              background: color.surfaceAlt,
              display: "flex",
              gap: space.sm,
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

/* ---- helpers for drawer content ---- */

export function DetailList({ rows, style }: { rows: Array<{ label: ReactNode; value: ReactNode }>; style?: CSSProperties }) {
  return (
    <div style={{ display: "grid", gap: space.md, ...style }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: space.md, alignItems: "start" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.textMuted, paddingTop: 1 }}>{r.label}</div>
          <div style={{ fontSize: 14, color: color.text, wordBreak: "break-word" }}>{r.value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

export interface TimelineEntry {
  title: ReactNode;
  timestamp?: ReactNode;
  actor?: ReactNode;
  status?: string | null;
  note?: ReactNode;
}

export function HistoryTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <div style={{ fontSize: 13, color: color.textMuted }}>No history recorded yet.</div>;
  }

  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space.lg }}>
      {entries.map((e, i) => (
        <li key={i} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: space.md }}>
          <div style={{ display: "grid", justifyItems: "center" }}>
            <span style={{ width: 11, height: 11, borderRadius: 999, background: color.brand, marginTop: 4 }} />
            {i < entries.length - 1 ? (
              <span style={{ width: 2, flex: 1, background: color.line, marginTop: 2 }} />
            ) : null}
          </div>
          <div style={{ paddingBottom: space.xs }}>
            <div style={{ display: "flex", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: color.ink }}>{e.title}</span>
              {e.status ? <StatusBadge status={e.status} size="sm" /> : null}
            </div>
            <div style={{ fontSize: 12, color: color.textMuted, marginTop: 2 }}>
              {[e.actor, e.timestamp].filter(Boolean).map((x, j) => (
                <span key={j}>
                  {j > 0 ? " · " : ""}
                  {x}
                </span>
              ))}
            </div>
            {e.note ? <div style={{ fontSize: 13, color: color.text, marginTop: 4 }}>{e.note}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
