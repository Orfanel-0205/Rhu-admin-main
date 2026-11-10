// src/components/PrescriberSignatureBox.tsx
//
// "Your signature", at the foot of the prescription and lab request form
// (Nov 2026).
//
// The signature is saved once, in My Profile, and printed by itself on what
// the prescriber issues afterwards. Staff looked for it on the prescription
// form, did not find it there, and concluded it did not exist. This box shows
// the signature that will print -- or that none is saved, with the pad to add
// one without leaving the form -- and says plainly when a dangerous-drug
// prescription will print unsigned.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PenLine, X } from "lucide-react";

import { SignatureCard } from "./SignatureCard";
import { getMySignature, type StaffSignature } from "../services/signature";

type Props = {
  isLabRequest: boolean;
  hasDangerousDrug: boolean;
};

export function PrescriberSignatureBox({ isLabRequest, hasDangerousDrug }: Props) {
  const [current, setCurrent] = useState<StaffSignature | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    getMySignature()
      .then(setCurrent)
      .catch(() => setCurrent(null))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const documentName = isLabRequest ? "lab request" : "prescription";

  return (
    <div style={styles.box}>
      <div style={styles.head}>
        <strong style={styles.title}>
          <PenLine size={16} />
          Your signature
        </strong>
        <button type="button" onClick={() => setEditing(true)} style={styles.button}>
          {current?.image ? "Change" : "Draw or upload signature"}
        </button>
      </div>

      {!loaded ? (
        <p style={styles.note}>Checking your signature…</p>
      ) : current?.image ? (
        <div style={styles.row}>
          <img src={current.image} alt="Your saved signature" style={styles.image} />
          <p style={hasDangerousDrug ? styles.warn : styles.note}>
            {hasDangerousDrug
              ? "Not printed on this one: it has a dangerous drug (S2), which needs the DDB yellow form signed by hand."
              : `Printed on this ${documentName} when you save it.`}
          </p>
        </div>
      ) : (
        <p style={styles.note}>
          No signature saved yet: this {documentName} will print with a blank signature line. Add one now, then save.
        </p>
      )}

      {editing
        ? createPortal(
            <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="My Signature">
              <div style={styles.panel}>
                <button type="button" onClick={() => setEditing(false)} style={styles.close} aria-label="Close">
                  <X size={18} />
                </button>
                <SignatureCard onChange={(signature) => setCurrent(signature)} />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    border: "1px solid #A7F3D0",
    background: "#F0FDF4",
    borderRadius: 14,
    padding: 14,
    display: "grid",
    gap: 8,
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" },
  title: { display: "inline-flex", alignItems: "center", gap: 8, color: "#065F46", fontWeight: 900 },
  button: {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #047857",
    background: "#FFFFFF",
    color: "#047857",
    fontWeight: 800,
    cursor: "pointer",
  },
  row: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  image: { height: 48, maxWidth: 240, background: "#FFFFFF", borderRadius: 8, padding: 4, border: "1px solid #E2E8F0" },
  note: { margin: 0, color: "#334155", fontWeight: 600, fontSize: 13, lineHeight: 1.5 },
  warn: { margin: 0, color: "#B45309", fontWeight: 700, fontSize: 13, lineHeight: 1.5 },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 3000,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    overflowY: "auto",
  },
  panel: { position: "relative", width: "min(860px, 100%)", maxHeight: "92vh", overflowY: "auto" },
  close: {
    position: "absolute",
    top: 30,
    right: 14,
    zIndex: 1,
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
};
