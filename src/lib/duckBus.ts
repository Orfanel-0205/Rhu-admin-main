// src/lib/duckBus.ts
//
// How the API client asks for a duck.
//
// Three answers from the server deserve more than a one-line toast, because
// the person needs to understand what happened, not just that it failed:
//
//   forbidden     403  your role cannot do this (e.g. a nurse issuing a
//                      prescription, which only a Doctor or MHO may do)
//   server_error  5xx  the server broke, not you
//   maintenance   503  the whole system is down for an update
//
// apiClient.ts emits; components/DuckStatus.tsx listens and draws. Kept apart
// so the API layer never imports React.

export type DuckKind = "forbidden" | "server_error" | "maintenance";

export interface DuckEvent {
  kind: DuckKind;
  /** The server's own explanation, when it gave one. */
  message?: string;
}

type Listener = (event: DuckEvent) => void;

const listeners = new Set<Listener>();

export function onDuck(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Show a duck. Returns false when nothing is listening (a page rendered
 * outside the app shell), so the caller can fall back to a toast instead of
 * failing silently.
 */
export function emitDuck(event: DuckEvent): boolean {
  if (listeners.size === 0) return false;

  listeners.forEach((listener) => listener(event));
  return true;
}
