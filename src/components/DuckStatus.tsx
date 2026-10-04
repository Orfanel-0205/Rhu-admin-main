// src/components/DuckStatus.tsx
//
// Doctor Quack for the three moments a plain toast explains badly:
//
//   403  "You can't do this" -- e.g. a nurse pressing Create E-Prescription,
//        which only a Doctor, MHO or Super Admin may do. The server's own
//        reason is shown, because it names who CAN.
//   5xx  "Our side broke" -- so staff know it is not something they did.
//   503  "Under maintenance" -- the whole system is updating; the screen
//        checks every 30 seconds and comes back by itself.
//
// apiClient.ts decides when (lib/duckBus.ts); this file only draws.

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";

import apiClient from "../lib/apiClient";
import { DuckKind, onDuck } from "../lib/duckBus";

const IMAGES: Record<DuckKind, string> = {
  forbidden: "/ducks/duck-403.webp",
  server_error: "/ducks/duck-500.webp",
  maintenance: "/ducks/duck-maintenance.webp",
};

const TITLES: Record<DuckKind, string> = {
  forbidden: "You don't have access to this",
  server_error: "Something went wrong on our side",
  maintenance: "Ka-Agapay is under maintenance",
};

const DEFAULT_MESSAGES: Record<DuckKind, string> = {
  forbidden: "Your role can't do this. Ask the Super Admin if your work needs it.",
  server_error:
    "The server couldn't finish that request. Please try again in a moment. If it keeps happening, tell the Super Admin what you were doing.",
  maintenance:
    "We're updating the system. This page will come back by itself as soon as it's done -- you don't need to do anything.",
};

/** How often the maintenance screen asks whether the server is back. */
const MAINTENANCE_POLL_MS = 30_000;

export function DuckPanel({
  kind,
  title,
  message,
  children,
  compact = false,
}: {
  kind: DuckKind;
  title?: string;
  message?: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={panelStyle}>
      <img
        src={IMAGES[kind]}
        alt=""
        aria-hidden="true"
        width={compact ? 180 : 240}
        height={compact ? 180 : 240}
        style={{ ...imageStyle, width: compact ? 180 : 240, height: compact ? 180 : 240 }}
      />
      <h2 style={titleStyle}>{title ?? TITLES[kind]}</h2>
      <p style={messageStyle}>{message || DEFAULT_MESSAGES[kind]}</p>
      {children ? <div style={actionsStyle}>{children}</div> : null}
    </div>
  );
}

/** A refused or failed action: one popup at a time, closed with OK or Esc. */
export function DuckDialogHost() {
  const [event, setEvent] = useState<{ kind: DuckKind; message?: string } | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      onDuck((next) => {
        if (next.kind === "maintenance") return;
        setEvent({ kind: next.kind, message: next.message });
      }),
    []
  );

  useEffect(() => {
    if (!event) return;

    okRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEvent(null);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event]);

  if (!event) return null;

  return (
    <div style={backdropStyle} onClick={() => setEvent(null)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={TITLES[event.kind]}
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <DuckPanel kind={event.kind} message={event.message} compact>
          <button ref={okRef} type="button" style={primaryButtonStyle} onClick={() => setEvent(null)}>
            OK
          </button>
        </DuckPanel>
      </div>
    </div>
  );
}

/**
 * Full screen while the server is in maintenance mode (HTTP 503), until
 * /health answers again; then the page reloads so nothing is half-loaded.
 */
export function MaintenanceScreen() {
  const [down, setDown] = useState(false);

  useEffect(() => onDuck((next) => next.kind === "maintenance" && setDown(true)), []);

  useEffect(() => {
    if (!down) return;

    const base = String(apiClient.defaults.baseURL ?? "").replace(/\/+$/, "");

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${base}/health`, { cache: "no-store" });

        if (response.status !== 503) {
          window.location.reload();
        }
      } catch {
        // Offline or still restarting: keep waiting.
      }
    }, MAINTENANCE_POLL_MS);

    return () => window.clearInterval(timer);
  }, [down]);

  if (!down) return null;

  return (
    <div style={maintenanceStyle} role="alert" aria-live="assertive">
      <DuckPanel kind="maintenance">
        <button type="button" style={primaryButtonStyle} onClick={() => window.location.reload()}>
          Check again now
        </button>
      </DuckPanel>
    </div>
  );
}

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 10,
  maxWidth: 460,
  margin: "0 auto",
};

const imageStyle: CSSProperties = {
  objectFit: "contain",
  maxWidth: "70vw",
  height: "auto",
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 22,
  fontWeight: 900,
  color: "#0f172a",
  letterSpacing: "-0.02em",
};

const messageStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.6,
  color: "#475569",
  fontWeight: 600,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "center",
  marginTop: 8,
};

const primaryButtonStyle: CSSProperties = {
  minWidth: 140,
  height: 46,
  padding: "0 22px",
  border: "none",
  borderRadius: 14,
  background: "#047857",
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2000,
  background: "rgba(15, 23, 42, 0.45)",
  display: "grid",
  placeItems: "center",
  padding: 16,
};

const dialogStyle: CSSProperties = {
  width: "100%",
  maxWidth: 480,
  background: "#ffffff",
  borderRadius: 24,
  padding: "24px 22px 26px",
  boxShadow: "0 30px 80px rgba(15, 23, 42, 0.3)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
};

const maintenanceStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 3000,
  background: "#f8fafc",
  display: "grid",
  placeItems: "center",
  padding: 16,
  overflowY: "auto",
};
