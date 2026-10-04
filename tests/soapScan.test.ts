// tests/soapScan.test.ts
//
// Scanning a paper SOAP form from the consultation page.
//
// The server reads the photo into suggestions; the page fills only EMPTY
// fields from them, and lab tests found on the form can open a lab request
// with those tests already ticked.

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();

vi.mock("../src/lib/apiClient", () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

const { scanPaperSoap } = await import("../src/services/consultations");

beforeEach(() => post.mockReset());

describe("scanPaperSoap", () => {
  it("uploads the photo to the consultation's scan endpoint and keeps the catalogue values", async () => {
    post.mockResolvedValueOnce({
      data: {
        message: "Read the form.",
        fields: { subjective: "Fever x 3 days" },
        vitals: { blood_pressure: "120/80" },
        lab_tests: { laboratory: ["CBC", "Urinalysis"], xray: ["CXR - PA View"], ultrasound: [] },
        confidence: 0,
        text: "S: Fever x 3 days",
      },
    });

    const file = new File(["x"], "soap.jpg", { type: "image/jpeg" });
    const result = await scanPaperSoap(42, file);

    expect(post.mock.calls[0][0]).toBe("/admin/consultations/42/scan-soap");
    expect((post.mock.calls[0][1] as FormData).get("soap_file")).toBeInstanceOf(File);
    expect(result.fields.subjective).toBe("Fever x 3 days");
    expect(result.lab_tests.laboratory).toEqual(["CBC", "Urinalysis"]);
  });

  it("copes with a reply that found nothing", async () => {
    post.mockResolvedValueOnce({ data: { fields: {}, vitals: {} } });

    const result = await scanPaperSoap(1, new File(["x"], "a.png", { type: "image/png" }));

    expect(result.lab_tests).toEqual({ laboratory: [], xray: [], ultrasound: [] });
  });
});

describe("the pages", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");

  it("fills only empty fields from the scan, as Auto-fill from ITR does", () => {
    const page = read("src/pages/ConsultationDetails.tsx");
    const scan = page.slice(page.indexOf("async function onSoapScanFile("), page.indexOf("setSoapScan({ filled, kept"));

    expect(scan).toMatch(/if \(current\.trim\(\)\) \{\s*kept\.push\(label\);/);
    expect(scan).toMatch(/if \(String\(clinical\[key\] \?\? ""\)\.trim\(\)\) \{\s*kept\.push\(label\);/);
    expect(scan).not.toContain("saveSoap(");
  });

  it("opens a lab request with the scanned tests ticked", () => {
    const prescriptions = read("src/pages/Prescriptions.tsx");

    expect(prescriptions).toContain('searchParams.get("form_type") === "lab_request"');
    expect(prescriptions).toContain('laboratory: listFromQuery("lab_laboratory")');
  });
});
