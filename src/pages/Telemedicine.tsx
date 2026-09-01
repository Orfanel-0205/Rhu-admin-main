// src/pages/Telemedicine.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getCurrentUserRhuId, isGlobalRhuRole } from "../services/queue";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  History,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Stethoscope,
  User,
  Video,
  X,
  XCircle,
} from "lucide-react";

import ActionMenu, { type ActionItem } from "../components/ui/ActionMenu";
import {
  buildTelemedicineRoomUrl,
  buildTelemedicineStats,
  cancelTelemedicineRequest,
  endorseTelemedicineToDoctor,
  endTelemedicineSession,
  getCurrentUserId,
  getTelemedicineComplaint,
  getTelemedicineNextStep,
  getTelemedicinePatientName,
  getTelemedicineRequests,
  getTelemedicineRequestStatusLabel,
  getTelemedicineSessionStatusLabel,
  getTelemedicineUrgencyLabel,
  isTelemedicineRequestClosed,
  isTelemedicineSessionClosed,
  notifyTelemedicinePatient,
  rejectTelemedicineRequest,
  screenAndScheduleNow,
  startTelemedicineScreening,
  startTelemedicineSessionNow,
  type TelemedicineBoard,
  type TelemedicineRequest,
  type TelemedicineSession,
} from "../services/telemedicine";
import { useToast } from "../contexts/ToastContext";

type StatusFilter =
  | "all"
  | "pending"
  | "screening"
  | "screened"
  | "endorsed_to_doctor"
  | "scheduled"
  | "completed"
  | "rejected"
  | "cancelled";

type UrgencyFilter = "all" | "routine" | "moderate" | "urgent" | "emergency";

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "teal";

type NormalizedBadge = {
  label: string;
  tone: BadgeTone;
};

// Level 1: can screen, collect vitals, endorse — cannot schedule sessions
const SCREENING_ROLES = new Set([
  "nurse", "midwife", "head_nurse", "staff", "rhu_staff", "rhu_admin",
]);

// Level 2: can schedule sessions, conduct consultations, finalize SOAP
const CLINICAL_ROLES = new Set([
  "doctor", "mho", "super_admin",
]);

// Same RHU-selector pattern as Reports/Analytics: global staff (Super Admin/MHO)
// may switch RHU 1 / RHU 2; facility-scoped staff stay locked to their own.
const RHU_OPTIONS = [
  { id: "1", label: "RHU 1" },
  { id: "2", label: "RHU 2" },
];

function defaultRhuFilter(): string {
  const own = getCurrentUserRhuId();
  if (!isGlobalRhuRole() && own > 0) return String(own);
  return "1";
}

function normalizeRoleName(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
}

function getUserRole(user: any): string {
  return normalizeRoleName(
    user?.role_name ?? user?.role?.name ?? user?.role ?? user?.account_type ?? ""
  );
}

const BOARD_TABS: { key: TelemedicineBoard; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "needs_soap", label: "Needs SOAP" },
  { key: "completed", label: "Completed" },
  { key: "history", label: "History" },
];

function safeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function compactId(prefix: string, value: unknown): string {
  const id = Number(value ?? 0);
  return `${prefix}-${String(Number.isFinite(id) ? id : 0).padStart(4, "0")}`;
}

function safeBackendError(error: any): string {
  const message =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Action failed. Please try again.";

  if (
    /SQLSTATE|query|syntax|stack trace|exception|constraint|column|table|server error/i.test(
      String(message)
    )
  ) {
    return "Telemedicine action failed. Please try again or contact the system administrator.";
  }

  return String(message);
}

function safePatientName(item: TelemedicineRequest): string {
  const direct = safeText(getTelemedicinePatientName(item));
  if (direct && direct !== "Patient") return direct;

  const anyItem = item as any;

  return (
    safeText(anyItem.patient_name) ||
    safeText(anyItem.resident?.name) ||
    safeText(anyItem.request?.resident?.name) ||
    "Unknown Patient"
  );
}

function safePatientBarangay(item: TelemedicineRequest): string {
  const anyItem = item as any;

  return (
    safeText(item.resident?.barangay) ||
    safeText(anyItem.barangay) ||
    safeText(anyItem.resident?.barangay_name) ||
    safeText(anyItem.request?.resident?.barangay) ||
    "Barangay not available"
  );
}

function safePatientAgeSex(item: TelemedicineRequest): string {
  const anyItem = item as any;

  const age =
    anyItem.age ??
    anyItem.patient_age ??
    anyItem.resident?.age ??
    anyItem.resident?.patient_age ??
    anyItem.request?.resident?.age ??
    null;

  const sex =
    anyItem.sex ??
    anyItem.gender ??
    anyItem.sex_gender ??
    anyItem.resident?.sex ??
    anyItem.resident?.gender ??
    anyItem.resident?.sex_gender ??
    anyItem.request?.resident?.sex_gender ??
    null;

  const ageText =
    age !== null && age !== undefined && safeText(age) !== ""
      ? `${age} yrs`
      : "";

  const sexText = safeText(sex);

  if (ageText && sexText) return `${ageText} / ${sexText}`;
  if (ageText) return ageText;
  if (sexText) return sexText;

  return "Age / sex not available";
}

function safeComplaint(item: TelemedicineRequest): string {
  const complaint = safeText(getTelemedicineComplaint(item));

  if (complaint) return complaint;

  const anyItem = item as any;

  return (
    safeText(item.chief_complaint) ||
    safeText(anyItem.complaint) ||
    safeText(anyItem.reason) ||
    safeText(item.additional_notes) ||
    "No complaint provided"
  );
}

function normalizeTelemedicineUrgency(
  urgency?: string | null
): NormalizedBadge {
  const value = safeText(urgency).toLowerCase();

  if (value === "emergency") {
    return { label: "Emergency", tone: "danger" };
  }

  if (value === "urgent") {
    return { label: "Urgent", tone: "warning" };
  }

  if (value === "moderate") {
    return { label: "Moderate", tone: "info" };
  }

  return { label: getTelemedicineUrgencyLabel(value || "routine"), tone: "success" };
}

function normalizeTelemedicineRequestStatus(
  status?: string | null
): NormalizedBadge {
  const value = safeText(status).toLowerCase();

  if (value === "completed") {
    return { label: "Completed", tone: "success" };
  }

  if (value === "scheduled") {
    return { label: "Scheduled", tone: "info" };
  }

  if (value === "endorsed_to_doctor") {
    return { label: "Endorsed to Doctor", tone: "info" };
  }

  if (value === "screened" || value === "approved") {
    return { label: "Screened / Approved", tone: "teal" };
  }

  if (value === "screening") {
    return { label: "Screening", tone: "teal" };
  }

  if (value === "rejected") {
    return { label: "Rejected", tone: "danger" };
  }

  if (value === "cancelled" || value === "canceled") {
    return { label: "Cancelled", tone: "danger" };
  }

  return { label: getTelemedicineRequestStatusLabel(value || "pending"), tone: "warning" };
}

function normalizeTelemedicineSessionStatus(
  session?: TelemedicineSession | null,
  requestCompleted = false
): NormalizedBadge {
  const value = safeText(session?.status).toLowerCase();

  if (!session?.id) {
    return { label: "Not scheduled", tone: "neutral" };
  }

  // A completed consultation/request must never display the video session as
  // still "Active" — the call is finished, the record is in History.
  if (requestCompleted && !["cancelled", "canceled", "no_show"].includes(value)) {
    return { label: "Ended", tone: "success" };
  }

  if (value === "active") {
    return { label: "Active", tone: "info" };
  }

  if (value === "waiting" || value === "scheduled") {
    return { label: getTelemedicineSessionStatusLabel(value), tone: "teal" };
  }

  if (value === "paused") {
    return { label: "Paused", tone: "warning" };
  }

  if (value === "ended" || value === "completed") {
    return { label: "Ended", tone: "success" };
  }

  if (value === "no_show") {
    return { label: "No Show", tone: "danger" };
  }

  if (value === "cancelled" || value === "canceled") {
    return { label: "Cancelled", tone: "danger" };
  }

  return { label: "Not scheduled", tone: "neutral" };
}

function getTelemedicineSoapStatus(item: TelemedicineRequest): NormalizedBadge {
  const notes = item.session?.notes;
  const finalized = Boolean(notes?.is_finalized || notes?.finalized_at);
  const sessionStatus = safeText(item.session?.status).toLowerCase();

  if (finalized || item.status === "completed") {
    return { label: "SOAP finalized", tone: "success" };
  }

  if (notes) {
    return { label: "Draft", tone: "info" };
  }

  if (sessionStatus === "ended") {
    return { label: "Needs review", tone: "warning" };
  }

  return { label: "Not started", tone: "neutral" };
}

function getTelemedicineNextStepSafe(item: TelemedicineRequest): string {
  const requestStatus = safeText(item.status).toLowerCase();
  const sessionStatus = safeText(item.session?.status).toLowerCase();
  const soap = getTelemedicineSoapStatus(item);

  if (requestStatus === "completed" || soap.label === "SOAP finalized") {
    return "Record finalized and stored in History";
  }

  if (requestStatus === "pending") {
    return "Screen request";
  }

  if (requestStatus === "screening") {
    return "Complete vitals collection and screen";
  }

  if (requestStatus === "screened") {
    return "Endorse to doctor or schedule session";
  }

  if (requestStatus === "endorsed_to_doctor") {
    return "Waiting for doctor to schedule session";
  }

  if (requestStatus === "scheduled" && !item.session?.id) {
    return "Schedule or start video session";
  }

  if (item.session?.id && ["scheduled", "waiting"].includes(sessionStatus)) {
    return "Start video";
  }

  if (item.session?.id && ["active", "paused"].includes(sessionStatus)) {
    return "Continue SOAP documentation";
  }

  if (item.session?.id && sessionStatus === "ended" && soap.label !== "SOAP finalized") {
    return "Finalize documentation";
  }

  if (requestStatus === "rejected") {
    return "Request rejected";
  }

  if (requestStatus === "cancelled" || requestStatus === "canceled") {
    return "Request cancelled";
  }

  return safeText(getTelemedicineNextStep(item)) || "Review telemedicine request";
}

function formatTelemedicineDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTelemedicineTime(value?: string | null): string {
  if (!value) return "";

  if (/^\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTelemedicineSchedule(item: TelemedicineRequest): string {
  const session = item.session;

  if (!session?.id) return "No session scheduled";

  const date = session.schedule?.date;
  const time = session.schedule?.time;

  if (date || time) {
    return `${formatTelemedicineDate(date)}${time ? ` · ${formatTelemedicineTime(time)}` : ""}`;
  }

  if (session.started_at) {
    return `${formatTelemedicineDate(session.started_at)} · ${formatTelemedicineTime(
      session.started_at
    )}`;
  }

  return "No session scheduled";
}

function isClosedRequest(item: TelemedicineRequest): boolean {
  return (
    isTelemedicineRequestClosed(item) ||
    ["completed", "cancelled", "canceled", "rejected"].includes(
      safeText(item.status).toLowerCase()
    )
  );
}

// The patient's user id for the Patient Profile link, across the shapes a
// telemedicine request carries it in.
function resolveTelemedicinePatientUserId(item: TelemedicineRequest): number | null {
  const candidates = [
    item.resident?.user_id,
    (item as any)?.requested_by_id,
    (item as any)?.requested_by?.user_id,
    (item as any)?.user_id,
  ];
  for (const candidate of candidates) {
    const id = Number(candidate);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

function hasHistory(item: TelemedicineRequest): boolean {
  return Boolean(
    item.status === "completed" ||
      item.session?.ended_at ||
      item.session?.consultation_id ||
      item.session?.consultation?.id ||
      item.session?.notes?.is_finalized
  );
}

function getHistoryUrl(item: TelemedicineRequest): string {
  const consultationId =
    item.session?.consultation_id ||
    item.session?.consultation?.id ||
    null;

  if (consultationId) {
    return `/consultations/${consultationId}`;
  }

  if (item.session?.id) {
    return buildTelemedicineRoomUrl(item.session);
  }

  return "";
}

function getSearchText(item: TelemedicineRequest): string {
  return [
    safePatientName(item),
    safePatientBarangay(item),
    safePatientAgeSex(item),
    safeComplaint(item),
    item.urgency_level,
    item.status,
    item.session?.status,
    getTelemedicineSoapStatus(item).label,
    getTelemedicineNextStepSafe(item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function Telemedicine() {
  const toast = useToast();
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user) as any;
  const userRole = getUserRole(authUser);
  const isScreeningRole = SCREENING_ROLES.has(userRole);
  const isClinicalRole = CLINICAL_ROLES.has(userRole);
  // Global staff can switch RHU; facility-scoped staff are locked to their own.
  const isGlobalRhu = isGlobalRhuRole();
  const [rhuFilter, setRhuFilter] = useState<string>(() => defaultRhuFilter());
  const selectedRhuId = Number(rhuFilter) || 1;
  const selectedRhuLabel = `RHU ${selectedRhuId}`;

  const [requests, setRequests] = useState<TelemedicineRequest[]>([]);
  const [board, setBoard] = useState<TelemedicineBoard>("active");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [urgency, setUrgency] = useState<UrgencyFilter>("all");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<TelemedicineRequest | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getTelemedicineRequests({
        rhu_id: selectedRhuId,
        status,
        urgency_level: urgency,
        board,
      });

      setRequests(data);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(safeBackendError(err));
    } finally {
      setLoading(false);
    }
  }, [status, urgency, board, selectedRhuId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return requests.filter((item) => {
      if (!q) return true;
      return getSearchText(item).includes(q);
    });
  }, [requests, search]);

  const stats = useMemo(() => buildTelemedicineStats(filtered), [filtered]);

  const nextRequest = useMemo(() => {
    return (
      filtered.find(
        (item) =>
          item.urgency_level === "emergency" &&
          !isClosedRequest(item)
      ) ||
      filtered.find(
        (item) =>
          item.urgency_level === "urgent" &&
          !isClosedRequest(item)
      ) ||
      filtered.find((item) => item.status === "pending") ||
      filtered.find((item) => item.status === "scheduled") ||
      null
    );
  }, [filtered]);

  function flash(message: string) {
    setSaved(message);
    window.setTimeout(() => setSaved(""), 3500);
  }

  async function runAction(
    item: TelemedicineRequest,
    action: () => Promise<void>,
    message: string
  ) {
    setActionLoadingId(item.id);
    setError("");

    try {
      await action();
      flash(message);
      await load();
      setSelected((current) => (current?.id === item.id ? null : current));
    } catch (err: any) {
      setError(safeBackendError(err));
    } finally {
      setActionLoadingId(null);
    }
  }

  function openRoom(session: TelemedicineSession) {
    const url = buildTelemedicineRoomUrl(session);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function startSession(item: TelemedicineRequest) {
    const isEmergency = item.urgency_level === "emergency";

    const confirmed = window.confirm(
      isEmergency
        ? `Emergency telemedicine request.\n\nDo not let video call delay urgent RHU or ER care.\n\nContinue for ${safePatientName(
            item
          )}?`
        : `Start online consultation for ${safePatientName(item)}?`
    );

    if (!confirmed) return;

    setActionLoadingId(item.id);
    setError("");

    try {
      const doctorId = await getCurrentUserId();

      let session = item.session;

      if (!session?.id) {
        session = await screenAndScheduleNow(item.id, doctorId);
      }

      const sessionIsClosed = isTelemedicineSessionClosed(session);

      if (sessionIsClosed) {
        openRoom(session);
        flash("Telemedicine room opened for documentation review.");
        await load();
        return;
      }

      const activeSession = await startTelemedicineSessionNow(session.id);

      openRoom({
        ...session,
        ...activeSession,
        session_token: activeSession.session_token || session.session_token,
        session_link: activeSession.session_link || session.session_link,
        consultation_id:
          activeSession.consultation_id || session.consultation_id || null,
      } as TelemedicineSession);

      flash("Telemedicine video session opened.");
      await load();
    } catch (err: any) {
      setError(safeBackendError(err));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function openExistingSession(item: TelemedicineRequest) {
    if (!item.session?.id) {
      toast.warning("This request has no video session yet.");
      return;
    }

    setActionLoadingId(item.id);
    setError("");

    try {
      if (isTelemedicineSessionClosed(item.session)) {
        // The session has already ended — never reopen/rejoin the call. Route
        // straight to the SOAP / consultation-documentation view so the doctor
        // can finish the notes there (where SOAP editing is fully enabled).
        const consultationId =
          item.session.consultation_id ||
          (item.session as any)?.consultation?.id ||
          null;

        if (consultationId) {
          navigate(`/consultations/${consultationId}`);
          return;
        }

        // No linked consultation record yet — fall back to the room, which now
        // shows a "session ended" state (no live video) rather than a call.
        openRoom(item.session);
        flash("Session ended — opened for SOAP documentation review.");
        await load();
        return;
      }

      const activeSession = await startTelemedicineSessionNow(item.session.id);

      openRoom({
        ...item.session,
        ...activeSession,
        session_token: activeSession.session_token || item.session.session_token,
        session_link: activeSession.session_link || item.session.session_link,
        consultation_id:
          activeSession.consultation_id ||
          item.session.consultation_id ||
          null,
      } as TelemedicineSession);

      flash("Video session opened.");
      await load();
    } catch (err: any) {
      setError(safeBackendError(err));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function notifyPatient(item: TelemedicineRequest) {
    const sessionId = item.session?.id;

    if (!sessionId) {
      setError("Start the telemedicine session first, then notify the patient.");
      return;
    }

    setActionLoadingId(item.id);
    setError("");

    try {
      const res = await notifyTelemedicinePatient(sessionId);
      flash(
        (res?.notified
          ? "Patient notified — the room is ready to join."
          : res?.message || "Patient notification sent.") +
          " Reminder: open/start the room as moderator before the patient enters."
      );
    } catch (err: any) {
      setError(safeBackendError(err));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function rejectRequest(item: TelemedicineRequest) {
    const reason = window.prompt(
      "Reason for rejection:",
      "Request is not appropriate for telemedicine. Please visit the RHU for proper assessment."
    );

    if (reason === null) return;

    await runAction(
      item,
      async () => {
        await rejectTelemedicineRequest(item.id, reason.trim());
      },
      "Telemedicine request rejected."
    );
  }

  async function cancelRequest(item: TelemedicineRequest) {
    const reason = window.prompt(
      "Reason for cancellation:",
      "Telemedicine request cancelled by RHU staff."
    );

    if (reason === null) return;

    await runAction(
      item,
      async () => {
        await cancelTelemedicineRequest(item.id, reason.trim());
      },
      "Telemedicine request cancelled."
    );
  }

  async function startScreeningRequest(item: TelemedicineRequest) {
    const confirmed = window.confirm(
      `Start screening for ${safePatientName(item)}?\n\nThis will mark the request as "In Screening".`
    );

    if (!confirmed) return;

    await runAction(
      item,
      async () => {
        await startTelemedicineScreening(item.id);
      },
      "Screening started."
    );
  }

  async function endorseRequest(item: TelemedicineRequest) {
    const doctorIdStr = window.prompt(
      `Endorse ${safePatientName(item)} to doctor.\n\nEnter the Doctor/MHO user ID to endorse to:`
    );

    if (doctorIdStr === null) return;

    const doctorId = parseInt(doctorIdStr.trim(), 10);

    if (!doctorId || isNaN(doctorId)) {
      toast.warning("Please enter a valid doctor user ID.");
      return;
    }

    await runAction(
      item,
      async () => {
        await endorseTelemedicineToDoctor(item.id, doctorId);
      },
      "Request endorsed to doctor. The doctor will be notified."
    );
  }

  async function endSession(item: TelemedicineRequest) {
    if (!item.session?.id) {
      toast.warning("This request has no active video session.");
      return;
    }

    const confirmed = window.confirm(
      "End this video session? Make sure consultation notes are saved."
    );

    if (!confirmed) return;

    await runAction(
      item,
      async () => {
        await endTelemedicineSession(item.session!.id);
      },
      "Telemedicine session ended."
    );
  }

  function openHistory(item: TelemedicineRequest) {
    const url = getHistoryUrl(item);

    if (!url) {
      toast.warning("No history or consultation record is linked to this request yet.");
      return;
    }

    if (url.startsWith("/")) {
      navigate(url);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="no-page-overflow" style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Ka-Agapay {selectedRhuLabel} Telemedicine</div>
          <h1 style={heroTitleStyle}>Telemedicine Management</h1>
          <p style={heroSubtitleStyle}>
            Screen {selectedRhuLabel} online consultation requests, open video sessions, track
            request progress, and safely complete SOAP documentation.
          </p>

          <div style={heroMetaStyle}>
            <span>{selectedRhuLabel} only</span>
            <span>Total shown: {filtered.length}</span>
            <span>
              Last updated:{" "}
              {lastUpdated
                ? new Date(lastUpdated).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </div>
        </div>

        <div style={nextCardStyle}>
          <small>Next Action</small>
          <strong>
            {nextRequest
              ? safePatientName(nextRequest)
              : "No pending telemedicine action"}
          </strong>
          <span>
            {nextRequest
              ? getTelemedicineNextStepSafe(nextRequest)
              : `New ${selectedRhuLabel} online consultation requests will appear here.`}
          </span>
        </div>
      </section>

      {saved ? (
        <div style={successStyle}>
          <CheckCircle2 size={18} />
          {saved}
        </div>
      ) : null}

      {error ? (
        <div style={errorStyle}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section style={stepsGridStyle}>
        <Step number="1" title="Screen" body="Check complaint and urgency." />
        <Step
          number="2"
          title="Start Video"
          body="Open only when staff is ready."
        />
        <Step
          number="3"
          title="Document"
          body="Complete SOAP and consultation record."
        />
      </section>

      <section style={statsGridStyle}>
        <Stat
          icon={<ClipboardList size={22} />}
          label="Total"
          value={stats.total}
          hint={`Requests in current ${selectedRhuLabel} view`}
        />
        <Stat
          icon={<Clock size={22} />}
          label="Pending"
          value={stats.pending}
          hint="Needs screening"
        />
        <Stat
          icon={<Video size={22} />}
          label="Active"
          value={stats.active}
          hint="Ongoing sessions"
        />
        <Stat
          icon={<AlertTriangle size={22} />}
          label="Urgent/Emergency"
          value={stats.urgent + stats.emergency}
          hint="Needs careful triage"
        />
      </section>

      <div className="status-tabs" style={boardTabsWrapStyle}>
        {BOARD_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`status-tab${board === tab.key ? " active" : ""}`}
            onClick={() => setBoard(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <span style={boardHintStyle}>
          {board === "active"
            ? "Pending, scheduled, active and needs-SOAP records."
            : board === "needs_soap"
            ? "Ended sessions awaiting SOAP finalization."
            : board === "completed"
            ? "Recently completed online consultations."
            : "Completed and closed telemedicine history."}
        </span>
      </div>

      <section style={toolbarStyle}>
        <div style={toolbarSearchStyle}>
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search patient, complaint, urgency..."
            style={toolbarSearchInputStyle}
          />
        </div>

        <label style={isGlobalRhu ? toolbarSelectFieldStyle : toolbarRhuFieldStyle}>
          <span>Facility</span>
          {isGlobalRhu ? (
            <select
              value={rhuFilter}
              onChange={(event) => setRhuFilter(event.target.value)}
              style={toolbarInputStyle}
            >
              {RHU_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <div style={lockedRhuStyle}>{selectedRhuLabel} only</div>
          )}
        </label>

        <label style={toolbarSelectFieldStyle}>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            style={toolbarInputStyle}
          >
            <option value="all">All Requests</option>
            <option value="pending">Pending</option>
            <option value="screening">Screening</option>
            <option value="screened">Screened / Approved</option>
            <option value="endorsed_to_doctor">Endorsed to Doctor</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <label style={toolbarSelectFieldStyle}>
          <span>Urgency</span>
          <select
            value={urgency}
            onChange={(event) => setUrgency(event.target.value as UrgencyFilter)}
            style={toolbarInputStyle}
          >
            <option value="all">All Urgency</option>
            <option value="routine">Routine</option>
            <option value="moderate">Moderate</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
        </label>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={refreshButtonStyle}
        >
          <RefreshCw size={18} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      <section style={boardStyle}>
        <div style={boardHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Telemedicine Request Board</h2>
            <p style={mutedTextStyle}>
              Review online consultation requests, screening status, session
              progress, SOAP documentation, and next action.
            </p>
          </div>

          <Stethoscope size={24} />
        </div>

        {loading ? (
          <div style={emptyStyle}>
            <RefreshCw size={28} />
            <strong>Loading telemedicine requests...</strong>
            <span>Please wait while {selectedRhuLabel} requests are loaded.</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={emptyStyle}>
            <Video size={28} />
            {search.trim() ? (
              <>
                <strong>No telemedicine requests match your search.</strong>
                <span>Try a different patient name, complaint, or urgency.</span>
              </>
            ) : (
              <>
                <strong>No {selectedRhuLabel} telemedicine requests yet.</strong>
                <span>Online consultation requests will appear here.</span>
              </>
            )}
          </div>
        ) : (
          <div className="responsive-table" style={tableWrapStyle}>
            <table style={tableStyle}>
              <colgroup>
                <col style={{ width: 190 }} />
                <col style={{ width: 230 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 196 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 184 }} />
              </colgroup>

              <thead>
                <tr>
                  <th style={thStyle}>Patient</th>
                  <th style={thStyle}>Chief Complaint</th>
                  <th style={thStyle}>Urgency</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Progress / Next Step</th>
                  <th style={thStyle}>Schedule</th>
                  <th style={thStickyRightStyle}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((item) => {
                  const urgencyBadge = normalizeTelemedicineUrgency(
                    item.urgency_level
                  );
                  const requestBadge = normalizeTelemedicineRequestStatus(
                    item.status
                  );
                  const sessionBadge = normalizeTelemedicineSessionStatus(
                    item.session,
                    item.status === "completed"
                  );
                  const soapBadge = getTelemedicineSoapStatus(item);
                  const complaint = safeComplaint(item);
                  const nextStep = getTelemedicineNextStepSafe(item);

                  return (
                    <tr key={item.id} style={trStyle}>
                      <td style={tdStyle}>
                        <div style={cellPrimaryStyle}>
                          {safePatientName(item)}
                        </div>
                        <div style={cellMutedStyle}>
                          {safePatientAgeSex(item)}
                        </div>
                        <div style={cellMutedStyle}>
                          {safePatientBarangay(item)}
                        </div>
                        <div style={requestIdStyle}>
                          {compactId("TEL", item.id)}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div
                          style={clampTwoStyle}
                          title={complaint}
                        >
                          {complaint}
                        </div>
                        <button
                          type="button"
                          style={linkButtonStyle}
                          onClick={() => setSelected(item)}
                        >
                          <Eye size={13} />
                          View details
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <StatusPill
                          label={urgencyBadge.label}
                          tone={urgencyBadge.tone}
                        />
                      </td>

                      {/* Combined Status: request status + session status */}
                      <td style={tdStyle}>
                        <div style={pillStackStyle}>
                          <StatusPill
                            label={requestBadge.label}
                            tone={requestBadge.tone}
                          />
                          <StatusPill
                            label={sessionBadge.label}
                            tone={sessionBadge.tone}
                          />
                        </div>
                      </td>

                      {/* Combined Progress / Next Step: SOAP status + next action */}
                      <td style={tdStyle}>
                        <StatusPill
                          label={soapBadge.label}
                          tone={soapBadge.tone}
                        />
                        <div
                          style={{ ...clampTwoStyle, ...cellMutedStyle, marginTop: 6 }}
                          title={nextStep}
                        >
                          {nextStep}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={cellPrimaryStyle}>
                          {formatTelemedicineDate(item.created_at)}
                        </div>
                        <div style={cellMutedStyle}>
                          {formatTelemedicineSchedule(item)}
                        </div>
                      </td>

                      <td style={tdStickyRightStyle}>
                        <ActionButtons
                          item={item}
                          busy={actionLoadingId === item.id}
                          isScreeningRole={isScreeningRole}
                          isClinicalRole={isClinicalRole}
                          onView={() => setSelected(item)}
                          onStartScreening={() => startScreeningRequest(item)}
                          onEndorse={() => endorseRequest(item)}
                          onStart={() => startSession(item)}
                          onOpenSession={() => openExistingSession(item)}
                          onReject={() => rejectRequest(item)}
                          onCancel={() => cancelRequest(item)}
                          onEnd={() => endSession(item)}
                          onHistory={() => openHistory(item)}
                          onNotify={() => notifyPatient(item)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DetailsModal
        item={selected}
        busy={selected ? actionLoadingId === selected.id : false}
        isScreeningRole={isScreeningRole}
        isClinicalRole={isClinicalRole}
        onClose={() => setSelected(null)}
        onStartScreening={selected ? () => startScreeningRequest(selected) : undefined}
        onEndorse={selected ? () => endorseRequest(selected) : undefined}
        onStart={selected ? () => startSession(selected) : undefined}
        onOpenSession={selected ? () => openExistingSession(selected) : undefined}
        onReject={selected ? () => rejectRequest(selected) : undefined}
        onCancel={selected ? () => cancelRequest(selected) : undefined}
        onEnd={selected ? () => endSession(selected) : undefined}
        onHistory={selected ? () => openHistory(selected) : undefined}
        onNotify={selected ? () => notifyPatient(selected) : undefined}
        onViewProfile={
          selected && resolveTelemedicinePatientUserId(selected)
            ? () => navigate(`/patients/${resolveTelemedicinePatientUserId(selected)}`)
            : undefined
        }
      />
    </div>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div style={stepCardStyle}>
      <div style={stepNumberStyle}>{number}</div>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div style={statCardStyle}>
      <div style={statIconStyle}>{icon}</div>
      <div>
        <span style={statLabelStyle}>{label}</span>
        <strong style={statValueStyle}>{value}</strong>
        <small style={statHintStyle}>{hint}</small>
      </div>
    </div>
  );
}

function StatusPill({ label, tone }: NormalizedBadge) {
  const toneStyle =
    tone === "success"
      ? badgeSuccessStyle
      : tone === "warning"
      ? badgeWarningStyle
      : tone === "danger"
      ? badgeDangerStyle
      : tone === "info"
      ? badgeInfoStyle
      : tone === "teal"
      ? badgeTealStyle
      : badgeNeutralStyle;

  return <span style={{ ...badgeBaseStyle, ...toneStyle }}>{label}</span>;
}

function ActionButtons({
  item,
  busy,
  isScreeningRole,
  isClinicalRole,
  onView,
  onStartScreening,
  onEndorse,
  onStart,
  onOpenSession,
  onReject,
  onCancel,
  onEnd,
  onHistory,
  onNotify,
}: {
  item: TelemedicineRequest;
  busy: boolean;
  isScreeningRole: boolean;
  isClinicalRole: boolean;
  onView: () => void;
  onStartScreening: () => void;
  onEndorse: () => void;
  onStart: () => void;
  onOpenSession: () => void;
  onReject: () => void;
  onCancel: () => void;
  onEnd: () => void;
  onHistory: () => void;
  onNotify: () => void;
}) {
  const closed = isClosedRequest(item);
  const requestStatus = safeText(item.status).toLowerCase();
  const sessionStatus = safeText(item.session?.status).toLowerCase();
  const soap = getTelemedicineSoapStatus(item);
  const hasSession = Boolean(item.session?.id);
  const showHistory = hasHistory(item);

  // Level 1 screening role actions
  const canStartScreening =
    isScreeningRole && !closed && requestStatus === "pending";
  const canCompleteScreening =
    isScreeningRole && !closed && requestStatus === "screening";
  const canEndorse =
    isScreeningRole && !closed &&
    ["screening", "screened"].includes(requestStatus);

  // Level 2 clinical role actions
  const canCreateSession =
    isClinicalRole && !closed && !hasSession &&
    ["screened", "endorsed_to_doctor"].includes(requestStatus);
  const canStartVideo =
    !closed && hasSession && ["scheduled", "waiting"].includes(sessionStatus);
  const canOpenRoom =
    !closed && hasSession && ["active", "paused"].includes(sessionStatus);
  const canContinueSoap =
    !closed && hasSession && soap.label !== "SOAP finalized" &&
    (sessionStatus === "ended" || soap.label === "Draft" || soap.label === "Needs review");
  const canEnd = hasSession && ["active", "paused", "waiting"].includes(sessionStatus);

  const canReject =
    !closed && ["pending", "screening", "screened", "endorsed_to_doctor"].includes(requestStatus);
  const canCancel = !closed;

  // Single primary action by priority
  const primary = canOpenRoom
    ? { label: "Open Room", icon: <Video size={14} />, onClick: onOpenSession, style: primaryButtonStyle }
    : canContinueSoap
    ? { label: "Continue SOAP", icon: <FileText size={14} />, onClick: onOpenSession, style: primaryButtonStyle }
    : canStartVideo
    ? { label: "Start Video", icon: <Video size={14} />, onClick: onOpenSession, style: primaryButtonStyle }
    : canCreateSession
    ? { label: "Screen / Start", icon: <PlayCircle size={14} />, onClick: onStart, style: primaryButtonStyle }
    : canCompleteScreening
    ? { label: "Complete Screening", icon: <PlayCircle size={14} />, onClick: onStart, style: primaryButtonStyle }
    : canStartScreening
    ? { label: "Start Screening", icon: <PlayCircle size={14} />, onClick: onStartScreening, style: primaryButtonStyle }
    : { label: "View Details", icon: <Eye size={14} />, onClick: onView, style: secondaryButtonStyle };

  const menuItems: ActionItem[] = [
    {
      label: "Endorse to Doctor",
      icon: <Stethoscope size={15} />,
      onClick: onEndorse,
      disabled: busy,
      hidden: !canEndorse,
    },
    {
      label: "Notify Patient",
      icon: <BellRing size={15} />,
      onClick: onNotify,
      disabled: busy,
      hidden: closed || !hasSession,
    },
    {
      label: "View Details",
      icon: <Eye size={15} />,
      onClick: onView,
      disabled: busy,
      hidden: primary.label === "View Details",
    },
    {
      label: "View History",
      icon: <History size={15} />,
      onClick: onHistory,
      disabled: busy,
      hidden: !showHistory,
    },
    {
      label: "End Session",
      icon: <Clock size={15} />,
      onClick: onEnd,
      disabled: busy,
      hidden: !canEnd,
    },
    {
      label: "Reject",
      icon: <XCircle size={15} />,
      onClick: onReject,
      danger: true,
      disabled: busy,
      hidden: !canReject,
    },
    {
      label: "Cancel",
      icon: <X size={15} />,
      onClick: onCancel,
      danger: true,
      disabled: busy,
      hidden: !canCancel,
    },
  ];

  return (
    <div style={actionCellStyle}>
      <button
        type="button"
        style={{ ...primary.style, opacity: busy ? 0.6 : 1 }}
        onClick={primary.onClick}
        disabled={busy}
      >
        {primary.icon}
        {primary.label}
      </button>

      <ActionMenu items={menuItems} label="More actions" />
    </div>
  );
}

function DetailsModal({
  item,
  busy,
  isScreeningRole,
  isClinicalRole,
  onClose,
  onStartScreening,
  onEndorse,
  onStart,
  onOpenSession,
  onReject,
  onCancel,
  onEnd,
  onHistory,
  onNotify,
  onViewProfile,
}: {
  item: TelemedicineRequest | null;
  busy: boolean;
  isScreeningRole: boolean;
  isClinicalRole: boolean;
  onClose: () => void;
  onStartScreening?: () => void;
  onEndorse?: () => void;
  onStart?: () => void;
  onOpenSession?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onEnd?: () => void;
  onHistory?: () => void;
  onNotify?: () => void;
  onViewProfile?: () => void;
}) {
  if (!item) return null;

  const urgency = normalizeTelemedicineUrgency(item.urgency_level);
  const requestStatus = normalizeTelemedicineRequestStatus(item.status);
  const sessionStatus = normalizeTelemedicineSessionStatus(
    item.session,
    item.status === "completed"
  );
  const soap = getTelemedicineSoapStatus(item);
  const complaint = safeComplaint(item);
  const nextStep = getTelemedicineNextStepSafe(item);
  const itemStatusLower = safeText(item.status).toLowerCase();
  const vitals = (item as any).screening?.vitals ?? null;
  const endorsement = (item as any).endorsement ?? null;

  return (
    <div style={modalBackdropStyle}>
      <section style={modalStyle}>
        <div style={modalHeaderStyle}>
          <div>
            <div style={eyebrowDarkStyle}>Telemedicine Details</div>
            <h2 style={modalTitleStyle}>{safePatientName(item)}</h2>
            <p style={modalSubtitleStyle}>{compactId("TEL", item.id)}</p>
          </div>

          <button type="button" style={modalCloseButtonStyle} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={detailGridStyle}>
          <Detail label="Patient" value={safePatientName(item)} />
          <Detail label="Age / Sex" value={safePatientAgeSex(item)} />
          <Detail label="Barangay" value={safePatientBarangay(item)} />
          <Detail label="Created" value={formatTelemedicineDate(item.created_at)} />
          <Detail label="Schedule" value={formatTelemedicineSchedule(item)} />
          <Detail label="Next Step" value={nextStep} wide />
        </div>

        <div style={modalBadgeRowStyle}>
          <StatusPill label={urgency.label} tone={urgency.tone} />
          <StatusPill label={requestStatus.label} tone={requestStatus.tone} />
          <StatusPill label={sessionStatus.label} tone={sessionStatus.tone} />
          <StatusPill label={soap.label} tone={soap.tone} />
        </div>

        <div style={fullTextBoxStyle}>
          <strong>Chief Complaint</strong>
          <p>{complaint}</p>
        </div>

        {safeText(item.screening?.screening_notes) ? (
          <div style={fullTextBoxStyle}>
            <strong>Screening Notes</strong>
            <p>{item.screening?.screening_notes}</p>
          </div>
        ) : null}

        {vitals && (vitals.temperature || vitals.blood_pressure || vitals.heart_rate || vitals.respiratory_rate) ? (
          <div style={fullTextBoxStyle}>
            <strong>Vitals (at screening)</strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginTop: 6 }}>
              {vitals.temperature ? <span>Temp: {vitals.temperature} °C</span> : null}
              {vitals.blood_pressure ? <span>BP: {vitals.blood_pressure}</span> : null}
              {vitals.heart_rate ? <span>HR: {vitals.heart_rate} bpm</span> : null}
              {vitals.respiratory_rate ? <span>RR: {vitals.respiratory_rate} /min</span> : null}
            </div>
          </div>
        ) : null}

        {endorsement?.endorsed_to?.name ? (
          <div style={fullTextBoxStyle}>
            <strong>Endorsed To</strong>
            <p>{endorsement.endorsed_to.name}{endorsement.endorsed_at ? ` · ${formatTelemedicineDate(endorsement.endorsed_at)}` : ""}</p>
          </div>
        ) : null}

        <div style={modalActionsStyle}>
          {onViewProfile ? (
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={onViewProfile}
              disabled={busy}
            >
              <User size={15} />
              View Patient Profile
            </button>
          ) : null}

          {onHistory && hasHistory(item) ? (
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={onHistory}
              disabled={busy}
            >
              <History size={15} />
              View History
            </button>
          ) : null}

          {isScreeningRole && !isClosedRequest(item) && itemStatusLower === "pending" && onStartScreening ? (
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={onStartScreening}
              disabled={busy}
            >
              <PlayCircle size={15} />
              Start Screening
            </button>
          ) : null}

          {isScreeningRole && !isClosedRequest(item) &&
           ["screening", "screened"].includes(itemStatusLower) && onEndorse ? (
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={onEndorse}
              disabled={busy}
            >
              <Stethoscope size={15} />
              Endorse to Doctor
            </button>
          ) : null}

          {!isClosedRequest(item) && !item.session?.id && onStart &&
           (isClinicalRole || (!isScreeningRole && !isClinicalRole)) ? (
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={onStart}
              disabled={busy}
            >
              <PlayCircle size={15} />
              {["screened", "endorsed_to_doctor"].includes(itemStatusLower)
                ? "Schedule Session"
                : "Screen / Start"}
            </button>
          ) : null}

          {item.session?.id && onOpenSession ? (
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={onOpenSession}
              disabled={busy}
            >
              <Video size={15} />
              Open Room / SOAP
            </button>
          ) : null}

          {item.session?.id && !isClosedRequest(item) && onNotify ? (
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={onNotify}
              disabled={busy}
              title="Send the resident a push + in-app notification that the room is ready"
            >
              <BellRing size={15} />
              Notify Patient
            </button>
          ) : null}

          {item.session?.id &&
          ["active", "paused", "waiting"].includes(
            safeText(item.session?.status).toLowerCase()
          ) &&
          onEnd ? (
            <button
              type="button"
              style={warningButtonStyle}
              onClick={onEnd}
              disabled={busy}
            >
              <Clock size={15} />
              End Session
            </button>
          ) : null}

          {!isClosedRequest(item) &&
          ["pending", "screened"].includes(safeText(item.status).toLowerCase()) &&
          onReject ? (
            <button
              type="button"
              style={dangerGhostButtonStyle}
              onClick={onReject}
              disabled={busy}
            >
              <XCircle size={15} />
              Reject
            </button>
          ) : null}

          {!isClosedRequest(item) && onCancel ? (
            <button
              type="button"
              style={dangerGhostButtonStyle}
              onClick={onCancel}
              disabled={busy}
            >
              <X size={15} />
              Cancel
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div style={wide ? detailWideStyle : detailStyle}>
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100%",
  minWidth: 0,
  maxWidth: "100%",
  overflowX: "hidden",
  padding: 24,
  background:
    "radial-gradient(circle at top left, rgba(20,184,166,.12), transparent 32%), linear-gradient(180deg, #F8FAFC 0%, #EEF2F7 100%)",
  display: "flex",
  flexDirection: "column",
  gap: 20,
  color: "#0F172A",
};

const heroStyle: CSSProperties = {
  borderRadius: 30,
  padding: 30,
  background:
    "linear-gradient(135deg, rgba(15,118,110,.98), rgba(13,148,136,.92))",
  color: "#FFFFFF",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
  gap: 24,
  alignItems: "stretch",
  boxShadow: "0 24px 60px rgba(15,118,110,.22)",
};

const boardTabsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  rowGap: 8,
};

const boardHintStyle: CSSProperties = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
  marginLeft: 4,
};

const eyebrowStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  background: "rgba(255,255,255,.16)",
  color: "#FFFFFF",
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const eyebrowDarkStyle: CSSProperties = {
  color: "#0F766E",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const heroTitleStyle: CSSProperties = {
  margin: "14px 0 8px",
  fontSize: 42,
  lineHeight: 1,
  letterSpacing: "-.05em",
};

const heroSubtitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: 780,
  color: "rgba(255,255,255,.88)",
  lineHeight: 1.7,
  fontSize: 15,
};

const heroMetaStyle: CSSProperties = {
  marginTop: 18,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 9,
  fontSize: 13,
  fontWeight: 800,
  color: "rgba(255,255,255,.9)",
};

const nextCardStyle: CSSProperties = {
  borderRadius: 24,
  padding: 18,
  background: "rgba(255,255,255,.14)",
  border: "1px solid rgba(255,255,255,.22)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  justifyContent: "center",
  minWidth: 0,
};

const successStyle: CSSProperties = {
  borderRadius: 18,
  padding: "13px 16px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 800,
  color: "#166534",
  background: "#DCFCE7",
  border: "1px solid #BBF7D0",
};

const errorStyle: CSSProperties = {
  borderRadius: 18,
  padding: "13px 16px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 800,
  color: "#B91C1C",
  background: "#FEF2F2",
  border: "1px solid #FECACA",
};

const stepsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
  gap: 14,
};

const stepCardStyle: CSSProperties = {
  borderRadius: 20,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  padding: 16,
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  boxShadow: "0 16px 34px rgba(15,23,42,.05)",
};

const stepNumberStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 13,
  background: "#0F766E",
  color: "#FFFFFF",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  flex: "0 0 auto",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
  gap: 14,
};

const statCardStyle: CSSProperties = {
  borderRadius: 22,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  padding: 17,
  display: "flex",
  alignItems: "center",
  gap: 13,
  boxShadow: "0 16px 34px rgba(15,23,42,.05)",
};

const statIconStyle: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 16,
  background: "#ECFDF5",
  color: "#0F766E",
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
};

const statLabelStyle: CSSProperties = {
  display: "block",
  color: "#64748B",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const statValueStyle: CSSProperties = {
  display: "block",
  color: "#0F172A",
  fontSize: 30,
  lineHeight: 1,
  marginTop: 4,
};

const statHintStyle: CSSProperties = {
  display: "block",
  color: "#64748B",
  fontWeight: 700,
  marginTop: 5,
};

const toolbarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))",
  alignItems: "end",
  gap: 12,
  padding: 16,
  borderRadius: 24,
  background: "rgba(255,255,255,.94)",
  border: "1px solid #E2E8F0",
  boxShadow: "0 18px 42px rgba(15,23,42,.06)",
};

const toolbarSearchStyle: CSSProperties = {
  height: 44,
  border: "1px solid #CBD5E1",
  borderRadius: 15,
  background: "#FFFFFF",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 12px",
};

const toolbarSearchInputStyle: CSSProperties = {
  border: 0,
  outline: "none",
  width: "100%",
  fontWeight: 700,
  color: "#0F172A",
};

const toolbarSelectFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "#64748B",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const toolbarRhuFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "#64748B",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const toolbarInputStyle: CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  padding: "0 12px",
  fontWeight: 800,
  color: "#0F172A",
  outline: "none",
  textTransform: "none",
  letterSpacing: 0,
};

const lockedRhuStyle: CSSProperties = {
  height: 44,
  borderRadius: 999,
  border: "1px solid #99F6E4",
  background: "#ECFDF5",
  color: "#0F766E",
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  fontWeight: 900,
  textTransform: "none",
  letterSpacing: 0,
};

const refreshButtonStyle: CSSProperties = {
  height: 44,
  border: 0,
  borderRadius: 999,
  padding: "0 16px",
  background: "#0F766E",
  color: "#FFFFFF",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
};

const boardStyle: CSSProperties = {
  borderRadius: 18,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  padding: 18,
  boxShadow: "0 18px 42px rgba(15,23,42,.06)",
  minWidth: 0,
  overflow: "hidden",
};

const boardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 16,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 20,
  letterSpacing: "-.03em",
};

const mutedTextStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748B",
  fontWeight: 700,
  lineHeight: 1.5,
};

const tableWrapStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  borderRadius: 16,
  border: "1px solid #E2E8F0",
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: 1080,
  borderCollapse: "collapse",
  tableLayout: "fixed",
  background: "#FFFFFF",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "13px 12px",
  background: "#F8FAFC",
  color: "#475569",
  borderBottom: "1px solid #E2E8F0",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const thRightStyle: CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const trStyle: CSSProperties = {
  borderBottom: "1px solid #F1F5F9",
};

const tdStyle: CSSProperties = {
  padding: "14px 12px",
  verticalAlign: "top",
  color: "#0F172A",
  fontSize: 13,
  fontWeight: 700,
  overflow: "hidden",
};

const tdRightStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};

const cellPrimaryStyle: CSSProperties = {
  color: "#0F172A",
  fontWeight: 950,
  lineHeight: 1.35,
};

const cellMutedStyle: CSSProperties = {
  color: "#64748B",
  fontWeight: 700,
  fontSize: 12,
  marginTop: 4,
  lineHeight: 1.35,
};

const requestIdStyle: CSSProperties = {
  display: "inline-flex",
  marginTop: 7,
  padding: "4px 7px",
  borderRadius: 999,
  background: "#F1F5F9",
  color: "#475569",
  fontSize: 11,
  fontWeight: 900,
};

const clampTwoStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  lineHeight: 1.45,
  color: "#0F172A",
  maxWidth: "100%",
};

const linkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginTop: 8,
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
  color: "#0F766E",
  fontWeight: 800,
  fontSize: 12.5,
  padding: "5px 12px",
  borderRadius: 999,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  maxWidth: "100%",
  borderRadius: 999,
  padding: "6px 9px",
  fontSize: 11,
  fontWeight: 950,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
  textAlign: "center",
};

const badgeSuccessStyle: CSSProperties = {
  background: "#DCFCE7",
  color: "#166534",
  border: "1px solid #BBF7D0",
};

const badgeWarningStyle: CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  border: "1px solid #FDE68A",
};

const badgeDangerStyle: CSSProperties = {
  background: "#FEE2E2",
  color: "#991B1B",
  border: "1px solid #FECACA",
};

const badgeInfoStyle: CSSProperties = {
  background: "#DBEAFE",
  color: "#1D4ED8",
  border: "1px solid #BFDBFE",
};

const badgeTealStyle: CSSProperties = {
  background: "#CCFBF1",
  color: "#0F766E",
  border: "1px solid #99F6E4",
};

const badgeNeutralStyle: CSSProperties = {
  background: "#F1F5F9",
  color: "#334155",
  border: "1px solid #CBD5E1",
};

const actionCellStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 7,
};

// Two status pills stacked (request status + session status) in one column.
const pillStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 5,
};

// Sticky right-hand Actions column so the primary action + More menu are always
// visible even if the table needs to scroll horizontally on small screens.
const thStickyRightStyle: CSSProperties = {
  ...thStyle,
  textAlign: "right",
  position: "sticky",
  right: 0,
  zIndex: 2,
  background: "#F8FAFC",
  boxShadow: "-8px 0 12px -8px rgba(15,23,42,0.12)",
};

const tdStickyRightStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  position: "sticky",
  right: 0,
  zIndex: 1,
  background: "#FFFFFF",
  boxShadow: "-8px 0 12px -8px rgba(15,23,42,0.10)",
};

const actionButtonBaseStyle: CSSProperties = {
  borderRadius: 999,
  minHeight: 32,
  padding: "7px 10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  border: "1px solid transparent",
  whiteSpace: "nowrap",
};

const primaryButtonStyle: CSSProperties = {
  ...actionButtonBaseStyle,
  background: "#0F766E",
  color: "#FFFFFF",
  borderColor: "#0F766E",
};

const secondaryButtonStyle: CSSProperties = {
  ...actionButtonBaseStyle,
  // Tinted teal (was plain white) so secondary actions like "View Details"
  // read as clearly clickable, while still ranking below the filled primary.
  background: "#F0FDFA",
  color: "#0F766E",
  borderColor: "#5EEAD4",
};

const warningButtonStyle: CSSProperties = {
  ...actionButtonBaseStyle,
  background: "#FFFBEB",
  color: "#92400E",
  borderColor: "#FDE68A",
};

const dangerGhostButtonStyle: CSSProperties = {
  ...actionButtonBaseStyle,
  background: "#FFFFFF",
  color: "#B91C1C",
  borderColor: "#FECACA",
};

const busyTextStyle: CSSProperties = {
  width: "100%",
  color: "#64748B",
  fontSize: 12,
  fontWeight: 800,
};

const emptyStyle: CSSProperties = {
  minHeight: 240,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px dashed #CBD5E1",
  color: "#64748B",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: 8,
  padding: 24,
};

const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.48)",
  zIndex: 80,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "min(880px, 96vw)",
  maxHeight: "90vh",
  overflowY: "auto",
  borderRadius: 18,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  boxShadow: "0 32px 80px rgba(15,23,42,.28)",
  padding: 22,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  marginBottom: 16,
};

const modalTitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#0F172A",
  fontSize: 26,
  letterSpacing: "-.04em",
};

const modalSubtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748B",
  fontWeight: 800,
};

const modalCloseButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 999,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  color: "#334155",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  flex: "0 0 auto",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(160px, 1fr))",
  gap: 10,
};

const detailStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const detailWideStyle: CSSProperties = {
  ...detailStyle,
  gridColumn: "1 / -1",
};

const modalBadgeRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 14,
};

const fullTextBoxStyle: CSSProperties = {
  marginTop: 14,
  borderRadius: 14,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  padding: 14,
  color: "#0F172A",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const modalActionsStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "flex-end",
};
