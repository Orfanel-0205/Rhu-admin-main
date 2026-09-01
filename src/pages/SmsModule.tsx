// src/pages/SmsModule.tsx
// Ka-Agapay SMS Center
// User-friendly RHU SMS management with real-life safety checks, recipient preview, credit estimation, and logs.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { usePagination } from "../hooks/usePagination";
import TablePagination from "../components/ui/TablePagination";
import ModuleTabs from "../components/ui/ModuleTabs";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
  X,
} from "lucide-react";

import {
  getBarangays,
  getSmsAccount,
  getSmsLogs,
  previewSmsRecipients,
  sendSms,
  type SendSmsPayload,
  type SmsLog,
  type SmsMode,
  type SmsRecipientPreview,
} from "../services/sms";
import { useToast } from "../contexts/ToastContext";

type FormState = {
  mode: SmsMode;
  mobile_number: string;
  barangay: string;
  message: string;
  notification_type: string;

  gender: string;
  age_min: string;
  age_max: string;
  account_status: string;
  id_verified: string;
  limit: string;
};

type NoticeState = {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
} | null;

type ConfirmState = {
  recipients: number | string;
  credits: number;
  message: string;
  payload: SendSmsPayload;
} | null;

const EMPTY_FORM: FormState = {
  mode: "single",
  mobile_number: "",
  barangay: "",
  message: "",
  notification_type: "manual",

  gender: "all",
  age_min: "",
  age_max: "",
  account_status: "active",
  id_verified: "",
  limit: "1000",
};

const SMS_TEMPLATES = [
  {
    label: "Appointment Reminder",
    type: "appointment_reminder",
    value:
      "RHU Reminder: You have an appointment at RHU Malasiqui. Please arrive 15 minutes early. Thank you.",
  },
  {
    label: "Queue Alert",
    type: "queue_alert",
    value:
      "RHU Queue Alert: Your turn is near. Please proceed to the waiting area. Thank you.",
  },
  {
    label: "Immunization",
    type: "program_notice",
    value:
      "RHU Reminder: Immunization activity is scheduled in your barangay. Please bring your child and health card.",
  },
  {
    label: "Medical Mission",
    type: "program_notice",
    value:
      "RHU Advisory: Free medical mission is available. Please visit your barangay health worker for details.",
  },
  {
    label: "Follow-up",
    type: "follow_up",
    value:
      "RHU Follow-up: Please return to RHU Malasiqui for your scheduled follow-up consultation.",
  },
  {
    label: "Emergency Advisory",
    type: "emergency_advisory",
    value:
      "RHU Advisory: Please monitor official RHU announcements and follow barangay health instructions. Stay safe.",
  },
];

function getErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === "object" && error !== null) {
    const anyError = error as any;
    const validation = anyError?.response?.data?.errors;

    if (validation) {
      return Object.values(validation).flat().join("\n");
    }

    return (
      anyError?.response?.data?.message ||
      anyError?.response?.data?.error ||
      anyError?.message ||
      fallback
    );
  }

  return fallback;
}

function normalizeMobileDisplay(value?: string | null): string {
  if (!value) return "—";

  const cleaned = value.replace(/[^\d]/g, "");

  if (cleaned.startsWith("63") && cleaned.length === 12) {
    return `0${cleaned.slice(2, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
  }

  if (cleaned.startsWith("09") && cleaned.length === 11) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }

  return value;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function smsSegments(message: string): number {
  return Math.max(1, Math.ceil(Math.max(message.length, 1) / 160));
}

function estimateCredits(recipientCount: number, message: string): number {
  return Math.max(0, recipientCount) * smsSegments(message);
}

function isValidPhilippineNumber(value: string): boolean {
  const cleaned = value.replace(/[^\d+]/g, "");

  return (
    /^09\d{9}$/.test(cleaned) ||
    /^\+639\d{9}$/.test(cleaned) ||
    /^639\d{9}$/.test(cleaned)
  );
}

function buildPayload(form: FormState): SendSmsPayload {
  return {
    mode: form.mode,
    mobile_number: form.mobile_number.trim() || undefined,
    barangay: form.barangay.trim() || undefined,
    message: form.message.trim(),
    notification_type: form.notification_type || "manual",

    gender: form.gender !== "all" ? form.gender : undefined,
    sex: form.gender !== "all" ? form.gender : undefined,

    age_min: form.age_min ? Number(form.age_min) : undefined,
    age_max: form.age_max ? Number(form.age_max) : undefined,

    account_status:
      form.account_status !== "all" ? form.account_status : undefined,

    id_verified:
      form.id_verified === ""
        ? undefined
        : form.id_verified === "true",

    limit: form.limit ? Number(form.limit) : 1000,
  };
}

function validateForm(
  form: FormState,
  requirePreview: boolean,
  allowEmptyMessage = false
): string | null {
  const message = form.message.trim();

  if (!allowEmptyMessage && !message) {
    return "Please type the SMS message first.";
  }

  if (message && message.length < 5) {
    return "SMS message is too short. Please write a clear message.";
  }

  if (message && message.length > 640) {
    return "SMS message is too long. Keep it within 640 characters.";
  }

  if (message && message.toUpperCase().startsWith("TEST")) {
    return "Do not start SMS messages with TEST. Some providers may silently ignore test-looking messages.";
  }

  if (
    message &&
    (
      message.toLowerCase().includes("diagnosed with") ||
      message.toLowerCase().includes("positive for") ||
      message.toLowerCase().includes("hiv") ||
      message.toLowerCase().includes("std")
    )
  ) {
    return "For privacy, avoid sensitive diagnosis details in SMS. Use a neutral reminder instead.";
  }

  if (form.mode === "single") {
    if (!form.mobile_number.trim()) {
      return "Please enter the recipient mobile number.";
    }

    if (!isValidPhilippineNumber(form.mobile_number.trim())) {
      return "Invalid mobile number. Use 09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX.";
    }
  }

  if (form.mode === "barangay" && !form.barangay.trim()) {
    return "Please select the barangay.";
  }

  if (form.mode === "custom") {
    const limit = Number(form.limit || 1000);

    if (!Number.isFinite(limit) || limit < 1 || limit > 1000) {
      return "Recipient limit must be from 1 to 1000.";
    }

    if (form.age_min && form.age_max) {
      const min = Number(form.age_min);
      const max = Number(form.age_max);

      if (min > max) {
        return "Minimum age cannot be greater than maximum age.";
      }
    }
  }

  if (requirePreview && form.mode !== "single") {
    return null;
  }

  return null;
}

function statusTone(status: string): CSSProperties {
  const value = status.toLowerCase();

  if (["sent", "delivered", "success"].includes(value)) {
    return S.statusSent;
  }

  if (["failed", "error", "undelivered"].includes(value)) {
    return S.statusFailed;
  }

  return S.statusQueued;
}

export default function SmsModule() {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [barangays, setBarangays] = useState<string[]>([]);
  // Part 8 — paginate the SMS log list.
  const pg = usePagination(logs, { resetDeps: [logs] });
  const [preview, setPreview] = useState<SmsRecipientPreview[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [estimatedCredits, setEstimatedCredits] = useState(0);

  const [creditBalance, setCreditBalance] = useState<number | string | null>(null);
  const [accountMessage, setAccountMessage] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [loadingLogs, setLoadingLogs] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);

  const [notice, setNotice] = useState<NoticeState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  // Panelist follow-up round: SMS Logs default to TODAY's messages. Older
  // logs stay fully accessible via "All history" — view scoping only.
  const [viewScope, setViewScope] = useState<"today" | "all">("today");

  const showNotice = useCallback(
    (type: NoticeState extends infer T ? "success" | "error" | "warning" | "info" : never, title: string, message: string) => {
      setNotice({ type, title, message });

      window.setTimeout(() => {
        setNotice(null);
      }, 4500);
    },
    []
  );

  const loadLogs = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoadingLogs(true);
      }

      try {
        // Default view = TODAY only (panelist follow-up round). This is a
        // VIEW scope, not a data-lifecycle change: nothing is archived or
        // deleted — "All history" fetches the same table unbounded.
        const today = new Date().toISOString().slice(0, 10);

        const data = await getSmsLogs({
          search: search.trim() || undefined,
          status,
          per_page: 100,
          date_from: viewScope === "today" ? today : undefined,
          date_to: viewScope === "today" ? today : undefined,
        });

        setLogs(data);
      } catch (error) {
        showNotice(
          "error",
          "Could not load SMS logs",
          getErrorMessage(error, "Please check the backend SMS logs endpoint.")
        );
      } finally {
        setLoadingLogs(false);
      }
    },
    [search, showNotice, status, viewScope]
  );

  const loadAccount = useCallback(async () => {
    setCheckingAccount(true);
    setAccountMessage("");

    try {
      const data = await getSmsAccount();

      const balance =
        data.credit_balance ??
        data.balance ??
        null;

      setCreditBalance(balance);
      showNotice(
        "success",
        "Provider connected",
        "SMS provider account was checked successfully."
      );
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Could not check Semaphore credits. Check API key and backend config."
      );

      setAccountMessage(message);
      showNotice("warning", "Credit check failed", message);
    } finally {
      setCheckingAccount(false);
    }
  }, [showNotice]);

  useEffect(() => {
    loadLogs(false);

    const timer = window.setInterval(() => {
      loadLogs(true);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [loadLogs]);

  useEffect(() => {
    getBarangays()
      .then(setBarangays)
      .catch(() => setBarangays([]));
  }, []);

  const stats = useMemo(() => {
    return {
      total: logs.length,
      sent: logs.filter((log) =>
        ["sent", "delivered", "success"].includes(String(log.status).toLowerCase())
      ).length,
      queued: logs.filter((log) =>
        ["queued", "pending", "processing"].includes(String(log.status).toLowerCase())
      ).length,
      failed: logs.filter((log) =>
        ["failed", "error", "undelivered"].includes(String(log.status).toLowerCase())
      ).length,
    };
  }, [logs]);

  const localRecipients =
    form.mode === "single" && form.mobile_number.trim() ? 1 : previewCount;

  const localCredits = estimateCredits(localRecipients, form.message);

  const safetyWarnings = useMemo(() => {
    const warnings: string[] = [];

    if (form.message.length > 160) {
      warnings.push(
        `Message uses ${smsSegments(form.message)} SMS segments per recipient.`
      );
    }

    if (form.mode === "all") {
      warnings.push("Sending to all residents should be used only for important RHU advisories.");
    }

    if (form.mode === "custom" && !form.barangay && form.gender === "all" && !form.age_min && !form.age_max) {
      warnings.push("Custom target has very broad filters. Preview recipients before sending.");
    }

    if (form.message.toLowerCase().includes("diagnosis")) {
      warnings.push("Avoid diagnosis details in SMS to protect patient privacy.");
    }

    return warnings;
  }, [form]);

  function changeMode(mode: SmsMode) {
    setForm((previous) => ({
      ...previous,
      mode,
      mobile_number: mode === "single" ? previous.mobile_number : "",
      barangay:
        mode === "barangay" || mode === "custom"
          ? previous.barangay
          : "",
    }));

    setPreview([]);
    setPreviewCount(0);
    setEstimatedCredits(0);
  }

  function clearPreview() {
    setPreview([]);
    setPreviewCount(0);
    setEstimatedCredits(0);
  }

  function applyTemplate(template: (typeof SMS_TEMPLATES)[number]) {
    setForm((previous) => ({
      ...previous,
      message: template.value,
      notification_type: template.type,
    }));

    clearPreview();
  }

  async function loadRecipientPreview(options?: { silent?: boolean; allowEmptyMessage?: boolean }) {
    const validation = validateForm(form, false, options?.allowEmptyMessage ?? false);

    if (validation) {
      if (!options?.silent) {
        showNotice("warning", "Check SMS details", validation);
      }
      return;
    }

    setPreviewing(true);

    try {
      const payload = buildPayload(form);
      const data = await previewSmsRecipients(payload);

      setPreview(data.recipients);
      setPreviewCount(data.count);
      setEstimatedCredits(data.estimated_credits);

      if (!options?.silent) {
        showNotice(
          "success",
          "Recipients loaded",
          `${data.count} recipient(s) found. Review the list before sending.`
        );
      }
    } catch (error) {
      if (!options?.silent) {
        showNotice(
          "error",
          "Preview failed",
          getErrorMessage(error, "Could not preview recipients.")
        );
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function handlePreview() {
    await loadRecipientPreview({ allowEmptyMessage: true });
  }

  useEffect(() => {
    if (form.mode !== "barangay" || !form.barangay.trim()) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadRecipientPreview({ silent: true, allowEmptyMessage: true });
    }, 250);

    return () => window.clearTimeout(timer);
    // Intentionally scoped to barangay target changes. Message edits should not
    // repeatedly reload the recipient list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.mode, form.barangay]);

  function prepareSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateForm(form, true);

    if (validation) {
      showNotice("warning", "Cannot send SMS yet", validation);
      return;
    }

    const payload = buildPayload(form);
    const recipients =
      form.mode === "single"
        ? 1
        : previewCount || "Backend will resolve";

    const credits =
      estimatedCredits ||
      localCredits ||
      estimateCredits(form.mode === "single" ? 1 : 0, form.message);

    if (form.mode !== "single" && previewCount <= 0) {
      showNotice(
        "warning",
        "Preview first",
        "For barangay, all, or custom sending, preview recipients first to avoid accidental bulk SMS."
      );
      return;
    }

    setConfirm({
      recipients,
      credits,
      message: form.message.trim(),
      payload,
    });
  }

  async function confirmSend() {
    if (!confirm) return;

    setSending(true);

    try {
      const response = await sendSms(confirm.payload);
      const successMsg =
        response?.message ||
        `SMS sent to ${response?.count ?? confirm.recipients} recipient(s).`;

      showNotice("success", "SMS request processed", successMsg);
      toast.success(successMsg);

      setConfirm(null);
      setForm(EMPTY_FORM);
      setPreview([]);
      setPreviewCount(0);
      setEstimatedCredits(0);

      await loadLogs(true);
    } catch (error) {
      const errMsg = getErrorMessage(error, "Provider rejected the SMS request.");
      showNotice("error", "SMS sending failed", errMsg);
      toast.error(errMsg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={S.page}>
      {notice ? (
        <NoticeToast notice={notice} onClose={() => setNotice(null)} />
      ) : null}

      <section style={S.hero}>
        <div>
          <div style={S.eyebrow}>Ka-Agapay RHU Communication</div>
          <h1 style={S.heroTitle}>SMS Center</h1>
          <p style={S.heroText}>
            Send safe RHU reminders, queue alerts, follow-ups, and program
            advisories. Preview recipients first to avoid wrong or accidental
            bulk sending.
          </p>

          <div style={S.heroSteps}>
            <span>1. Choose recipients</span>
            <span>2. Write message</span>
            <span>3. Preview</span>
            <span>4. Confirm send</span>
          </div>
        </div>

        <div style={S.heroActions}>
          <button type="button" onClick={loadAccount} style={S.whiteButton}>
            <Wallet size={18} />
            {checkingAccount ? "Checking..." : "Check Credits"}
          </button>

          <button type="button" onClick={() => loadLogs(false)} style={S.whiteButton}>
            <RefreshCw size={18} />
            Refresh Logs
          </button>
        </div>
      </section>

      {accountMessage ? (
        <section style={S.warningPanel}>
          <AlertTriangle size={22} />
          <div>
            <strong>SMS Provider Warning</strong>
            <p>{accountMessage}</p>
          </div>
        </section>
      ) : null}

      <section style={S.metricsGrid}>
        <Metric
          label="Semaphore Credits"
          value={creditBalance === null ? "—" : String(creditBalance)}
          hint="Available balance"
          icon={<Wallet size={22} />}
          tone="teal"
        />

        <Metric
          label="Total SMS Logs"
          value={String(stats.total)}
          hint="Recent records"
          icon={<MessageSquare size={22} />}
          tone="blue"
        />

        <Metric
          label="Sent"
          value={String(stats.sent)}
          hint="Accepted/sent"
          icon={<Send size={22} />}
          tone="green"
        />

        <Metric
          label="Queued"
          value={String(stats.queued)}
          hint="Waiting/provider queue"
          icon={<Bell size={22} />}
          tone="yellow"
        />

        <Metric
          label="Failed"
          value={String(stats.failed)}
          hint="Needs checking"
          icon={<Smartphone size={22} />}
          tone="red"
        />
      </section>

      <section style={S.twoColumn}>
        <div style={S.card}>
          <div style={S.sectionHeader}>
            <div>
              <h2 style={S.sectionTitle}>Create SMS Campaign</h2>
              <p style={S.sectionSub}>
                Keep messages short, neutral, and easy to understand.
              </p>
            </div>
          </div>

          <form onSubmit={prepareSend} style={S.form}>
            <div style={S.formGrid}>
              <label style={S.field}>
                <span>Recipient Mode</span>
                <select
                  value={form.mode}
                  onChange={(event) => changeMode(event.target.value as SmsMode)}
                  style={S.input}
                >
                  <option value="single">One mobile number</option>
                  <option value="barangay">Specific barangay</option>
                  <option value="all">All eligible residents</option>
                  <option value="custom">Custom filters</option>
                </select>
              </label>

              <label style={S.field}>
                <span>Notification Type</span>
                <select
                  value={form.notification_type}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      notification_type: event.target.value,
                    }))
                  }
                  style={S.input}
                >
                  <option value="manual">Manual SMS</option>
                  <option value="appointment_reminder">Appointment Reminder</option>
                  <option value="queue_alert">Queue Alert</option>
                  <option value="program_notice">Program Notice</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="emergency_advisory">Emergency Advisory</option>
                </select>
              </label>
            </div>

            {form.mode === "single" ? (
              <Field
                label="Mobile Number"
                value={form.mobile_number}
                onChange={(value) =>
                  setForm((previous) => ({
                    ...previous,
                    mobile_number: value,
                  }))
                }
                placeholder="09XXXXXXXXX"
              />
            ) : null}

            {form.mode === "barangay" || form.mode === "custom" ? (
              <label style={S.field}>
                <span>
                  {form.mode === "barangay"
                    ? "Barangay"
                    : "Barangay, optional"}
                </span>
                <select
                  value={form.barangay}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((previous) => ({
                      ...previous,
                      barangay: value,
                    }));
                    clearPreview();
                  }}
                  style={S.input}
                >
                  <option value="">
                    {form.mode === "barangay"
                      ? "Select barangay..."
                      : "All barangays"}
                  </option>
                  {barangays.map((barangay) => (
                    <option key={barangay} value={barangay}>
                      {barangay}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {form.mode === "custom" ? (
              <div style={S.filterBox}>
                <div style={S.filterTitle}>
                  <Filter size={18} />
                  <strong>Target Filters</strong>
                </div>

                <div style={S.formGrid}>
                  <label style={S.field}>
                    <span>Gender / Sex</span>
                    <select
                      value={form.gender}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          gender: event.target.value,
                        }))
                      }
                      style={S.input}
                    >
                      <option value="all">All</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  <Field
                    label="Age Min"
                    type="number"
                    value={form.age_min}
                    onChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        age_min: value,
                      }))
                    }
                    placeholder="0"
                  />

                  <Field
                    label="Age Max"
                    type="number"
                    value={form.age_max}
                    onChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        age_max: value,
                      }))
                    }
                    placeholder="120"
                  />

                  <label style={S.field}>
                    <span>Account Status</span>
                    <select
                      value={form.account_status}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          account_status: event.target.value,
                        }))
                      }
                      style={S.input}
                    >
                      <option value="active">Active only</option>
                    </select>
                    <small style={S.helpText}>
                      Bulk SMS is limited to active resident/patient accounts.
                    </small>
                  </label>

                  <label style={S.field}>
                    <span>ID Verification</span>
                    <select
                      value={form.id_verified}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          id_verified: event.target.value,
                        }))
                      }
                      style={S.input}
                    >
                      <option value="">Any</option>
                      <option value="true">Verified only</option>
                      <option value="false">Not verified only</option>
                    </select>
                  </label>

                  <Field
                    label="Limit"
                    type="number"
                    value={form.limit}
                    onChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        limit: value,
                      }))
                    }
                    placeholder="1000"
                  />
                </div>
              </div>
            ) : null}

            <div style={S.templateSection}>
              <span style={S.label}>Templates</span>
              <div style={S.templateGrid}>
                {SMS_TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    style={S.templateButton}
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <label style={S.field}>
              <span>Message</span>
              <textarea
                value={form.message}
                maxLength={640}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    message: event.target.value,
                  }))
                }
                placeholder="Type the SMS message here..."
                style={{ ...S.input, minHeight: 135, paddingTop: 12, resize: "vertical" }}
              />
              <small style={S.helpText}>
                {form.message.length}/640 characters • {smsSegments(form.message)} segment(s)
              </small>
            </label>

            {safetyWarnings.length > 0 ? (
              <div style={S.safetyBox}>
                <AlertTriangle size={20} />
                <div>
                  <strong>Safety Reminder</strong>
                  <ul style={S.warningList}>
                    {safetyWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div style={S.goodBox}>
                <ShieldCheck size={20} />
                <span>Message looks safe for SMS. Still preview recipients before sending.</span>
              </div>
            )}

            <div style={S.creditBox}>
              <div>
                <strong>Recipients:</strong> {previewCount || (form.mode === "single" && form.mobile_number ? 1 : 0)}
              </div>
              <div>
                <strong>Estimated Credits:</strong> {estimatedCredits || localCredits}
              </div>
              <div>
                <strong>Segments:</strong> {smsSegments(form.message)}
              </div>
            </div>

            <div style={S.actionRow}>
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewing}
                style={S.secondaryButton}
              >
                <Users size={17} />
                {previewing ? "Previewing..." : "Preview Recipients"}
              </button>

              <button
                type="submit"
                disabled={sending}
                style={S.primaryButton}
              >
                <Send size={17} />
                {sending ? "Sending..." : "Send SMS"}
              </button>
            </div>
          </form>
        </div>

        <div style={S.card}>
          <div style={S.sectionHeader}>
            <div>
              <h2 style={S.sectionTitle}>Recipient Preview</h2>
              <p style={S.sectionSub}>
                Read-only list of active resident/patient accounts that match
                the selected recipient filters.
              </p>
            </div>
            <span style={S.countPill}>{previewCount} found</span>
          </div>

          {preview.length === 0 ? (
            <div style={S.emptyBox}>
              <Users size={42} />
              <strong>No preview yet</strong>
              <span>Click Preview Recipients first.</span>
            </div>
          ) : (
            <div style={S.recipientList}>
              {preview.slice(0, 30).map((recipient, index) => (
                <div
                  key={`${recipient.mobile_number}-${recipient.user_id ?? index}`}
                  style={S.recipientCard}
                >
                  <div>
                    <strong>
                      {recipient.name ||
                        recipient.recipient_name ||
                        "Recipient"}
                    </strong>
                    <span>{normalizeMobileDisplay(recipient.mobile_number)}</span>
                  </div>
                  <div style={S.recipientMeta}>
                    <span>{recipient.barangay || "No barangay"}</span>
                    <span>{recipient.role || "No role"}</span>
                    <span>{recipient.account_status || "No status"}</span>
                    <span>
                      {recipient.id_verified ? "Verified" : "ID not shown"}
                    </span>
                  </div>
                </div>
              ))}

              {preview.length > 30 ? (
                <p style={S.helpText}>
                  Showing first 30 only. Total recipients: {preview.length}.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section style={S.card}>
        <div style={S.logsHeader}>
          <div>
            <h2 style={S.sectionTitle}>SMS Logs</h2>
            <p style={S.sectionSub}>
              Real SMS sending history from the backend.
            </p>
          </div>

          <div style={S.logFilters}>
            {/* Today-first view (panelist follow-up). Older messages are NOT
                archived or deleted — "All history" reads the same table. */}
            <ModuleTabs
              tabs={[
                { key: "today", label: "Today" },
                { key: "all", label: "All history" },
              ]}
              active={viewScope}
              onChange={(key) => setViewScope(key as "today" | "all")}
              style={{ borderBottom: "none" }}
            />

            <div style={S.searchBox}>
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search number/message..."
                style={S.searchInput}
              />
            </div>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              style={S.filterSelect}
            >
              <option value="all">All Status</option>
              <option value="queued">Queued</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </select>

            <button
              type="button"
              onClick={() => loadLogs(false)}
              style={S.iconButton}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>

        {loadingLogs ? (
          <div style={S.emptyBox}>
            <RefreshCw size={36} />
            <strong>Loading SMS logs...</strong>
          </div>
        ) : pg.total === 0 ? (
          <div style={S.emptyBox}>
            <MessageSquare size={42} />
            <strong>No SMS logs found</strong>
            <span>Send your first SMS or adjust filters.</span>
          </div>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Recipient</th>
                  <th style={S.th}>Mobile</th>
                  <th style={S.th}>Message</th>
                  <th style={S.th}>Mode</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Date</th>
                </tr>
              </thead>

              <tbody>
                {pg.pageRows.map((log) => (
                  <tr key={log.id ?? `${log.mobile_number}-${log.created_at}`}>
                    <td style={S.td}>
                      <strong>{log.recipient_name || log.recipient || "Recipient"}</strong>
                    </td>
                    <td style={S.td}>{normalizeMobileDisplay(log.mobile_number)}</td>
                    <td style={{ ...S.td, maxWidth: 360 }}>
                      <div style={S.messageText}>{log.message}</div>
                      {log.error_message ? (
                        <div style={S.errorText}>{log.error_message}</div>
                      ) : null}
                    </td>
                    <td style={S.td}>{log.mode || "single"}</td>
                    <td style={S.td}>
                      <span style={{ ...S.statusPill, ...statusTone(String(log.status)) }}>
                        {String(log.status || "queued").toUpperCase()}
                      </span>
                    </td>
                    <td style={S.td}>{formatDate(log.sent_at || log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loadingLogs && pg.total > 0 ? (
          <TablePagination
            page={pg.page}
            pageCount={pg.pageCount}
            total={pg.total}
            from={pg.from}
            to={pg.to}
            pageSize={pg.pageSize}
            onPage={pg.setPage}
            onPageSize={pg.setPageSize}
            label="SMS logs"
          />
        ) : null}
      </section>

      {confirm ? (
        <div style={S.modalOverlay}>
          <div style={S.confirmCard}>
            <div style={S.confirmHeader}>
              <div style={S.confirmIcon}>
                <Send size={26} />
              </div>
              <div>
                <h3 style={S.confirmTitle}>Confirm SMS Sending</h3>
                <p style={S.confirmText}>
                  Please review carefully. SMS sending may consume real provider credits.
                </p>
              </div>
            </div>

            <div style={S.confirmDetails}>
              <div>
                <span>Recipients</span>
                <strong>{confirm.recipients}</strong>
              </div>
              <div>
                <span>Estimated Credits</span>
                <strong>{confirm.credits}</strong>
              </div>
              <div>
                <span>Message</span>
                <p>{confirm.message}</p>
              </div>
            </div>

            <div style={S.actionRowEnd}>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                style={S.cancelButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={sending}
                style={S.primaryButton}
              >
                <Send size={17} />
                {sending ? "Sending..." : "Confirm Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={S.field}>
      <span>{label}</span>
      <input
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={S.input}
      />
    </label>
  );
}

function Metric({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: "teal" | "blue" | "green" | "yellow" | "red";
}) {
  const tones = {
    teal: { bg: "#CCFBF1", color: "#0F766E" },
    blue: { bg: "#DBEAFE", color: "#2563EB" },
    green: { bg: "#DCFCE7", color: "#047857" },
    yellow: { bg: "#FEF3C7", color: "#B45309" },
    red: { bg: "#FEE2E2", color: "#B91C1C" },
  };

  const selected = tones[tone];

  return (
    <div style={S.metricCard}>
      <div style={{ ...S.metricIcon, background: selected.bg, color: selected.color }}>
        {icon}
      </div>
      <div>
        <div style={S.metricLabel}>{label}</div>
        <div style={{ ...S.metricValue, color: selected.color }}>{value}</div>
        <div style={S.metricHint}>{hint}</div>
      </div>
    </div>
  );
}

function NoticeToast({
  notice,
  onClose,
}: {
  notice: NonNullable<NoticeState>;
  onClose: () => void;
}) {
  const tone =
    notice.type === "success"
      ? S.toastSuccess
      : notice.type === "warning"
      ? S.toastWarning
      : notice.type === "info"
      ? S.toastInfo
      : S.toastError;

  return (
    <div style={{ ...S.toast, ...tone }}>
      <div>
        {notice.type === "success" ? (
          <CheckCircle2 size={22} />
        ) : (
          <AlertTriangle size={22} />
        )}
      </div>

      <div style={{ flex: 1 }}>
        <strong>{notice.title}</strong>
        <p>{notice.message}</p>
      </div>

      <button type="button" onClick={onClose} style={S.toastClose}>
        <X size={16} />
      </button>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 22,
    paddingBottom: 40,
  },

  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
    padding: 28,
    borderRadius: 28,
    color: "#FFFFFF",
    background:
      "linear-gradient(135deg, #064E3B 0%, #0F766E 55%, #5EEAD4 100%)",
    boxShadow: "0 22px 55px rgba(15, 118, 110, 0.24)",
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.9,
  },

  heroTitle: {
    margin: "6px 0 8px",
    fontSize: 36,
    fontWeight: 950,
    lineHeight: 1.05,
  },

  heroText: {
    margin: 0,
    maxWidth: 800,
    lineHeight: 1.7,
    fontSize: 16,
    opacity: 0.95,
  },

  heroSteps: {
    display: "flex",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 16,
    fontSize: 12,
    fontWeight: 900,
  },

  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  whiteButton: {
    minHeight: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: 0,
    borderRadius: 14,
    padding: "0 16px",
    background: "#FFFFFF",
    color: "#0F766E",
    fontWeight: 950,
    cursor: "pointer",
  },

  warningPanel: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 18,
    background: "#FFFBEB",
    color: "#92400E",
    border: "1px solid #FDE68A",
  },

  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },

  metricCard: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    minHeight: 105,
    padding: 17,
    borderRadius: 20,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  },

  metricIcon: {
    width: 50,
    height: 50,
    display: "grid",
    placeItems: "center",
    borderRadius: 16,
    flex: "0 0 auto",
  },

  metricLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 950,
    textTransform: "uppercase",
  },

  metricValue: {
    marginTop: 2,
    fontSize: 30,
    fontWeight: 950,
  },

  metricHint: {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B",
  },

  twoColumn: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.65fr)",
    gap: 18,
    alignItems: "start",
  },

  card: {
    padding: 20,
    borderRadius: 22,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.07)",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 15,
  },

  sectionTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 21,
    fontWeight: 950,
  },

  sectionSub: {
    margin: "5px 0 0",
    color: "#64748B",
    lineHeight: 1.55,
    fontSize: 13,
  },

  form: {
    display: "grid",
    gap: 16,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 13,
  },

  field: {
    display: "grid",
    gap: 7,
    color: "#334155",
    fontSize: 13,
    fontWeight: 950,
  },

  label: {
    display: "block",
    color: "#334155",
    fontSize: 13,
    fontWeight: 950,
    marginBottom: 8,
  },

  input: {
    width: "100%",
    minHeight: 48,
    border: "1px solid #CBD5E1",
    borderRadius: 15,
    padding: "0 12px",
    outline: "none",
    background: "#FFFFFF",
    color: "#0F172A",
    fontFamily: "inherit",
    fontSize: 15,
    fontWeight: 750,
    boxSizing: "border-box",
  },

  helpText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: 750,
  },

  filterBox: {
    padding: 16,
    borderRadius: 18,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },

  filterTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    color: "#0F766E",
  },

  templateSection: {
    display: "grid",
    gap: 8,
  },

  templateGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  templateButton: {
    minHeight: 35,
    border: "1px solid #99F6E4",
    borderRadius: 999,
    padding: "0 12px",
    background: "#F0FDFA",
    color: "#0F766E",
    fontSize: 12,
    fontWeight: 950,
    cursor: "pointer",
  },

  safetyBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: "#FFFBEB",
    color: "#92400E",
    border: "1px solid #FDE68A",
  },

  goodBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: "#ECFDF5",
    color: "#047857",
    border: "1px solid #A7F3D0",
    fontWeight: 850,
  },

  warningList: {
    margin: "6px 0 0",
    paddingLeft: 18,
  },

  creditBox: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    padding: 14,
    borderRadius: 16,
    background: "#F0FDFA",
    color: "#0F766E",
    border: "1px solid #CCFBF1",
    fontWeight: 850,
  },

  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  actionRowEnd: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },

  primaryButton: {
    minHeight: 45,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: 0,
    borderRadius: 14,
    padding: "0 17px",
    background: "#0F766E",
    color: "#FFFFFF",
    fontWeight: 950,
    cursor: "pointer",
  },

  secondaryButton: {
    minHeight: 45,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid #0F766E",
    borderRadius: 14,
    padding: "0 17px",
    background: "#FFFFFF",
    color: "#0F766E",
    fontWeight: 950,
    cursor: "pointer",
  },

  cancelButton: {
    minHeight: 45,
    border: 0,
    borderRadius: 14,
    padding: "0 17px",
    background: "#F1F5F9",
    color: "#334155",
    fontWeight: 950,
    cursor: "pointer",
  },

  countPill: {
    padding: "6px 11px",
    borderRadius: 999,
    background: "#ECFDF5",
    color: "#047857",
    fontWeight: 950,
    fontSize: 12,
  },

  emptyBox: {
    minHeight: 220,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    textAlign: "center",
    padding: 24,
    borderRadius: 18,
    background: "#F8FAFC",
    color: "#64748B",
  },

  recipientList: {
    display: "grid",
    gap: 10,
    maxHeight: 560,
    overflowY: "auto",
  },

  recipientCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 15,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },

  recipientMeta: {
    display: "grid",
    gap: 4,
    textAlign: "right",
    color: "#64748B",
    fontSize: 12,
    fontWeight: 800,
  },

  logsHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 16,
  },

  logFilters: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },

  searchBox: {
    minHeight: 43,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    color: "#64748B",
  },

  searchInput: {
    width: 220,
    border: 0,
    outline: "none",
    background: "transparent",
    color: "#0F172A",
    fontWeight: 750,
  },

  filterSelect: {
    minHeight: 43,
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: "0 12px",
    background: "#F8FAFC",
    color: "#334155",
    fontWeight: 850,
  },

  iconButton: {
    width: 43,
    height: 43,
    display: "grid",
    placeItems: "center",
    border: "1px solid #0F766E",
    borderRadius: 14,
    background: "#FFFFFF",
    color: "#0F766E",
    cursor: "pointer",
  },

  tableWrap: {
    width: "100%",
    overflowX: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 850,
  },

  th: {
    textAlign: "left",
    padding: "13px 14px",
    background: "#F8FAFC",
    color: "#64748B",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
    borderBottom: "1px solid #E2E8F0",
  },

  td: {
    padding: "14px",
    verticalAlign: "top",
    borderBottom: "1px solid #F1F5F9",
    color: "#0F172A",
    fontSize: 13,
  },

  messageText: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.45,
  },

  errorText: {
    marginTop: 7,
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: 800,
  },

  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 950,
  },

  statusSent: {
    background: "#DCFCE7",
    color: "#166534",
  },

  statusQueued: {
    background: "#FEF3C7",
    color: "#92400E",
  },

  statusFailed: {
    background: "#FEE2E2",
    color: "#B91C1C",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2147483000,
    display: "grid",
    placeItems: "center",
    padding: 22,
    background: "rgba(15, 23, 42, 0.55)",
    backdropFilter: "blur(5px)",
  },

  confirmCard: {
    width: "min(620px, 100%)",
    borderRadius: 24,
    background: "#FFFFFF",
    padding: 24,
    boxShadow: "0 30px 70px rgba(15, 23, 42, 0.35)",
  },

  confirmHeader: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 18,
  },

  confirmIcon: {
    width: 56,
    height: 56,
    display: "grid",
    placeItems: "center",
    borderRadius: 18,
    background: "#ECFDF5",
    color: "#047857",
    flex: "0 0 auto",
  },

  confirmTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 22,
    fontWeight: 950,
  },

  confirmText: {
    margin: "5px 0 0",
    color: "#64748B",
    lineHeight: 1.6,
  },

  confirmDetails: {
    display: "grid",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    marginBottom: 18,
  },

  toast: {
    position: "fixed",
    right: 22,
    bottom: 22,
    zIndex: 2147483647,
    width: "min(440px, calc(100vw - 32px))",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 18,
    border: "1px solid",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
  },

  toastSuccess: {
    background: "#ECFDF5",
    color: "#047857",
    borderColor: "#A7F3D0",
  },

  toastWarning: {
    background: "#FFFBEB",
    color: "#B45309",
    borderColor: "#FDE68A",
  },

  toastInfo: {
    background: "#EFF6FF",
    color: "#2563EB",
    borderColor: "#BFDBFE",
  },

  toastError: {
    background: "#FEF2F2",
    color: "#B91C1C",
    borderColor: "#FECACA",
  },

  toastClose: {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    border: 0,
    borderRadius: 10,
    background: "rgba(255,255,255,.55)",
    color: "inherit",
    cursor: "pointer",
  },
};
