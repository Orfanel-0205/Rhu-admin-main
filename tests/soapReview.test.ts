// tests/soapReview.test.ts
//
// Who writes which part of the SOAP, as on the MHO's Individual Treatment
// Record: nurses, midwives and BHWs fill the vitals and S/O/A/P and "Send to
// MHO"; the doctor (MHO, doctor, Super Admin) writes Remarks & Diagnosis,
// Treatment and Prescribe Drug/s and completes the record. The server
// enforces the same split; these tests keep the page honest about it.

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();

vi.mock("../src/lib/apiClient", () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

const { sendSoapForReview } = await import("../src/services/consultations");

beforeEach(() => post.mockReset());

describe("sendSoapForReview", () => {
  it("posts the nurse's part to the consultation's send-for-review endpoint", async () => {
    post.mockResolvedValueOnce({
      data: { message: "Sent to the MHO. 3 MHOs were notified.", consultation: { id: 7, sent_for_review_at: "2026-10-05T08:00:00Z" } },
    });

    const result = await sendSoapForReview(7, { subjective: "S", assessment: "A", plan: "P" });

    expect(post.mock.calls[0][0]).toBe("/admin/consultations/7/send-for-review");
    expect(post.mock.calls[0][1]).toMatchObject({ subjective: "S", assessment: "A", plan: "P" });
    expect(result.message).toBe("Sent to the MHO. 3 MHOs were notified.");
    expect((result.consultation as any).sent_for_review_at).toBe("2026-10-05T08:00:00Z");
  });
});

describe("the consultation page", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../src/pages/ConsultationDetails.tsx"), "utf8");

  it("keeps the doctor's sections read-only for nurses, midwives and BHWs", () => {
    // Diagnosis, Treatment and Prescribed Drug/s.
    expect(page.match(/readOnly=\{isSoapReadOnly \|\| !isDoctorSide\}/g)?.length).toBe(3);
  });

  it("offers Send to MHO instead of completing, to everyone but the doctor", () => {
    expect(page.match(/isDoctorSide \? \(\s*<button onClick=\{onComplete\}/g)?.length).toBe(2);
    expect(page.match(/<button onClick=\{onSendForReview\}/g)?.length).toBe(2);
  });

  it("does not let a scan fill the doctor's sections for a nurse", () => {
    expect(page).toContain('if (!isDoctorSide && (key === "diagnosis" || key === "treatment"))');
    expect(page).toContain('if (!isDoctorSide && key === "prescribed_drugs")');
  });
});
