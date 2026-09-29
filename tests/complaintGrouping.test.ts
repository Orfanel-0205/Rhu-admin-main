// tests/complaintGrouping.test.ts
//
// A board and the outbreak map have to agree about what a patient said.
//
// The vocabulary that turns "I have been experiencing a persistent cough" into
// Cough lives in the backend, in App\Support\ComplaintGrouping, because that
// is what the heatmap counts by. The admin holds a copy so a card can name a
// complaint without asking the server what a sentence is about.
//
// Two copies of a list drift. When they do, a card says Fever and the outbreak
// map files the same complaint as Influenza-like illness, and the RHU has two
// systems disagreeing about a patient with no way to tell which is right.
// These tests hold them identical.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  COMPLAINT_GROUPS,
  NOTIFIABLE_CONDITIONS,
  complaintCondition,
  summariseComplaint,
} from "../src/utils/complaintGrouping";

const ROOT = path.resolve(__dirname, "..");

const BACKEND_CANDIDATES = [
  "../../../PROMAIN-BE-1/ka-agapay-backend",
  "../../PROMAIN-BE-1/ka-agapay-backend",
  "../ka-agapay-backend",
];

function backendSource(): string | null {
  for (const candidate of BACKEND_CANDIDATES) {
    const file = path.resolve(
      ROOT,
      candidate,
      "app/Support/ComplaintGrouping.php"
    );

    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }

  return null;
}

/** The GROUPS table as the backend declares it. */
function backendGroups(php: string): Record<string, string[]> {
  const block = php.match(/private const GROUPS = \[([\s\S]*?)\n    \];/);

  if (!block) throw new Error("Could not find the GROUPS table.");

  const groups: Record<string, string[]> = {};

  for (const line of block[1].split("\n")) {
    const entry = line.match(/^\s*'([^']+)'\s*=>\s*\[(.*)\],\s*$/);

    if (!entry) continue;

    groups[entry[1]] = Array.from(entry[2].matchAll(/'([^']*)'/g)).map(
      (m) => m[1]
    );
  }

  return groups;
}

function backendNotifiable(php: string): string[] {
  const block = php.match(/private const NOTIFIABLE = \[([\s\S]*?)\n    \];/);

  if (!block) throw new Error("Could not find the NOTIFIABLE list.");

  return Array.from(block[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

describe("the admin and the backend group complaints the same way", () => {
  const php = backendSource();

  it.skipIf(php === null)("has the same conditions and terms", () => {
    const theirs = backendGroups(php!);

    expect(
      Object.keys(COMPLAINT_GROUPS).sort(),
      "The two vocabularies list different conditions. A card and the " +
        "outbreak map would file the same complaint under different names."
    ).toEqual(Object.keys(theirs).sort());

    for (const condition of Object.keys(theirs)) {
      expect(
        [...COMPLAINT_GROUPS[condition]].sort(),
        `The words meaning "${condition}" differ between the admin and the ` +
          "backend, so one will recognise a complaint the other will not."
      ).toEqual([...theirs[condition]].sort());
    }
  });

  it.skipIf(php === null)("agrees on which conditions are notifiable", () => {
    expect([...NOTIFIABLE_CONDITIONS].sort()).toEqual(
      [...backendNotifiable(php!)].sort()
    );
  });
});

describe("naming the complaint in a sentence", () => {
  it("finds the complaint inside ordinary prose", () => {
    expect(
      complaintCondition("I have been experiencing a persistent cough")
    ).toBe("Cough");

    expect(complaintCondition("Lagnat po simula kahapon")).toBe("Fever");
    expect(complaintCondition("may sipon lang po")).toBe("Colds");
  });

  it("prefers the longer phrase over a word inside it", () => {
    // "Dengue fever" must not be filed as Fever: Dengue alerts at two cases.
    expect(complaintCondition("suspected dengue fever")).toBe("Dengue");
    expect(complaintCondition("lagnat at ubo")).toBe("Influenza-like illness");

    /*
     * A complaint naming two things is filed under the longer phrase, not the
     * first one written. "may sipon at masakit ang ulo" is Headache because
     * "masakit ang ulo" is a longer match than "sipon".
     *
     * That is a deliberate tie-break, not a judgement about which complaint
     * matters more, and it is the same one the backend makes -- which is the
     * property that counts, since both have to file it identically.
     */
    expect(complaintCondition("may sipon at masakit ang ulo")).toBe("Headache");
  });

  it("matches whole words only", () => {
    // "ubo" must not match inside "ubos".
    expect(complaintCondition("ubos na ang gamot")).toBeNull();
  });

  it("returns nothing rather than guessing", () => {
    expect(complaintCondition("annual medical certificate")).toBeNull();
    expect(complaintCondition("")).toBeNull();
    expect(complaintCondition(null)).toBeNull();
  });
});

describe("what a card shows", () => {
  it("shows the condition when it recognises one", () => {
    const summary = summariseComplaint(
      "I have been experiencing a persistent cough for three days"
    );

    expect(summary.label).toBe("Cough");
    expect(summary.recognised).toBe(true);
    expect(summary.full).toContain("persistent cough");
  });

  it("marks a condition worth noticing early", () => {
    expect(summariseComplaint("possible dengue").notifiable).toBe(true);
    expect(summariseComplaint("ubo").notifiable).toBe(false);
  });

  it("keeps unrecognised wording, cut at a word", () => {
    const summary = summariseComplaint(
      "Requesting a medical certificate for employment purposes overseas",
      46
    );

    expect(summary.recognised).toBe(false);
    expect(summary.label.endsWith("…")).toBe(true);

    /*
     * The kept text must stop where a word stops in the original, so the
     * label never reads as a word cut in half -- "persistent cou…" looks
     * like broken software rather than a shortened sentence.
     */
    const kept = summary.label.slice(0, -1);

    expect(summary.full.startsWith(kept)).toBe(true);
    expect(summary.full[kept.length]).toBe(" ");
  });

  it("leaves a short reason alone", () => {
    expect(summariseComplaint("Follow-up check").label).toBe("Follow-up check");
  });
});
