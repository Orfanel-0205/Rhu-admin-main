// src/lib/toastBus.ts
//
// Imperative bridge so non-React modules (e.g. the axios interceptor in
// apiClient.ts, or plain service functions) can raise a toast through the SAME
// single global <ToastProvider>. React components keep using useToast(); this is
// only for code that runs outside the React tree.
//
// Mirrors the mobile pattern (store/useToastStore.ts -> showToast()).

import type { ToastType } from "../types";

type ToastListener = (message: string, type: ToastType, duration?: number) => void;

let listener: ToastListener | null = null;

/** ToastProvider registers itself here on mount (and clears on unmount). */
export function registerToastListener(fn: ToastListener | null): void {
  listener = fn;
}

/** Raise a toast from anywhere. No-op (with a dev warning) if no provider is mounted. */
export function emitToast(message: string, type: ToastType = "info", duration?: number): void {
  if (listener) {
    listener(message, type, duration);
  } else if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[toastBus] no ToastProvider mounted — dropped ${type} toast:`, message);
  }
}

/**
 * Turn an axios/unknown error into a short, user-safe message. Never leaks SQL,
 * stack traces, or raw exception text to the UI.
 */
export function toUserErrorMessage(error: any, fallback = "Something went wrong. Please try again."): string {
  const raw =
    fieldErrorMessage(error?.response?.data) ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "";

  const text = String(raw).trim();

  if (!text) return fallback;

  // Hide anything that looks like a server/database internal.
  if (/sql|select |insert |update |delete |exception|stack|trace|syntax|econn|timeout of/i.test(text)) {
    return fallback;
  }

  // Axios network failure with no response.
  if (!error?.response && /network|failed to fetch/i.test(text)) {
    return "Cannot reach the server. Check your connection and try again.";
  }

  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

/**
 * The server's 422 answer says only "Validation failed." and lists what was
 * wrong under `errors` ({ email: ["The email field must be a valid email
 * address."] }). Staff saw the bare "Validation failed." and could not tell
 * which field to fix, so the toast shows the field messages instead.
 */
export function fieldErrorMessage(data: any): string {
  const errors = data?.errors;
  if (!errors || typeof errors !== "object") return "";

  const messages = Object.values(errors)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(messages));

  if (unique.length === 0) return "";
  return unique.length === 1 ? unique[0] : `${unique[0]} (and ${unique.length - 1} more)`;
}
