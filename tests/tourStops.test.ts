// tests/tourStops.test.ts
//
// WHAT THIS GUARDS
// ----------------
// The Getting Started walkthrough points at real controls by the words on
// them. That is the most stable handle this admin offers -- it has no test
// ids and styles its pages inline -- but it is a string matched against a
// page, and strings drift. Rename a button and the pointer lands on nothing:
// the duck stands in the corner, the highlight never appears, and the tour
// silently degrades into a slideshow.
//
// Nothing else catches that. It typechecks, it builds, every test passes, and
// the only symptom is a reader wondering what they are meant to be looking at.
//
// Three of the first forty-seven stops were already wrong when this was
// written: a translation key that had never been defined, and a button
// labelled "Release PDF" that the tour called "Open PDF".
//
// SCOPE
// -----
// This reads source, not a rendered page, so it proves the words exist where
// the pointer will look -- not that the element is visible at that moment. A
// control behind a tab or a role check still passes here. That is the right
// trade: it catches renames and typos, which are what actually happen.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

const assistant = fs.readFileSync(
  path.join(SRC, "components", "AIChatAssistant.tsx"),
  "utf8"
);
const translations = fs.readFileSync(
  path.join(SRC, "i18n", "translations.ts"),
  "utf8"
);
const app = fs.readFileSync(path.join(SRC, "App.tsx"), "utf8");

interface Stop {
  module: string;
  route?: string;
  kind: "key" | "text";
  value: string;
}

/** Which page component a route renders, read from the router itself. */
function routeToPage(): Map<string, string> {
  const map = new Map<string, string>();

  for (const match of app.matchAll(/path="([^"]+)"[\s\S]{0,200}?<(\w+)\s*\/>/g)) {
    if (!map.has(match[1])) map.set(match[1], match[2]);
  }

  return map;
}

function stops(): Stop[] {
  const found: Stop[] = [];

  for (const step of assistant.matchAll(/\{\s*module: "([^"]+)",([\s\S]*?)\n  \},/g)) {
    const module = step[1];
    const body = step[2];
    const route = body.match(/route: "([^"]+)"/)?.[1];

    for (const stop of body.matchAll(/\{ (key|text): "((?:[^"\\]|\\.)*)", says:/g)) {
      found.push({ module, route, kind: stop[1] as "key" | "text", value: stop[2] });
    }
  }

  return found;
}

/** English text behind a translation key. */
function englishFor(key: string): string | null {
  const after = translations.split(new RegExp(`\\n  ${key}: \\{`))[1];
  if (!after) return null;

  return after.match(/en: "((?:[^"\\]|\\.)*)"/)?.[1] ?? null;
}

/**
 * A page's own source, plus the source of every local component it imports.
 *
 * The pointer searches the rendered page, and a page renders its children --
 * the date shortcuts a tour points at live in DateRangeFilter, not in
 * Consultations. Reading only the page file reported those as missing when
 * they render perfectly well.
 */
function pageAndChildren(page: string): string {
  const file = path.join(SRC, "pages", `${page}.tsx`);
  if (!fs.existsSync(file)) return "";

  let text = fs.readFileSync(file, "utf8");

  for (const imp of text.matchAll(/from "\.\.\/(components\/[\w/]+)"/g)) {
    for (const ext of [".tsx", ".ts"]) {
      const child = path.join(SRC, imp[1] + ext);
      if (fs.existsSync(child)) {
        text += fs.readFileSync(child, "utf8");
        break;
      }
    }
  }

  return text;
}

describe("Getting Started tour stops", () => {
  const all = stops();
  const pages = routeToPage();

  it("has stops to check", () => {
    // If the workflow is restructured and this regex stops matching, every
    // test below would pass while checking nothing.
    expect(all.length).toBeGreaterThan(20);
  });

  it("names only translation keys that exist", () => {
    const missing = all
      .filter((stop) => stop.kind === "key" && englishFor(stop.value) === null)
      .map((stop) => `  ${stop.module}: "${stop.value}"`);

    expect(
      missing,
      "These stops name a translation key that is defined nowhere, so the "
        + "pointer resolves to nothing:\n" + missing.join("\n")
    ).toEqual([]);
  });

  it("points at words that appear on the page it opens", () => {
    const misses: string[] = [];

    for (const stop of all) {
      if (!stop.route) continue;

      const page = pages.get(stop.route);
      if (!page) {
        misses.push(`  ${stop.module}: no page renders ${stop.route}`);
        continue;
      }

      const body = pageAndChildren(page);
      if (!body) {
        misses.push(`  ${stop.module}: ${page}.tsx not found`);
        continue;
      }

      const needle =
        stop.kind === "key" ? englishFor(stop.value) ?? stop.value : stop.value;

      const present =
        body.includes(needle) ||
        (stop.kind === "key" && body.includes(`"${stop.value}"`));

      if (!present) {
        misses.push(`  ${stop.module} (${page}): "${needle}"`);
      }
    }

    expect(
      misses,
      "These stops point at words that do not appear on the page they open. "
        + "The duck will stand in the corner with nothing highlighted:\n"
        + misses.join("\n")
    ).toEqual([]);
  });

  it("gives every stop something for the duck to say", () => {
    const silent = [...assistant.matchAll(/\{ (?:key|text): "[^"]*", says: ""/g)];

    expect(silent.length, "A stop with no line leaves an empty bubble.").toBe(0);
  });
});
