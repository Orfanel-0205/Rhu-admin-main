// tests/idleSignOut.test.ts
//
// Settings → Security Rules → Session timeout: the dashboard signs staff out
// after that many minutes without activity; empty means no limit.

import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/apiClient", () => ({ default: { get: vi.fn() } }));

const { isIdleExpired } = await import("../src/lib/idleSignOut");

describe("idle sign-out", () => {
  const minute = 60_000;
  const start = 1_800_000_000_000;

  it("signs out once the limit has passed, not before", () => {
    expect(isIdleExpired(start, start + 29 * minute, 30)).toBe(false);
    expect(isIdleExpired(start, start + 30 * minute, 30)).toBe(true);
  });

  it("never signs out when no limit is set", () => {
    expect(isIdleExpired(start, start + 24 * 60 * minute, null)).toBe(false);
    expect(isIdleExpired(start, start + 24 * 60 * minute, 0)).toBe(false);
  });
});
