// tests/signature.test.ts
//
// My Signature (Nov 2026): only the MHO and doctors are offered the card, and
// the ITR prints the completing doctor's signature with their name under it --
// but only an image the server produced, never whatever string arrives.

import { afterEach, describe, expect, it, vi } from "vitest";
import { canSignDocuments } from "../src/lib/roleAccess";
import { printItrForm } from "../src/utils/printItr";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

function printed(data: Parameters<typeof printItrForm>[0]): string {
  let html = "";
  vi.stubGlobal("window", {
    open: () => ({
      document: { open() {}, write: (h: string) => (html = h), close() {} },
      focus() {},
    }),
  });
  printItrForm(data);
  return html;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("who signs", () => {
  it("offers My Signature to the MHO, doctors and the Super Admin only", () => {
    expect(canSignDocuments({ role: "mho" })).toBe(true);
    expect(canSignDocuments({ role: "Doctor" })).toBe(true);
    expect(canSignDocuments({ role: "super_admin" })).toBe(true);
    expect(canSignDocuments({ role: "nurse" })).toBe(false);
    expect(canSignDocuments({ role: "rhu_admin" })).toBe(false);
    expect(canSignDocuments(null)).toBe(false);
  });
});

describe("the ITR signature", () => {
  it("prints the signature with the signer's name under it", () => {
    const html = printed({ attendingName: "Nurse Reyes", signatureImage: PNG, signerName: "Dr. Santos" });
    expect(html).toContain('<img class="sig"');
    expect(html).toContain("Dr. Santos");
    expect(html).not.toContain("Nurse Reyes");
  });

  it("keeps the attending name and a blank line when unsigned", () => {
    const html = printed({ attendingName: "Nurse Reyes" });
    expect(html).not.toContain('<img class="sig"');
    expect(html).toContain("Nurse Reyes");
  });

  it("refuses anything that is not a PNG data URI", () => {
    for (const bad of [
      "javascript:alert(1)",
      'data:image/png;base64,AAA" onerror="alert(1)',
      "https://example.com/sig.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
    ]) {
      expect(printed({ attendingName: "Dr. Santos", signatureImage: bad })).not.toContain('<img class="sig"');
    }
  });
});
