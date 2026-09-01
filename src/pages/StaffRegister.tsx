// src/pages/StaffRegister.tsx

import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
} from "lucide-react";

import { authService } from "../services/auth";
import {
  registrationInviteService,
  type InviteValidationResult,
} from "../services/registrationInvites";
import PasswordStrengthMeter from "../components/ui/PasswordStrengthMeter";
import TermsModal from "../components/TermsModal";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — matches backend config/ocr_validation
const MOBILE_PATTERN = /^09\d{9}$/;

/**
 * Sir Ayco — /register is INVITATION-ONLY. The page only renders the form
 * after the signed one-time link in the URL (?token=…&expires=…&signature=…)
 * is verified by the backend. Bare /register (no or bad link) shows an
 * explicit invalid-access screen with the exact failure reason. This frontend
 * check is advisory UX — the authoritative re-check runs server-side on
 * POST /admin/register.
 */
export default function StaffRegister() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token") ?? "";
  const inviteExpires = searchParams.get("expires") ?? "";
  const inviteSignature = searchParams.get("signature") ?? "";

  const [gate, setGate] = useState<InviteValidationResult | null>(null);
  const [gateChecking, setGateChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    registrationInviteService
      .validateInvite({
        token: inviteToken,
        expires: inviteExpires,
        signature: inviteSignature,
      })
      .then((result) => {
        if (!cancelled) setGate(result);
      })
      .finally(() => {
        if (!cancelled) setGateChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken, inviteExpires, inviteSignature]);

  if (gateChecking) {
    return (
      <GateShell
        icon={<Loader2 size={30} className="ka-spin" />}
        title="Checking your registration link…"
        body="Please wait while we verify your invitation."
      />
    );
  }

  if (!gate?.valid) {
    return <InvalidInviteScreen result={gate} />;
  }

  return (
    <StaffRegisterForm
      inviteToken={inviteToken}
      inviteExpires={inviteExpires}
      inviteSignature={inviteSignature}
      intendedFor={gate.data?.intended_for ?? null}
      lockedMobile={gate.data?.mobile_number ?? null}
    />
  );
}

/** Distinct, honest invalid-access screens per failure mode (Sir Ayco #7). */
function InvalidInviteScreen({ result }: { result: InviteValidationResult | null }) {
  const code = result?.code ?? "missing_invite";

  const titles: Record<string, string> = {
    missing_invite: "This page needs an invitation link",
    invalid_signature: "This link is invalid or was modified",
    expired: "This link has expired",
    not_found: "This link is not recognized",
    revoked: "This link was cancelled",
    already_used: "This link was already used",
    network_error: "We couldn't verify your link",
  };

  const icon =
    code === "expired" ? <Clock size={30} /> : <ShieldAlert size={30} />;

  return (
    <GateShell
      icon={icon}
      title={titles[code] ?? "Invalid registration link"}
      body={
        result?.message ??
        "Staff registration is by invitation only. Please ask the RHU Super Admin for your personal registration link."
      }
      danger
    />
  );
}

function GateShell({
  icon,
  title,
  body,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  danger?: boolean;
}) {
  return (
    <main style={styles.page}>
      <section style={{ ...styles.card, maxWidth: 560, textAlign: "center" }}>
        <div
          style={{
            ...styles.icon,
            margin: "0 auto 16px",
            background: danger ? "#FEF2F2" : "#ECFDF5",
            color: danger ? "#B91C1C" : "#047857",
          }}
        >
          {icon}
        </div>
        <h1 style={{ ...styles.title, fontSize: 26 }}>{title}</h1>
        <p style={{ ...styles.subtitle, marginTop: 10 }}>{body}</p>
        <p style={{ ...styles.subtitle, marginTop: 14, fontSize: 13.5 }}>
          Registration links are signed, expire automatically, and work exactly
          once. If you need a new one, contact the RHU Super Admin.
        </p>
        <Link
          to="/login"
          style={{ ...styles.backLink, justifyContent: "center", marginTop: 20 }}
        >
          <ArrowLeft size={17} />
          Back to sign in
        </Link>
        <style>{`.ka-spin { animation: ka-spin 1s linear infinite; } @keyframes ka-spin { to { transform: rotate(360deg); } }`}</style>
      </section>
    </main>
  );
}

function StaffRegisterForm({
  inviteToken,
  inviteExpires,
  inviteSignature,
  intendedFor,
  lockedMobile,
}: {
  inviteToken: string;
  inviteExpires: string;
  inviteSignature: string;
  intendedFor: string | null;
  lockedMobile: string | null;
}) {
  const [form, setForm] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    // When the invite was locked to a mobile number, pre-fill it — the backend
    // rejects a different number for this link anyway.
    mobile_number: lockedMobile ?? "",
    barangay: "",
    birthday: "",
    password: "",
    password_confirmation: "",
  });

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  // RHU staff/admin must accept Terms and upload an Employee Identification Card
  // before the request is submitted. The approver reviews it before approval.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<File | null>(null);

  const [barangays, setBarangays] = useState<string[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState("");

  useEffect(() => {
    authService
      .getBarangays()
      .then(setBarangays)
      .catch(() => setBarangays([]));
  }, []);

  const mobileValid = MOBILE_PATTERN.test(form.mobile_number);
  const canSubmit =
    termsAccepted && !!employeeId && mobileValid && !loading && !ocrLoading;

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  // PH mobile: keep digits only, cap at 11 (09XXXXXXXXX).
  function onMobileChange(value: string) {
    update("mobile_number", value.replace(/\D/g, "").slice(0, 11));
  }

  // Only fill fields the user hasn't already typed, so OCR never clobbers edits.
  function applyAutofill(fields: {
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    birthday?: string | null;
  }) {
    setForm((current) => ({
      ...current,
      first_name: current.first_name || (fields.first_name ?? ""),
      middle_name: current.middle_name || (fields.middle_name ?? ""),
      last_name: current.last_name || (fields.last_name ?? ""),
      birthday: current.birthday || (fields.birthday ?? ""),
    }));
  }

  async function onPickEmployeeId(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError("");
    setOcrMessage("");

    if (!file) {
      setEmployeeId(null);
      return;
    }

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Please upload a JPG or PNG image of your Employee ID.");
      setEmployeeId(null);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError("That image is too large. Please upload a photo up to 5 MB.");
      setEmployeeId(null);
      event.target.value = "";
      return;
    }

    setEmployeeId(file);

    // Advisory OCR autofill — pre-fill name/birthday for the user to review.
    // The real name-match check runs on the server at submission.
    setOcrLoading(true);
    try {
      const result = await authService.extractEmployeeId(file);
      applyAutofill(result.fields);
      setOcrMessage(
        result.ok
          ? "We pre-filled some details from your ID. Please review and correct anything that's wrong."
          : "We couldn't read much from that photo — please fill in the details yourself."
      );
    } catch {
      setOcrMessage(
        "We couldn't scan the photo automatically. Please fill in the details yourself."
      );
    } finally {
      setOcrLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!termsAccepted) {
      setError("Please accept the Terms and Conditions to register.");
      return;
    }

    if (!employeeId) {
      setError("Please upload your Employee Identification Card.");
      return;
    }

    if (!MOBILE_PATTERN.test(form.mobile_number)) {
      setError("Please enter a valid mobile number (09XXXXXXXXX).");
      return;
    }

    setLoading(true);
    setSaved("");
    setError("");

    try {
      await authService.registerStaff({
        ...form,
        email: form.email.trim() || undefined,
        barangay: form.barangay.trim() || undefined,
        terms_accepted: termsAccepted,
        employee_id: employeeId,
        // The signed one-time invite — re-verified authoritatively server-side.
        invite_token: inviteToken,
        invite_expires: inviteExpires,
        invite_signature: inviteSignature,
      });

      setSaved(
        "Registration submitted successfully. Your Employee ID was uploaded. Your account will remain pending until reviewed by the Super Admin."
      );

      setForm({
        first_name: "",
        middle_name: "",
        last_name: "",
        email: "",
        mobile_number: "",
        barangay: "",
        birthday: "",
        password: "",
        password_confirmation: "",
      });
      setTermsAccepted(false);
      setTermsAcknowledged(false);
      setEmployeeId(null);
      setOcrMessage("");
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      const firstError = errors
        ? Object.values(errors).flat().filter(Boolean)[0]
        : null;

      setError(
        String(
          firstError ||
            err?.response?.data?.message ||
            err?.message ||
            "Registration failed. Please check all fields."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <Link to="/login" style={styles.backLink}>
          <ArrowLeft size={17} />
          Back to sign in
        </Link>

        <div style={styles.header}>
          <div style={styles.icon}>
            <UserPlus size={28} />
          </div>

          <div>
            <h1 style={styles.title}>RHU Staff Registration</h1>
            <p style={styles.subtitle}>
              Submit your account request. Admin approval is required before
              dashboard access.
            </p>
          </div>
        </div>

        <div style={styles.notice}>
          <ShieldCheck size={18} />
          <span>
            Your invitation link is <strong>verified</strong>
            {intendedFor ? (
              <>
                {" "}
                (issued for <strong>{intendedFor}</strong>)
              </>
            ) : null}
            . It works exactly once — please finish this form in one sitting.
            For safety, new staff accounts start as <strong>Pending</strong>;
            the Super Admin will review the request and assign the final role.
          </span>
        </div>

        {saved ? (
          <div style={styles.successBox}>
            <CheckCircle2 size={18} />
            <span>{saved}</span>
          </div>
        ) : null}

        {error ? (
          <div style={styles.errorBox}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={submit} style={styles.form}>
          <div style={styles.twoCols}>
            <Field label="First Name" icon={<User size={17} />}>
              <input
                value={form.first_name}
                onChange={(event) => update("first_name", event.target.value)}
                placeholder="Juan"
                style={styles.input}
                required
              />
            </Field>

            <Field label="Middle Name Optional" icon={<User size={17} />}>
              <input
                value={form.middle_name}
                onChange={(event) => update("middle_name", event.target.value)}
                placeholder="Santos"
                style={styles.input}
              />
            </Field>
          </div>

          <div style={styles.twoCols}>
            <Field label="Last Name" icon={<User size={17} />}>
              <input
                value={form.last_name}
                onChange={(event) => update("last_name", event.target.value)}
                placeholder="Dela Cruz"
                style={styles.input}
                required
              />
            </Field>

            <Field label="Mobile Number" icon={<Phone size={17} />}>
              <input
                value={form.mobile_number}
                onChange={(event) => onMobileChange(event.target.value)}
                placeholder="09XXXXXXXXX"
                inputMode="numeric"
                maxLength={11}
                style={{
                  ...styles.input,
                  borderColor:
                    form.mobile_number && !mobileValid ? "#FCA5A5" : "#CBD5E1",
                }}
                required
              />
              {form.mobile_number && !mobileValid ? (
                <span style={{ color: "#B91C1C", fontSize: 12, fontWeight: 700 }}>
                  Use 11 digits starting with 09.
                </span>
              ) : null}
            </Field>
          </div>

          <Field label="Email Optional" icon={<Mail size={17} />}>
            <input
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="staff@example.com"
              type="email"
              style={styles.input}
            />
          </Field>

          {/* Registrants do NOT pick their own role — it is assigned by the
              Super Admin when this registration is approved. The backend
              ignores any role sent from this form. */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: "#F0FDFA",
              border: "1px solid #99F6E4",
              borderRadius: 12,
              padding: "11px 14px",
            }}
          >
            <ShieldCheck size={17} color="#0F766E" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, color: "#134E4A", lineHeight: 1.5 }}>
              <strong>Your role is assigned on approval.</strong> The Super
              Admin will set your position (doctor, nurse, midwife, BHW, or
              admin staff) when they review your registration.
            </div>
          </div>

          <div style={styles.twoCols}>
            <Field label="Barangay" icon={<MapPin size={17} />}>
              <select
                value={form.barangay}
                onChange={(event) => update("barangay", event.target.value)}
                style={styles.input}
                required
              >
                <option value="">Select barangay…</option>
                {barangays.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Birthday" icon={<CalendarDays size={17} />}>
              <input
                type="date"
                value={form.birthday}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => update("birthday", event.target.value)}
                style={styles.input}
              />
            </Field>
          </div>

          <div style={styles.twoCols}>
            <Field label="Password" icon={<Lock size={17} />}>
              <input
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
                placeholder="Strong password"
                type="password"
                style={styles.input}
                required
              />
            </Field>

            <PasswordStrengthMeter password={form.password} />

            <Field label="Confirm Password" icon={<Lock size={17} />}>
              <input
                value={form.password_confirmation}
                onChange={(event) =>
                  update("password_confirmation", event.target.value)
                }
                placeholder="Repeat password"
                type="password"
                style={styles.input}
                required
              />
            </Field>
          </div>

          {/* Employee ID (required) */}
          <div style={styles.uploadCard}>
            <div style={styles.labelText}>
              <ShieldCheck size={17} />
              Upload your Employee ID *
            </div>
            <p style={styles.uploadHelp}>
              Upload a clear photo of your Employee ID. We&apos;ll read it to help
              fill in your details, and it will be reviewed before your account is
              approved.
            </p>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={onPickEmployeeId}
              style={styles.fileInput}
            />
            {ocrLoading ? (
              <div style={styles.fileChosen}>
                <Loader2 size={16} />
                <span>Reading your ID…</span>
              </div>
            ) : employeeId ? (
              <div style={styles.fileChosen}>
                <CheckCircle2 size={16} />
                <span>{employeeId.name}</span>
              </div>
            ) : null}
            {ocrMessage ? <p style={styles.uploadHelp}>{ocrMessage}</p> : null}
          </div>

          {/* Terms and Conditions (required) — must open + read before accepting */}
          <div style={{ display: "grid", gap: 8 }}>
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                alignSelf: "flex-start",
                background: "#ECFDF5",
                color: "#047857",
                border: "1px solid #A7F3D0",
                borderRadius: 12,
                padding: "10px 14px",
                fontWeight: 900,
                fontSize: 13.5,
                cursor: "pointer",
              }}
            >
              <ShieldCheck size={16} />
              Read the Terms, Data Privacy Notice &amp; System Use Policy
            </button>

            <label
              style={{
                ...styles.termsRow,
                opacity: termsAcknowledged ? 1 : 0.6,
                cursor: termsAcknowledged ? "pointer" : "not-allowed",
              }}
            >
              <input
                type="checkbox"
                checked={termsAccepted}
                disabled={!termsAcknowledged}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
              />
              <span style={styles.termsText}>
                I have read and accept the Terms and Conditions, Data Privacy
                Notice, and System Use Policy.{" "}
                {termsAcknowledged
                  ? "I understand my account stays pending until it is approved."
                  : "Please open and read the document above to enable this."}
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...styles.primaryButton,
              opacity: canSubmit ? 1 : 0.55,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "Submitting..." : "Submit Registration"}
            <UserPlus size={18} />
          </button>
        </form>
      </section>

      <TermsModal
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        onAcknowledge={() => {
          setTermsAcknowledged(true);
          setTermsAccepted(true);
        }}
      />
    </main>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label style={styles.label}>
      <span style={styles.labelText}>
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #ECFDF5, #F8FAFC)",
    display: "grid",
    placeItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 820,
    background: "#FFFFFF",
    borderRadius: 28,
    border: "1px solid #E2E8F0",
    boxShadow: "0 24px 70px rgba(15,23,42,0.12)",
    padding: 32,
  },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#047857",
    textDecoration: "none",
    fontWeight: 900,
    marginBottom: 22,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 18,
  },
  icon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    background: "#ECFDF5",
    color: "#047857",
    display: "grid",
    placeItems: "center",
  },
  title: {
    margin: 0,
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: "-0.04em",
    color: "#0F172A",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#64748B",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  notice: {
    display: "flex",
    gap: 10,
    padding: 16,
    borderRadius: 18,
    background: "#F0FDFA",
    color: "#115E59",
    border: "1px solid #99F6E4",
    fontWeight: 700,
    lineHeight: 1.6,
    marginBottom: 18,
  },
  successBox: {
    display: "flex",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: "#ECFDF5",
    color: "#047857",
    border: "1px solid #A7F3D0",
    fontWeight: 800,
    marginBottom: 16,
  },
  errorBox: {
    display: "flex",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: "#FEF2F2",
    color: "#991B1B",
    border: "1px solid #FECACA",
    fontWeight: 800,
    marginBottom: 16,
  },
  form: {
    display: "grid",
    gap: 16,
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },
  label: {
    display: "grid",
    gap: 8,
  },
  labelText: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#334155",
    fontWeight: 900,
    fontSize: 14,
  },
  input: {
    width: "100%",
    height: 50,
    borderRadius: 16,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    padding: "0 14px",
    fontSize: 15,
    fontWeight: 700,
    outline: "none",
    boxSizing: "border-box",
  },
  primaryButton: {
    height: 54,
    borderRadius: 18,
    border: "none",
    background: "#047857",
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
  },
  uploadCard: {
    display: "grid",
    gap: 8,
    padding: 16,
    borderRadius: 16,
    border: "1px dashed #99F6E4",
    background: "#F0FDFA",
  },
  uploadHelp: {
    margin: 0,
    color: "#475569",
    fontWeight: 600,
    fontSize: 13,
    lineHeight: 1.5,
  },
  fileInput: {
    width: "100%",
    fontSize: 14,
    fontWeight: 600,
    color: "#0F172A",
  },
  fileChosen: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#047857",
    fontWeight: 800,
    fontSize: 13,
  },
  fileHint: {
    color: "#94A3B8",
    fontWeight: 700,
    fontSize: 12,
  },
  termsRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    cursor: "pointer",
  },
  termsText: {
    color: "#334155",
    fontWeight: 600,
    fontSize: 13.5,
    lineHeight: 1.5,
  },
};
