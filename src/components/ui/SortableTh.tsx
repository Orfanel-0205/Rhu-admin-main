// src/components/ui/SortableTh.tsx
//
// A clickable table header cell that drives useSortableRows (Part 4). Drop it in
// place of a plain <th> for any column that should be sortable; it keeps the
// page's existing header style and adds a visible ascending/descending indicator
// plus aria-sort for accessibility. Non-sortable columns keep their plain <th>.

import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import type { SortState } from "../../hooks/useSortableRows";

interface SortableThProps {
  label: ReactNode;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  style?: CSSProperties;
  align?: "left" | "center" | "right";
}

export default function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  style,
  align = "left",
}: SortableThProps) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;

  return (
    <th
      onClick={() => onSort(sortKey)}
      role="columnheader"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSort(sortKey);
        }
      }}
      style={{ ...style, cursor: "pointer", userSelect: "none" }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          justifyContent:
            align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
        }}
      >
        {label}
        <Icon
          size={13}
          style={{ opacity: active ? 0.95 : 0.4, flexShrink: 0 }}
          aria-hidden
        />
      </span>
    </th>
  );
}
