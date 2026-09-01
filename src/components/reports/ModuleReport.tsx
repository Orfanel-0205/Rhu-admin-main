// src/components/reports/ModuleReport.tsx
//
// Part 7 — one reusable, module-scoped report: a summary stat strip, a single
// shared sortable table, and a labelled CSV export. Every Reports module tab
// (Consultations, Follow-up, Inventory, Queue, Appointments, Telemedicine)
// renders THIS with its own adapter, so there is exactly one <table> structure
// to maintain — and Part 8 adds pagination here once, not six times.

import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useSortableRows, type SortAccessor } from "../../hooks/useSortableRows";
import { usePagination } from "../../hooks/usePagination";
import SortableTh from "../ui/SortableTh";
import TablePagination from "../ui/TablePagination";
import { downloadCsv, type CsvColumn } from "../../services/analytics";

export interface ModuleReportStat {
  label: string;
  value: ReactNode;
  helper?: string;
  tone?: "default" | "warning" | "danger" | "success";
}

export interface ModuleReportColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortAccessor?: SortAccessor<T>;
  align?: "left" | "right" | "center";
  width?: number | string;
}

interface ModuleReportProps<T> {
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  stats: ModuleReportStat[];
  columns: ModuleReportColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  csv: { filename: string; columns: CsvColumn[] };
  emptyText?: string;
  onRefresh?: () => void;
}

export default function ModuleReport<T>({
  title,
  subtitle,
  loading,
  error,
  stats,
  columns,
  rows,
  rowKey,
  csv,
  emptyText = "No records found for the selected filters.",
  onRefresh,
}: ModuleReportProps<T>) {
  const accessors = useMemo(() => {
    const map: Record<string, SortAccessor<T>> = {};
    for (const col of columns) {
      if (col.sortAccessor) map[col.key] = col.sortAccessor;
    }
    return map;
  }, [columns]);

  const { sorted, sort, toggle } = useSortableRows(rows, accessors);
  const pg = usePagination(sorted, { resetDeps: [sort.key, sort.dir, rows] });

  return (
    <section style={cardStyle}>
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <h2 style={titleStyle}>{title}</h2>
          {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onRefresh ? (
            <button type="button" onClick={onRefresh} style={ghostBtn}>
              <RefreshCw size={15} />
              Refresh
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => downloadCsv(csv.filename, rows as any[], csv.columns)}
            disabled={rows.length === 0}
            style={{ ...exportBtn, opacity: rows.length === 0 ? 0.55 : 1 }}
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      <div style={statStripStyle}>
        {stats.map((stat) => (
          <div key={stat.label} style={{ ...statCardStyle, ...toneStyle(stat.tone) }}>
            <span style={statLabelStyle}>{stat.label}</span>
            <strong style={statValueStyle}>{stat.value}</strong>
            {stat.helper ? <small style={statHelperStyle}>{stat.helper}</small> : null}
          </div>
        ))}
      </div>

      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #E2E8F0" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.map((col) =>
                col.sortAccessor ? (
                  <SortableTh
                    key={col.key}
                    label={col.header}
                    sortKey={col.key}
                    sort={sort}
                    onSort={toggle}
                    align={col.align}
                    style={{ ...thStyle, textAlign: col.align ?? "left", width: col.width }}
                  />
                ) : (
                  <th
                    key={col.key}
                    style={{ ...thStyle, textAlign: col.align ?? "left", width: col.width }}
                  >
                    {col.header}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={emptyCellStyle}>
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length} style={{ ...emptyCellStyle, color: "#B91C1C" }}>
                  {error}
                </td>
              </tr>
            ) : pg.total === 0 ? (
              <tr>
                <td colSpan={columns.length} style={emptyCellStyle}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              pg.pageRows.map((row, i) => (
                <tr key={rowKey(row, i)} style={i % 2 === 1 ? rowAltStyle : undefined}>
                  {columns.map((col) => (
                    <td key={col.key} style={{ ...tdStyle, textAlign: col.align ?? "left" }}>
                      {col.render ? col.render(row) : String((row as any)[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && !error && pg.total > 0 ? (
          <TablePagination
            page={pg.page}
            pageCount={pg.pageCount}
            total={pg.total}
            from={pg.from}
            to={pg.to}
            pageSize={pg.pageSize}
            onPage={pg.setPage}
            onPageSize={pg.setPageSize}
          />
        ) : null}
      </div>
    </section>
  );
}

function toneStyle(tone?: ModuleReportStat["tone"]): CSSProperties {
  switch (tone) {
    case "danger":
      return { background: "#FEF2F2", borderColor: "#FECACA" };
    case "warning":
      return { background: "#FFFBEB", borderColor: "#FDE68A" };
    case "success":
      return { background: "#ECFDF5", borderColor: "#A7F3D0" };
    default:
      return {};
  }
}

const cardStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 20,
  borderRadius: 20,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  boxShadow: "0 16px 32px rgba(15,23,42,0.05)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 20, fontWeight: 950, color: "#0F172A" };
const subtitleStyle: CSSProperties = { margin: "5px 0 0", color: "#64748B", fontSize: 13.5, lineHeight: 1.5 };

const ghostBtn: CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 12,
  padding: "9px 13px",
  fontWeight: 900,
  fontSize: 13.5,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
};

const exportBtn: CSSProperties = {
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
  color: "#0F766E",
  borderRadius: 12,
  padding: "9px 13px",
  fontWeight: 900,
  fontSize: 13.5,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
};

const statStripStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const statCardStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  minWidth: 0,
};

const statLabelStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".03em",
};
const statValueStyle: CSSProperties = { color: "#0F172A", fontSize: 26, fontWeight: 950, lineHeight: 1.1 };
const statHelperStyle: CSSProperties = { color: "#64748B", fontSize: 12, fontWeight: 700 };

const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 720, background: "#FFFFFF" };
const thStyle: CSSProperties = {
  padding: "12px 14px",
  background: "#F8FAFC",
  color: "#334155",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  fontWeight: 900,
  borderBottom: "1px solid #E2E8F0",
  whiteSpace: "nowrap",
};
const tdStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  fontSize: 13.5,
  fontWeight: 700,
  verticalAlign: "top",
};
const rowAltStyle: CSSProperties = { background: "#F8FAFC" };
const emptyCellStyle: CSSProperties = { padding: "36px 16px", textAlign: "center", color: "#64748B", fontWeight: 800 };
