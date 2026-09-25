// tests/analyticsFilters.test.ts
//
// THE INCIDENT THIS GUARDS
// ------------------------
// Analytics filtered by facility with a hard-coded allow-list:
//
//     if (key === "rhu_id" && !["1", "2"].includes(String(value))) return;
//
// It was correct on the day it was written, when Malasiqui ran two units. The
// third RHU was added months later, and from then on selecting it sent no
// facility filter at all. The backend answered with system-wide totals and the
// page printed them under the RHU 3 heading: 33 telemedicine requests and 31
// completed consultations for a facility that had none of either.
//
// Nothing looked broken. There was no error, no empty state, no blank chart --
// just confident numbers belonging to somebody else, on a screen the MHO uses
// to decide where staff and stock go. That is the shape of bug worth a
// permanent test: the failure is invisible at every point a human checks.
//
// So these do not test that cleanParams works. They test that it stays open to
// facilities that do not exist yet.

import { describe, expect, it } from "vitest";

import { cleanParams } from "../src/services/analytics";

describe("cleanParams", () => {
  it("forwards a facility id the code has never seen before", () => {
    // The literal point of the regression. 3 is the RHU that broke; 47 stands
    // in for every facility a future municipality adds.
    for (const id of [3, 4, 12, 47]) {
      expect(cleanParams({ rhu_id: id })).toEqual({ rhu_id: id });
      expect(cleanParams({ rhu_id: String(id) })).toEqual({ rhu_id: id });
    }
  });

  it("still forwards the two facilities that used to be the whole list", () => {
    expect(cleanParams({ rhu_id: 1 })).toEqual({ rhu_id: 1 });
    expect(cleanParams({ rhu_id: "2" })).toEqual({ rhu_id: 2 });
  });

  it("sends the id as a number whichever way the select hands it over", () => {
    // A <select> yields strings; the store holds numbers. The backend
    // validates against the rhus table either way, but a consistent type
    // keeps request logs and cache keys comparable.
    expect(cleanParams({ rhu_id: " 3 " })).toEqual({ rhu_id: 3 });
  });

  it("drops a facility id that is not a usable one", () => {
    // "all" is the every-facility option, not a filter. The rest cannot
    // identify a row, and sending them would have the backend guess.
    for (const value of ["all", "", "abc", 0, -1, NaN]) {
      expect(cleanParams({ rhu_id: value as any })).toEqual({});
    }
  });

  it("drops empty filters without dropping real ones beside them", () => {
    const cleaned = cleanParams({
      from: "2026-01-01",
      to: "",
      disease: "all",
      diagnosis: undefined,
      rhu_id: 3,
      barangay_id: "all",
    });

    expect(cleaned).toEqual({ from: "2026-01-01", rhu_id: 3 });
  });

  it("keeps barangay filters as given, including ones added later", () => {
    // Same failure mode, different column: every RHU now serves all of
    // Malasiqui, so any barangay can legitimately pair with any facility.
    expect(cleanParams({ rhu_id: 3, barangay_id: 41 })).toEqual({
      rhu_id: 3,
      barangay_id: 41,
    });
  });

  it("returns undefined when there are no filters, so no query string is sent", () => {
    expect(cleanParams(undefined)).toBeUndefined();
  });
});
