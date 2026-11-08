// src/lib/soapAutosave.ts
//
// SOAP notes typed but not yet saved, kept on this computer (Nov 2026).
//
// "Save Draft" already survives a dropped connection (lib/offlineOutbox), but
// only once it is pressed. A tab closed, a browser that crashes, or a reload
// while the Wi-Fi is down would lose everything typed since. The SOAP page
// writes what is on screen here a moment after each change, per consultation
// and per account, and offers it back when the page opens -- only if it is
// newer than what the server has. It is removed as soon as the server has a
// save of it.

const PREFIX = "kaagapay.soapAutosave.v1";

export type SoapAutosave = {
  fields: Record<string, unknown>;
  savedAt: string;
};

function key(consultationId: string | number, userId: string | null): string {
  return `${PREFIX}:${userId ?? "anon"}:${consultationId}`;
}

export function readSoapAutosave(consultationId: string | number, userId: string | null): SoapAutosave | null {
  try {
    const raw = localStorage.getItem(key(consultationId, userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && parsed.fields && parsed.savedAt ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSoapAutosave(
  consultationId: string | number,
  userId: string | null,
  fields: Record<string, unknown>
): void {
  try {
    localStorage.setItem(key(consultationId, userId), JSON.stringify({ fields, savedAt: new Date().toISOString() }));
  } catch {
    // Storage full or blocked: typing goes on; only the safety copy is lost.
  }
}

export function clearSoapAutosave(consultationId: string | number, userId: string | null): void {
  try {
    localStorage.removeItem(key(consultationId, userId));
  } catch {
    // Nothing to do.
  }
}

/** The kept copy, if it was written after the server's last save and differs from it. */
export function newerThanServer(
  autosave: SoapAutosave | null,
  serverSavedAt: string | null | undefined,
  serverFields: Record<string, unknown>
): SoapAutosave | null {
  if (!autosave) return null;
  const kept = Date.parse(autosave.savedAt);
  const server = serverSavedAt ? Date.parse(serverSavedAt) : 0;
  if (!Number.isFinite(kept) || kept <= server) return null;
  return JSON.stringify(autosave.fields) === JSON.stringify(serverFields) ? null : autosave;
}
