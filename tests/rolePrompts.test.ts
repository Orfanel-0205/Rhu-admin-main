// tests/rolePrompts.test.ts
//
// The staff assistant's starter questions follow the role (Nov 2026): nobody
// is invited to ask about a screen the server refuses them.

import { describe, expect, it } from "vitest";
import { promptsForRole } from "../src/lib/rolePrompts";

const askAbout = (role: string) => (promptsForRole({ role }) ?? []).join(" ").toLowerCase();

describe("starter questions by role", () => {
  it("never offers a nurse or a BHW the screens their role cannot open", () => {
    for (const role of ["nurse", "bhw"]) {
      const text = askAbout(role);
      expect(text).not.toMatch(/sms|analytics|approve|api key|rhu facility/);
    }
    expect(askAbout("bhw")).not.toMatch(/inventory|prescription/);
  });

  it("starts each role from its own work", () => {
    expect(askAbout("doctor")).toContain("e-prescription");
    expect(askAbout("mho")).toContain("signature");
    expect(askAbout("bhw")).toContain("barangay event");
    expect(askAbout("super_admin")).toContain("rhu facility");
    expect(askAbout("rhu_admin")).toContain("announcement");
  });

  it("falls back to the page's own help for a role it does not know", () => {
    expect(promptsForRole({ role: "municipal_mayor" })).toBeNull();
    expect(promptsForRole(null)).toBeNull();
  });
});
