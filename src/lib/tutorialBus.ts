// src/lib/tutorialBus.ts
//
// Imperative bridge so anything outside the chatbot (the Sidebar's "Getting
// Started" entry, the first-login trigger in DashboardShell) can open the
// EXISTING assistant in its EXISTING tutorial mode.
//
// Deliberately mirrors lib/toastBus.ts: <AIChatAssistant> registers itself on
// mount, callers just fire. This avoids lifting the assistant's whole state up
// into DashboardShell or threading props through the Sidebar, and it keeps the
// tutorial itself in ONE place — there is no second tutorial system here, only
// a new way to reach the one that already exists.

export interface OpenGettingStartedOptions {
  /**
   * True only for the automatic first-ever-login open. Shows a one-time welcome
   * banner; the sidebar entry passes nothing and gets the plain coach.
   */
  firstLogin?: boolean;
}

type TutorialListener = (options: OpenGettingStartedOptions) => void;

let listener: TutorialListener | null = null;

/** AIChatAssistant registers itself here on mount (and clears on unmount). */
export function registerTutorialListener(fn: TutorialListener | null): void {
  listener = fn;
}

/**
 * Open the assistant in Getting Started mode.
 *
 * Idempotent by design: unlike the header toggle this always switches INTO
 * tutorial mode, so clicking the sidebar entry while already in the coach
 * re-opens/restarts it instead of silently toggling back to the normal
 * assistant.
 */
export function openGettingStarted(options: OpenGettingStartedOptions = {}): void {
  if (listener) {
    listener(options);
  } else if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn("[tutorialBus] no AIChatAssistant mounted — dropped Getting Started request");
  }
}
