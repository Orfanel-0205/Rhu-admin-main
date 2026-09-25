// tests/translationKeys.test.ts
//
// THE INCIDENT THIS GUARDS
// ------------------------
// `t()` cannot fail. An unknown key is humanised and rendered: t("queue_call")
// comes back "Queue Call", which reads like a label somebody wrote on purpose.
// That fallback is the right behaviour for a clinic -- a missing string must
// never blank a button in front of a waiting patient -- but it also means an
// untranslated key is completely invisible to anyone working in English.
//
// It was invisible here. A hand audit of the dashboard turned up 53 keys used
// in code and defined nowhere. In English they all looked fine. Switch the
// dashboard to Pangasinense or Tagalog and those 53 stayed in English, mixed
// into translated screens, for the staff who most need the translation.
//
// This walks the source, collects every t("...") key, and asks whether there
// is a real entry behind it. It is the only way the fallback stops hiding.
//
// SCOPE
// -----
// Only literal keys are seen. t(`status_${row.status}`) is invisible to any
// check short of running the application, so composed keys still need a
// glance from whoever writes them.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { T, hasTranslation, type Lang } from "../src/i18n/translations";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

const LANGS: Lang[] = ["en", "tag", "pag"];

/** Every .ts/.tsx file under src/, except the translation tables themselves. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return sourceFiles(full);

    if (!/\.tsx?$/.test(entry.name)) return [];
    if (full.includes(`${path.sep}i18n${path.sep}`)) return [];

    return [full];
  });
}

/** Keys passed to t() as a plain string, mapped to where they were found. */
function usedKeys(): Map<string, string> {
  const found = new Map<string, string>();

  for (const file of sourceFiles(SRC)) {
    const source = fs.readFileSync(file, "utf8");

    for (const match of source.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g)) {
      if (!found.has(match[1])) {
        found.set(match[1], path.relative(SRC, file));
      }
    }
  }

  return found;
}

describe("translation keys", () => {
  it("finds the call sites at all", () => {
    // If a refactor changes how t() is called, the regex above quietly matches
    // nothing and every test below passes while checking nothing. This is the
    // canary for that.
    expect(usedKeys().size).toBeGreaterThan(200);
  });

  it("has an entry for every key the dashboard asks for", () => {
    const missing = [...usedKeys()]
      .filter(([key]) => !hasTranslation(key))
      .map(([key, file]) => `  ${key}  (${file})`);

    expect(
      missing,
      "These keys are used in code but defined in no table, so t() humanises "
        + "them. They read as English on every language setting -- add them to "
        + "T in src/i18n/translations.ts:\n" + missing.join("\n")
    ).toEqual([]);
  });

  it("gives every entry all three languages", () => {
    const gaps: string[] = [];

    for (const [key, entry] of Object.entries(T)) {
      for (const lang of LANGS) {
        if (!entry[lang]?.trim()) gaps.push(`${key}.${lang}`);
      }
    }

    expect(
      gaps,
      "Entries missing a language fall back to English silently:\n"
        + gaps.join("\n")
    ).toEqual([]);
  });

  it("keeps placeholders identical across the three languages", () => {
    // t() substitutes {name}, {count} and friends by literal match. A
    // translation that spells the placeholder differently prints the braces
    // to the screen -- "Welcome {pangalan}" -- in that language only.
    const mismatches: string[] = [];

    for (const [key, entry] of Object.entries(T)) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

      const expected = placeholders(entry.en ?? "");

      for (const lang of LANGS) {
        const actual = placeholders(entry[lang] ?? "");

        if (entry[lang] && actual !== expected) {
          mismatches.push(`${key}.${lang}: [${actual}] vs en [${expected}]`);
        }
      }
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });
});
