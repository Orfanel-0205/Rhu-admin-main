// src/components/cms/MultiSelectDropdown.tsx
//
// Searchable multi-select dropdown for the Event Creation redesign — used for
// Barangay Target and RHU Service Offered. Built for RHU staff with limited
// digital literacy: big click targets (≥44px), plain checkboxes, a visible
// "Select All", removable chips, and no surprises.
//
// Behavior per spec:
// - search filters options (group headers hide when their options are filtered out)
// - "Select All" checks everything and DISABLES individual boxes until unchecked
// - Clear Selection empties everything
// - selections render as removable chips below the trigger; when "all" is
//   selected a single "All … Selected" chip is shown instead
// - the control stays compact regardless of how many options are selected

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface MultiSelectGroup {
  /** Optional heading; omit for a flat list (e.g. barangays). */
  label?: string;
  options: string[];
}

export default function MultiSelectDropdown({
  id,
  groups,
  selected,
  allSelected,
  onChange,
  placeholder,
  selectAllLabel,
  allChipLabel,
  searchPlaceholder = "Type to search…",
  summaryNoun,
}: {
  id: string;
  groups: MultiSelectGroup[];
  selected: string[];
  allSelected: boolean;
  onChange: (selected: string[], allSelected: boolean) => void;
  placeholder: string;
  selectAllLabel: string;
  allChipLabel: string;
  searchPlaceholder?: string;
  /** e.g. "barangays" / "services" — used in the "3 services selected" summary. */
  summaryNoun: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const totalOptions = useMemo(
    () => groups.reduce((sum, group) => sum + group.options.length, 0),
    [groups]
  );

  const filteredGroups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return groups;

    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter(
          (option) =>
            option.toLowerCase().includes(keyword) ||
            (group.label ?? "").toLowerCase().includes(keyword)
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);

  // Close on click-outside and on Escape.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Focus the search box when the panel opens.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function toggleOption(option: string) {
    if (allSelected) return; // individual boxes are disabled under Select All
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next, false);
  }

  function toggleAll(checked: boolean) {
    onChange([], checked);
  }

  function clearAll() {
    onChange([], false);
    setQuery("");
  }

  const summary = allSelected
    ? allChipLabel
    : selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} ${summaryNoun} selected`;

  const hasValue = allSelected || selected.length > 0;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...triggerStyle,
          color: hasValue ? "#0F172A" : "#94A3B8",
          borderColor: open ? "#0F766E" : "#CBD5E1",
          boxShadow: open ? "0 0 0 3px rgba(15,118,110,.14)" : "none",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summary}
        </span>
        <ChevronDown
          size={17}
          style={{
            flexShrink: 0,
            color: "#64748B",
            transition: "transform .15s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open ? (
        <div style={panelStyle} role="listbox" aria-multiselectable="true">
          <div style={searchRowStyle}>
            <Search size={15} style={{ color: "#94A3B8", flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              style={searchInputStyle}
              aria-label={searchPlaceholder}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                style={searchClearStyle}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <label style={{ ...optionRowStyle, background: "#F0FDFA", borderBottom: "1px solid #CCFBF1" }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => toggleAll(event.target.checked)}
              style={checkboxStyle}
            />
            <strong style={{ color: "#0F766E" }}>{selectAllLabel}</strong>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748B", fontWeight: 700 }}>
              {totalOptions} total
            </span>
          </label>

          <div style={optionListStyle}>
            {filteredGroups.length === 0 ? (
              <div style={emptyStyle}>Nothing matches “{query.trim()}”.</div>
            ) : (
              filteredGroups.map((group, groupIndex) => (
                <div key={group.label ?? `group-${groupIndex}`}>
                  {group.label ? (
                    <div style={groupHeaderStyle}>{group.label}</div>
                  ) : null}

                  {group.options.map((option) => {
                    const checked = allSelected || selected.includes(option);
                    return (
                      <label
                        key={option}
                        style={{
                          ...optionRowStyle,
                          opacity: allSelected ? 0.6 : 1,
                          cursor: allSelected ? "not-allowed" : "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={allSelected}
                          onChange={() => toggleOption(option)}
                          style={checkboxStyle}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div style={panelFooterStyle}>
            <button type="button" onClick={clearAll} style={clearButtonStyle}>
              Clear Selection
            </button>
            <button type="button" onClick={() => setOpen(false)} style={doneButtonStyle}>
              <Check size={15} />
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* Chips — compact, wrapping, removable. */}
      {hasValue ? (
        <div style={chipsRowStyle}>
          {allSelected ? (
            <span style={{ ...chipStyle, background: "#0F766E", color: "#FFFFFF", borderColor: "#0F766E" }}>
              {allChipLabel}
              <button
                type="button"
                onClick={() => toggleAll(false)}
                style={{ ...chipRemoveStyle, color: "#FFFFFF" }}
                aria-label={`Remove ${allChipLabel}`}
              >
                <X size={12} />
              </button>
            </span>
          ) : (
            selected.map((option) => (
              <span key={option} style={chipStyle}>
                {option}
                <button
                  type="button"
                  onClick={() => toggleOption(option)}
                  style={chipRemoveStyle}
                  aria-label={`Remove ${option}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const triggerStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  border: "1px solid #CBD5E1",
  borderRadius: 15,
  padding: "0 14px",
  background: "#FFFFFF",
  fontSize: 15,
  fontWeight: 750,
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "left",
  boxSizing: "border-box",
};

const panelStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  zIndex: 60,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  boxShadow: "0 22px 55px rgba(15,23,42,.18)",
  overflow: "hidden",
};

const searchRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderBottom: "1px solid #F1F5F9",
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  border: "none",
  outline: "none",
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "inherit",
  color: "#0F172A",
  minHeight: 30,
};

const searchClearStyle: CSSProperties = {
  border: "none",
  background: "#F1F5F9",
  borderRadius: 999,
  width: 22,
  height: 22,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: "#475569",
};

const optionListStyle: CSSProperties = {
  maxHeight: 260,
  overflowY: "auto",
};

const groupHeaderStyle: CSSProperties = {
  padding: "9px 14px 5px",
  fontSize: 11.5,
  fontWeight: 900,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "#0F766E",
  background: "#FAFAF9",
  position: "sticky",
  top: 0,
};

const optionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  minHeight: 44,
  padding: "4px 14px",
  fontSize: 14,
  fontWeight: 700,
  color: "#0F172A",
  cursor: "pointer",
};

const checkboxStyle: CSSProperties = {
  width: 18,
  height: 18,
  flexShrink: 0,
  accentColor: "#0F766E",
  cursor: "inherit",
};

const emptyStyle: CSSProperties = {
  padding: "18px 14px",
  fontSize: 13,
  fontWeight: 700,
  color: "#94A3B8",
  textAlign: "center",
};

const panelFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 14px",
  borderTop: "1px solid #F1F5F9",
  background: "#F8FAFC",
};

const clearButtonStyle: CSSProperties = {
  minHeight: 36,
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: "0 13px",
  background: "#FFFFFF",
  color: "#475569",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const doneButtonStyle: CSSProperties = {
  minHeight: 36,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: 0,
  borderRadius: 10,
  padding: "0 15px",
  background: "#0F766E",
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const chipsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 8,
  maxHeight: 108,
  overflowY: "auto",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: "1px solid #A7F3D0",
  background: "#ECFDF5",
  color: "#047857",
  borderRadius: 999,
  padding: "5px 8px 5px 11px",
  fontSize: 12.5,
  fontWeight: 800,
};

const chipRemoveStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#047857",
  width: 18,
  height: 18,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  padding: 0,
};
