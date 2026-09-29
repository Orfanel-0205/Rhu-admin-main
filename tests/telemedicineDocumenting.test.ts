// tests/telemedicineDocumenting.test.ts
//
// "Save SOAP does nothing."
//
// Every control in the telemedicine documentation panel was disabled by
// `isSessionFinished`, which is true for a session whose status is "ended".
// Ending the session is how a consultation finishes, so the panel switched
// itself off at exactly the moment the clinician sat down to write the note.
// All 22 sessions in production were in that state, which is why it presented
// as a button that had simply stopped working.
//
// The page said the opposite in words directly above the dead button:
// "Continue documenting or finalizing the SOAP notes from the panel."
//
// The backend never agreed with the frontend here. TelemedicineService::
// saveNotes accepts active, paused and ended, and refuses only cancelled and
// no_show. The frontend was stricter than the API it was calling, by mistake.
//
// These tests hold that boundary in place: the call ending must stop the call
// and nothing else, and the two repositories must keep the same idea of when
// a note can still be written.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const ROOM = path.join(ROOT, "src", "pages", "TelemedicineRoom.tsx");

/** Where the backend might be, relative to this checkout. */
const BACKEND_CANDIDATES = [
  "../../../PROMAIN-BE-1/ka-agapay-backend",
  "../../PROMAIN-BE-1/ka-agapay-backend",
  "../ka-agapay-backend",
];

function roomSource(): string {
  return fs.readFileSync(ROOM, "utf8");
}

/** The status list a `useMemo` block tests membership against. */
function statusesFor(source: string, flag: string): string[] {
  const declaration = new RegExp(
    `const ${flag} = useMemo\\(\\(\\) => \\{\\s*return (\\[[^\\]]*\\])`,
    "m"
  );

  const match = source.match(declaration);

  if (!match) {
    throw new Error(`Could not find the status list for ${flag}.`);
  }

  return Array.from(match[1].matchAll(/"([a-z_]+)"/g))
    .map((m) => m[1])
    .sort();
}

function backendService(): string | null {
  for (const candidate of BACKEND_CANDIDATES) {
    const file = path.resolve(
      ROOT,
      candidate,
      "app/Services/Telemedicine/TelemedicineService.php"
    );

    if (fs.existsSync(file)) {
      return fs.readFileSync(file, "utf8");
    }
  }

  return null;
}

describe("telemedicine documentation stays available after the call", () => {
  it("treats an ended session as still writable", () => {
    expect(statusesFor(roomSource(), "canDocument")).toEqual([
      "active",
      "ended",
      "paused",
    ]);
  });

  it("does not gate saving on the call being live", () => {
    const source = roomSource();

    // The two save buttons and the two tools that feed them. Each must follow
    // canDocument; isSessionFinished may only hide the call itself.
    const guards = source.match(/disabled=\{[^}]*isSessionFinished[^}]*\}/g) ?? [];

    expect(
      guards,
      "A documentation control is disabled by isSessionFinished again. " +
        "That flag means the video call is over, not that the consultation " +
        "note is closed — use canDocument."
    ).toEqual([]);
  });

  it("still hides the call itself once the session is finished", () => {
    // The guard is not useless; it must keep doing the one job it has.
    expect(roomSource()).toContain("{isSessionFinished ? (");
  });
});

describe("the frontend and backend agree on when notes are accepted", () => {
  const service = backendService();

  it.skipIf(service === null)(
    "matches TelemedicineService::saveNotes",
    () => {
      const guard = service!.match(
        /if \(!in_array\(\$session->status, (\[[^\]]*\]), true\)\) \{\s*throw new \\DomainException\('Notes can only be saved/m
      );

      expect(
        guard,
        "Could not find the status guard in saveNotes. If it moved, this " +
          "test needs to follow it rather than be deleted."
      ).not.toBeNull();

      const backendStatuses = Array.from(guard![1].matchAll(/'([a-z_]+)'/g))
        .map((m) => m[1])
        .sort();

      expect(
        statusesFor(roomSource(), "canDocument"),
        "The admin now allows a different set of statuses than the API it " +
          "calls. Whichever side is stricter will look broken to the user."
      ).toEqual(backendStatuses);
    }
  );
});
