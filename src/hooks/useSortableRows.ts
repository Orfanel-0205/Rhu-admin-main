// src/hooks/useSortableRows.ts
//
// Reusable client-side table sorting for the Analytics / Heatmap / Reports pages
// (Part 4). Give it the rows and a map of column-key -> value accessor; it
// returns the sorted rows plus the current sort state and a toggle() for headers.
// Numeric-aware, case-insensitive, and always sorts empty/null values LAST
// regardless of direction so blank cells never float to the top.

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string | null;
  dir: SortDir;
}

export type SortValue = string | number | null | undefined;
export type SortAccessor<T> = (row: T) => SortValue;

function isEmpty(value: SortValue): boolean {
  return value === null || value === undefined || value === "";
}

function baseCompare(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function useSortableRows<T>(
  rows: T[],
  accessors: Record<string, SortAccessor<T>>,
  initial?: { key: string; dir?: SortDir }
) {
  const [sort, setSort] = useState<SortState>({
    key: initial?.key ?? null,
    dir: initial?.dir ?? "asc",
  });

  function toggle(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  const sorted = useMemo(() => {
    const accessor = sort.key ? accessors[sort.key] : undefined;

    if (!accessor) {
      return rows;
    }

    const factor = sort.dir === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);

      const aEmpty = isEmpty(av);
      const bEmpty = isEmpty(bv);

      // Empty values always sink to the bottom, independent of direction.
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      return baseCompare(av, bv) * factor;
    });
  }, [rows, sort, accessors]);

  return { sorted, sort, toggle, setSort };
}
