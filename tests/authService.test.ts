// tests/authService.test.ts
//
// THE INCIDENT THIS GUARDS
// ------------------------
// The Log out button called POST /admin/logout. No such route has ever
// existed. The request 404'd, the handler caught and discarded the error, and
// the store cleared the browser's own session -- so logging out looked
// completely normal to every member of staff who did it.
//
// What did not happen was the part that matters: the Sanctum token was never
// revoked. 172 tokens had accumulated on the server, the oldest dated 19 June
// 2026, none of them ended by anyone pressing Log out. On a shared clinic
// computer that is the whole problem -- the browser forgets you, the server
// does not, and the token in that machine's storage keeps working.
//
// It stayed hidden because every visible signal was correct. The mobile client
// had the path right all along, which is why the audit trail showed LOGOUT
// events from phones and none from the dashboard.
//
// scripts/check-api-routes.mjs catches this whole class of bug against a live
// backend. This test pins the one path we already paid for.

import { describe, expect, it, vi, beforeEach } from "vitest";

const post = vi.fn(() => Promise.resolve({ data: {} }));

vi.mock("../src/lib/apiClient", () => ({
  default: { post, get: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { default: authService } = await import("../src/services/auth");

describe("authService.logout", () => {
  beforeEach(() => post.mockClear());

  it("posts to the route the server actually serves", async () => {
    await authService.logout();

    expect(post).toHaveBeenCalledWith("/logout");
  });

  it("never calls the route that does not exist", async () => {
    await authService.logout();

    const paths = post.mock.calls.map((call) => call[0]);

    expect(
      paths,
      "/admin/logout is not a route. It 404s, the error is swallowed, and the "
        + "session token is left valid on the server."
    ).not.toContain("/admin/logout");
  });

  it("still resolves when the server cannot be reached", async () => {
    // Deliberate: a staff member on a shared computer must be able to clear
    // this browser's session even when the network is down. Leaving them
    // logged in would be worse than leaving a stale token behind.
    post.mockRejectedValueOnce(new Error("network down"));

    await expect(authService.logout()).resolves.toBeUndefined();
  });
});
