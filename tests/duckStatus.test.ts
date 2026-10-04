// tests/duckStatus.test.ts
//
// When Doctor Quack appears instead of a toast, and when he must not.
//
// The duck replaces the red toast for "your role can't do this" (403), "the
// server broke" (5xx) and maintenance (503). Two 403s are NOT refusals and
// must never show him: the sign-in code step (code_required), and anything a
// screen handles itself (suppressErrorToast) -- the login page is one.

import { AxiosError, AxiosHeaders } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// apiClient reads the saved token from localStorage on every request.
beforeAll(() => {
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
});

const { default: apiClient } = await import("../src/lib/apiClient");
const { onDuck } = await import("../src/lib/duckBus");

let ducks: { kind: string; message?: string }[] = [];
let stop: () => void = () => {};

beforeEach(() => {
  ducks = [];
  stop();
  stop = onDuck((event) => ducks.push(event));
});

function failWith(status: number, data: unknown) {
  apiClient.defaults.adapter = async (config) => {
    throw new AxiosError(`HTTP ${status}`, "ERR_BAD_RESPONSE", config, null, {
      status,
      statusText: "",
      data,
      headers: {},
      config: { ...config, headers: new AxiosHeaders() },
    });
  };
}

describe("Doctor Quack in the admin", () => {
  it("shows the 403 duck with the server's reason when an action is refused", async () => {
    failWith(403, { message: "Only a Doctor, MHO, or Super Admin can create or issue prescriptions." });

    await apiClient.post("/prescriptions", {}).catch(() => {});

    expect(ducks).toEqual([
      { kind: "forbidden", message: "Only a Doctor, MHO, or Super Admin can create or issue prescriptions." },
    ]);
  });

  it("does not treat the sign-in code step as a refusal", async () => {
    failWith(403, { code_required: true, challenge: "x", message: "Enter the code" });

    await apiClient.post("/admin/login", {}).catch(() => {});

    expect(ducks).toEqual([]);
  });

  it("leaves screens that handle their own errors alone", async () => {
    failWith(403, { message: "Your account is pending approval." });

    await apiClient.post("/admin/login", {}, { suppressErrorToast: true } as any).catch(() => {});

    expect(ducks).toEqual([]);
  });

  it("shows the 500 duck when the server breaks", async () => {
    failWith(500, { message: "Server Error" });

    await apiClient.patch("/consultations/1", {}).catch(() => {});

    expect(ducks.map((d) => d.kind)).toEqual(["server_error"]);
  });

  it("shows the maintenance duck for any request, even a page load", async () => {
    failWith(503, { message: "Service Unavailable" });

    await apiClient.get("/dashboard").catch(() => {});

    expect(ducks.map((d) => d.kind)).toEqual(["maintenance"]);
  });

  it("does not pop up for a failed page load that is not maintenance", async () => {
    // Background loads failing must not cover the screen in dialogs.
    failWith(500, {});

    await apiClient.get("/notifications").catch(() => {});

    expect(ducks).toEqual([]);
  });
});
