// tests/signInCode.test.ts
//
// The admin sign-in after a wrong password.
//
// The server answers the right password on a flagged account with HTTP 403
// and code_required, and expects the page to ask for the code texted to the
// account holder's phone. If the service mistook that 403 for a refusal, a
// staff member who mistyped once would see an error and never get the code
// screen -- locked out of their own account by a security feature.

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();

vi.mock("../src/lib/apiClient", () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

const { authService, SignInCodeRequired } = await import("../src/services/auth");

function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });
}

beforeEach(() => post.mockReset());

describe("signing in after a wrong password", () => {
  it("turns code_required into the code step, with what that step needs", async () => {
    post.mockRejectedValueOnce(
      httpError(403, {
        code_required: true,
        challenge: "abc123",
        masked_mobile: "001",
        expires_in: 300,
        resend_after: 60,
        message: "Enter the code we sent.",
      })
    );

    const attempt = authService.login({ mobile_number: "09171234567", password: "right" });

    await expect(attempt).rejects.toBeInstanceOf(SignInCodeRequired);
    await attempt.catch((error: InstanceType<typeof SignInCodeRequired>) => {
      expect(error.challenge).toEqual({
        challenge: "abc123",
        maskedMobile: "001",
        expiresIn: 300,
        resendAfter: 60,
      });
    });
  });

  it("leaves an ordinary refusal as an ordinary error", async () => {
    // A 403 without code_required is a real refusal (pending, suspended).
    post.mockRejectedValueOnce(httpError(403, { message: "Your account has been suspended." }));

    const attempt = authService.login({ mobile_number: "09171234567", password: "x" });

    await expect(attempt).rejects.not.toBeInstanceOf(SignInCodeRequired);
  });

  it("sends the code to the admin endpoint and returns the session", async () => {
    post.mockResolvedValueOnce({ data: { token: "t0k", user: { user_id: 1, role_name: "super_admin" } } });

    const session = await authService.verifyLoginCode("abc123", "123456");

    expect(post.mock.calls[0][0]).toBe("/admin/login/verify-code");
    expect(post.mock.calls[0][1]).toEqual({ challenge: "abc123", code: "123456" });
    expect(session.token).toBe("t0k");
  });
});

describe("the code screen", () => {
  const login = () => fs.readFileSync(path.resolve(__dirname, "../src/pages/Login.tsx"), "utf8");

  it("lets the phone fill the code in, and only takes digits", () => {
    const source = login();

    // Lets iOS and Android offer the code from the incoming text.
    expect(source).toContain('autoComplete="one-time-code"');
    expect(source).toContain('inputMode="numeric"');
    expect(source).toMatch(/replace\(\/\\D\/g, ""\)\.slice\(0, 6\)/);
  });

  it("tells a locked-out person how to get back in", () => {
    // Without this, a lost phone or a wrong number on file is a dead end.
    expect(login()).toMatch(/Ask RHU staff to set a new password/);
  });
});
