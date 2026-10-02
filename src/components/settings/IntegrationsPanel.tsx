// src/components/settings/IntegrationsPanel.tsx
//
// Settings > API keys: replace the key for an outside service without a server.
//
// Each card says where its key comes from right now -- saved here, or the
// server's own settings -- because "the chatbot works" and "the chatbot works
// on a key the developer set up" are different facts for whoever pays for
// these accounts.
//
// Save always tests first and stores nothing that fails, so a typo cannot
// take the assistant or the SMS reminders down. Secrets are never shown back:
// after saving, the field empties and the card shows only the last four
// characters.

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  RotateCcw,
  Save,
  XCircle,
} from "lucide-react";

import {
  getIntegrations,
  resetIntegration,
  saveIntegration,
  testIntegration,
} from "../../services/integrations";
import type {
  FieldSource,
  IntegrationId,
  IntegrationStatus,
  IntegrationTestResult,
  IntegrationValues,
} from "../../services/integrations";

/** Where to get each key, in the words of each provider's own console. */
const GUIDANCE: Record<IntegrationId, string> = {
  gemini:
    "Create a key in Google AI Studio (aistudio.google.com → Get API key). A key from a new Google project may not be offered older models; if the test says the model is unavailable, try gemini-3.5-flash. Turn on billing for that project before residents use the assistant: on the free tier Google may use what is sent to improve its products.",
  semaphore:
    "Copy the API key from semaphore.co → Account. The sender name is what residents see on every text and must be approved on that same account; the test checks it against your approved list.",
  ocr_space:
    "OCR.space emails the free API key when you register at ocr.space/ocrapi. It reads the ID photos uploaded at registration.",
  jaas:
    "From jaas.8x8.vc → API Keys. The App ID starts with vpaas-magic-cookie-. Upload the public key to 8x8 first, then paste the whole private key file here, including the BEGIN and END lines.",
};

/** Long values that are pasted rather than typed. */
const MULTILINE_FIELDS = new Set(["jaas.private_key"]);

const ORDER: IntegrationId[] = ["gemini", "semaphore", "ocr_space", "jaas"];

export default function IntegrationsPanel() {
  const [statuses, setStatuses] = useState<Partial<Record<IntegrationId, IntegrationStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      setStatuses(await getIntegrations());
    } catch {
      setLoadError("The API key settings could not be loaded. Only super admins can view them.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ ...noticeStyle, ...fullWidth }}>
        <Loader2 size={16} className="spin" /> Loading API key settings…
      </div>
    );
  }

  if (loadError) {
    return <div style={{ ...noticeStyle, ...fullWidth, color: "#B91C1C" }}>{loadError}</div>;
  }

  return (
    <div style={{ ...fullWidth, display: "grid", gap: 14 }}>
      <p style={introStyle}>
        Keys entered here replace the server's settings for that service and are stored encrypted.
        Each one is tested before it is saved; a key that fails the test is not stored. Blank fields
        keep their current value.
      </p>

      <div style={cardGridStyle}>
        {ORDER.filter((id) => statuses[id]).map((id) => (
          <IntegrationCard
            key={id}
            id={id}
            status={statuses[id] as IntegrationStatus}
            onStatuses={(next) => setStatuses(next)}
          />
        ))}
      </div>
    </div>
  );
}

function IntegrationCard({
  id,
  status,
  onStatuses,
}: {
  id: IntegrationId;
  status: IntegrationStatus;
  onStatuses: (next: Partial<Record<IntegrationId, IntegrationStatus>>) => void;
}) {
  const [values, setValues] = useState<IntegrationValues>({});
  const [busy, setBusy] = useState<"" | "test" | "save" | "reset">("");
  const [result, setResult] = useState<IntegrationTestResult | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const anyFilled = Object.values(values).some((v) => String(v ?? "").trim() !== "");

  async function run(kind: "test" | "save" | "reset") {
    setBusy(kind);
    setNotice(null);

    try {
      if (kind === "test") {
        setResult(await testIntegration(id, values));
        return;
      }

      if (kind === "save") {
        const outcome = await saveIntegration(id, values);
        setResult(outcome.result ?? null);
        setNotice({ ok: outcome.saved, text: outcome.message });

        if (outcome.saved) {
          // A pasted key does not linger in the page once it is stored.
          setValues({});
          if (outcome.integrations) onStatuses(outcome.integrations);
        }

        return;
      }

      const confirmed = window.confirm(
        `Stop using the values saved here for ${status.label}, and go back to the server's own settings?`
      );

      if (!confirmed) return;

      const outcome = await resetIntegration(id);
      setResult(null);
      setValues({});
      setNotice({ ok: true, text: outcome.message });
      if (outcome.integrations) onStatuses(outcome.integrations);
    } catch {
      setNotice({ ok: false, text: "The server could not be reached. Nothing was changed." });
    } finally {
      setBusy("");
    }
  }

  return (
    <article style={cardStyle}>
      <header style={cardHeaderStyle}>
        <h3 style={cardTitleStyle}>{status.label}</h3>

        <span style={status.customised ? badgeSavedStyle : badgeServerStyle}>
          {status.customised ? "Saved here" : "Server settings"}
        </span>
      </header>

      {status.updated_by && status.updated_at ? (
        <p style={metaStyle}>
          Last changed by {status.updated_by} on{" "}
          {new Date(status.updated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      ) : null}

      <p style={guidanceStyle}>{GUIDANCE[id]}</p>

      <div style={{ display: "grid", gap: 12 }}>
        {Object.entries(status.fields).map(([field, meta]) => {
          const inputId = `integration-${id}-${field}`;
          const multiline = MULTILINE_FIELDS.has(`${id}.${field}`);
          const value = values[field] ?? "";

          return (
            <div key={field} style={{ display: "grid", gap: 5, minWidth: 0 }}>
              <div style={fieldHeaderStyle}>
                <label htmlFor={inputId} style={fieldLabelStyle}>
                  {meta.label}
                </label>
                <SourceChip source={meta.source} />
              </div>

              <div style={currentStyle}>
                {meta.display ? (
                  <>
                    Current: <strong style={{ wordBreak: "break-all" }}>{meta.display}</strong>
                  </>
                ) : (
                  "Not set"
                )}
              </div>

              {multiline ? (
                <textarea
                  id={inputId}
                  value={value}
                  onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                  placeholder="Paste a new private key to replace the current one"
                  spellCheck={false}
                  autoComplete="off"
                  rows={4}
                  style={{ ...inputStyle, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12, resize: "vertical" }}
                />
              ) : (
                <input
                  id={inputId}
                  type={meta.secret ? "password" : "text"}
                  value={value}
                  onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                  placeholder={meta.secret ? "Paste a new key to replace it" : meta.display || "Not set"}
                  spellCheck={false}
                  // Stops browsers offering to save or autofill a service key
                  // as though it were the admin's own password.
                  autoComplete={meta.secret ? "new-password" : "off"}
                  style={inputStyle}
                />
              )}
            </div>
          );
        })}
      </div>

      {result ? <ResultBox result={result} /> : null}

      {notice ? (
        <div style={{ ...noticeStyle, color: notice.ok ? "#047857" : "#B91C1C" }}>{notice.text}</div>
      ) : null}

      <footer style={actionsStyle}>
        <button
          type="button"
          onClick={() => void run("test")}
          disabled={busy !== ""}
          style={secondaryButtonStyle}
          title={anyFilled ? "Test the values entered, without saving" : "Test the key currently in use"}
        >
          {busy === "test" ? <Loader2 size={15} className="spin" /> : <FlaskConical size={15} />}
          {anyFilled ? "Test" : "Test current"}
        </button>

        <button
          type="button"
          onClick={() => void run("save")}
          disabled={busy !== "" || !anyFilled}
          style={{ ...primaryButtonStyle, opacity: anyFilled ? 1 : 0.55 }}
          title="Tests first, and saves only if the test passes"
        >
          {busy === "save" ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
          Test & save
        </button>

        {status.customised ? (
          <button
            type="button"
            onClick={() => void run("reset")}
            disabled={busy !== ""}
            style={ghostButtonStyle}
            title="Remove the values saved here; the server's own settings apply again"
          >
            {busy === "reset" ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />}
            Use server default
          </button>
        ) : null}
      </footer>
    </article>
  );
}

function SourceChip({ source }: { source: FieldSource }) {
  const copy: Record<FieldSource, [string, CSSProperties]> = {
    saved: ["Saved here", chipSavedStyle],
    server: ["From server", chipServerStyle],
    none: ["Not set", chipNoneStyle],
    unreadable: ["Can't be read — save again", chipWarnStyle],
  };

  const [label, style] = copy[source];

  return <span style={{ ...chipBaseStyle, ...style }}>{label}</span>;
}

function ResultBox({ result }: { result: IntegrationTestResult }) {
  const details = result.details ?? {};

  return (
    <div style={{ ...resultStyle, ...(result.ok ? resultOkStyle : resultFailStyle) }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {result.ok ? <CheckCircle2 size={17} style={{ flex: "0 0 auto" }} /> : <XCircle size={17} style={{ flex: "0 0 auto" }} />}
        <span>{result.message}</span>
      </div>

      {result.warning ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "#92400E" }}>
          <AlertTriangle size={16} style={{ flex: "0 0 auto" }} />
          <span>{result.warning}</span>
        </div>
      ) : null}

      {typeof details.credit_balance === "number" ? (
        <div style={detailStyle}>SMS credit balance: <strong>{details.credit_balance}</strong></div>
      ) : null}

      {details.approved_sender_names && details.approved_sender_names.length > 0 ? (
        <div style={detailStyle}>
          Approved sender names: <strong>{details.approved_sender_names.join(", ")}</strong>
        </div>
      ) : null}

      {details.fingerprint ? (
        <div style={detailStyle}>
          Key fingerprint: <strong>{details.fingerprint}</strong>
        </div>
      ) : null}
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────

/** The section lays its children in three columns; this panel takes all of them. */
const fullWidth: CSSProperties = { gridColumn: "1 / -1" };

const introStyle: CSSProperties = { margin: 0, color: "#475569", fontSize: 13.5, lineHeight: 1.6 };

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
  gap: 14,
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  alignContent: "start",
  minWidth: 0,
  padding: 16,
  borderRadius: 16,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  flexWrap: "wrap",
};

const cardTitleStyle: CSSProperties = { margin: 0, fontSize: 15.5, fontWeight: 900, color: "#0F172A" };

const badgeBase: CSSProperties = {
  padding: "3px 10px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const badgeSavedStyle: CSSProperties = { ...badgeBase, background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" };
const badgeServerStyle: CSSProperties = { ...badgeBase, background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0" };

const metaStyle: CSSProperties = { margin: "-6px 0 0", fontSize: 12, color: "#64748B" };

const guidanceStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 12,
  background: "#F8FAFC",
  color: "#475569",
  fontSize: 12.5,
  lineHeight: 1.55,
};

const fieldHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" };
const fieldLabelStyle: CSSProperties = { fontSize: 13, fontWeight: 800, color: "#0F172A" };
const currentStyle: CSSProperties = { fontSize: 12.5, color: "#475569", minWidth: 0 };

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid #CBD5E1",
  fontSize: 13.5,
  color: "#0F172A",
  background: "#FFFFFF",
};

const chipBaseStyle: CSSProperties = { padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800 };
const chipSavedStyle: CSSProperties = { background: "#ECFDF5", color: "#047857" };
const chipServerStyle: CSSProperties = { background: "#F1F5F9", color: "#475569" };
const chipNoneStyle: CSSProperties = { background: "#FEF2F2", color: "#B91C1C" };
const chipWarnStyle: CSSProperties = { background: "#FFFBEB", color: "#92400E" };

const resultStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 12,
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 600,
};

const resultOkStyle: CSSProperties = { background: "#F0FDF4", color: "#166534", border: "1px solid #BBF7D0" };
const resultFailStyle: CSSProperties = { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" };
const detailStyle: CSSProperties = { fontSize: 12.5, color: "#334155", wordBreak: "break-word" };

const noticeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
};

const actionsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

const buttonBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 13px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const primaryButtonStyle: CSSProperties = { ...buttonBase, background: "#0F766E", color: "#FFFFFF", border: "1px solid #0F766E" };
const secondaryButtonStyle: CSSProperties = { ...buttonBase, background: "#FFFFFF", color: "#0F766E", border: "1px solid #99F6E4" };
const ghostButtonStyle: CSSProperties = { ...buttonBase, background: "transparent", color: "#64748B", border: "1px solid #E2E8F0" };
