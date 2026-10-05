// src/lib/tableFit.ts
//
// ROWS IF THEY FIT, CARDS IF THEY DO NOT -- decided by each table, not by the
// screen.
//
// The boards used to switch from rows to cards at a fixed screen width
// (1280px). A screen width says nothing about whether a table fits: the
// sidebar takes about 290px of it, and a ten-column table with three buttons
// (Health Follow-up) needs far more room than a six-column one. So on a wide
// monitor the Follow-up table stayed in rows and its Actions column ran off
// the right edge, while on a 1280-1366px laptop tables that would have fit as
// rows -- which staff and the panel find easier to scan -- were shown as cards.
//
// Now each .responsive-table measures itself. In rows, if the table is wider
// than the space it has, it becomes cards and remembers how wide its rows
// needed to be; in cards, it goes back to rows once that much space is
// available, and checks again. The result is written to data-layout, which
// the stylesheet reads (styles/globals.css). Started once from main.tsx; it
// finds tables as pages render them.

const ATTRIBUTE = "data-layout";

/**
 * Extra room needed before going back from cards to rows, so a table at the
 * edge does not flip back and forth -- a scrollbar appearing or disappearing
 * alone changes the space by about 15px.
 */
const SLACK = 24;
const tracked = new WeakMap<HTMLElement, { need: number; observer: ResizeObserver }>();

function measure(wrapper: HTMLElement): void {
  const table = wrapper.querySelector("table");
  const state = tracked.get(wrapper);

  if (!table || !state) return;

  const space = wrapper.clientWidth;
  const layout = wrapper.getAttribute(ATTRIBUTE);

  if (layout !== "cards") {
    // In rows: too wide for the space is the signal, measured as laid out.
    if (table.scrollWidth > space + 1) {
      state.need = table.scrollWidth;
      wrapper.setAttribute(ATTRIBUTE, "cards");
    } else if (layout !== "rows") {
      wrapper.setAttribute(ATTRIBUTE, "rows");
    }

    return;
  }

  // In cards: try rows again once the space is what the rows needed.
  if (space >= state.need + SLACK) {
    wrapper.setAttribute(ATTRIBUTE, "rows");

    if (table.scrollWidth > space + 1) {
      // The data changed since and rows still do not fit.
      state.need = table.scrollWidth;
      wrapper.setAttribute(ATTRIBUTE, "cards");
    }
  }
}

function track(wrapper: HTMLElement): void {
  if (tracked.has(wrapper)) return;

  const observer = new ResizeObserver(() => measure(wrapper));
  tracked.set(wrapper, { need: Number.POSITIVE_INFINITY, observer });

  observer.observe(wrapper);

  const table = wrapper.querySelector("table");
  if (table) observer.observe(table);

  measure(wrapper);
}

function scan(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".responsive-table").forEach(track);
}

let started = false;

export function startTableFit(): void {
  if (started || typeof window === "undefined" || typeof ResizeObserver === "undefined") return;
  started = true;

  scan(document);

  // Pages render their tables after data loads; pick them up as they appear,
  // and re-measure when rows are added or changed.
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;

        if (node.matches(".responsive-table")) track(node);
        scan(node);

        const wrapper = node.closest<HTMLElement>(".responsive-table");
        if (wrapper && tracked.has(wrapper)) {
          // A new table inside a known wrapper (empty state -> list).
          const table = wrapper.querySelector("table");
          if (table) tracked.get(wrapper)!.observer.observe(table);
          measure(wrapper);
        }
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}
