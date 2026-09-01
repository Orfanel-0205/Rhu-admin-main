// src/components/TermsModal.tsx
//
// Reusable Terms & Conditions / Data Privacy / System Use modal. Opened from a
// link/button; the user must scroll and click "I have read and understand" to
// acknowledge — so the acceptance checkbox is only meaningful after the content
// was actually shown (not a dead label).

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ShieldCheck, X } from "lucide-react";

export default function TermsModal({
  open,
  onClose,
  onAcknowledge,
}: {
  open: boolean;
  onClose: () => void;
  onAcknowledge: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [viewedToEnd, setViewedToEnd] = useState(false);

  useEffect(() => {
    if (!open) {
      setViewedToEnd(false);
      return;
    }

    setViewedToEnd(false);
    window.setTimeout(() => {
      const element = bodyRef.current;
      if (!element) return;
      element.scrollTop = 0;
      if (element.scrollHeight <= element.clientHeight + 4) {
        setViewedToEnd(true);
      }
    }, 0);
  }, [open]);

  function handleScroll() {
    const element = bodyRef.current;
    if (!element) return;
    const reachedEnd =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 8;

    if (reachedEnd) {
      setViewedToEnd(true);
    }
  }

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={iconBadge}>
              <ShieldCheck size={20} />
            </div>
            <h2 style={title}>Terms, Data Privacy &amp; System Use</h2>
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div ref={bodyRef} onScroll={handleScroll} style={body}>
          <Section title="1. Terms and Conditions">
            <p style={p}>
              The Ka-Agapay Community Health Service Hub is an official system of the
              Rural Health Units (RHU 1 &amp; RHU 2) of the Municipality of Malasiqui,
              Pangasinan. By registering, you certify that the information you provide
              is true and correct, and that you are the person named on the uploaded
              Employee Identification Card.
            </p>
            <p style={p}>
              Staff accounts remain <strong>pending</strong> until reviewed and
              approved by the Super Admin, who assigns the final staff role during
              approval. Access may be suspended or revoked for misuse, sharing of
              credentials, or unauthorized disclosure of patient information.
            </p>
          </Section>

          <Section title="2. Data Privacy Notice">
            <p style={p}>
              In accordance with the Data Privacy Act of 2012 (RA 10173), the RHU
              collects and processes your personal information (name, mobile number,
              barangay, birth date, assigned role, and Employee ID image) solely to
              verify your identity, create your staff account, and administer RHU
              health services.
            </p>
            <p style={p}>
              Your information is stored securely, accessed only by authorized RHU
              personnel, and is never sold or shared for marketing. You may request
              correction of your information through the RHU. Uploaded ID images are
              retained for verification and audit purposes.
            </p>
          </Section>

          <Section title="3. System Use Policy">
            <p style={p}>
              You agree to use Ka-Agapay only for legitimate RHU health-service duties,
              to keep your password confidential, and to complete accurate clinical and
              administrative records. All actions are logged for accountability. Any
              deletion is an <strong>archive</strong> — records are retained and can be
              restored within the recycle-bin window; nothing is permanently destroyed
              automatically.
            </p>
          </Section>
        </div>

        <div style={footer}>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Close
          </button>
          <button
            type="button"
            disabled={!viewedToEnd}
            onClick={() => {
              if (!viewedToEnd) return;
              onAcknowledge();
              onClose();
            }}
            style={{
              ...primaryBtn,
              opacity: viewedToEnd ? 1 : 0.55,
              cursor: viewedToEnd ? "pointer" : "not-allowed",
            }}
          >
            {viewedToEnd ? "I have read and understand" : "Scroll to the end to continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 6 }}>
      <h3 style={sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  backdropFilter: "blur(3px)",
  display: "grid",
  placeItems: "center",
  padding: 20,
  zIndex: 90,
};

const modal: CSSProperties = {
  width: "min(680px, 100%)",
  maxHeight: "88vh",
  display: "flex",
  flexDirection: "column",
  background: "#FFFFFF",
  borderRadius: 20,
  boxShadow: "0 28px 70px rgba(2,6,23,0.4)",
  overflow: "hidden",
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "18px 20px",
  borderBottom: "1px solid #E2E8F0",
};

const iconBadge: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: "#ECFDF5",
  color: "#047857",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const title: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950, color: "#0F172A" };

const closeBtn: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  color: "#334155",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const body: CSSProperties = {
  padding: 20,
  overflowY: "auto",
  display: "grid",
  gap: 18,
  maxHeight: "min(420px, 54vh)",
};
const sectionTitle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 900, color: "#0F172A" };
const p: CSSProperties = { margin: 0, color: "#334155", fontSize: 13.5, lineHeight: 1.6, fontWeight: 600 };

const footer: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  padding: "16px 20px",
  borderTop: "1px solid #E2E8F0",
  flexWrap: "wrap",
};

const secondaryBtn: CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 12,
  padding: "10px 16px",
  fontWeight: 900,
  cursor: "pointer",
};

const primaryBtn: CSSProperties = {
  border: "none",
  background: "#047857",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "10px 18px",
  fontWeight: 900,
  cursor: "pointer",
};
