// src/pages/Queue.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  PhoneCall,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

import {
  callNextInQueue,
  callPriorityNextInQueue,
  DEFAULT_QUEUE_SERVICE_TYPE,
  getLiveQueue,
  getQueueSummary,
  getServiceLabel,
  isGlobalRhuRole,
  QUEUE_SERVICE_OPTIONS,
  startQueueService,
  updateQueueTicketStatus,
  type QueueServiceType,
  type QueueStatus,
  type QueueSummary,
  type QueueTicket,
} from "../services/queue";
import { t } from "../i18n/translations";
import { useLangStore } from "../store/langStore";
import { useToast } from "../contexts/ToastContext";
import WalkInPatientModal from "../components/queue/WalkInPatientModal";

type StatusFilter =
  | "active"
  | "all"
  | "waiting"
  | "called"
  | "in_service"
  | "completed"
  | "skipped"
  | "no_show"
  | "cancelled";

const ACTIVE_STATUSES = ["waiting", "called", "now_calling", "in_service", "serving"];
const SERVING_STATUSES = ["called", "now_calling", "in_service", "serving"];

function isCalledStatus(status?: QueueStatus): boolean {
  return ["called", "now_calling"].includes(String(status ?? "").toLowerCase());
}

function isInServiceStatus(status?: QueueStatus): boolean {
  return ["in_service", "serving"].includes(String(status ?? "").toLowerCase());
}

function isServingStatus(status?: QueueStatus): boolean {
  return isCalledStatus(status) || isInServiceStatus(status);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMinutes(value?: number | null): string {
  const minutes = toNumber(value, 0);

  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);

  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function formatTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeLiveWait(ticket: QueueTicket): number {
  if (
    typeof ticket.current_wait_minutes === "number" &&
    Number.isFinite(ticket.current_wait_minutes)
  ) {
    return ticket.current_wait_minutes;
  }

  if (
    typeof ticket.wait_time_minutes === "number" &&
    Number.isFinite(ticket.wait_time_minutes)
  ) {
    return ticket.wait_time_minutes;
  }

  if (!ticket.issued_at) return 0;

  const issued = new Date(ticket.issued_at);

  if (Number.isNaN(issued.getTime())) return 0;

  return Math.max(0, Math.round((Date.now() - issued.getTime()) / 60000));
}

function isPriorityTicket(ticket: QueueTicket): boolean {
  const category = String(ticket.priority_category ?? "").toLowerCase();
  const level = String(ticket.priority_level ?? "").toLowerCase();
  const score = toNumber(ticket.priority_score, 0);

  return (
    Boolean(ticket.is_emergency) ||
    Boolean(ticket.is_senior) ||
    Boolean(ticket.is_pregnant) ||
    Boolean(ticket.is_pwd) ||
    Boolean(ticket.is_pediatric) ||
    Boolean(ticket.is_bhw_endorsed) ||
    (category !== "" && category !== "regular") ||
    ["critical", "high", "moderate"].includes(level) ||
    score >= 35
  );
}

function priorityLabel(ticket: QueueTicket): string {
  if (ticket.priority_display_label) return ticket.priority_display_label;
  if (ticket.is_emergency) return "Emergency";
  if (ticket.is_pregnant) return "Pregnant";
  if (ticket.is_senior) return "Senior";
  if (ticket.is_pwd) return "PWD";
  if (ticket.is_pediatric) return "Pediatric";
  if (ticket.is_bhw_endorsed) return "BHW Endorsed";

  const category = String(ticket.priority_category ?? "regular");

  if (!category || category === "regular") return "Regular";

  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function priorityLevelLabel(ticket: QueueTicket): string {
  const level = String(ticket.priority_level || "").toLowerCase();
  const score = toNumber(ticket.priority_score, 0);

  if (["critical", "urgent"].includes(level) || score >= 80 || ticket.is_emergency) {
    return "Urgent";
  }
  if (level === "high" || score >= 60) return "High";
  if (level === "moderate" || score >= 35 || isPriorityTicket(ticket)) {
    return "Moderate";
  }
  return "Low";
}

function priorityReason(ticket: QueueTicket): string {
  return (
    ticket.priority_reason ||
    (isPriorityTicket(ticket)
      ? "Priority flag from queue record"
      : "Regular queue order")
  );
}

function patientAgeLabel(ticket: QueueTicket): string {
  return ticket.patient_age_label || "Age not available";
}

function patientBarangayLabel(ticket: QueueTicket): string {
  return ticket.patient_barangay || "Barangay not available";
}

function complaintLabel(ticket: QueueTicket): string {
  return ticket.chief_complaint || ticket.service_label || getServiceLabel(ticket.service_type);
}

function sourceLabel(source?: string | null): string {
  const value = String(source ?? "walk_in").toLowerCase();

  if (value === "online_appointment") return "Online Booking";
  if (value === "walk_in") return "Walk-in";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(status?: QueueStatus): string {
  switch (status) {
    case "waiting":
      return "Waiting";
    case "called":
    case "now_calling":
      return "Now Calling";
    case "in_service":
    case "serving":
      return "In Service";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No Show";
    default:
      return String(status || "Unknown");
  }
}

function translatedStatusLabel(status: QueueStatus | undefined, lang: any): string {
  switch (String(status || "").toLowerCase()) {
    case "waiting":
      return t("q_status_waiting", lang);
    case "called":
    case "now_calling":
      return t("q_status_called", lang);
    case "in_service":
    case "serving":
      return t("q_status_in_service", lang);
    case "completed":
      return t("q_status_completed", lang);
    case "skipped":
      return t("q_status_skipped", lang);
    case "cancelled":
      return t("q_status_cancelled", lang);
    case "no_show":
      return t("q_status_no_show", lang);
    default:
      return statusLabel(status);
  }
}

function compareTickets(a: QueueTicket, b: QueueTicket): number {
  const aStatusRank = isCalledStatus(a.status) ? 0 : isInServiceStatus(a.status) ? 1 : 2;
  const bStatusRank = isCalledStatus(b.status) ? 0 : isInServiceStatus(b.status) ? 1 : 2;

  if (aStatusRank !== bStatusRank) return aStatusRank - bStatusRank;

  const aPos = a.queue_position ?? 99999;
  const bPos = b.queue_position ?? 99999;

  if (aPos !== bPos) return aPos - bPos;

  const aScore = toNumber(a.priority_score, 0);
  const bScore = toNumber(b.priority_score, 0);

  if (aScore !== bScore) return bScore - aScore;

  const aTime = a.issued_at ? new Date(a.issued_at).getTime() : 0;
  const bTime = b.issued_at ? new Date(b.issued_at).getTime() : 0;

  return aTime - bTime;
}

function statusBadgeStyle(status?: QueueStatus): CSSProperties {
  switch (status) {
    case "called":
    case "now_calling":
      return { ...badgeStyle, background: "#DBEAFE", color: "#1D4ED8" };
    case "in_service":
    case "serving":
      return { ...badgeStyle, background: "#DCFCE7", color: "#166534" };
    case "completed":
      return { ...badgeStyle, background: "#ECFDF5", color: "#047857" };
    case "skipped":
      return { ...badgeStyle, background: "#FEF3C7", color: "#92400E" };
    case "cancelled":
    case "no_show":
      return { ...badgeStyle, background: "#FEE2E2", color: "#B91C1C" };
    default:
      return { ...badgeStyle, background: "#F3F4F6", color: "#374151" };
  }
}

function priorityBadgeStyle(ticket: QueueTicket): CSSProperties {
  if (ticket.is_emergency) {
    return { ...badgeStyle, background: "#FEE2E2", color: "#B91C1C" };
  }

  if (isPriorityTicket(ticket)) {
    return { ...badgeStyle, background: "#FEF3C7", color: "#92400E" };
  }

  return { ...badgeStyle, background: "#F3F4F6", color: "#374151" };
}

function congestionAdvice(level?: string): string {
  switch (String(level || "low").toLowerCase()) {
    case "critical":
      return "Critical crowding. Add staff, open another desk, or separate priority cases.";
    case "high":
      return "High crowding. Prepare another staff member or redirect non-urgent patients.";
    case "moderate":
      return "Moderate queue. Continue calling patients and watch priority cases.";
    default:
      return "Queue is manageable. Continue normal calling.";
  }
}

function playAdminCallBeep(): void {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.16);
  } catch {
    // Browser audio permissions should never block queue calling.
  }
}

function queueCallNotice(ticket: QueueTicket): {
  tone: "success" | "warning";
  title: string;
  message: string;
} {
  const notification = ticket.notification;

  if (notification?.push_sent) {
    return {
      tone: "success",
      title: `Queue number ${ticket.ticket_number} is now calling.`,
      message: "Notification sent to patient.",
    };
  }

  if (notification?.database_created) {
    return {
      tone: "warning",
      title: `Queue number ${ticket.ticket_number} is now calling.`,
      message:
        notification.message ||
        "In-app notification was created, but mobile push sound could not be confirmed.",
    };
  }

  return {
    tone: "warning",
    title: `Queue number ${ticket.ticket_number} is now calling.`,
    message:
      notification?.message ||
      "Queue called, but mobile notification service is not configured.",
  };
}

export default function Queue() {
  const navigate = useNavigate();
  const lang = useLangStore((state) => state.lang);
  const toast = useToast();
  const isGlobalScope = useMemo(() => isGlobalRhuRole(), []);
  // Global staff (super_admin/mho) can switch between RHU 1 and RHU 2. Everyone
  // else is locked server-side to their assigned RHU regardless of this value.
  const [rhuId, setRhuId] = useState(1);
  const [serviceType, setServiceType] = useState<QueueServiceType>(
    DEFAULT_QUEUE_SERVICE_TYPE
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [summary, setSummary] = useState<QueueSummary>({
    total_issued: 0,
    total_served_today: 0,
    currently_waiting: 0,
    waiting: 0,
    called: 0,
    in_service: 0,
    completed: 0,
    skipped: 0,
    cancelled: 0,
    no_show: 0,
    emergency_waiting: 0,
    priority_waiting: 0,
    average_wait_minutes: 0,
    average_service_minutes: 0,
    total_active_queues: 0,
    congestion_level: "low",
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "warning";
    title: string;
    message: string;
  } | null>(null);

  const currentTicket = useMemo(() => {
    return (
      tickets.find(
        (ticket) =>
          ticket.service_type === serviceType && isCalledStatus(ticket.status)
      ) ??
      tickets.find(
        (ticket) =>
          ticket.service_type === serviceType && isInServiceStatus(ticket.status)
      ) ??
      null
    );
  }, [tickets, serviceType]);

  const nextWaitingTicket = useMemo(() => {
    return (
      tickets
        .filter(
          (ticket) =>
            ticket.service_type === serviceType && ticket.status === "waiting"
        )
        .sort(compareTickets)[0] ?? null
    );
  }, [tickets, serviceType]);

  const selectedServiceTickets = useMemo(() => {
    return tickets
      .filter((ticket) => ticket.service_type === serviceType)
      .sort(compareTickets);
  }, [tickets, serviceType]);

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tickets
      .filter((ticket) => {
        if (statusFilter === "active") {
          return ACTIVE_STATUSES.includes(String(ticket.status));
        }

        if (statusFilter === "all") return true;

        return ticket.status === statusFilter;
      })
      .filter((ticket) => {
        if (!term) return true;

        return (
          String(ticket.ticket_number).toLowerCase().includes(term) ||
          String(ticket.patient_name ?? "").toLowerCase().includes(term) ||
          String(ticket.service_label ?? getServiceLabel(ticket.service_type))
            .toLowerCase()
            .includes(term)
        );
      })
      .sort(compareTickets);
  }, [tickets, search, statusFilter]);

  const rhuName = useMemo(() => {
    const named = tickets.find((ticket) => ticket.rhu_name);
    return named?.rhu_name ?? null;
  }, [tickets]);

  const urgentTickets = useMemo(() => {
    return tickets
      .filter(
        (ticket) =>
          ticket.status === "waiting" &&
          (ticket.is_emergency || toNumber(ticket.priority_score, 0) >= 80)
      )
      .sort(compareTickets);
  }, [tickets]);

  const loadQueue = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);

      setRefreshing(true);
      setError(null);

      try {
        const [liveResult, summaryResult] = await Promise.allSettled([
          getLiveQueue({ rhu_id: rhuId }),
          getQueueSummary({ rhu_id: rhuId }),
        ]);

        if (liveResult.status === "rejected") {
          throw liveResult.reason;
        }

        const nextTickets = liveResult.value.tickets;
        setTickets(nextTickets);

        if (summaryResult.status === "fulfilled") {
          setSummary(summaryResult.value);
        } else {
          const waiting = nextTickets.filter((ticket) => ticket.status === "waiting");
          const called = nextTickets.filter((ticket) => isCalledStatus(ticket.status));
          const inService = nextTickets.filter(
            (ticket) => isInServiceStatus(ticket.status)
          );

          setSummary((current) => ({
            ...current,
            currently_waiting: waiting.length,
            waiting: waiting.length,
            called: called.length,
            in_service: inService.length,
            total_active_queues: new Set(
              nextTickets.map((ticket) => ticket.service_type)
            ).size,
            priority_waiting: waiting.filter(isPriorityTicket).length,
            emergency_waiting: waiting.filter((ticket) => ticket.is_emergency)
              .length,
          }));
        }

        setLastUpdated(new Date().toISOString());
      } catch (err: any) {
        setError(
          err?.response?.data?.message ||
            err?.response?.data?.errors?.rhu_id?.[0] ||
            err?.response?.data?.errors?.service_type?.[0] ||
            err?.message ||
            "Could not load the queue. Please check the connection and try again."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [rhuId]
  );

  useEffect(() => {
    loadQueue();

    if (!autoRefresh) return;

    const timer = window.setInterval(() => {
      loadQueue(true);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [loadQueue, autoRefresh]);

  async function handleCallNext() {
    const confirmed = window.confirm(
      `Call next patient for ${getServiceLabel(serviceType)}?\n\nOnly press OK if staff is ready.`
    );

    if (!confirmed) return;

    setBusyAction("call-next");
    setError(null);
    setNotice(null);

    try {
      const result = await callNextInQueue({
        rhu_id: rhuId,
        service_type: serviceType,
      });

      if (!result) {
        setError("No waiting patient for this selected service.");
        toast.warning("No waiting patient for the selected service.");
      } else {
        setNotice(queueCallNotice(result));
        playAdminCallBeep();
        const name = result.patient_name || "Patient";
        toast.success(`Calling ${name} — Queue ${result.ticket_number}`);
      }

      await loadQueue(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.service_type?.[0] ||
        err?.message ||
        "Could not call the next patient.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCallPriorityNext() {
    const confirmed = window.confirm(
      `Call the next PRIORITY patient for ${getServiceLabel(serviceType)}?\n\n` +
        "This pulls the highest-priority waiting patient (senior, PWD, pregnant, " +
        "pediatric, or emergency). Only press OK if staff is ready."
    );

    if (!confirmed) return;

    setBusyAction("call-priority-next");
    setError(null);
    setNotice(null);

    try {
      const result = await callPriorityNextInQueue({
        rhu_id: rhuId,
        service_type: serviceType,
      });

      if (!result) {
        const msg = "No priority patients (senior, PWD, pregnant, pediatric, or emergency) are waiting.";
        setError(msg);
        toast.warning(msg);
      } else {
        setNotice(queueCallNotice(result));
        playAdminCallBeep();
        const name = result.patient_name || "Priority patient";
        toast.success(`Calling ${name} — Queue ${result.ticket_number}`);
      }

      await loadQueue(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.service_type?.[0] ||
        err?.message ||
        "Could not call the next priority patient.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartService(ticket: QueueTicket) {
    const confirmed = window.confirm(
      `Start service for ticket ${ticket.ticket_number}?\n\nThis will open the patient's SOAP consultation.`
    );

    if (!confirmed) return;

    setBusyAction(`${ticket.id}-start-service`);
    setError(null);

    try {
      const result = await startQueueService(ticket.id);
      await loadQueue(true);

      if (result.consultation_id) {
        toast.success(`Service started — opening SOAP for ticket ${ticket.ticket_number}.`);
        navigate(`/consultations/${result.consultation_id}`);
        return;
      }

      setError("Service started, but the backend did not return a consultation ID.");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.status?.[0] ||
        err?.response?.data?.errors?.consultation?.[0] ||
        err?.message ||
        "Could not start service or open SOAP.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStatusChange(
    ticket: QueueTicket,
    status:
      | "in_service"
      | "completed"
      | "skipped"
      | "no_show"
      | "cancelled"
      | "waiting"
  ) {
    const messages: Record<string, string> = {
      in_service: `Start service for ticket ${ticket.ticket_number}?`,
      completed: `Mark ticket ${ticket.ticket_number} as completed?`,
      skipped: `Skip ticket ${ticket.ticket_number}?\n\nUse this if the patient is not yet ready but may still return.`,
      no_show: `Mark ticket ${ticket.ticket_number} as no-show?\n\nUse this if the patient did not respond after being called.`,
      cancelled: `Cancel ticket ${ticket.ticket_number}?`,
      waiting: `Return ticket ${ticket.ticket_number} to the waiting queue?`,
    };

    const confirmed = window.confirm(messages[status] ?? "Update ticket status?");

    if (!confirmed) return;

    setBusyAction(`${ticket.id}-${status}`);
    setError(null);

    try {
      await updateQueueTicketStatus(ticket.id, {
        status,
        notes:
          status === "skipped"
            ? "Patient skipped by RHU staff."
            : status === "no_show"
            ? "Patient did not respond when called."
            : undefined,
        cancellation_reason:
          status === "cancelled"
            ? "Cancelled by RHU staff from queue monitor."
            : undefined,
      });

      const successMessages: Record<string, string> = {
        completed: `Ticket ${ticket.ticket_number} marked as completed.`,
        skipped: `Ticket ${ticket.ticket_number} skipped.`,
        no_show: `Ticket ${ticket.ticket_number} marked as no-show.`,
        cancelled: `Ticket ${ticket.ticket_number} cancelled.`,
        waiting: `Ticket ${ticket.ticket_number} returned to waiting queue.`,
        in_service: `Ticket ${ticket.ticket_number} is now in service.`,
      };
      if (successMessages[status]) {
        toast.success(successMessages[status]);
      }

      await loadQueue(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.status?.[0] ||
        err?.message ||
        "Could not update the ticket.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return (
      <div style={loadingCardStyle}>
        <RefreshCw size={24} />
        <strong>{t("q_loading", lang)}</strong>
        <span>{t("q_error_load", lang)}</span>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>{t("q_eyebrow", lang)}</div>
          <h1 style={heroTitleStyle}>{t("q_title", lang)}</h1>
          <p style={heroSubtitleStyle}>{t("q_subtitle", lang)}</p>

          <div style={heroMetaStyle}>
            <span>
              {t("q_currently_managing", lang)}: RHU {rhuId}
              {rhuName ? ` · ${rhuName}` : ""}
            </span>
            <span>{t("last_updated", lang)}: {lastUpdated ? formatTime(lastUpdated) : "—"}</span>
            <span>{autoRefresh ? t("q_auto_on", lang) : t("q_auto_off", lang)}</span>
            <span>{isGlobalScope ? `Managing RHU ${rhuId}` : t("q_locked_rhu", lang)}</span>
          </div>
        </div>

        <div style={controlPanelStyle}>
          <label style={fieldStyle}>
            <span>{t("q_rhu_selector", lang)}</span>
            {isGlobalScope ? (
              <select
                value={rhuId}
                onChange={(event) => setRhuId(Number(event.target.value))}
                style={inputStyle}
                title="Switch RHU facility"
              >
                <option value={1}>RHU 1</option>
                <option value={2}>RHU 2</option>
              </select>
            ) : (
              <div style={lockedRhuStyle}>{`RHU ${rhuId}`}</div>
            )}
          </label>

          <label style={fieldStyle}>
            <span>{t("q_choose_service_desk", lang)}</span>
            <select
              value={serviceType}
              onChange={(event) =>
                setServiceType(event.target.value as QueueServiceType)
              }
              style={inputStyle}
            >
              {QUEUE_SERVICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={() => setWalkInOpen(true)}
              style={walkInButtonStyle}
            >
              <UserPlus size={18} />
              Add Walk-in
            </button>

            <button
              type="button"
              onClick={() => loadQueue()}
              disabled={refreshing}
              style={lightButtonStyle}
            >
              <RefreshCw size={18} />
              {refreshing ? t("refreshing", lang) : t("um_btn_refresh", lang)}
            </button>

            <button
              type="button"
              onClick={() => setAutoRefresh((value) => !value)}
              style={lightButtonStyle}
            >
              <Activity size={18} />
              {autoRefresh ? t("q_auto_short_on", lang) : t("q_auto_short_off", lang)}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section style={errorStyle}>
          <AlertTriangle size={22} />
          <div>
            <strong>{t("q_action_needed", lang)}</strong>
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      {notice ? (
        <section
          style={notice.tone === "success" ? successNoticeStyle : warningStyle}
        >
          {notice.tone === "success" ? (
            <BellRing size={22} />
          ) : (
            <AlertTriangle size={22} />
          )}
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.message}</p>
          </div>
        </section>
      ) : null}

      <section style={statsGridStyle}>
        <Stat
          icon={<CheckCircle2 size={22} />}
          label={t("q_served_today", lang)}
          value={summary.total_served_today}
          hint={t("q_completed_tickets", lang)}
        />
        <Stat
          icon={<Clock3 size={22} />}
          label={t("q_waiting_now", lang)}
          value={summary.currently_waiting || summary.waiting}
          hint={t("q_patients_waiting", lang)}
        />
        <Stat
          icon={<ShieldAlert size={22} />}
          label={t("q_priority_waiting", lang)}
          value={summary.priority_waiting}
          hint={t("q_priority_hint", lang)}
        />
        <Stat
          icon={<Activity size={22} />}
          label={t("q_average_wait", lang)}
          value={formatMinutes(summary.average_wait_minutes)}
          hint={congestionAdvice(summary.congestion_level)}
        />
      </section>

      {urgentTickets.length > 0 ? (
        <section style={warningStyle}>
          <ShieldAlert size={22} />
          <div>
            <strong>{t("q_urgent_title", lang, { count: urgentTickets.length })}</strong>
            <p>{t("q_urgent_body", lang)}</p>
          </div>
        </section>
      ) : null}

      <section style={callingPanelStyle}>
        <div style={selectedHeaderStyle}>
          <div>
            <small>{t("q_selected_desk", lang)}</small>
            <h2>{getServiceLabel(serviceType)}</h2>
          </div>
          <span style={livePillStyle}>{t("q_live", lang)}</span>
        </div>

        <div style={nowCallingStyle}>
          {currentTicket ? (
            <div style={activeCallContentStyle}>
              <div style={activeCallHeaderStyle}>
                <div style={activeCallIconStyle}>
                  <BellRing size={24} />
                </div>
                <div>
                  <small>{t("q_now_calling", lang)}</small>
                  <strong>
                    {currentTicket.patient_name || t("q_patient_fallback", lang)}
                  </strong>
                  <span style={activeQueueNumberStyle}>
                    Queue {currentTicket.ticket_number}
                  </span>
                </div>
                <span style={statusBadgeStyle(currentTicket.status)}>
                  {translatedStatusLabel(currentTicket.status, lang)}
                </span>
              </div>

              <div style={activeCallDetailsStyle}>
                <Info
                  label={t("q_patient", lang)}
                  value={currentTicket.patient_name || t("q_patient_fallback", lang)}
                />
                <Info label="Age" value={patientAgeLabel(currentTicket)} />
                <Info label="Barangay" value={patientBarangayLabel(currentTicket)} />
                <Info label="Service" value={getServiceLabel(serviceType)} />
                <Info label="Complaint" value={complaintLabel(currentTicket)} />
                <Info
                  label="Priority"
                  value={`${priorityLabel(currentTicket)} (${priorityLevelLabel(currentTicket)})`}
                />
              </div>

              <div style={triageNoteStyle}>
                <ShieldAlert size={16} />
                <span>
                  AI triage is a support tool only. RHU staff must validate
                  urgency and priority before final action. Reason:{" "}
                  <strong>{priorityReason(currentTicket)}</strong>
                  {toNumber(currentTicket.priority_score, 0) > 0
                    ? ` · Score ${toNumber(currentTicket.priority_score, 0)}`
                    : ""}
                </span>
              </div>

              <div style={nowCallingActionRowStyle}>
                {isCalledStatus(currentTicket.status) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStartService(currentTicket)}
                      disabled={
                        busyAction === `${currentTicket.id}-start-service`
                      }
                      style={primaryButtonStyle}
                    >
                      <PlayCircle size={15} />
                      {busyAction === `${currentTicket.id}-start-service`
                        ? t("q_starting", lang)
                        : t("q_start_consultation", lang)}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange(currentTicket, "skipped")}
                      disabled={busyAction === `${currentTicket.id}-skipped`}
                      style={warningButtonStyle}
                    >
                      {t("q_skip", lang)}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange(currentTicket, "no_show")}
                      disabled={busyAction === `${currentTicket.id}-no_show`}
                      style={dangerButtonStyle}
                    >
                      {t("q_no_show", lang)}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange(currentTicket, "waiting")}
                      disabled={busyAction === `${currentTicket.id}-waiting`}
                      style={secondaryButtonStyle}
                    >
                      {t("q_return_waiting", lang)}
                    </button>
                  </>
                ) : null}

                {isInServiceStatus(currentTicket.status) ? (
                  <>
                    {currentTicket.consultation_id ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/consultations/${currentTicket.consultation_id}`)
                        }
                        style={lightButtonStyle}
                      >
                        <PlayCircle size={15} />
                        {t("q_open_soap", lang)}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleStatusChange(currentTicket, "completed")}
                      disabled={busyAction === `${currentTicket.id}-completed`}
                      style={primaryButtonStyle}
                    >
                      <UserCheck size={15} />
                      {busyAction === `${currentTicket.id}-completed`
                        ? t("q_completing", lang)
                        : t("q_complete_consultation", lang)}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <strong>{t("q_no_active_call", lang)}</strong>
              <span>{t("q_press_call_next", lang)}</span>
            </>
          )}
        </div>

        <div style={nextBoxStyle}>
          <small>{t("q_next_waiting_patient", lang)}</small>
          <strong>
            {nextWaitingTicket
              ? `${nextWaitingTicket.ticket_number} · ${
                  nextWaitingTicket.patient_name || "Patient"
                }`
              : t("q_none", lang)}
          </strong>
          {nextWaitingTicket ? (
            <span>
              {patientAgeLabel(nextWaitingTicket)} ·{" "}
              {priorityLabel(nextWaitingTicket)} ·{" "}
              {priorityReason(nextWaitingTicket)}
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Part 3c — while either call is in flight both buttons disable;
              the opacity/cursor change makes that state visible instead of
              the buttons silently ignoring clicks. */}
          <button
            type="button"
            onClick={handleCallNext}
            disabled={busyAction === "call-next" || busyAction === "call-priority-next"}
            style={{
              ...callButtonStyle,
              ...(busyAction === "call-next" || busyAction === "call-priority-next"
                ? { opacity: 0.55, cursor: "not-allowed" }
                : null),
            }}
          >
            <PhoneCall size={18} />
            {busyAction === "call-next" ? t("q_btn_calling", lang) : t("q_btn_call_next_patient", lang)}
          </button>

          <button
            type="button"
            onClick={handleCallPriorityNext}
            disabled={busyAction === "call-next" || busyAction === "call-priority-next"}
            style={{
              ...callPriorityButtonStyle,
              ...(busyAction === "call-next" || busyAction === "call-priority-next"
                ? { opacity: 0.55, cursor: "not-allowed" }
                : null),
            }}
            title="Call the next priority patient (senior, PWD, pregnant, pediatric, or emergency)"
          >
            <Star size={18} />
            {busyAction === "call-priority-next" ? t("q_btn_calling", lang) : t("q_btn_call_priority_next", lang)}
          </button>
        </div>

        <p style={queueHelpStyle}>{t("q_help_text", lang)}</p>
      </section>

      <section style={toolbarStyle}>
        <div style={searchBoxStyle}>
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("q_search_placeholder", lang)}
            style={searchInputStyle}
          />
        </div>

        <label style={fieldStyle}>
          <span>{t("q_status_view", lang)}</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            style={inputStyle}
          >
            <option value="active">{t("q_active_queue", lang)}</option>
            <option value="all">{t("q_all_statuses", lang)}</option>
            <option value="waiting">{t("q_status_waiting", lang)}</option>
            <option value="called">{t("q_status_called", lang)}</option>
            <option value="in_service">{t("q_status_in_service", lang)}</option>
            <option value="completed">{t("q_status_completed", lang)}</option>
            <option value="skipped">{t("q_status_skipped", lang)}</option>
            <option value="no_show">{t("q_status_no_show", lang)}</option>
            <option value="cancelled">{t("q_status_cancelled", lang)}</option>
          </select>
        </label>
      </section>

      <section style={boardStyle}>
        <div style={boardHeaderStyle}>
          <div>
            <h2>{t("q_active_tickets_title", lang)}</h2>
            <p>{t("q_active_tickets_desc", lang)}</p>
          </div>

          <Users size={24} />
        </div>

        {filteredTickets.length === 0 ? (
          <div style={emptyStyle}>
            <strong style={{ display: "block", color: "#0F172A", marginBottom: 4 }}>
              {t("q_empty_no_tickets", lang)}
            </strong>
            {statusFilter === "active" || statusFilter === "all"
              ? t("q_empty_checklist", lang, {
                  rhu: rhuId,
                  desk: getServiceLabel(serviceType),
                })
              : t("q_empty_status_hint", lang)}
          </div>
        ) : (
          <div style={ticketGridStyle}>
            {filteredTickets.map((ticket) => (
              <article key={ticket.id} style={ticketCardStyle}>
                <div style={ticketHeaderStyle}>
                  <div>
                    <small>{getServiceLabel(ticket.service_type)}</small>
                    <h3>{ticket.ticket_number}</h3>
                    <p>{ticket.patient_name || t("q_patient_fallback", lang)}</p>
                    <span style={patientMetaStyle}>
                      {patientAgeLabel(ticket)} · {patientBarangayLabel(ticket)}
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <span style={statusBadgeStyle(ticket.status)}>
                      {translatedStatusLabel(ticket.status, lang)}
                    </span>

                    <span style={priorityBadgeStyle(ticket)}>
                      {priorityLabel(ticket)}
                    </span>
                  </div>
                </div>

                <div style={ticketInfoGridStyle}>
                  <Info
                    label="RHU"
                    value={
                      ticket.rhu_name
                        ? `RHU ${ticket.rhu_id} · ${ticket.rhu_name}`
                        : `RHU ${ticket.rhu_id ?? "—"}`
                    }
                  />
                  <Info label={t("q_source", lang)} value={sourceLabel(ticket.source)} />
                  <Info label="Age" value={patientAgeLabel(ticket)} />
                  <Info label="Barangay" value={patientBarangayLabel(ticket)} />
                  <Info label="Complaint" value={complaintLabel(ticket)} />
                  <Info label="Priority reason" value={priorityReason(ticket)} />
                  <Info
                    label="AI triage"
                    value={`${priorityLevelLabel(ticket)}${
                      toNumber(ticket.priority_score, 0) > 0
                        ? ` · ${toNumber(ticket.priority_score, 0)}`
                        : ""
                    }`}
                  />
                  <Info label={t("q_position", lang)} value={String(ticket.queue_position ?? "—")} />
                  <Info label={t("q_wait", lang)} value={formatMinutes(computeLiveWait(ticket))} />
                  <Info label={t("q_issued", lang)} value={formatTime(ticket.issued_at)} />
                  <Info label={t("q_status_called", lang)} value={formatTime(ticket.called_at)} />
                  <Info label={t("q_attempts", lang)} value={String(ticket.call_attempt ?? 0)} />
                </div>

                <div style={triageNoteStyle}>
                  <ShieldAlert size={15} />
                  <span>
                    AI triage is a support tool only. RHU staff must validate
                    urgency and priority before final action.
                  </span>
                </div>

                <div style={actionRowStyle}>
                  {ticket.status === "waiting" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(ticket, "cancelled")}
                        disabled={busyAction === `${ticket.id}-cancelled`}
                        style={dangerButtonStyle}
                      >
                        {t("btn_cancel", lang)}
                      </button>
                    </>
                  ) : null}

                  {isCalledStatus(ticket.status) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartService(ticket)}
                        disabled={busyAction === `${ticket.id}-start-service`}
                        style={primaryButtonStyle}
                      >
                        <PlayCircle size={15} />
                        {busyAction === `${ticket.id}-start-service`
                          ? t("q_starting_service", lang)
                          : t("q_start_consultation", lang)}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(ticket, "skipped")}
                        disabled={busyAction === `${ticket.id}-skipped`}
                        style={warningButtonStyle}
                      >
                        {t("q_skip", lang)}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(ticket, "no_show")}
                        disabled={busyAction === `${ticket.id}-no_show`}
                        style={dangerButtonStyle}
                      >
                        {t("q_no_show", lang)}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(ticket, "waiting")}
                        disabled={busyAction === `${ticket.id}-waiting`}
                        style={secondaryButtonStyle}
                      >
                        {t("q_return_waiting", lang)}
                      </button>
                    </>
                  ) : null}

                  {isInServiceStatus(ticket.status) ? (
                    <>
                      {ticket.consultation_id ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/consultations/${ticket.consultation_id}`)}
                          style={lightButtonStyle}
                        >
                          <PlayCircle size={15} />
                          {t("q_open_soap", lang)}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleStatusChange(ticket, "completed")}
                        disabled={busyAction === `${ticket.id}-completed`}
                        style={primaryButtonStyle}
                      >
                        <UserCheck size={15} />
                        {busyAction === `${ticket.id}-completed`
                          ? t("q_completing", lang)
                          : t("q_complete_consultation", lang)}
                      </button>
                    </>
                  ) : null}

                  {["skipped", "no_show"].includes(String(ticket.status)) ? (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(ticket, "waiting")}
                      disabled={busyAction === `${ticket.id}-waiting`}
                      style={lightButtonStyle}
                    >
                      {t("q_return_waiting", lang)}
                    </button>
                  ) : null}

                  {["completed", "cancelled"].includes(String(ticket.status)) ? (
                    <span style={closedStyle}>
                      <CheckCircle2 size={15} />
                      {t("q_closed", lang)}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={boardStyle}>
        <div style={boardHeaderStyle}>
          <div>
            <h2>{t("q_selected_desk_summary", lang)}</h2>
            <p>{t("q_selected_desk_overview", lang, { desk: getServiceLabel(serviceType) })}</p>
          </div>
        </div>

        <div style={summaryGridStyle}>
          <Info
            label={t("q_total_tickets", lang)}
            value={String(selectedServiceTickets.length)}
          />
          <Info
            label={t("q_status_waiting", lang)}
            value={String(
              selectedServiceTickets.filter((item) => item.status === "waiting")
                .length
            )}
          />
          <Info
            label={t("q_status_called", lang)}
            value={String(
              selectedServiceTickets.filter((item) => isCalledStatus(item.status))
                .length
            )}
          />
          <Info
            label={t("q_status_in_service", lang)}
            value={String(
              selectedServiceTickets.filter((item) => isInServiceStatus(item.status))
                .length
            )}
          />
        </div>
      </section>

      <WalkInPatientModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        rhuId={rhuId}
        defaultServiceType={serviceType}
        onIssued={() => loadQueue()}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div style={statCardStyle}>
      <div style={statIconStyle}>{icon}</div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{hint}</p>
      </div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoBoxStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 18,
};

const loadingCardStyle: CSSProperties = {
  minHeight: 300,
  display: "grid",
  placeItems: "center",
  gap: 8,
  color: "#64748B",
};

const heroStyle: CSSProperties = {
  background: "linear-gradient(135deg, #064E3B, #14B8A6)",
  color: "#FFFFFF",
  borderRadius: 28,
  padding: 28,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
  gap: 20,
  alignItems: "center",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#A7F3D0",
  marginBottom: 8,
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 34,
  fontWeight: 900,
  letterSpacing: "-0.05em",
};

const heroSubtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#D1FAE5",
  maxWidth: 760,
  lineHeight: 1.6,
  fontWeight: 650,
};

const heroMetaStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 14,
  fontSize: 12,
  fontWeight: 900,
};

const controlPanelStyle: CSSProperties = {
  background: "rgba(255,255,255,.14)",
  border: "1px solid rgba(255,255,255,.28)",
  borderRadius: 20,
  padding: 18,
  display: "grid",
  gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
  color: "#475569",
};

const inputStyle: CSSProperties = {
  height: 46,
  borderRadius: 14,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  padding: "0 12px",
  fontWeight: 800,
  outline: 0,
};

const lockedRhuStyle: CSSProperties = {
  height: 46,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.34)",
  background: "rgba(255,255,255,.16)",
  color: "#FFFFFF",
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  fontWeight: 900,
};

const buttonRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const lightButtonStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  background: "#FFFFFF",
  color: "#334155",
  padding: "10px 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontWeight: 900,
  cursor: "pointer",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const statCardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 16,
  display: "flex",
  gap: 14,
  alignItems: "center",
};

const statIconStyle: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 16,
  background: "#CCFBF1",
  color: "#0F766E",
  display: "grid",
  placeItems: "center",
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
  borderRadius: 16,
  padding: 16,
  display: "flex",
  gap: 12,
};

const warningStyle: CSSProperties = {
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  color: "#92400E",
  borderRadius: 16,
  padding: 16,
  display: "flex",
  gap: 12,
};

const successNoticeStyle: CSSProperties = {
  background: "#ECFDF5",
  border: "1px solid #99F6E4",
  color: "#065F46",
  borderRadius: 16,
  padding: 16,
  display: "flex",
  gap: 12,
};

const callingPanelStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 22,
  padding: 20,
  display: "grid",
  gap: 14,
};

const selectedHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
};

const livePillStyle: CSSProperties = {
  background: "#DCFCE7",
  color: "#166534",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const nowCallingStyle: CSSProperties = {
  minHeight: 150,
  background: "linear-gradient(135deg, #ECFDF5, #CCFBF1)",
  border: "1px solid #5EEAD4",
  borderRadius: 18,
  display: "grid",
  gap: 6,
  padding: 18,
  color: "#064E3B",
};

const activeCallContentStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const activeCallHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  gap: 12,
  alignItems: "center",
};

const activeCallIconStyle: CSSProperties = {
  width: 50,
  height: 50,
  borderRadius: 16,
  background: "#0F766E",
  color: "#FFFFFF",
  display: "grid",
  placeItems: "center",
};

const activeQueueNumberStyle: CSSProperties = {
  display: "block",
  marginTop: 3,
  color: "#0F766E",
  fontSize: 13,
  fontWeight: 900,
};

const activeCallDetailsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
  fontSize: 15,
  fontWeight: 900,
};

const triageNoteStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#78350F",
  borderRadius: 14,
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.45,
};

const nowCallingActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const nextBoxStyle: CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 4,
};

const callButtonStyle: CSSProperties = {
  height: 54,
  border: 0,
  borderRadius: 16,
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  cursor: "pointer",
  flex: "1 1 200px",
};

const callPriorityButtonStyle: CSSProperties = {
  height: 54,
  border: "1px solid #B45309",
  borderRadius: 16,
  background: "#B45309",
  color: "#FFFFFF",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  cursor: "pointer",
  flex: "1 1 200px",
};

const toolbarStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 20,
  padding: 14,
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) minmax(170px, 220px)",
  gap: 12,
  alignItems: "end",
};

const searchBoxStyle: CSSProperties = {
  height: 46,
  borderRadius: 14,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 14px",
};

const searchInputStyle: CSSProperties = {
  border: 0,
  outline: 0,
  background: "transparent",
  width: "100%",
  fontWeight: 700,
};

const boardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 22,
  overflow: "hidden",
};

const boardHeaderStyle: CSSProperties = {
  padding: 20,
  borderBottom: "1px solid #E2E8F0",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const emptyStyle: CSSProperties = {
  padding: 34,
  textAlign: "center",
  color: "#64748B",
  fontWeight: 800,
};

const queueHelpStyle: CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  background: "#F0FDFA",
  border: "1px solid #CCFBF1",
  borderRadius: 12,
  color: "#0F766E",
  fontSize: 12,
  lineHeight: 1.6,
};

const ticketGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  padding: 16,
};

const ticketCardStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 16,
  background: "#FFFFFF",
  boxShadow: "0 10px 30px rgba(15,23,42,.04)",
};

const ticketHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const patientMetaStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "#64748B",
  fontSize: 12,
  fontWeight: 800,
};

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const ticketInfoGridStyle: CSSProperties = {
  display: "grid",
  // Collapses to one column on narrow screens so ticket details stay readable.
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
  gap: 10,
  marginTop: 14,
};

const infoBoxStyle: CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 5,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 14,
};

const primaryButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 12,
  padding: "10px 12px",
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const warningButtonStyle: CSSProperties = {
  border: "1px solid #FDE68A",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#FFFBEB",
  color: "#92400E",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid #FECACA",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#FEF2F2",
  color: "#B91C1C",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#F8FAFC",
  color: "#334155",
  fontWeight: 900,
  cursor: "pointer",
};

const closedStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  color: "#047857",
  fontWeight: 900,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
  padding: 16,
};

const walkInButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  borderRadius: 12,
  padding: "12px 16px",
  background: "#0F766E",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};
