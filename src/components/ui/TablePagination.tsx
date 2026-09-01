// src/components/ui/TablePagination.tsx
//
// Shared pager UI for admin tables (Part 8). Drives a usePagination() result:
// shows "Showing X–Y of N", Prev / numbered pages / Next, and an optional
// page-size selector. Renders the count row even for a single page; hides the
// numbered nav when there is only one page.

import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "../../hooks/usePagination";

interface TablePaginationProps {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Noun for the "Showing X–Y of N <label>" line. */
  label?: string;
}

// Compact page window: first, last, current ±1, with "…" gaps.
function pageWindow(current: number, count: number): (number | "gap")[] {
  if (count <= 7) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  const pages: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);

  if (start > 2) pages.push("gap");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < count - 1) pages.push("gap");

  pages.push(count);
  return pages;
}

export default function TablePagination({
  page,
  pageCount,
  total,
  from,
  to,
  pageSize,
  onPage,
  onPageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  label = "records",
}: TablePaginationProps) {
  return (
    <div style={barStyle}>
      <span style={countStyle}>
        {total === 0 ? (
          `No ${label}`
        ) : (
          <>
            Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> {label}
          </>
        )}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {onPageSize ? (
          <label style={sizeLabelStyle}>
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              style={selectStyle}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {pageCount > 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => onPage(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
              style={{ ...navBtnStyle, ...(page <= 1 ? disabledStyle : {}) }}
            >
              <ChevronLeft size={16} />
            </button>

            {pageWindow(page, pageCount).map((item, i) =>
              item === "gap" ? (
                <span key={`gap-${i}`} style={gapStyle}>
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPage(item)}
                  aria-current={item === page ? "page" : undefined}
                  style={{ ...pageBtnStyle, ...(item === page ? activePageStyle : {}) }}
                >
                  {item}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => onPage(page + 1)}
              disabled={page >= pageCount}
              aria-label="Next page"
              style={{ ...navBtnStyle, ...(page >= pageCount ? disabledStyle : {}) }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const barStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  padding: "12px 14px",
  borderTop: "1px solid #E2E8F0",
  background: "#F8FAFC",
};

const countStyle: CSSProperties = { color: "#475569", fontSize: 13, fontWeight: 700 };
const sizeLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#64748B",
  fontSize: 12.5,
  fontWeight: 800,
};
const selectStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "5px 8px",
  fontSize: 13,
  fontWeight: 800,
  color: "#0F172A",
  background: "#FFFFFF",
  cursor: "pointer",
};

const navBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  cursor: "pointer",
};

const pageBtnStyle: CSSProperties = {
  minWidth: 32,
  height: 32,
  padding: "0 8px",
  borderRadius: 8,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const activePageStyle: CSSProperties = {
  background: "#0F766E",
  borderColor: "#0F766E",
  color: "#FFFFFF",
};

const disabledStyle: CSSProperties = { opacity: 0.45, cursor: "not-allowed" };
const gapStyle: CSSProperties = { padding: "0 4px", color: "#94A3B8", fontWeight: 800 };
