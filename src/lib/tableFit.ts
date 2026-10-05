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
// the stylesheet reads (styles/globals.css). Started once from main.tsx.
//
// FINDING THE TABLES
// Pages render a loading or empty message first and the table later, and
// React often reuses that same <div> for the table -- it only adds the class
// and replaces the children. So a wrapper can appear without any element
// being added, and its table can arrive long after it. Every DOM change is
// therefore traced back to the .responsive-table it happened in, and that
// wrapper is (re)checked. Found by a real-browser check: Telemedicine on a
// phone stayed in rows and scrolled sideways, and Consultations was never
// measured at all, until this was done.

const ATTRIBUTE = "data-layout";

/**
 * Extra room needed before going back from cards to rows, so a table at the
 * edge does not flip back and forth -- a scrollbar appearing or disappearing
 * alone changes the space by about 15px.
 */
const SLACK = 24;

interface State {
  need: number;
  observer: ResizeObserver;
  table: HTMLTableElement | null;
}

const tracked = new WeakMap<HTMLElement, State>();

function measure(wrapper: HTMLElement): void {
  const state = tracked.get(wrapper);
  const table = state?.table;

  if (!state || !table || !table.isConnected) return;

  const space = wrapper.clientWidth;

  // Not laid out yet (hidden tab, still mounting): nothing to decide.
  if (space === 0) return;

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

/** Start watching a wrapper if new, follow its current table, and decide. */
function sync(wrapper: HTMLElement): void {
  let state = tracked.get(wrapper);

  if (!state) {
    state = {
      need: Number.POSITIVE_INFINITY,
      observer: new ResizeObserver(() => measure(wrapper)),
      table: null,
    };
    tracked.set(wrapper, state);
    state.observer.observe(wrapper);
  }

  const table = wrapper.querySelector("table");

  if (table !== state.table) {
    if (state.table) state.observer.unobserve(state.table);
    state.table = table;

    // A different table (new data, another tab) needs measuring afresh.
    state.need = Number.POSITIVE_INFINITY;
    wrapper.removeAttribute(ATTRIBUTE);

    if (table) state.observer.observe(table);
  }

  measure(wrapper);
}

let started = false;

export function startTableFit(): void {
  if (started || typeof window === "undefined" || typeof ResizeObserver === "undefined") return;
  started = true;

  document.querySelectorAll<HTMLElement>(".responsive-table").forEach(sync);

  new MutationObserver((mutations) => {
    const touched = new Set<HTMLElement>();

    for (const mutation of mutations) {
      const target = mutation.target instanceof HTMLElement ? mutation.target : mutation.target.parentElement;
      const around = target?.closest<HTMLElement>(".responsive-table");
      if (around) touched.add(around);

      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(".responsive-table")) touched.add(node);
        node.querySelectorAll<HTMLElement>(".responsive-table").forEach((w) => touched.add(w));
      });
    }

    touched.forEach(sync);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    // React adding the class to a reused <div> is an attribute change.
    attributes: true,
    attributeFilter: ["class"],
  });
}
