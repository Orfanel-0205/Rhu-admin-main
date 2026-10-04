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
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Smartphone,
  XCircle,
  ArrowRight as ArrowRightIcon,
} from "lucide-react";

import {
  confirmReveal,
  getIntegrations,
  resendRevealCode,
  resetIntegration,
  revealIntegrationField,
  saveIntegration,
  testIntegration,
} from "../../services/integrations";
import type {
  FieldSource,
  IntegrationId,
  IntegrationStatus,
  IntegrationTestResult,
  IntegrationValues,
  RevealOutcome,
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
  email:
    "Sends password reset codes by email, alongside the text message. Use a Gmail account the RHU owns. Turn on 2-Step Verification for it, then create an app password at myaccount.google.com → Security → App passwords and paste the 16 letters here. The test signs in to Gmail without sending anything. Until this is set, reset codes go by SMS only.",
};

/** Long values that are pasted rather than typed. */
const MULTILINE_FIELDS = new Set(["jaas.private_key"]);

const ORDER: IntegrationId[] = ["gemini", "semaphore", "ocr_space", "jaas", "email"];

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

  /*
   * A key shown in full: which field, its value, and when it hides again.
   *
   * Held in this component's state and nowhere else -- not storage, not the
   * URL, not a parent -- so it is gone when the timer runs out, the tab is
   * hidden, the card re-renders without it, or the page is left.
   */
  const [revealed, setRevealed] = useState<{ field: string; value: string; hidesAt: number } | null>(null);
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!revealed) return;

    const tick = () => {
      const left = Math.ceil((revealed.hidesAt - Date.now()) / 1000);

      if (left <= 0) {
        setRevealed(null);
      } else {
        setSecondsLeft(left);
      }
    };

    // Walking away from the screen hides the key at once, rather than
    // leaving it up for whoever looks at the monitor next.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setRevealed(null);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [revealed]);

  /** Shows a released key; returns the outcome so the dialog can explain a refusal. */
  function show(field: string, outcome: RevealOutcome) {
    if (outcome.ok && outcome.value) {
      setRevealed({
        field,
        value: outcome.value,
        hidesAt: Date.now() + (outcome.visibleSeconds ?? 30) * 1000,
      });
      setAskingFor(null);
    }

    return outcome;
  }

  /** Step two: the code from the phone. */
  async function confirm(field: string, challenge: string, code: string) {
    return show(field, await confirmReveal(id, challenge, code));
  }

  /** Step one: the password. A right password answers with a code step. */
  async function reveal(field: string, password: string) {
    const outcome = await revealIntegrationField(id, field, password);

    if (outcome.ok && outcome.value) {
      setRevealed({
        field,
        value: outcome.value,
        hidesAt: Date.now() + (outcome.visibleSeconds ?? 30) * 1000,
      });
      setAskingFor(null);
    }

    return outcome;
  }

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

              <div style={currentRowStyle}>
                <span style={currentStyle}>
                  {meta.display ? (
                    <>
                      Current: <strong style={{ wordBreak: "break-all" }}>{meta.display}</strong>
                    </>
                  ) : (
                    "Not set"
                  )}
                </span>

                {meta.revealable ? (
                  revealed?.field === field ? (
                    <button type="button" onClick={() => setRevealed(null)} style={viewButtonStyle}>
                      <EyeOff size={14} /> Hide
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAskingFor(field)}
                      style={viewButtonStyle}
                      title="Show this key in full. Requires your password."
                    >
                      <Eye size={14} /> View
                    </button>
                  )
                ) : null}
              </div>

              {revealed?.field === field ? (
                <RevealedValue
                  value={revealed.value}
                  secondsLeft={secondsLeft}
                  onHide={() => setRevealed(null)}
                />
              ) : null}

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

      {askingFor ? (
        <PasswordPrompt
          title={`View ${status.label} — ${status.fields[askingFor]?.label ?? askingFor}`}
          onSubmit={(password) => reveal(askingFor, password)}
          onCode={(challenge, code) => confirm(askingFor, challenge, code)}
          onResend={(challenge) => resendRevealCode(id, challenge)}
          onCancel={() => setAskingFor(null)}
        />
      ) : null}
    </article>
  );
}

/**
 * A revealed key, with a countdown and a copy button.
 *
 * Copying is offered because retyping a 39-character key is how typos get
 * into the provider's console. The clipboard is the user's to manage; the
 * note says so rather than pretending the page can clear it.
 */
function RevealedValue({
  value,
  secondsLeft,
  onHide,
}: {
  value: string;
  secondsLeft: number;
  onHide: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={revealBoxStyle} role="status" aria-live="polite">
      <code style={revealValueStyle}>{value}</code>

      <div style={revealFooterStyle}>
        <span style={{ color: "#92400E", fontWeight: 700 }}>
          Hides in {secondsLeft}s{copied ? " · Copied. Paste it where it belongs, then copy something else over it." : ""}
        </span>

        <span style={{ display: "inline-flex", gap: 6 }}>
          <button type="button" onClick={() => void copy()} style={viewButtonStyle}>
            <Copy size={14} /> {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={onHide} style={viewButtonStyle}>
            <EyeOff size={14} /> Hide
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * Two steps before a key is shown: the super admin's own password, then the
 * code texted to their own phone.
 *
 * The password stops a stolen session. The code stops the one thing the
 * password cannot: someone at an unlocked computer whose browser has saved
 * and filled in that password. They have the computer; they do not have the
 * phone.
 *
 * Both inputs are cleared after every attempt, right or wrong, and neither is
 * kept anywhere but this dialog's state.
 */
function PasswordPrompt({
  title,
  onSubmit,
  onCode,
  onResend,
  onCancel,
}: {
  title: string;
  onSubmit: (password: string) => Promise<RevealOutcome>;
  onCode: (challenge: string, code: string) => Promise<RevealOutcome>;
  onResend: (challenge: string) => Promise<RevealOutcome>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"password" | "code">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [maskedMobile, setMaskedMobile] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;

    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, resendIn]);

  /** A refusal that ends the code step sends the dialog back to the start. */
  function backToPassword(message: string) {
    setStep("password");
    setChallenge("");
    setCode("");
    setInfo("");
    setError(message);
  }

  async function submitPassword() {
    if (!password || busy || locked) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const outcome = await onSubmit(password);

      if (outcome.codeRequired && outcome.challenge) {
        setChallenge(outcome.challenge);
        setMaskedMobile(outcome.maskedMobile ?? "");
        setResendIn(outcome.resendAfter ?? 60);
        setStep("code");
      } else if (!outcome.ok) {
        setError(outcome.message ?? "The key could not be shown.");
        setLocked(Boolean(outcome.locked));
      }
    } catch {
      setError("The server could not be reached. Nothing was shown.");
    } finally {
      // Never left sitting in the form, whatever the answer was.
      setPassword("");
      setBusy(false);
    }
  }

  async function submitCode() {
    if (code.length !== 6 || busy) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const outcome = await onCode(challenge, code);

      if (!outcome.ok) {
        if (outcome.restart) backToPassword(outcome.message ?? "That code has expired. Start again.");
        else setError(outcome.message ?? "Incorrect code.");
      }
    } catch {
      setError("The server could not be reached. Nothing was shown.");
    } finally {
      setCode("");
      setBusy(false);
    }
  }

  async function resend() {
    if (resendIn > 0 || busy) return;

    setError("");
    setInfo("");

    try {
      const outcome = await onResend(challenge);

      if (outcome.restart) {
        backToPassword(outcome.message ?? "Start again to get a new code.");
      } else if (outcome.resendAfter) {
        setInfo(outcome.message ?? "A new code was sent.");
        setResendIn(outcome.resendAfter);
      } else {
        setError(outcome.message ?? "A new code could not be sent.");
      }
    } catch {
      setError("The server could not be reached.");
    }
  }

  return (
    <div style={overlayStyle} onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="reveal-title" style={dialogStyle}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={dialogIconStyle}>
            {step === "password" ? <Lock size={18} /> : <Smartphone size={18} />}
          </span>
          <h3 id="reveal-title" style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#0F172A" }}>
            {title}
          </h3>
        </div>

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#475569" }}>
          {step === "password" ? (
            <>
              Step 1 of 2: enter your own password. Next we text a code to your phone. The key is
              shown for 30 seconds and hides when you leave this tab. Every view, and every wrong
              attempt, is recorded in the audit log.
            </>
          ) : (
            <>
              Step 2 of 2: enter the 6-digit code we sent to your mobile number ending in{" "}
              <b>{maskedMobile || "—"}</b>. It expires in 5 minutes.
            </>
          )}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (step === "password" ? submitPassword() : submitCode());
          }}
          style={{ display: "grid", gap: 10 }}
        >
          {step === "password" ? (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="Your password"
              aria-label="Your password"
              disabled={locked}
              style={inputStyle}
            />
          ) : (
            <input
              key="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              aria-label="6-digit code from your phone"
              style={{ ...inputStyle, letterSpacing: "0.3em", fontWeight: 800 }}
            />
          )}

          {info ? (
            <div style={{ display: "flex", gap: 8, color: "#166534", fontSize: 13, fontWeight: 700 }}>
              <CheckCircle2 size={16} style={{ flex: "0 0 auto" }} />
              <span>{info}</span>
            </div>
          ) : null}

          {error ? (
            <div style={{ display: "flex", gap: 8, color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
              <XCircle size={16} style={{ flex: "0 0 auto" }} />
              <span>{error}</span>
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {step === "code" ? (
              <button
                type="button"
                onClick={() => void resend()}
                disabled={resendIn > 0 || busy}
                style={{ ...ghostButtonStyle, opacity: resendIn > 0 ? 0.6 : 1 }}
              >
                <RotateCcw size={14} />
                {resendIn > 0 ? `New code in ${resendIn}s` : "Send a new code"}
              </button>
            ) : (
              <span />
            )}

            <span style={{ display: "inline-flex", gap: 8 }}>
              <button type="button" onClick={onCancel} disabled={busy} style={ghostButtonStyle}>
                Cancel
              </button>
              {step === "password" ? (
                <button
                  type="submit"
                  disabled={!password || busy || locked}
                  style={{ ...primaryButtonStyle, opacity: !password || busy || locked ? 0.55 : 1 }}
                >
                  {busy ? <Loader2 size={15} className="spin" /> : <ArrowRightIcon size={15} />}
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={code.length !== 6 || busy}
                  style={{ ...primaryButtonStyle, opacity: code.length !== 6 || busy ? 0.55 : 1 }}
                >
                  {busy ? <Loader2 size={15} className="spin" /> : <Eye size={15} />}
                  View key
                </button>
              )}
            </span>
          </div>
        </form>
      </div>
    </div>
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

const currentRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  minWidth: 0,
};

const viewButtonStyle: CSSProperties = {
  ...buttonBase,
  padding: "4px 9px",
  fontSize: 12,
  background: "#FFFFFF",
  color: "#0F766E",
  border: "1px solid #CCFBF1",
};

/* Amber, not green: a visible key is a state to end, not a success. */
const revealBoxStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 12,
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  minWidth: 0,
};

const revealValueStyle: CSSProperties = {
  display: "block",
  fontFamily: "ui-monospace, Consolas, monospace",
  fontSize: 13,
  color: "#0F172A",
  wordBreak: "break-all",
  userSelect: "all",
};

const revealFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  fontSize: 12,
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 5000,
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "rgba(15, 23, 42, 0.55)",
};

const dialogStyle: CSSProperties = {
  width: "min(100%, 440px)",
  display: "grid",
  gap: 14,
  padding: 20,
  borderRadius: 18,
  background: "#FFFFFF",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.3)",
};

const dialogIconStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  borderRadius: 10,
  background: "#F0FDFA",
  color: "#0F766E",
  flex: "0 0 auto",
};
