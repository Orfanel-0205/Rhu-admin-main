// tests/responsiveTables.test.ts
//
// Boards must never make staff scroll sideways to reach a button.
//
// This took four attempts to get right, and the first three failed the same
// way: they kept the table and tried to make it fit. Pinning the first and
// last columns, stopping words breaking mid-character, moving the breakpoint
// from 1100px to 1400px -- each helped, and each left a window size where nine
// columns still did not fit and the Actions column was still off screen.
//
// A table with a declared min-width is always too wide for some screen. So the
// boards are cards at every width now, laid out in a grid that takes as many
// columns as the space allows, and every cell carries its column heading in a
// data-label so nothing is lost in the change.
//
// These tests hold the two halves of that in place: a wide table has to be
// inside a wrapper the card rules apply to, and cells have to keep their
// headings. They also pin the one global CSS declaration that caused the
// crushed layout, because it read as harmless and was not.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "src");
const CSS = path.join(SRC, "styles", "globals.css");

/** Any width at or above this cannot be assumed to fit on a laptop. */
const WIDE = 800;

function sourceFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name)) found.push(full);
    }
  };

  walk(SRC);

  return found;
}

/** Files declaring a table wide enough to overflow a laptop. */
function filesWithWideTables(): string[] {
  return sourceFiles().filter((file) => {
    const text = fs.readFileSync(file, "utf8");

    if (!text.includes("<table")) return false;

    return Array.from(text.matchAll(/minWidth:\s*(\d{3,4})/g)).some(
      (match) => Number(match[1]) >= WIDE
    );
  });
}

describe("wide tables cannot strand their buttons off screen", () => {
  it("wraps every wide table in the card layout", () => {
    const unwrapped = filesWithWideTables()
      .filter((file) => !fs.readFileSync(file, "utf8").includes("responsive-table"))
      .map((file) => path.relative(SRC, file));

    expect(
      unwrapped,
      "These files declare a table at least " +
        `${WIDE}px wide but are not inside a "responsive-table" wrapper, so ` +
        "the card rules never reach them and staff will have to scroll " +
        "sideways to reach the Actions column."
    ).toEqual([]);
  });

  it("gives every wide table's cells their column heading", () => {
    const unlabelled = filesWithWideTables()
      .filter((file) => !fs.readFileSync(file, "utf8").includes("data-label="))
      .map((file) => path.relative(SRC, file));

    expect(
      unlabelled,
      "A card prints each value beside its column heading, taken from " +
        "data-label. Without it the card is a column of bare values: " +
        '"RHU 2", "Onsite", "Pending", with nothing saying what they are.'
    ).toEqual([]);
  });
});

describe("the global cell rule that crushed the boards", () => {
  it("does not let a cell break words at any character", () => {
    const css = fs.readFileSync(CSS, "utf8");
    const rule = css.match(/\btd\s*\{[^}]*\}/);

    expect(rule, "The base td rule moved or was removed.").not.toBeNull();

    expect(
      rule![0],
      'overflow-wrap: anywhere is back on td. It breaks words at any ' +
        'character -- buttons read "Consulta tion" and a mobile number splits ' +
        'as "0968321461 5" -- and it tells the browser a cell needs only one ' +
        "character of width, so every column may shrink below the width of " +
        "its own words. Use break-word."
    ).not.toContain("anywhere");
  });
});
