// src/hooks/usePagination.ts
//
// Reusable client-side pagination for admin tables (Part 8). Give it the rows
// AFTER filtering + sorting (order of operations: filter -> sort -> paginate)
// and it returns the current page slice plus the controls a pager UI needs.
//
// Composability: pair it with useSortableRows — feed the hook's `sorted` output
// in as `rows` here. Pass `resetDeps` (e.g. the sort state and the source rows)
// so re-sorting or a new filter result snaps the user back to page 1 instead of
// stranding them on a now-meaningless "page 3". The page also auto-clamps down
// when a filter shrinks the set below the current page.

import { useEffect, useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [20, 50, 100];

export interface PaginationResult<T> {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first row shown (0 when empty). */
  from: number;
  /** 1-based index of the last row shown (0 when empty). */
  to: number;
  pageRows: T[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  next: () => void;
  prev: () => void;
  canPrev: boolean;
  canNext: boolean;
}

export function usePagination<T>(
  rows: T[],
  options?: { pageSize?: number; resetDeps?: unknown[] }
): PaginationResult<T> {
  const [pageSize, setPageSizeState] = useState(options?.pageSize ?? DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Reset to the first page whenever the upstream sort/filter/data changes.
  const resetDeps = options?.resetDeps ?? [];
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  // Changing page size is also a "start over" action.
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  // Auto-clamp: never point past the last available page.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const safePage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage, pageSize]);

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return {
    page: safePage,
    pageSize,
    pageCount,
    total,
    from,
    to,
    pageRows,
    setPage: (p: number) => setPage(Math.min(Math.max(1, p), pageCount)),
    setPageSize: (size: number) => setPageSizeState(size),
    next: () => setPage((p) => Math.min(p + 1, pageCount)),
    prev: () => setPage((p) => Math.max(p - 1, 1)),
    canPrev: safePage > 1,
    canNext: safePage < pageCount,
  };
}
