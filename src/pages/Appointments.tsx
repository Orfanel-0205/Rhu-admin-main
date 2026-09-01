// src/pages/Appointments.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  MonitorPlay,
  PlayCircle,
  RefreshCw,
  Search,
  Stethoscope,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { useToast } from "../contexts/ToastContext";
import { useAuthStore } from "../store/authStore";
import { RHU_OPTIONS, isGlobalRhuRole } from "../lib/rhu";

import {
  addAppointmentToQueue,
  approveAppointment,
  buildAppointmentSummary,
  cancelAppointment,
  formatAppointmentDate,
  formatAppointmentTime,
  getAppointmentReason,
  getAppointmentSymptoms,
  getAppointmentType,
  getAppointments,
  getConsultationId,
  getPatientMobile,
  getPatientName,
  getQueueTicketStatus,
  getStartResultRoomUrl,
  getEffectiveAppointmentStatus,
  getAppointmentFollowUp,
  isConsultationCompleted,
  isTelemedicineSessionActive,
  isTelemedicineSessionEnded,
  rejectAppointment,
  scheduleAppointment,
  startConsultationFromAppointment,
  type Appointment,
  type AppointmentBoard,
  type AppointmentStatus,
  type ConsultationType,
} from "../services/appointments";

type StatusFilter = "all" | AppointmentStatus | "ongoing";
type TypeFilter = "all" | ConsultationType;
type DateFilter = "all" | "today" | "upcoming";

type ConfirmModalState = {
  appointment: Appointment;
  title: string;
  body: string;
  confirmText: string;
  tone: "green" | "blue" | "red" | "yellow";
  successMessage: string;
  action: () => Promise<any>;
};

type ReasonModalState = {
  appointment: Appointment;
  mode: "reject" | "cancel";
  title: string;
  label: string;
  defaultReason: string;
};

type AppointmentQueueState = {
  key: string;
  label: string;
  description: string;
  tone: CSSProperties;
  showAddAction: boolean;
};

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "approved",
  "scheduled",
  "ongoing",
];

const BOARD_TABS: { key: AppointmentBoard; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled / Rejected" },
  { key: "history", label: "History" },
];

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateOffsetString(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isToday(value?: string | null): boolean {
  return value?.slice(0, 10) === todayString();
}

function isUpcoming(value?: string | null): boolean {
  if (!value) return false;
  return value.slice(0, 10) >= todayString();
}

function toInputDate(value?: string | null): string {
  if (!value) return todayString();

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return todayString();
  }

  return date.toISOString().slice(0, 10);
}

function toInputTime(value?: string | null): string {
  if (!value) return "09:00";

  const time = String(value).slice(0, 5);

  if (/^\d{2}:\d{2}$/.test(time)) {
    return time;
  }

  return "09:00";
}

function statusTone(status?: string | null): CSSProperties {
  switch (String(status || "").toLowerCase()) {
    case "pending":
      return { background: "#FEF3C7", color: "#92400E" };
    case "approved":
    case "confirmed":
    case "scheduled":
      return { background: "#DCFCE7", color: "#166534" };
    case "ongoing":
      return { background: "#DBEAFE", color: "#1D4ED8" };
    case "needs_soap":
      return { background: "#FFEDD5", color: "#9A3412" };
    case "completed":
      return { background: "#E0E7FF", color: "#3730A3" };
    case "cancelled":
    case "rejected":
      return { background: "#FEE2E2", color: "#B91C1C" };
    default:
      return { background: "#F3F4F6", color: "#374151" };
  }
}

function typeTone(type: ConsultationType): CSSProperties {
  if (type === "online") {
    return { background: "#EFF6FF", color: "#1D4ED8" };
  }

  return { background: "#ECFDF5", color: "#047857" };
}

function queueTone(status?: string | null): CSSProperties {
  switch (String(status || "").toLowerCase()) {
    case "waiting":
      return { background: "#FEF3C7", color: "#92400E" };
    case "called":
    case "in_service":
      return { background: "#DBEAFE", color: "#1D4ED8" };
    case "completed":
      return { background: "#DCFCE7", color: "#166534" };
    case "skipped":
    case "no_show":
    case "cancelled":
      return { background: "#FEE2E2", color: "#B91C1C" };
    default:
      return { background: "#F3F4F6", color: "#374151" };
  }
}

function getLocalStatusLabel(status?: string | null): string {
  switch (String(status || "").toLowerCase()) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "approved":
      return "Approved";
    case "scheduled":
      return "Scheduled";
    case "ongoing":
      return "Ongoing";
    case "needs_soap":
      return "Needs SOAP";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "rejected":
      return "Rejected";
    default:
      return "Pending";
  }
}

function queueStatusLabel(status: string | null): string {
  if (!status) return "Not in queue yet";

  switch (status) {
    case "waiting":
      return "Waiting";
    case "called":
      return "Called";
    case "in_service":
      return "In Service";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "no_show":
      return "No Show";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function getAppointmentQueueState(
  appointment: Appointment
): AppointmentQueueState {
  const status = getQueueTicketStatus(appointment);
  const appointmentStatus = String(appointment.status || "").toLowerCase();
  const hasTicket = Boolean(appointment.queue_ticket);
  const onsite = getAppointmentType(appointment) === "onsite";
  const approvedOrScheduled = ["confirmed", "approved", "scheduled"].includes(
    appointmentStatus
  );
  const scheduledToday = isToday(appointment.appointment_date);

  // ONLINE telemedicine never uses an onsite queue ticket. Show a clear
  // telemedicine status instead of the confusing "Not in queue yet".
  if (!onsite) {
    if (isConsultationCompleted(appointment)) {
      return {
        key: "telemedicine_completed",
        label: "Telemedicine completed",
        description: "Online consultation finished. Record saved to History.",
        tone: { background: "#DCFCE7", color: "#166534" },
        showAddAction: false,
      };
    }

    if (isTelemedicineSessionEnded(appointment)) {
      return {
        key: "telemedicine_needs_soap",
        label: "Telemedicine ended",
        description: "Video ended. Finalize SOAP to complete the record.",
        tone: { background: "#FFEDD5", color: "#9A3412" },
        showAddAction: false,
      };
    }

    if (isTelemedicineSessionActive(appointment)) {
      return {
        key: "telemedicine_active",
        label: "Telemedicine in session",
        description: "Online consultation is active. Open the room to continue.",
        tone: { background: "#EFF6FF", color: "#1D4ED8" },
        showAddAction: false,
      };
    }

    return {
      key: "telemedicine",
      label: "Telemedicine",
      description:
        "Online appointment. Open telemedicine; no onsite queue ticket is required.",
      tone: { background: "#EFF6FF", color: "#1D4ED8" },
      showAddAction: false,
    };
  }

  if (status) {
    const descriptions: Record<string, string> = {
      waiting: "Patient is visible in Queue. Call patient from Queue.",
      called: "Patient has been called. Start consultation when ready.",
      in_service: "Patient is currently being served.",
      completed: "Queue process finished.",
      skipped: "Patient was skipped. Return to waiting if they are ready.",
      no_show: "Patient did not respond.",
      cancelled: "Queue ticket was cancelled.",
    };

    return {
      key: status,
      label: queueStatusLabel(status),
      description:
        descriptions[status] ||
        "Queue ticket exists. If it is not visible, switch Queue RHU/desk to view this ticket.",
      tone: queueTone(status),
      showAddAction: false,
    };
  }

  if (hasTicket) {
    return {
      key: "ready",
      label: "Queue ticket ready",
      description:
        "Queue ticket exists. If it is not visible, switch Queue RHU/desk to view this ticket.",
      tone: { background: "#ECFDF5", color: "#047857" },
      showAddAction: false,
    };
  }

  if (appointmentStatus === "pending") {
    return {
      key: "pending",
      label: "Not in queue yet",
      description: "Approve appointment first.",
      tone: { background: "#FEF3C7", color: "#92400E" },
      showAddAction: false,
    };
  }

  if (approvedOrScheduled && !scheduledToday) {
    return {
      key: "other_date",
      label: "Not in queue yet",
      description: `Appointment is for ${formatAppointmentDate(
        appointment.appointment_date
      )}. It will not show in today's active queue.`,
      tone: { background: "#F3F4F6", color: "#475569" },
      showAddAction: false,
    };
  }

  if (approvedOrScheduled) {
    return {
      key: "not_in_queue",
      label: "Not in queue yet",
      description: "Click Add to Queue when patient arrives.",
      tone: { background: "#FEF3C7", color: "#92400E" },
      showAddAction: true,
    };
  }

  return {
    key: "closed",
    label: "Not in queue yet",
    description: "Closed or rejected appointments do not appear in active Queue.",
    tone: { background: "#F3F4F6", color: "#475569" },
    showAddAction: false,
  };
}

function getLocalNextStep(appointment: Appointment): string {
  const status = String(appointment.status || "").toLowerCase();
  const type = getAppointmentType(appointment);
  const queueState = getAppointmentQueueState(appointment);

  if (status === "pending") {
    return "Review request, then approve or reject.";
  }

  if (status === "approved" || status === "confirmed") {
    return type === "online"
      ? "Open telemedicine when staff and patient are ready."
      : queueState.description;
  }

  if (status === "scheduled") {
    return type === "online"
      ? "Open telemedicine room when staff and patient are ready."
      : queueState.description;
  }

  if (status === "ongoing") {
    return type === "online"
      ? "Telemedicine consultation is ongoing. Continue SOAP documentation."
      : "Consultation is ongoing. Complete SOAP when finished.";
  }

  if (status === "completed") {
    return "Consultation has been completed.";
  }

  if (status === "cancelled") {
    return "Appointment was cancelled.";
  }

  if (status === "rejected") {
    return "Appointment was rejected.";
  }

  return "Review appointment.";
}

function canStart(appointment: Appointment): boolean {
  const status = String(appointment.status || "").toLowerCase();

  if (!["confirmed", "approved", "scheduled"].includes(status)) {
    return false;
  }

  if (getAppointmentType(appointment) === "online") {
    // Never re-open the video once the record is completed or the session ended.
    return (
      !isConsultationCompleted(appointment) &&
      !isTelemedicineSessionEnded(appointment)
    );
  }

  return getQueueTicketStatus(appointment) === "in_service";
}

// Online telemedicine that has ended its video but whose SOAP is not yet
// finalized — staff should continue/finalize the consultation, not re-open Room.
function canContinueSoap(appointment: Appointment): boolean {
  return (
    getAppointmentType(appointment) === "online" &&
    !isConsultationCompleted(appointment) &&
    isTelemedicineSessionEnded(appointment) &&
    getConsultationId(appointment) !== null
  );
}

function canSchedule(appointment: Appointment): boolean {
  const status = String(appointment.status || "").toLowerCase();
  return ["confirmed", "approved"].includes(status);
}

function canViewQueue(appointment: Appointment): boolean {
  const status = String(appointment.status || "").toLowerCase();
  return ["confirmed", "approved", "scheduled", "ongoing"].includes(status);
}

function canViewConsultation(appointment: Appointment): boolean {
  const status = String(appointment.status || "").toLowerCase();
  return (
    ["ongoing", "completed"].includes(status) &&
    getConsultationId(appointment) !== null
  );
}

function canOpenOngoingTelemedicine(appointment: Appointment): boolean {
  return (
    getAppointmentType(appointment) === "online" &&
    !isConsultationCompleted(appointment) &&
    !isTelemedicineSessionEnded(appointment) &&
    (String(appointment.status || "").toLowerCase() === "ongoing" ||
      isTelemedicineSessionActive(appointment))
  );
}

function isClosed(appointment: Appointment): boolean {
  const status = String(appointment.status || "").toLowerCase();
  return ["completed", "cancelled", "rejected"].includes(status);
}

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function truncate(value: string, max = 44): string {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function safeActionError(error: any, fallback: string): string {
  const rawMessage =
    error?.response?.data?.message ||
    error?.response?.data?.errors?.appointment_date?.[0] ||
    error?.response?.data?.errors?.appointment_time?.[0] ||
    error?.response?.data?.errors?.status?.[0] ||
    error?.message ||
    fallback;

  if (
    /SQLSTATE|query|syntax|stack trace|exception|constraint|column|table|server error/i.test(
      String(rawMessage)
    )
  ) {
    return "Action failed. Please try again or contact the system administrator.";
  }

  return String(rawMessage);
}

export default function Appointments() {
  const toast = useToast();
  const navigate = useNavigate();

  const authUser = useAuthStore((state) => state.user);
  const canPickRhu = isGlobalRhuRole(authUser);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [board, setBoard] = useState<AppointmentBoard>("active");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [rhu, setRhu] = useState<string>("all");

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(
    null
  );

  const [reasonModal, setReasonModal] = useState<ReasonModalState | null>(null);
  const [reasonText, setReasonText] = useState("");

  // Read-only "View Details" modal for the full Reason / Symptoms of a row.
  const [detailsAppointment, setDetailsAppointment] = useState<Appointment | null>(null);

  const [scheduleTarget, setScheduleTarget] = useState<Appointment | null>(null);
  const [scheduleDate, setScheduleDate] = useState(todayString());
  const [scheduleTime, setScheduleTime] = useState("09:00");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getAppointments({
        search,
        status,
        type,
        board,
        rhu_id: canPickRhu && rhu !== "all" ? rhu : undefined,
      });

      setAppointments(data);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Could not load appointments. Please check the backend connection.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [search, status, type, board, rhu, canPickRhu]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const visibleAppointments = useMemo(() => {
    // The Active board is already scoped to today by the backend, so the
    // client date filter does not apply there (it would only ever empty it out).
    if (board === "active") {
      return appointments;
    }

    return appointments.filter((appointment) => {
      if (dateFilter === "today" && !isToday(appointment.appointment_date)) {
        return false;
      }

      if (
        dateFilter === "upcoming" &&
        !isUpcoming(appointment.appointment_date)
      ) {
        return false;
      }

      return true;
    });
  }, [appointments, dateFilter, board]);

  const summary = useMemo(
    () => buildAppointmentSummary(visibleAppointments),
    [visibleAppointments]
  );

  const nextAppointment = useMemo(() => {
    return (
      visibleAppointments
        .filter((item) =>
          ACTIVE_STATUSES.includes(String(item.status || "").toLowerCase())
        )
        .sort((a, b) => {
          const aDate = `${a.appointment_date || ""} ${
            a.appointment_time || ""
          }`;
          const bDate = `${b.appointment_date || ""} ${
            b.appointment_time || ""
          }`;

          return aDate.localeCompare(bDate);
        })[0] ?? null
    );
  }, [visibleAppointments]);

  async function runAction(
    appointment: Appointment,
    action: () => Promise<any>,
    successMessage: string
  ): Promise<boolean> {
    setActionLoadingId(appointment.id);

    try {
      await action();
      toast.success(successMessage);
      await load();
      return true;
    } catch (err: any) {
      const message = safeActionError(err, "Action failed. Please try again.");
      toast.error(message);
      return false;
    } finally {
      setActionLoadingId(null);
    }
  }

  function sameTabGo(url: string) {
    if (!url) return;

    if (url.startsWith("http://") || url.startsWith("https://")) {
      window.location.href = url;
      return;
    }

    navigate(url);
  }

  function getRoomUrlFromResult(result: any): string | null {
    return getStartResultRoomUrl(result);
  }

  function openApproveModal(appointment: Appointment) {
    setConfirmModal({
      appointment,
      title: "Approve Appointment",
      body: `Approve appointment #${appointment.id} for ${getPatientName(
        appointment
      )}? RHU staff will accept this request.`,
      confirmText: "Approve",
      tone: "green",
      successMessage: appointment.rhu_id
        ? `Appointment approved for RHU ${appointment.rhu_id}. Add to Queue when the patient arrives.`
        : "Appointment approved. Add to Queue when the patient arrives.",
      action: () => approveAppointment(appointment.id),
    });
  }

  function openStartModal(appointment: Appointment) {
    const isOnline = getAppointmentType(appointment) === "online";

    setConfirmModal({
      appointment,
      title: isOnline ? "Open Telemedicine" : "Start Consultation",
      body: isOnline
        ? `Open online telemedicine consultation for ${getPatientName(
            appointment
          )}? This will create or reuse the telemedicine session, then open the video room with STT and SOAP/AI panel in this same tab.`
        : `Start onsite consultation for ${getPatientName(
            appointment
          )}? This requires the patient to be in service in the Queue.`,
      confirmText: isOnline ? "Open Telemedicine" : "Start Consultation",
      tone: "blue",
      successMessage: isOnline
        ? "Telemedicine consultation opened."
        : "Consultation started.",
      action: () => startConsultationFromAppointment(appointment.id),
    });
  }

  function openScheduleModal(appointment: Appointment) {
    setScheduleTarget(appointment);
    setScheduleDate(toInputDate(appointment.appointment_date));
    setScheduleTime(toInputTime(appointment.appointment_time));
  }

  function openRejectModal(appointment: Appointment) {
    setReasonModal({
      appointment,
      mode: "reject",
      title: "Reject Appointment",
      label: "Reason for rejection",
      defaultReason:
        "Please choose another schedule or visit the RHU for further assistance.",
    });

    setReasonText(
      "Please choose another schedule or visit the RHU for further assistance."
    );
  }

  function openCancelModal(appointment: Appointment) {
    setReasonModal({
      appointment,
      mode: "cancel",
      title: "Cancel Appointment",
      label: "Reason for cancellation",
      defaultReason: "Appointment cancelled by RHU staff.",
    });

    setReasonText("Appointment cancelled by RHU staff.");
  }

  async function submitAddToQueue(appointment: Appointment) {
    const success = await runAction(
      appointment,
      () => addAppointmentToQueue(appointment.id),
      "Patient added to queue."
    );

    if (success) {
      toast.success("Patient is now visible in the RHU queue.");
    }
  }

  async function submitConfirmModal() {
    if (!confirmModal) return;

    setActionLoadingId(confirmModal.appointment.id);

    try {
      const result = await confirmModal.action();
      const roomUrl = getRoomUrlFromResult(result);

      if (roomUrl) {
        toast.success(confirmModal.successMessage);
        await load();
        setConfirmModal(null);
        sameTabGo(roomUrl);
        return;
      }

      if (result?.redirect_to === "consultation" && result?.consultation?.id) {
        toast.success(
          "Telemedicine session already ended. Opening consultation record."
        );
        await load();
        setConfirmModal(null);
        navigate(`/consultations/${result.consultation.id}`);
        return;
      }

      if (result?.consultation?.id) {
        toast.success(confirmModal.successMessage);
        await load();
        setConfirmModal(null);
        navigate(`/consultations/${result.consultation.id}`);
        return;
      }

      toast.success(confirmModal.successMessage);
      await load();
      setConfirmModal(null);
    } catch (err: any) {
      const message = safeActionError(err, "Action failed. Please try again.");
      toast.error(message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function openOngoingTelemedicine(appointment: Appointment) {
    setActionLoadingId(appointment.id);

    try {
      const result = await startConsultationFromAppointment(appointment.id);
      const roomUrl = getRoomUrlFromResult(result);

      if (roomUrl) {
        sameTabGo(roomUrl);
        return;
      }

      if (result?.redirect_to === "consultation" && result?.consultation?.id) {
        navigate(`/consultations/${result.consultation.id}`);
        return;
      }

      toast.error(
        "Telemedicine session exists, but no room URL/session ID was returned."
      );
    } catch (err: any) {
      const message = safeActionError(
        err,
        "Could not open telemedicine room."
      );

      toast.error(message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function submitReasonModal() {
    if (!reasonModal) return;

    const reason = reasonText.trim();

    if (!reason) {
      toast.warning("Please enter a reason before continuing.");
      return;
    }

    const action =
      reasonModal.mode === "reject"
        ? () => rejectAppointment(reasonModal.appointment.id, reason)
        : () => cancelAppointment(reasonModal.appointment.id, reason);

    const success = await runAction(
      reasonModal.appointment,
      action,
      reasonModal.mode === "reject"
        ? "Appointment rejected."
        : "Appointment cancelled."
    );

    if (success) {
      setReasonModal(null);
      setReasonText("");
    }
  }

  async function submitScheduleModal() {
    if (!scheduleTarget) return;

    if (!scheduleDate) {
      toast.warning("Please choose an appointment date.");
      return;
    }

    if (!isValidTime(scheduleTime)) {
      toast.warning("Please choose a valid appointment time.");
      return;
    }

    if (scheduleDate < todayString()) {
      toast.warning("Appointment date cannot be in the past.");
      return;
    }

    if (scheduleTime < "08:00" || scheduleTime > "17:00") {
      toast.warning("Appointment time must be between 08:00 AM and 05:00 PM.");
      return;
    }

    const success = await runAction(
      scheduleTarget,
      () =>
        scheduleAppointment(scheduleTarget.id, {
          appointment_date: scheduleDate,
          appointment_time: scheduleTime,
          notes: "Appointment scheduled by RHU staff.",
        }),
      "Appointment scheduled."
    );

    if (success) {
      setScheduleTarget(null);
    }
  }

  function setQuickSchedule(daysFromToday: number, time: string) {
    setScheduleDate(dateOffsetString(daysFromToday));
    setScheduleTime(time);
  }

  return (
    <div className="no-page-overflow" style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Ka-Agapay RHU Appointments</div>
          <h1 style={heroTitleStyle}>Appointment Management</h1>
          <p style={heroSubtitleStyle}>
            Simple RHU appointment board for approving, scheduling, rejecting,
            adding onsite patients to queue, and starting consultations. Online
            appointments open the telemedicine room in the same tab.
          </p>

          <div style={heroMetaStyle}>
            <span>Total shown: {visibleAppointments.length}</span>
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
          <div style={eyebrowStyle}>Next Action</div>
          {nextAppointment ? (
            <>
              <strong style={nextNameStyle}>
                {getPatientName(nextAppointment)}
              </strong>
              <span style={mutedWhiteStyle}>
                {formatAppointmentDate(nextAppointment.appointment_date)} ·{" "}
                {formatAppointmentTime(nextAppointment.appointment_time)}
              </span>
              <span style={nextStepPillStyle}>
                {getLocalNextStep(nextAppointment)}
              </span>
            </>
          ) : (
            <>
              <strong style={nextNameStyle}>No active appointments</strong>
              <span style={mutedWhiteStyle}>
                Pending, scheduled, or ongoing appointments will appear here.
              </span>
            </>
          )}
        </div>
      </section>

      <section style={instructionGridStyle}>
        <InstructionCard
          number="1"
          title="Review"
          body="Check patient name, mobile number, reason, symptoms, date, and type."
        />
        <InstructionCard
          number="2"
          title="Approve or Reject"
          body="Approve valid requests. Reject only with clear reason."
        />
        <InstructionCard
          number="3"
          title="Queue or Start"
          body="Onsite appointments go to Queue. Online appointments open Telemedicine."
        />
      </section>

      <section style={statsGridStyle}>
        <StatCard
          icon={<Users size={24} />}
          label="Total"
          value={summary.total}
          hint="Appointments in current view"
          tone="teal"
        />
        <StatCard
          icon={<Clock size={24} />}
          label="Needs Review"
          value={summary.pending}
          hint="Pending requests"
          tone="yellow"
        />
        <StatCard
          icon={<Calendar size={24} />}
          label="Scheduled"
          value={summary.scheduled}
          hint="Approved or scheduled"
          tone="green"
        />
        <StatCard
          icon={<MonitorPlay size={24} />}
          label="Online"
          value={summary.online}
          hint="Telemedicine requests"
          tone="blue"
        />
      </section>

      {error ? (
        <section style={errorStyle}>
          <AlertTriangle size={22} />
          <div>
            <strong>Action needed</strong>
            <p>{error}</p>
          </div>
        </section>
      ) : null}

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
            ? "Only appointments that still need action. Closed records move to Completed / History."
            : board === "completed"
            ? "Recently completed appointments (kept for reports & history)."
            : board === "cancelled"
            ? "Cancelled and rejected appointments with their reason."
            : "Completed, cancelled and rejected appointment history."}
        </span>
      </div>

      <section style={toolbarStyle}>
        <div style={searchBoxStyle}>
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search patient, reason, symptoms, mobile..."
            style={searchInputStyle}
          />
        </div>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          style={selectStyle}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="scheduled">Scheduled</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={type}
          onChange={(event) => setType(event.target.value as TypeFilter)}
          style={selectStyle}
        >
          <option value="all">All Types</option>
          <option value="online">Online</option>
          <option value="onsite">Onsite</option>
        </select>

        {canPickRhu ? (
          <select
            value={rhu}
            onChange={(event) => setRhu(event.target.value)}
            style={selectStyle}
            title="Filter by RHU facility"
          >
            <option value="all">All RHUs</option>
            {RHU_OPTIONS.map((option) => (
              <option key={option.id} value={String(option.id)}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        {board === "active" ? (
          // The Active board is scoped to today's appointments server-side, so a
          // date filter here would only ever narrow "today" to nothing.
          <span
            style={todayScopePillStyle}
            title="Active shows today's onsite appointments, plus all telemedicine requests regardless of date"
          >
            📅 Today (onsite) · all telemedicine
          </span>
        ) : (
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            style={selectStyle}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="upcoming">Upcoming</option>
          </select>
        )}

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
            <h2 style={sectionTitleStyle}>Appointment Board</h2>
            <p style={mutedTextStyle}>
              Table shows the next correct action for RHU staff.
            </p>
          </div>

          <Filter size={22} />
        </div>

        {loading ? (
          <div style={emptyStyle}>
            <RefreshCw size={28} />
            <strong>Loading appointments...</strong>
            <span>Please wait.</span>
          </div>
        ) : visibleAppointments.length === 0 ? (
          <div style={emptyStyle}>
            <UserCheck size={28} />
            {search.trim() || status !== "all" || type !== "all" ? (
              <>
                <strong>No appointments match the current filters.</strong>
                <span>
                  Try changing the status, type, or search to see other
                  appointments.
                </span>
              </>
            ) : (
              <>
                <strong>No scheduled appointments found for this view.</strong>
                <span>
                  New requests from residents appear here as “Pending” and need
                  RHU review.
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="responsive-table" style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Patient</th>
                  <th style={thStyle}>RHU</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Date / Time</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}>Symptoms</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Queue Status</th>
                  <th style={thRightStyle}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {visibleAppointments.map((appointment) => {
                  const appointmentType = getAppointmentType(appointment);
                  const reason = getAppointmentReason(appointment);
                  const symptoms = getAppointmentSymptoms(appointment);
                  const isActionLoading = actionLoadingId === appointment.id;
                  const statusText = String(
                    appointment.status || ""
                  ).toLowerCase();
                  const effectiveStatus =
                    getEffectiveAppointmentStatus(appointment);
                  const consultationCompleted =
                    isConsultationCompleted(appointment);
                  const queueStatus = getQueueTicketStatus(appointment);
                  const queueState = getAppointmentQueueState(appointment);
                  const followUp = getAppointmentFollowUp(appointment);

                  return (
                    <tr key={appointment.id} style={trStyle}>
                      <td style={tdStyle}>
                        {appointment.user_id ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/patients/${appointment.user_id}`)}
                            style={patientLinkStyle}
                            title="View patient profile"
                          >
                            {getPatientName(appointment)}
                          </button>
                        ) : (
                          <div style={cellPrimaryStyle}>
                            {getPatientName(appointment)}
                          </div>
                        )}
                        <div style={cellMutedStyle}>
                          #{appointment.id} · {getPatientMobile(appointment)}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        {appointment.rhu_id ? `RHU ${appointment.rhu_id}` : "—"}
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...tableBadgeStyle,
                            ...typeTone(appointmentType),
                          }}
                        >
                          {appointmentType === "online" ? "Online" : "Onsite"}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={cellPrimaryStyle}>
                          {formatAppointmentDate(appointment.appointment_date)}
                        </div>
                        <div style={cellMutedStyle}>
                          {formatAppointmentTime(appointment.appointment_time)}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        {reason && reason !== "—" ? (
                          <div>
                            <span title={reason}>{truncate(reason)}</span>
                            <button
                              type="button"
                              onClick={() => setDetailsAppointment(appointment)}
                              style={viewDetailsLinkStyle}
                            >
                              View details
                            </button>
                          </div>
                        ) : (
                          <span style={cellMutedStyle}>—</span>
                        )}
                      </td>

                      <td style={tdStyle}>
                        {symptoms && symptoms !== "—" ? (
                          <span title={symptoms}>{truncate(symptoms)}</span>
                        ) : (
                          <span style={{ ...cellMutedStyle, fontStyle: "italic" }}>
                            Not yet assessed
                          </span>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...tableBadgeStyle,
                            ...statusTone(effectiveStatus),
                          }}
                        >
                          {getLocalStatusLabel(effectiveStatus)}
                        </span>

                        {(statusText === "cancelled" ||
                          statusText === "rejected") &&
                        (appointment.rejection_reason || appointment.notes) ? (
                          <div
                            style={cellMutedStyle}
                            title={
                              appointment.rejection_reason ||
                              appointment.notes ||
                              ""
                            }
                          >
                            {statusText === "rejected" ? "Reason: " : "Cancelled: "}
                            {truncate(
                              String(
                                appointment.rejection_reason ||
                                  appointment.notes ||
                                  ""
                              ),
                              40
                            )}
                          </div>
                        ) : null}

                        {followUp ? (
                          <span
                            style={followUpPillStyle}
                            title={
                              followUp.date
                                ? `Follow-up: ${formatAppointmentDate(
                                    followUp.date
                                  )}${
                                    followUp.status
                                      ? ` · ${followUp.status}`
                                      : ""
                                  }`
                                : "Has follow-up"
                            }
                          >
                            Has follow-up
                            {followUp.date
                              ? ` · ${formatAppointmentDate(followUp.date)}`
                              : ""}
                          </span>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <div style={queueCellStyle}>
                          <span
                            style={{
                              ...tableBadgeStyle,
                              ...queueState.tone,
                            }}
                          >
                            {queueState.label}
                          </span>

                          <span style={queueHintStyle}>
                            {queueState.description}
                          </span>

                          {queueState.showAddAction ? (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => submitAddToQueue(appointment)}
                              title="Add this approved onsite appointment to the RHU queue."
                              style={smallApproveStyle}
                            >
                              <Users size={14} />
                              {isActionLoading ? "Adding..." : "Add to Queue"}
                            </button>
                          ) : null}

                          {queueStatus ? (
                            <span style={cellMutedStyle}>
                              If missing in Queue, switch to RHU{" "}
                              {appointment.rhu_id ?? "assigned"} and matching
                              desk.
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td style={tdRightStyle}>
                        <div style={tableActionsStyle}>
                          {statusText === "pending" ? (
                            <>
                              <button
                                type="button"
                                disabled={isActionLoading}
                                onClick={() => openApproveModal(appointment)}
                                style={smallApproveStyle}
                              >
                                <CheckCircle2 size={14} />
                                Approve
                              </button>

                              <button
                                type="button"
                                disabled={isActionLoading}
                                onClick={() => openRejectModal(appointment)}
                                style={smallRejectStyle}
                              >
                                <XCircle size={14} />
                                Reject
                              </button>
                            </>
                          ) : null}

                          {canSchedule(appointment) ? (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => openScheduleModal(appointment)}
                              style={smallScheduleStyle}
                            >
                              <Calendar size={14} />
                              Schedule
                            </button>
                          ) : null}

                          {canViewQueue(appointment) ? (
                            <button
                              type="button"
                              onClick={() => navigate("/queue")}
                              style={smallScheduleStyle}
                            >
                              <Users size={14} />
                              View Queue
                            </button>
                          ) : null}

                          {canStart(appointment) ? (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => openStartModal(appointment)}
                              style={smallStartStyle}
                            >
                              <PlayCircle size={14} />
                              {appointmentType === "online"
                                ? "Open Telemedicine"
                                : "Start"}
                            </button>
                          ) : null}

                          {canViewConsultation(appointment) ? (
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/consultations/${getConsultationId(
                                    appointment
                                  )}`
                                )
                              }
                              style={smallScheduleStyle}
                            >
                              <FileText size={14} />
                              Consultation
                            </button>
                          ) : null}

                          {effectiveStatus === "completed" ? (
                            <button
                              type="button"
                              onClick={() => navigate("/prescriptions")}
                              style={smallStartStyle}
                            >
                              <Stethoscope size={14} />
                              Prescription
                            </button>
                          ) : null}

                          {canContinueSoap(appointment) ? (
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/consultations/${getConsultationId(
                                    appointment
                                  )}`
                                )
                              }
                              style={smallStartStyle}
                            >
                              <FileText size={14} />
                              Continue SOAP
                            </button>
                          ) : null}

                          {canOpenOngoingTelemedicine(appointment) &&
                          !consultationCompleted ? (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() =>
                                openOngoingTelemedicine(appointment)
                              }
                              style={smallStartStyle}
                            >
                              <MonitorPlay size={14} />
                              Open Room
                            </button>
                          ) : null}

                          {!isClosed(appointment) &&
                          !consultationCompleted &&
                          statusText !== "pending" &&
                          statusText !== "ongoing" ? (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => openCancelModal(appointment)}
                              style={smallCancelStyle}
                            >
                              <XCircle size={14} />
                              Cancel
                            </button>
                          ) : null}

                          {effectiveStatus === "ongoing" ? (
                            <span style={cellMutedStyle}>Ongoing</span>
                          ) : null}

                          {isActionLoading ? (
                            <span style={cellMutedStyle}>Updating...</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {scheduleTarget ? (
        <ModalShell
          title="Schedule Appointment"
          subtitle={`Appointment #${scheduleTarget.id} · ${getPatientName(
            scheduleTarget
          )}`}
          onClose={() => setScheduleTarget(null)}
        >
          <div style={modalSectionStyle}>
            <div style={patientPreviewStyle}>
              <div>
                <strong>{getPatientName(scheduleTarget)}</strong>
                <span>{getPatientMobile(scheduleTarget)}</span>
              </div>
              <span
                style={{
                  ...badgeStyle,
                  ...typeTone(getAppointmentType(scheduleTarget)),
                }}
              >
                {getAppointmentType(scheduleTarget) === "online"
                  ? "Online"
                  : "Onsite"}
              </span>
            </div>

            <div style={formGridStyle}>
              <label style={fieldLabelStyle}>
                Date
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={fieldLabelStyle}>
                Time
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(event) => setScheduleTime(event.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={quickScheduleStyle}>
              <button
                type="button"
                onClick={() => setQuickSchedule(0, "09:00")}
                style={quickButtonStyle}
              >
                Today 9 AM
              </button>
              <button
                type="button"
                onClick={() => setQuickSchedule(1, "09:00")}
                style={quickButtonStyle}
              >
                Tomorrow 9 AM
              </button>
              <button
                type="button"
                onClick={() => setQuickSchedule(1, "13:00")}
                style={quickButtonStyle}
              >
                Tomorrow 1 PM
              </button>
            </div>

            <div style={modalActionsStyle}>
              <button
                type="button"
                onClick={() => setScheduleTarget(null)}
                style={modalCancelButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoadingId === scheduleTarget.id}
                onClick={submitScheduleModal}
                style={modalPrimaryButtonStyle}
              >
                {actionLoadingId === scheduleTarget.id
                  ? "Saving..."
                  : "Save Schedule"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {confirmModal ? (
        <ModalShell
          title={confirmModal.title}
          subtitle={`Appointment #${confirmModal.appointment.id}`}
          onClose={() => setConfirmModal(null)}
        >
          <div style={modalSectionStyle}>
            <div style={confirmBodyStyle}>{confirmModal.body}</div>

            <div style={modalActionsStyle}>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                style={modalCancelButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoadingId === confirmModal.appointment.id}
                onClick={submitConfirmModal}
                style={
                  confirmModal.tone === "red"
                    ? modalDangerButtonStyle
                    : modalPrimaryButtonStyle
                }
              >
                {actionLoadingId === confirmModal.appointment.id
                  ? "Processing..."
                  : confirmModal.confirmText}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {reasonModal ? (
        <ModalShell
          title={reasonModal.title}
          subtitle={`Appointment #${reasonModal.appointment.id} · ${getPatientName(
            reasonModal.appointment
          )}`}
          onClose={() => setReasonModal(null)}
        >
          <div style={modalSectionStyle}>
            <label style={fieldLabelStyle}>
              {reasonModal.label}
              <textarea
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
                rows={4}
                style={textareaStyle}
              />
            </label>

            <div style={modalActionsStyle}>
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                style={modalCancelButtonStyle}
              >
                Back
              </button>
              <button
                type="button"
                disabled={actionLoadingId === reasonModal.appointment.id}
                onClick={submitReasonModal}
                style={modalDangerButtonStyle}
              >
                {actionLoadingId === reasonModal.appointment.id
                  ? "Processing..."
                  : reasonModal.mode === "reject"
                  ? "Reject Appointment"
                  : "Cancel Appointment"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {detailsAppointment ? (
        <ModalShell
          title="Appointment Details"
          subtitle={`Appointment #${detailsAppointment.id} · ${getPatientName(
            detailsAppointment
          )}`}
          onClose={() => setDetailsAppointment(null)}
        >
          <div style={modalSectionStyle}>
            <div style={detailRowStyle}>
              <span style={fieldLabelStyle}>Date / Time</span>
              <span>
                {formatAppointmentDate(detailsAppointment.appointment_date)} ·{" "}
                {formatAppointmentTime(detailsAppointment.appointment_time)}
              </span>
            </div>

            <div style={detailRowStyle}>
              <span style={fieldLabelStyle}>Type</span>
              <span>
                {getAppointmentType(detailsAppointment) === "online"
                  ? "Online"
                  : "Onsite"}
              </span>
            </div>

            <div>
              <span style={fieldLabelStyle}>Reason</span>
              <p style={detailTextStyle}>
                {getAppointmentReason(detailsAppointment)}
              </p>
            </div>

            {getAppointmentSymptoms(detailsAppointment) &&
            getAppointmentSymptoms(detailsAppointment) !== "—" ? (
              <div>
                <span style={fieldLabelStyle}>Symptoms</span>
                <p style={detailTextStyle}>
                  {getAppointmentSymptoms(detailsAppointment)}
                </p>
              </div>
            ) : null}

            <div style={modalActionsStyle}>
              <button
                type="button"
                onClick={() => setDetailsAppointment(null)}
                style={modalCancelButtonStyle}
              >
                Close
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function InstructionCard({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <article style={instructionCardStyle}>
      <span style={instructionNumberStyle}>{number}</span>
      <div>
        <h3 style={instructionTitleStyle}>{title}</h3>
        <p style={instructionBodyStyle}>{body}</p>
      </div>
    </article>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
  tone: "teal" | "yellow" | "green" | "blue";
}) {
  const toneMap: Record<string, CSSProperties> = {
    teal: { background: "#CCFBF1", color: "#0F766E" },
    yellow: { background: "#FEF3C7", color: "#92400E" },
    green: { background: "#DCFCE7", color: "#166534" },
    blue: { background: "#DBEAFE", color: "#1D4ED8" },
  };

  return (
    <article style={statCardStyle}>
      <div style={{ ...statIconStyle, ...toneMap[tone] }}>{icon}</div>
      <div>
        <div style={statLabelStyle}>{label}</div>
        <strong style={statValueStyle}>{value}</strong>
        <p style={statHintStyle}>{hint}</p>
      </div>
    </article>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div style={modalOverlayStyle}>
      <div style={modalCardStyle}>
        <div style={modalHeaderStyle}>
          <div>
            <h2 style={modalTitleStyle}>{title}</h2>
            {subtitle ? <p style={modalSubtitleStyle}>{subtitle}</p> : null}
          </div>

          <button type="button" onClick={onClose} style={modalCloseStyle}>
            <X size={20} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 20,
  padding: "24px 28px 48px",
  background: "#F8FAFC",
  minHeight: "100vh",
  minWidth: 0,
  maxWidth: "100%",
  overflowX: "hidden",
  color: "#0F172A",
};

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
  gap: 24,
  alignItems: "center",
  borderRadius: 28,
  padding: 32,
  background: "linear-gradient(135deg, #047857 0%, #14B8A6 100%)",
  color: "#FFFFFF",
  boxShadow: "0 18px 45px rgba(15, 118, 110, 0.22)",
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

const followUpPillStyle: CSSProperties = {
  display: "inline-block",
  marginTop: 6,
  padding: "3px 8px",
  borderRadius: 999,
  background: "#EEF2FF",
  color: "#4338CA",
  border: "1px solid #C7D2FE",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.92,
};

const heroTitleStyle: CSSProperties = {
  margin: "10px 0 8px",
  fontSize: 38,
  lineHeight: 1,
  fontWeight: 900,
};

const heroSubtitleStyle: CSSProperties = {
  maxWidth: 760,
  margin: 0,
  fontSize: 16,
  lineHeight: 1.7,
  fontWeight: 700,
  opacity: 0.95,
};

const heroMetaStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 18,
  fontSize: 13,
  fontWeight: 800,
};

const nextCardStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 18,
  borderRadius: 20,
  background: "rgba(255,255,255,0.16)",
  border: "1px solid rgba(255,255,255,0.24)",
  backdropFilter: "blur(10px)",
};

const nextNameStyle: CSSProperties = {
  fontSize: 22,
  lineHeight: 1.2,
};

const mutedWhiteStyle: CSSProperties = {
  color: "rgba(255,255,255,0.86)",
  fontSize: 13,
  fontWeight: 700,
};

const nextStepPillStyle: CSSProperties = {
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.18)",
  fontSize: 13,
  fontWeight: 800,
};

const instructionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
  gap: 16,
};

const instructionCardStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
  padding: 22,
  borderRadius: 20,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
};

const instructionNumberStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minWidth: 34,
  height: 34,
  borderRadius: 12,
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 900,
};

const instructionTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 16,
  fontWeight: 900,
};

const instructionBodyStyle: CSSProperties = {
  margin: 0,
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.6,
  fontWeight: 600,
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
  gap: 16,
};

const statCardStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "center",
  padding: 22,
  borderRadius: 20,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
};

const statIconStyle: CSSProperties = {
  width: 52,
  height: 52,
  display: "grid",
  placeItems: "center",
  borderRadius: 18,
};

const statLabelStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  textTransform: "uppercase",
  fontWeight: 900,
};

const statValueStyle: CSSProperties = {
  display: "block",
  fontSize: 30,
  lineHeight: 1,
  color: "#0F766E",
  marginTop: 4,
};

const statHintStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#64748B",
  fontSize: 13,
  fontWeight: 600,
};

const errorStyle: CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  padding: 16,
  borderRadius: 18,
  color: "#991B1B",
  background: "#FEF2F2",
  border: "1px solid #FECACA",
};

const toolbarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
  gap: 12,
  alignItems: "center",
  padding: 16,
  borderRadius: 18,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
};

const searchBoxStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: "0 14px",
  height: 48,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#0F172A",
  fontWeight: 700,
};

const selectStyle: CSSProperties = {
  height: 48,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  padding: "0 14px",
  fontWeight: 800,
  color: "#0F172A",
};

const todayScopePillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 48,
  borderRadius: 999,
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
  padding: "0 16px",
  fontWeight: 800,
  fontSize: 13.5,
  color: "#0F766E",
  whiteSpace: "nowrap",
};

const refreshButtonStyle: CSSProperties = {
  height: 48,
  border: "none",
  borderRadius: 999,
  background: "#047857",
  color: "#FFFFFF",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const boardStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 22,
  borderRadius: 18,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  boxShadow: "0 16px 32px rgba(15, 23, 42, 0.05)",
  minWidth: 0,
  maxWidth: "100%",
  overflow: "hidden",
};

const boardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
};

const mutedTextStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#64748B",
  fontSize: 14,
  fontWeight: 600,
};

const emptyStyle: CSSProperties = {
  minHeight: 220,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: 8,
  color: "#64748B",
  borderRadius: 16,
  border: "1px dashed #CBD5E1",
  background: "#F8FAFC",
  padding: 24,
};

const tableWrapStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
  borderRadius: 16,
  border: "1px solid #E2E8F0",
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: 1220,
  borderCollapse: "collapse",
  background: "#FFFFFF",
};

const thStyle: CSSProperties = {
  padding: "14px 16px",
  background: "#F8FAFC",
  color: "#334155",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 900,
  textAlign: "left",
  borderBottom: "1px solid #E2E8F0",
};

const thRightStyle: CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const trStyle: CSSProperties = {
  borderBottom: "1px solid #EEF2F7",
};

const tdStyle: CSSProperties = {
  padding: "16px",
  verticalAlign: "top",
  color: "#0F172A",
  fontSize: 14,
  fontWeight: 700,
};

const tdRightStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};

const cellPrimaryStyle: CSSProperties = {
  fontWeight: 900,
  color: "#0F172A",
};

const cellMutedStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "#64748B",
  fontSize: 12,
  fontWeight: 700,
};

const tableBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 26,
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  lineHeight: 1,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const badgeStyle: CSSProperties = {
  ...tableBadgeStyle,
};

const queueCellStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxWidth: 260,
};

const queueHintStyle: CSSProperties = {
  color: "#334155",
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 700,
};

const tableActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  alignItems: "center",
  flexWrap: "wrap",
};

const smallButtonBaseStyle: CSSProperties = {
  minHeight: 34,
  border: "none",
  borderRadius: 999,
  padding: "7px 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const smallApproveStyle: CSSProperties = {
  ...smallButtonBaseStyle,
  background: "#DCFCE7",
  color: "#166534",
};

const smallRejectStyle: CSSProperties = {
  ...smallButtonBaseStyle,
  background: "#FEE2E2",
  color: "#B91C1C",
};

const smallScheduleStyle: CSSProperties = {
  ...smallButtonBaseStyle,
  background: "#F1F5F9",
  color: "#0F172A",
};

const smallStartStyle: CSSProperties = {
  ...smallButtonBaseStyle,
  background: "#2563EB",
  color: "#FFFFFF",
};

const smallCancelStyle: CSSProperties = {
  ...smallButtonBaseStyle,
  background: "#FEE2E2",
  color: "#B91C1C",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(15, 23, 42, 0.56)",
  backdropFilter: "blur(4px)",
  zIndex: 60,
};

const modalCardStyle: CSSProperties = {
  width: "min(520px, 100%)",
  // Never exceed the viewport on short/phone screens — scroll inside instead
  // of overflowing off-screen (the overlay pads 24px top+bottom).
  maxHeight: "calc(100vh - 48px)",
  overflowY: "auto",
  borderRadius: 18,
  padding: 22,
  background: "#FFFFFF",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 16,
};

const modalTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 900,
};

const modalSubtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748B",
  fontSize: 13,
  fontWeight: 800,
};

const modalCloseStyle: CSSProperties = {
  border: "none",
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  background: "#F1F5F9",
  color: "#0F172A",
  cursor: "pointer",
};

const modalSectionStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const confirmBodyStyle: CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "#F8FAFC",
  color: "#334155",
  fontSize: 15,
  lineHeight: 1.6,
  fontWeight: 800,
};

const patientPreviewStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "center",
  padding: 14,
  borderRadius: 14,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  // Collapses to one column on phones / narrow panels so form fields are never
  // cramped or clipped at 100% browser zoom.
  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
  gap: 12,
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  color: "#334155",
  fontSize: 13,
  fontWeight: 900,
};

const patientLinkStyle: CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  color: "#0F766E",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

const viewDetailsLinkStyle: CSSProperties = {
  display: "block",
  marginTop: 3,
  padding: 0,
  border: "none",
  background: "none",
  color: "#0F766E",
  fontSize: 11.5,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};

const detailRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 13.5,
  color: "#0F172A",
};

const detailTextStyle: CSSProperties = {
  margin: "6px 0 0",
  padding: "10px 12px",
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "#0F172A",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const inputStyle: CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  padding: "0 12px",
  fontWeight: 800,
  color: "#0F172A",
};

const textareaStyle: CSSProperties = {
  minHeight: 120,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  padding: 12,
  fontWeight: 700,
  color: "#0F172A",
  resize: "vertical",
};

const quickScheduleStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const quickButtonStyle: CSSProperties = {
  border: "1px solid #99F6E4",
  borderRadius: 999,
  padding: "8px 12px",
  background: "#F0FDFA",
  color: "#0F766E",
  fontWeight: 900,
  cursor: "pointer",
};

const modalActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 4,
};

const modalCancelButtonStyle: CSSProperties = {
  height: 42,
  borderRadius: 999,
  border: "1px solid #CBD5E1",
  padding: "0 16px",
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 900,
  cursor: "pointer",
};

const modalPrimaryButtonStyle: CSSProperties = {
  height: 42,
  borderRadius: 999,
  border: "none",
  padding: "0 16px",
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 900,
  cursor: "pointer",
};

const modalDangerButtonStyle: CSSProperties = {
  height: 42,
  borderRadius: 999,
  border: "none",
  padding: "0 16px",
  background: "#DC2626",
  color: "#FFFFFF",
  fontWeight: 900,
  cursor: "pointer",
};
