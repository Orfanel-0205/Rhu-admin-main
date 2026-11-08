// tests/offlineOutbox.test.ts
//
// What staff save with no connection is kept and sent later (Nov 2026).
//
//   - no connection: the save is kept with its own Idempotency-Key, under the
//     account that made it, and the form is told so instead of failing
//   - an answer from the server (a validation error) is thrown as before and
//     nothing is kept
//   - sending later uses the same key, removes what was accepted, keeps what
//     was refused with the reason, and stops at a server error to keep order
//   - another account's items are never sent under this one
//   - a newer SOAP draft replaces a waiting older one
//   - the SOAP autosave is offered back only when newer than the server's save

import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("../src/lib/apiClient", () => ({ default: { request: (...args: any[]) => request(...args) } }));

import {
  flushOutbox,
  getOutboxSnapshot,
  IDEMPOTENCY_HEADER,
  sendOrQueue,
} from "../src/lib/offlineOutbox";
import { newerThanServer } from "../src/lib/soapAutosave";

const STORAGE_KEY = "kaagapay.outbox.v1";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function signIn(id: number) {
  localStorage.setItem("ka_agapay_user", JSON.stringify({ id }));
}

function kept(): any[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

const noAnswer = () => Object.assign(new Error("Network Error"), { isAxiosError: true, config: {}, code: "ERR_NETWORK" });
const answered = (status: number, message = "Refused") =>
  Object.assign(new Error(message), { isAxiosError: true, config: {}, response: { status, data: { message } } });

let online = true;

beforeEach(() => {
  request.mockReset();
  online = true;
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
  });
  vi.stubGlobal("window", { dispatchEvent: () => true, addEventListener: () => {}, setInterval: () => 0 });
  signIn(7);
});

describe("saving", () => {
  it("sends straight away when there is a connection, with a key", async () => {
    request.mockResolvedValueOnce({ data: { ok: true } });

    const result = await sendOrQueue({ method: "post", url: "/queue/issue", data: { a: 1 }, label: "Queue ticket" });

    expect(result).toEqual({ queued: false, data: { ok: true } });
    expect(request.mock.calls[0][0].headers[IDEMPOTENCY_HEADER]).toMatch(/^outbox-/);
    expect(kept()).toHaveLength(0);
  });

  it("keeps the save under this account when the request gets no answer", async () => {
    request.mockRejectedValueOnce(noAnswer());

    const result = await sendOrQueue({ method: "post", url: "/admin/events/3/walk-ins", data: { name: "Juan" }, label: "Event walk-in: Juan" });

    expect(result.queued).toBe(true);
    expect(kept()).toMatchObject([{ userId: "7", url: "/admin/events/3/walk-ins", status: "waiting", label: "Event walk-in: Juan" }]);
  });

  it("keeps it without trying when the browser knows it is offline", async () => {
    online = false;

    const result = await sendOrQueue({ method: "post", url: "/follow-up-reminders", data: {}, label: "Follow-up" });

    expect(result.queued).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("throws a server's answer as before and keeps nothing", async () => {
    request.mockRejectedValueOnce(answered(422, "The patient is already in the queue."));

    await expect(sendOrQueue({ method: "post", url: "/queue/issue", data: {}, label: "x" })).rejects.toThrow(
      "The patient is already in the queue."
    );
    expect(kept()).toHaveLength(0);
  });

  it("lets a newer SOAP draft replace a waiting one", async () => {
    online = false;
    await sendOrQueue({ method: "put", url: "/admin/consultations/5/soap", data: { plan: "old" }, label: "SOAP", coalesceKey: "soap:5" });
    await sendOrQueue({ method: "put", url: "/admin/consultations/5/soap", data: { plan: "new" }, label: "SOAP", coalesceKey: "soap:5" });

    expect(kept()).toHaveLength(1);
    expect(kept()[0].data).toEqual({ plan: "new" });
  });
});

describe("sending later", () => {
  async function keepThree() {
    online = false;
    await sendOrQueue({ method: "post", url: "/a", data: 1, label: "A" });
    await sendOrQueue({ method: "post", url: "/b", data: 2, label: "B" });
    await sendOrQueue({ method: "post", url: "/c", data: 3, label: "C" });
    online = true;
  }

  it("sends each with the key it was kept with and removes what was accepted", async () => {
    await keepThree();
    const keys = kept().map((item) => item.id);
    request.mockResolvedValue({ data: {} });

    expect(await flushOutbox()).toBe(3);
    expect(request.mock.calls.map((call) => call[0].headers[IDEMPOTENCY_HEADER])).toEqual(keys);
    expect(kept()).toHaveLength(0);
  });

  it("keeps a refused item with the reason and goes on to the next", async () => {
    await keepThree();
    request
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(answered(422, "The event has ended."))
      .mockResolvedValueOnce({ data: {} });

    expect(await flushOutbox()).toBe(2);
    expect(kept()).toMatchObject([{ label: "B", status: "refused", error: "The event has ended." }]);
  });

  it("stops at a server error and keeps the rest in order", async () => {
    await keepThree();
    request.mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(answered(500));

    expect(await flushOutbox()).toBe(1);
    expect(kept().map((item) => [item.label, item.status])).toEqual([
      ["B", "waiting"],
      ["C", "waiting"],
    ]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("never sends another account's items", async () => {
    await keepThree();
    signIn(8);
    request.mockResolvedValue({ data: {} });

    expect(await flushOutbox()).toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(getOutboxSnapshot().items).toHaveLength(0);
    expect(kept()).toHaveLength(3);
  });
});

describe("SOAP autosave", () => {
  const server = { plan: "Paracetamol" };

  it("offers back notes written after the server's last save", () => {
    const kept = { fields: { plan: "Paracetamol, fluids" }, savedAt: "2026-11-08T03:00:00Z" };
    expect(newerThanServer(kept, "2026-11-08T02:00:00Z", server)).toBe(kept);
  });

  it("ignores a copy older than the server's save, or the same as it", () => {
    expect(newerThanServer({ fields: { plan: "x" }, savedAt: "2026-11-08T01:00:00Z" }, "2026-11-08T02:00:00Z", server)).toBeNull();
    expect(newerThanServer({ fields: server, savedAt: "2026-11-08T03:00:00Z" }, "2026-11-08T02:00:00Z", server)).toBeNull();
  });
});
