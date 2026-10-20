// tests/localDate.test.ts
//
// Dates on the browser's clock, not UTC (Oct 2026).
//
// toISOString().slice(0, 10) gave the UTC date: "today" was yesterday until
// 8:00 AM in Manila, and a date made at local midnight became the day before
// at any hour, which is how the heatmap trend labelled every day one day late
// and dropped today's cases.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localDateKey } from "../src/lib/localDate";

const SRC = path.resolve(__dirname, "../src");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("localDateKey", () => {
  it("keeps a local-midnight date on its own day", () => {
    const midnight = new Date(2026, 9, 21); // 21 Oct, 00:00 local
    expect(localDateKey(midnight)).toBe("2026-10-21");
  });

  it("pads month and day", () => {
    expect(localDateKey(new Date(2026, 0, 5, 13, 0))).toBe("2026-01-05");
  });

  it("is used instead of the UTC date everywhere in src", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(path.join("lib", "localDate.ts")))
      .flatMap((file) =>
        fs
          .readFileSync(file, "utf8")
          .split("\n")
          .map((line, i) => (/toISOString\(\)\.(slice|substring|substr)\(0, ?10\)|toISOString\(\)\.split\(["']T["']\)\[0\]/.test(line) ? `${path.relative(SRC, file)}:${i + 1}` : null))
          .filter(Boolean)
      );

    expect(offenders).toEqual([]);
  });
});
