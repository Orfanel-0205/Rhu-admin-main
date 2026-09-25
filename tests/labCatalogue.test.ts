// tests/labCatalogue.test.ts
//
// WHAT THIS GUARDS
// ----------------
// The laboratory catalogue exists twice: src/constants/labTests.ts builds the
// form in the browser, app/Support/LabTestCatalogue.php builds the printed
// request on the server. Two copies of a clinical list is a standing hazard.
//
// A test added to only one side fails in the worst possible way. Add it here
// alone and a clinician ticks it, the prescription saves, and the test is
// simply absent from the paper the patient carries to the laboratory -- the
// form looks correct at every point a human looks at it. The patient finds out
// at the laboratory counter, or nobody finds out at all.
//
// The backend has a mirror of this test. Both exist because whoever edits one
// repository usually runs only that repository's tests.
//
// The stored `value` is the other hazard. It is what sits in
// prescriptions.lab_tests, so renaming one does not rename history -- it blanks
// that test on every prescription already saved. Labels can be reworded
// freely; values cannot be touched.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LABORATORY_GROUPS,
  ULTRASOUND_GROUPS,
  XRAY_GROUPS,
  flattenTests,
  labelForValue,
  type LabTestGroupDef,
} from "../src/constants/labTests";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SECTIONS: Record<string, LabTestGroupDef[]> = {
  laboratory: LABORATORY_GROUPS,
  xray: XRAY_GROUPS,
  ultrasound: ULTRASOUND_GROUPS,
};

/**
 * Values that existed before this catalogue did.
 *
 * Listed literally rather than read from the catalogue: the whole point is to
 * fail if the catalogue changes underneath them.
 */
const ORIGINAL_VALUES: Record<string, string[]> = {
  laboratory: [
    "CBC", "Urinalysis", "Fecalysis", "FBS", "HBA1C", "B.U.A",
    "ALT", "AST", "Creatinine", "B.U.N", "Total Lipid Profile",
  ],
  xray: ["CXR - PA View", "CXR - Apicolordotic View"],
  ultrasound: [
    "Whole Abdomen", "Lower Abdomen", "Upper Abdomen", "Prostate", "HBT", "KUB",
  ],
};

/** Where the file sits inside whichever folder the backend was cloned into. */
const CATALOGUE = path.join("app", "Support", "LabTestCatalogue.php");

/**
 * The backend checkout, if it is anywhere this machine can see it.
 *
 * The two repositories are separate clones and are not reliably siblings, so
 * this climbs out of the admin folder looking for the backend by name rather
 * than assuming a layout. KAAGAPAY_BACKEND_PATH settles it on a machine that
 * keeps them somewhere else entirely.
 */
function backendCataloguePath(): string | null {
  const fromEnv = process.env.KAAGAPAY_BACKEND_PATH;

  if (fromEnv) {
    const explicit = path.join(fromEnv, CATALOGUE);

    return fs.existsSync(explicit) ? explicit : null;
  }

  // Folder names the backend has been cloned under.
  const names = ["ka-agapay-backend", "PROMAIN-BE-1/ka-agapay-backend"];

  let dir = HERE;

  for (let climb = 0; climb < 6; climb += 1) {
    for (const name of names) {
      const candidate = path.join(dir, name, CATALOGUE);

      if (fs.existsSync(candidate)) return candidate;
    }

    const parent = path.dirname(dir);

    if (parent === dir) break;

    dir = parent;
  }

  return null;
}

/**
 * Pull the stored values out of one PHP constant.
 *
 * A regex rather than anything cleverer, on purpose: the PHP file is a plain
 * data literal, and a parser would be more code than the thing it checks.
 */
function backendValues(source: string, constant: string): string[] {
  const start = source.indexOf(`const ${constant} = [`);

  if (start < 0) throw new Error(`${constant} not found in the backend catalogue`);

  const next = source.indexOf("const ", start + 10);
  const block = next < 0 ? source.slice(start) : source.slice(start, next);

  // No stored value contains an apostrophe, so matching to the next quote is
  // enough; the one escaped quote in the PHP file is in a group name, and
  // group names are display only.
  const pattern = /'value'\s*=>\s*'([^']*)'/g;

  return [...block.matchAll(pattern)].map((match) => match[1]);
}

describe("laboratory catalogue", () => {
  it.each(Object.keys(SECTIONS))("%s keeps every value already stored", (section) => {
    const values = flattenTests(SECTIONS[section]).map((test) => test.value);

    for (const original of ORIGINAL_VALUES[section]) {
      expect(
        values,
        `'${original}' has gone from the ${section} catalogue. Every `
          + "prescription already saved with it would stop ticking that box on "
          + "the printed request. Add a new entry instead of renaming this one."
      ).toContain(original);
    }
  });

  it.each(Object.keys(SECTIONS))("%s never lists the same value twice", (section) => {
    const values = flattenTests(SECTIONS[section]).map((test) => test.value);

    // A duplicate shows as two checkboxes that tick and untick together.
    expect(values).toEqual([...new Set(values)]);
  });

  it.each(Object.keys(SECTIONS))("%s gives every test a value and a label", (section) => {
    for (const test of flattenTests(SECTIONS[section])) {
      expect(test.value.trim()).not.toBe("");
      expect(test.label.trim()).not.toBe("");
    }
  });

  it("falls back to the stored value for a test no longer offered", () => {
    // A prescription printed from an old record must still name its test,
    // even after the RHU stops offering it.
    expect(labelForValue(LABORATORY_GROUPS, "CBC")).toBe("Complete Blood Count (CBC)");
    expect(labelForValue(LABORATORY_GROUPS, "Some Retired Test")).toBe("Some Retired Test");
  });

  it("offers exactly what the backend prints", () => {
    const backendPath = backendCataloguePath();

    if (backendPath === null) {
      // Honest skip. A developer who has only checked out the admin cannot be
      // asked to fix a mismatch they have no way to see -- and the backend's
      // own copy of this test covers the case from the other side.
      console.warn(
        "Skipped: the backend checkout was not found. Set KAAGAPAY_BACKEND_PATH "
          + "to the Laravel root to compare the two catalogues."
      );
      return;
    }

    const source = fs.readFileSync(backendPath, "utf8");

    for (const [section, constant] of Object.entries({
      laboratory: "LABORATORY",
      xray: "XRAY",
      ultrasound: "ULTRASOUND",
    })) {
      const here = flattenTests(SECTIONS[section]).map((test) => test.value).sort();
      const there = backendValues(source, constant).sort();

      expect(
        here,
        `The ${section} catalogue differs between the admin and the backend. A `
          + "test in only one of them is either tickable and missing from the "
          + "printed request, or printed and impossible to select."
      ).toEqual(there);
    }
  });
});
