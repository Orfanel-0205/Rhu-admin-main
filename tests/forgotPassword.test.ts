// tests/forgotPassword.test.ts
//
// "Forgot password?" on the admin sign-in page.
//
// The server answers a reset request the same way whether or not an account
// matched, so the page must always move on to the code step and must never
// show anything that only a real account would have. These tests hold the
// calls to the staff endpoints (never the residents') and that the page
// offers the way in at all.

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();

vi.mock("../src/lib/apiClient", () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

const { authService } = await import("../src/services/auth");

beforeEach(() => post.mockReset());

describe("the reset requests", () => {
  it("asks the staff endpoint, quietly, and keeps the challenge", async () => {
    post.mockResolvedValueOnce({ data: { challenge: "c-1", message: "If an account matches...", resend_after: 60 } });

    const sent = await authService.forgotPassword("09171234567");

    expect(post.mock.calls[0][0]).toBe("/admin/forgot-password");
    expect(post.mock.calls[0][1]).toEqual({ login: "09171234567" });
    // A refusal is shown inside the panel, not as a second toast.
    expect(post.mock.calls[0][2]).toMatchObject({ suppressErrorToast: true });
    expect(sent).toEqual({ challenge: "c-1", message: "If an account matches...", resendAfter: 60 });
  });

  it("sends the code and both passwords together", async () => {
    post.mockResolvedValueOnce({ data: { message: "Your password has been changed." } });

    const message = await authService.resetPassword({
      challenge: "c-1",
      code: "123456",
      password: "New-Pass-123!",
      password_confirmation: "New-Pass-123!",
    });

    expect(post.mock.calls[0][0]).toBe("/admin/reset-password");
    expect(post.mock.calls[0][1]).toMatchObject({ challenge: "c-1", code: "123456" });
    expect(message).toBe("Your password has been changed.");
  });

  it("resends on the staff endpoint", async () => {
    post.mockResolvedValueOnce({ data: { message: "We sent a new code.", resend_after: 60 } });

    await authService.resendResetCode("c-1");

    expect(post.mock.calls[0][0]).toBe("/admin/forgot-password/resend");
  });
});

describe("the sign-in page", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");

  it("offers Forgot password? and opens the reset panel", () => {
    const login = read("src/pages/Login.tsx");

    expect(login).toContain("Forgot password?");
    expect(login).toContain("<ForgotPasswordPanel");
  });

  it("never shows where a code went, which only a real account would have", () => {
    const panel = read("src/components/auth/ForgotPasswordPanel.tsx");

    expect(panel).not.toMatch(/masked_?[Mm]obile|masked_?[Ee]mail/);
    expect(panel).toContain('autoComplete="one-time-code"');
    expect(panel).toContain('autoComplete="new-password"');
  });
});
