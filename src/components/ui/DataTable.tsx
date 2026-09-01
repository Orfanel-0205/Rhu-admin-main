// src/components/ui/DataTable.tsx
// Generic, typed, readable data table — the workhorse that replaces card lists.
// Columns are declarative; cells can render any ReactNode.

import type { CSSProperties, ReactNode } from "react";
import { color, radius, shadow, space } from "../../theme/tokens";
import EmptyState from "./EmptyState";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer; falls back to (row as any)[key]. */
  render?: (row: T, index: number) => ReactNode;
  align?: "left" | "center" | "right";
  width?: number | string;
  /** Hide on narrow widths (admin tablets). */
  hideOnNarrow?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  /** Optional footer row (totals, pagination, etc.). */
  footer?: ReactNode;
  style?: CSSProperties;
  dense?: boolean;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  emptyTitle = "Nothing here yet",
  emptyMessage = "No records match the current filters.",
  emptyIcon,
  footer,
  style,
  dense,
}: DataTableProps<T>) {
  const padY = dense ? 8 : 12;

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.line}`,
        borderRadius: radius.xl,
        boxShadow: shadow.card,
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: c.align ?? "left",
                    padding: `${padY}px ${space.lg}px`,
                    background: color.surfaceAlt,
                    borderBottom: `1px solid ${color.line}`,
                    color: color.textMuted,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    width: c.width,
                    position: "sticky",
                    top: 0,
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 36, textAlign: "center", color: color.textMuted }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 0 }}>
                  <EmptyState title={emptyTitle} message={emptyMessage} icon={emptyIcon} bordered={false} />
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    cursor: onRowClick ? "pointer" : "default",
                    background: i % 2 === 1 ? color.surfaceAlt : color.surface,
                    transition: "background 120ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = color.brandTintBg;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      i % 2 === 1 ? color.surfaceAlt : color.surface;
                  }}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        textAlign: c.align ?? "left",
                        padding: `${padY}px ${space.lg}px`,
                        borderBottom: `1px solid ${color.lineSoft}`,
                        color: color.text,
                        verticalAlign: "middle",
                      }}
                    >
                      {c.render ? c.render(row, i) : ((row as any)[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {footer ? (
        <div style={{ borderTop: `1px solid ${color.line}`, padding: space.md, background: color.surfaceAlt }}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
