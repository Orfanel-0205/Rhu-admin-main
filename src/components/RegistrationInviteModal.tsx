// src/components/RegistrationInviteModal.tsx
//
// Sir Ayco — Super Admin generates signed, unique, ONE-TIME staff registration
// links here. The full signed URL (with its HMAC signature) is shown exactly
// once after generation — this modal is also the screenshot-able evidence that
// the mechanism is real: token, SHA-256 hash, signature, and expiry all visible.

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Link2,
  Loader2,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import {
  registrationInviteService,
  type GeneratedInvite,
  type InviteListRow,
} from "../services/registrationInvites";
import { useToast } from "../contexts/ToastContext";

const LIFETIMES = [
  { minutes: 30, label: "30 minutes (register on the spot)" },
  { minutes: 1440, label: "1 day" },
  { minutes: 10080, label: "7 days (recommended for busy staff)" },
];

export default function RegistrationInviteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();

  const [intendedFor, setIntendedFor] = useState("");
  const [mobile, setMobile] = useState("");
  const [minutes, setMinutes] = useState(10080);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const [invites, setInvites] = useState<InviteListRow[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const loadInvites = useCallback(async () => {
    setListLoading(true);
    try {
      setInvites(await registrationInviteService.list());
    } catch {
      // List is informational; generation still works without it.
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setResult(null);
      setCopied(false);
      void loadInvites();
    }
  }, [open, loadInvites]);

  if (!open) return null;

  async function generate() {
    setGenerating(true);
    try {
      const response = await registrationInviteService.generate({
        intended_for: intendedFor.trim() || undefined,
        mobile_number: mobile.trim() || undefined,
        expires_in_minutes: minutes,
      });

      setResult(response.data);
      setCopied(false);
      toast.success("Registration link generated — copy it now.");
      void loadInvites();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Could not generate the registration link."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success("Link copied.");
    } catch {
      toast.error("Copy failed — select the link text and copy manually.");
    }
  }

  async function revoke(id: number) {
    if (!window.confirm("Revoke this registration link? It will stop working immediately.")) {
      return;
    }

    try {
      await registrationInviteService.revoke(id);
      toast.success("Link revoked.");
      void loadInvites();
    } catch {
      // Global toast interceptor already reported the failure.
    }
  }

  const signatureFromUrl = result
    ? new URLSearchParams(result.url.split("?")[1] ?? "").get("signature") ?? ""
    : "";

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={headerIconStyle}>
              <Link2 size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>
                Staff Registration Links
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: "#64748B", fontWeight: 600 }}>
                Signed · unique · expiring · one-time use
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Generation form */}
        <div style={sectionStyle}>
          <div style={twoColsStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>For whom (shown in the list)</span>
              <input
                value={intendedFor}
                onChange={(e) => setIntendedFor(e.target.value)}
                placeholder="e.g. Maria Santos — new midwife"
                style={inputStyle}
                maxLength={150}
              />
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>Lock to mobile (optional)</span>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="09XXXXXXXXX"
                inputMode="numeric"
                style={inputStyle}
              />
            </label>
          </div>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Link lifetime</span>
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              style={inputStyle}
            >
              {LIFETIMES.map((l) => (
                <option key={l.minutes} value={l.minutes}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={generate}
            disabled={generating}
            style={{ ...primaryButtonStyle, opacity: generating ? 0.6 : 1 }}
          >
            {generating ? <Loader2 size={17} className="ka-invite-spin" /> : <ShieldCheck size={17} />}
            {generating ? "Generating…" : "Generate signed link"}
          </button>
        </div>

        {/* One-time result — the screenshot-able evidence */}
        {result ? (
          <div style={resultBoxStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, color: "#047857" }}>
              <CheckCircle2 size={17} />
              Link ready — copy it now. For security it will not be shown again.
            </div>

            <div style={linkRowStyle}>
              <code style={linkCodeStyle}>{result.url}</code>
              <button type="button" onClick={copyLink} style={copyButtonStyle}>
                {copied ? <ClipboardCheck size={16} /> : <Clipboard size={16} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <dl style={evidenceGridStyle}>
              <dt style={dtStyle}>Expires</dt>
              <dd style={ddStyle}>
                {result.expires_at ? new Date(result.expires_at).toLocaleString() : "—"}
              </dd>
              <dt style={dtStyle}>HMAC signature</dt>
              <dd style={ddStyle}>{signatureFromUrl || "—"}</dd>
              <dt style={dtStyle}>Token SHA-256 (stored)</dt>
              <dd style={ddStyle}>{result.token_hash}</dd>
            </dl>
          </div>
        ) : null}

        {/* Recent invites */}
        <div style={{ ...sectionStyle, paddingTop: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: "#334155", marginBottom: 8 }}>
            Recent links {listLoading ? "…" : ""}
          </div>

          {invites.length === 0 && !listLoading ? (
            <p style={{ margin: 0, fontSize: 13, color: "#94A3B8", fontWeight: 600 }}>
              No registration links generated yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>For</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Expires</th>
                    <th style={thStyle}>Used by</th>
                    <th style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id}>
                      <td style={tdStyle}>
                        {invite.intended_for || <span style={{ color: "#94A3B8" }}>—</span>}
                        {invite.mobile_number ? (
                          <div style={{ fontSize: 11.5, color: "#64748B" }}>{invite.mobile_number}</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ ...statusChipStyle, ...statusColors[invite.status] }}>
                          {invite.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {invite.expires_at ? new Date(invite.expires_at).toLocaleString() : "—"}
                      </td>
                      <td style={tdStyle}>{invite.used_by || "—"}</td>
                      <td style={tdStyle}>
                        {invite.status === "active" ? (
                          <button type="button" onClick={() => revoke(invite.id)} style={revokeButtonStyle}>
                            <XCircle size={14} />
                            Revoke
                          </button>
                        ) : (
                          <span style={{ color: "#CBD5E1" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <style>{`.ka-invite-spin { animation: ka-invite-spin 1s linear infinite; } @keyframes ka-invite-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

const statusColors: Record<string, CSSProperties> = {
  active: { background: "#ECFDF5", color: "#047857" },
  used: { background: "#EFF6FF", color: "#1D4ED8" },
  expired: { background: "#F1F5F9", color: "#64748B" },
  revoked: { background: "#FEF2F2", color: "#B91C1C" },
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  display: "grid",
  placeItems: "center",
  padding: 20,
  zIndex: 90,
};

const modalStyle: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#FFFFFF",
  borderRadius: 22,
  border: "1px solid #E2E8F0",
  boxShadow: "0 30px 80px rgba(15,23,42,0.25)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "18px 22px",
  borderBottom: "1px solid #E2E8F0",
  position: "sticky",
  top: 0,
  background: "#FFFFFF",
  zIndex: 1,
};

const headerIconStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  background: "#ECFDF5",
  color: "#047857",
  display: "grid",
  placeItems: "center",
};

const closeButtonStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  color: "#475569",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const sectionStyle: CSSProperties = {
  padding: 22,
  display: "grid",
  gap: 14,
};

const twoColsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
};

const labelStyle: CSSProperties = { display: "grid", gap: 6 };

const labelTextStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#334155",
};

const inputStyle: CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  padding: "0 12px",
  fontSize: 14,
  fontWeight: 700,
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
};

const primaryButtonStyle: CSSProperties = {
  height: 46,
  borderRadius: 14,
  border: "none",
  background: "#047857",
  color: "#FFFFFF",
  fontSize: 14.5,
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
};

const resultBoxStyle: CSSProperties = {
  margin: "0 22px 8px",
  padding: 16,
  borderRadius: 16,
  border: "1px solid #A7F3D0",
  background: "#ECFDF5",
  display: "grid",
  gap: 12,
};

const linkRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const linkCodeStyle: CSSProperties = {
  flex: 1,
  fontSize: 12,
  fontWeight: 700,
  background: "#FFFFFF",
  border: "1px solid #D1FAE5",
  borderRadius: 10,
  padding: "10px 12px",
  wordBreak: "break-all",
  whiteSpace: "normal",
  color: "#065F46",
};

const copyButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 40,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid #A7F3D0",
  background: "#FFFFFF",
  color: "#047857",
  fontWeight: 900,
  fontSize: 13,
  cursor: "pointer",
  flexShrink: 0,
};

const evidenceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  gap: "6px 14px",
  margin: 0,
  fontSize: 12.5,
};

const dtStyle: CSSProperties = { fontWeight: 900, color: "#065F46" };

const ddStyle: CSSProperties = {
  margin: 0,
  color: "#334155",
  fontWeight: 600,
  wordBreak: "break-all",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #E2E8F0",
  color: "#64748B",
  fontWeight: 900,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  fontWeight: 600,
  verticalAlign: "top",
};

const statusChipStyle: CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "capitalize",
};

const revokeButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  borderRadius: 10,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
};
