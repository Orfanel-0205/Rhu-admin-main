// src/components/OfflineBanner.tsx
//
// The offline outbox, as staff see it (lib/offlineOutbox): a strip at the top
// of every page that says the connection is down and what is waiting to be
// sent, and lists anything the server refused once it was sent, with the
// reason, so it can be re-entered or let go. Nothing shows while all is well.

import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CloudOff, Copy, RefreshCw, Trash2, UploadCloud } from "lucide-react";

import {
  discardOutboxItem,
  flushOutbox,
  getOutboxSnapshot,
  retryOutboxItem,
  startOutbox,
  subscribeOutbox,
  type OutboxItem,
} from "../lib/offlineOutbox";
import { emitToast } from "../lib/toastBus";

export function OfflineBanner() {
  useEffect(() => startOutbox(), []);

  const { online, items } = useSyncExternalStore(subscribeOutbox, getOutboxSnapshot, getOutboxSnapshot);
  const [sending, setSending] = useState(false);
  const [showRefused, setShowRefused] = useState(false);

  const waiting = items.filter((item) => item.status === "waiting");
  const refused = items.filter((item) => item.status === "refused");

  if (online && waiting.length === 0 && refused.length === 0) return null;

  async function sendNow() {
    setSending(true);
    try {
      await flushOutbox();
    } finally {
      setSending(false);
    }
  }

  async function copy(item: OutboxItem) {
    try {
      await navigator.clipboard.writeText(`${item.label}\n${JSON.stringify(item.data, null, 2)}`);
      emitToast("Details copied. Paste them where you re-enter the record.", "success");
    } catch {
      emitToast("Could not copy. Open the details and re-enter them by hand.", "error");
    }
  }

  function discard(item: OutboxItem) {
    if (window.confirm(`Discard "${item.label}"? It was not saved in the system and will be removed from this computer.`)) {
      discardOutboxItem(item.id);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 16 }} role="status" aria-live="polite">
      {!online ? (
        <div style={{ ...bar, background: "#FFFBEB", borderColor: "#FCD34D", color: "#92400E" }}>
          <CloudOff size={18} />
          <span style={{ flex: 1 }}>
            You are offline. What you save is kept on this computer and sent when the connection returns.
            {waiting.length ? ` Waiting: ${waiting.length}.` : ""}
          </span>
        </div>
      ) : waiting.length ? (
        <div style={{ ...bar, background: "#EFF6FF", borderColor: "#93C5FD", color: "#1E3A8A" }}>
          <UploadCloud size={18} />
          <span style={{ flex: 1 }}>
            {waiting.length === 1 ? "1 item saved offline is" : `${waiting.length} items saved offline are`} waiting to
            be sent.
          </span>
          <button type="button" onClick={sendNow} disabled={sending} style={smallButton}>
            <RefreshCw size={14} />
            {sending ? "Sending…" : "Send now"}
          </button>
        </div>
      ) : null}

      {refused.length ? (
        <div style={{ ...bar, background: "#FEF2F2", borderColor: "#FCA5A5", color: "#991B1B", flexWrap: "wrap" }}>
          <AlertTriangle size={18} />
          <span style={{ flex: 1 }}>
            {refused.length === 1 ? "1 item saved offline was" : `${refused.length} items saved offline were`} not
            accepted when sent.
          </span>
          <button type="button" onClick={() => setShowRefused((v) => !v)} style={smallButton}>
            {showRefused ? "Hide" : "See why"}
          </button>
          {showRefused ? (
            <ul style={{ width: "100%", margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {refused.map((item) => (
                <li key={item.id} style={refusedRow}>
                  <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <strong style={{ color: "#0F172A" }}>{item.label}</strong>
                    <span style={{ color: "#B91C1C" }}>{item.error || "The server did not accept it."}</span>
                    <span style={{ color: "#64748B", fontSize: 12 }}>
                      Saved {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => retryOutboxItem(item.id)} style={smallButton}>
                      <RefreshCw size={14} />
                      Try again
                    </button>
                    <button type="button" onClick={() => copy(item)} style={smallButton}>
                      <Copy size={14} />
                      Copy details
                    </button>
                    <button type="button" onClick={() => discard(item)} style={{ ...smallButton, color: "#B91C1C" }}>
                      <Trash2 size={14} />
                      Discard
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const bar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 14,
  border: "1px solid",
  fontWeight: 800,
  fontSize: 14,
};

const smallButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const refusedRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  padding: 10,
  borderRadius: 12,
  background: "#FFFFFF",
  border: "1px solid #FECACA",
  fontWeight: 700,
};
