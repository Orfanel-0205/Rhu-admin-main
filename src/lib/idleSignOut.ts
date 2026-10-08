// src/lib/idleSignOut.ts
//
// SIGN STAFF OUT AFTER A WHILE WITHOUT ACTIVITY -- Settings → Security Rules
// → Session timeout. The setting was saved and read by nothing until
// October 2026; a dashboard left open on a shared RHU computer stayed signed
// in for the token's full seven days.
//
// The minutes come from GET /session-policy (empty = no limit). Activity in
// any tab -- mouse, keys, touch, scrolling -- counts for all of them: the time
// of the last activity is kept in localStorage, so working in one tab never
// signs out another. When the limit passes the session is cleared and the
// sign-in page says why.

import { useEffect } from "react";
import apiClient from "./apiClient";

export const LAST_ACTIVITY_KEY = "ka_agapay_last_activity";
export const SIGNED_OUT_IDLE_KEY = "ka_agapay_signed_out_idle";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
const RECORD_EVERY_MS = 15_000;
const CHECK_EVERY_MS = 30_000;

/** Whether `minutes` without activity have passed since `lastActivity`. */
export function isIdleExpired(lastActivity: number, now: number, minutes: number | null): boolean {
  if (!minutes || minutes <= 0 || !Number.isFinite(lastActivity)) return false;
  return now - lastActivity >= minutes * 60_000;
}

function readLastActivity(): number {
  try {
    const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : Date.now();
  } catch {
    return Date.now();
  }
}

function recordActivity(): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    // Private mode: this tab's own timer still works from page load.
  }
}

export function useIdleSignOut(signOut: (minutes: number) => void): void {
  useEffect(() => {
    let minutes: number | null = null;
    let lastRecorded = 0;
    let cancelled = false;

    recordActivity();

    const onActivity = () => {
      const now = Date.now();
      if (now - lastRecorded >= RECORD_EVERY_MS) {
        lastRecorded = now;
        recordActivity();
      }
    };

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));

    apiClient
      .get("/session-policy", { suppressErrorToast: true } as any)
      .then((res) => {
        if (!cancelled) {
          const value = Number(res.data?.session_timeout_minutes);
          minutes = Number.isFinite(value) && value > 0 ? value : null;
        }
      })
      .catch(() => {
        // No policy: no limit, as before.
      });

    const timer = window.setInterval(() => {
      if (minutes && isIdleExpired(readLastActivity(), Date.now(), minutes)) {
        window.clearInterval(timer);
        try {
          sessionStorage.setItem(SIGNED_OUT_IDLE_KEY, String(minutes));
        } catch {
          // The notice is a courtesy.
        }
        signOut(minutes);
      }
    }, CHECK_EVERY_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity));
    };
  }, [signOut]);
}
