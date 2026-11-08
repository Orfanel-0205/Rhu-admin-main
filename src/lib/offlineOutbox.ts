// src/lib/offlineOutbox.ts
//
// WHAT STAFF SAVE WITH NO CONNECTION IS KEPT, AND SENT WHEN IT RETURNS
// (Nov 2026).
//
// A walk-in added at a barangay event, a walk-in queue ticket, a follow-up, a
// SOAP draft: if the Wi-Fi or mobile data drops at the moment of saving, the
// request is kept in this browser with its own Idempotency-Key and sent again
// when the connection comes back -- on the browser's "online" signal, every
// 30 seconds while anything waits, and when the dashboard opens. The server
// does a resent request once (IdempotentRequests), so a reply lost on the way
// back cannot make a second walk-in or ticket.
//
// A kept item belongs to the account that saved it and is only ever sent
// under that account. One the server refuses when it is finally sent (the
// event has ended, the patient was already queued) is kept under "Needs
// attention" with the reason, never dropped silently. Sent items are deleted
// at once, so patient details stay on the computer only while they wait.

import apiClient from "./apiClient";
import { emitToast, toUserErrorMessage } from "./toastBus";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

const STORAGE_KEY = "kaagapay.outbox.v1";
const USER_KEY = "ka_agapay_user";
const RETRY_EVERY_MS = 30_000;

export type OutboxMethod = "post" | "put" | "patch";

export type OutboxItem = {
  /** Also the Idempotency-Key the server sees on every attempt. */
  id: string;
  userId: string;
  method: OutboxMethod;
  url: string;
  data: unknown;
  /** What the banner shows, e.g. "Walk-in: Juan Dela Cruz". */
  label: string;
  /** A newer save with the same key replaces an older waiting one (a SOAP draft). */
  coalesceKey?: string;
  createdAt: string;
  attempts: number;
  status: "waiting" | "refused";
  error?: string;
};

export type SendResult<T> = { queued: false; data: T } | { queued: true; item: OutboxItem };

// ---------------------------------------------------------------- storage

function readAll(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: OutboxItem[]): void {
  try {
    if (items.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage full or blocked: the save already failed and was reported.
  }
  notify();
}

export function currentUserId(): string | null {
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    const id = user?.id ?? user?.user_id;
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}

function newKey(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `outbox-${random}`;
}

// ---------------------------------------------------------------- state for the banner

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: { online: boolean; items: OutboxItem[] } = { online: true, items: [] };

function notify(): void {
  const me = currentUserId();
  snapshot = {
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    items: me ? readAll().filter((item) => item.userId === me) : [],
  };
  listeners.forEach((listener) => listener());
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in account's kept items and whether the browser thinks it is online. */
export function getOutboxSnapshot(): { online: boolean; items: OutboxItem[] } {
  return snapshot;
}

// ---------------------------------------------------------------- sending

/** No answer at all: offline, DNS, a dropped connection or a timeout. */
export function isConnectionFailure(error: any): boolean {
  if (error?.code === "ERR_CANCELED") return false;
  return Boolean(error?.isAxiosError || error?.config) && !error?.response;
}

function enqueue(item: Omit<OutboxItem, "createdAt" | "attempts" | "status" | "userId"> & { userId: string }): OutboxItem {
  const full: OutboxItem = { ...item, createdAt: new Date().toISOString(), attempts: 0, status: "waiting" };
  const items = readAll().filter(
    (existing) =>
      !(full.coalesceKey && existing.coalesceKey === full.coalesceKey && existing.userId === full.userId && existing.status === "waiting")
  );
  writeAll([...items, full]);
  return full;
}

/**
 * Send now, or keep it for later when there is no connection. Errors the
 * server answers (validation, a refusal) are thrown as before, for the form
 * to show; only a request that got no answer at all is kept.
 */
export async function sendOrQueue<T = any>(request: {
  method: OutboxMethod;
  url: string;
  data?: unknown;
  label: string;
  coalesceKey?: string;
}): Promise<SendResult<T>> {
  const userId = currentUserId();
  const id = newKey();

  const keep = (): SendResult<T> => {
    if (!userId) throw new Error("Sign in again to save.");
    const item = enqueue({ id, userId, ...request, data: request.data ?? null });
    emitToast("No connection. Saved on this computer: it will be sent when you are back online.", "warning", 6000);
    return { queued: true, item };
  };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return keep();
  }

  try {
    const res = await apiClient.request<T>({
      method: request.method,
      url: request.url,
      data: request.data,
      headers: { [IDEMPOTENCY_HEADER]: id },
      outbox: true,
    } as any);
    return { queued: false, data: res.data };
  } catch (error) {
    if (isConnectionFailure(error)) return keep();
    throw error;
  }
}

let flushing = false;

/** Send every waiting item of the signed-in account, oldest first. */
export async function flushOutbox(): Promise<number> {
  const me = currentUserId();
  if (flushing || !me || (typeof navigator !== "undefined" && navigator.onLine === false)) return 0;

  flushing = true;
  let sent = 0;

  try {
    for (const item of readAll().filter((entry) => entry.userId === me && entry.status === "waiting")) {
      try {
        await apiClient.request({
          method: item.method,
          url: item.url,
          data: item.data,
          headers: { [IDEMPOTENCY_HEADER]: item.id },
          outbox: true,
          suppressErrorToast: true,
        } as any);
        writeAll(readAll().filter((entry) => entry.id !== item.id));
        sent++;
      } catch (error: any) {
        const status = error?.response?.status ?? 0;

        // Still offline, signed out, busy or broken: try again later, in order.
        if (isConnectionFailure(error) || status === 401 || status === 409 || status === 429 || status >= 500) {
          writeAll(readAll().map((entry) => (entry.id === item.id ? { ...entry, attempts: entry.attempts + 1 } : entry)));
          break;
        }

        // The server looked at it and said no: keep it for a person to see.
        writeAll(
          readAll().map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "refused", attempts: entry.attempts + 1, error: toUserErrorMessage(error) }
              : entry
          )
        );
      }
    }
  } finally {
    flushing = false;
  }

  if (sent > 0) {
    emitToast(sent === 1 ? "1 item saved offline was sent." : `${sent} items saved offline were sent.`, "success");
    window.dispatchEvent(new CustomEvent("kaagapay:outbox-sent"));
  }
  notify();
  return sent;
}

export function discardOutboxItem(id: string): void {
  writeAll(readAll().filter((entry) => entry.id !== id));
}

export function retryOutboxItem(id: string): void {
  writeAll(readAll().map((entry) => (entry.id === id ? { ...entry, status: "waiting", error: undefined } : entry)));
  void flushOutbox();
}

/** Waiting or refused items the signed-in account still has on this computer. */
export function pendingOutboxCount(): number {
  const me = currentUserId();
  return me ? readAll().filter((entry) => entry.userId === me).length : 0;
}

// ---------------------------------------------------------------- automatic sending

let started = false;

/** Called once by the dashboard shell. Safe to call again. */
export function startOutbox(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("online", () => {
    notify();
    void flushOutbox();
  });
  window.addEventListener("offline", notify);
  // Another tab of the admin kept or sent something.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === USER_KEY) notify();
  });
  window.setInterval(() => {
    if (snapshot.items.some((item) => item.status === "waiting")) void flushOutbox();
  }, RETRY_EVERY_MS);

  notify();
  void flushOutbox();
}
