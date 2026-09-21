// src/lib/screenContext.ts
//
// What the assistant can see of the screen you are looking at.
//
// Staff ask "what does this mean?" while looking at a chart, and an assistant
// that cannot see the chart can only answer in generalities. This is how a page
// tells the assistant what it is currently showing, so the answer can be about
// these numbers rather than about numbers in general.
//
// WHAT IS SHARED, AND WHAT IS NOT
//   Only figures a page has already worked out and drawn: totals, counts,
//   percentages, the period being viewed, the filters applied. Never a patient
//   name, a record, a row of a list, or an image of the screen. Nothing leaves
//   this system that is not already an aggregate on a chart, which keeps the
//   feature on the right side of the privacy work done on this system and
//   costs nothing to run.
//
//   A page that shows individual patients therefore publishes how many and of
//   what kind, not who. That rule is the reason this module takes figures and
//   notes rather than arbitrary data.

export interface ScreenFigure {
  /** What the number is, as the screen labels it. */
  label: string;
  /** The value as shown, formatted: "128", "12%", "₱4,500". */
  value: string;
  /** Optional comparison the page already displays, e.g. "up 18% vs last month". */
  change?: string;
}

export interface ScreenSnapshot {
  /** The screen's name as staff would say it: "Analytics", "Reports". */
  title: string;
  /** The period or filter in view: "September 2026", "RHU 1, last 30 days". */
  scope?: string;
  /** The headline figures currently drawn. */
  figures?: ScreenFigure[];
  /** Anything else worth an explanation: a ranked list, a trend, an empty state. */
  notes?: string[];
}

/**
 * The assistant reads this at the moment a question is asked, so it only ever
 * reflects the page in front of the person right then.
 */
let current: ScreenSnapshot | null = null;

export function setScreenSnapshot(snapshot: ScreenSnapshot | null): void {
  current = snapshot;
}

export function clearScreenSnapshot(): void {
  current = null;
}

export function getScreenSnapshot(): ScreenSnapshot | null {
  return current;
}

/** Keeps one page from filling the whole prompt with a long ranked list. */
const MAX_FIGURES = 24;
const MAX_NOTES = 12;
const MAX_LENGTH = 2000;

/**
 * The snapshot as a few lines of text for the model.
 *
 * Deliberately plain: a labelled list reads the same to a model as it does to
 * a person, and it stays readable in a log when someone asks why the assistant
 * said what it said.
 */
export function describeScreen(snapshot: ScreenSnapshot | null = current): string {
  if (!snapshot) return "";

  const lines: string[] = [`Screen: ${snapshot.title}`];

  if (snapshot.scope) lines.push(`Showing: ${snapshot.scope}`);

  const figures = (snapshot.figures ?? []).filter((f) => f.label && f.value).slice(0, MAX_FIGURES);

  if (figures.length > 0) {
    lines.push("Figures currently on screen:");

    figures.forEach((figure) => {
      lines.push(`- ${figure.label}: ${figure.value}${figure.change ? ` (${figure.change})` : ""}`);
    });
  }

  const notes = (snapshot.notes ?? []).filter(Boolean).slice(0, MAX_NOTES);

  if (notes.length > 0) {
    lines.push("Also shown:");
    notes.forEach((note) => lines.push(`- ${note}`));
  }

  return lines.join("\n").slice(0, MAX_LENGTH);
}
