// src/services/appointments.ts

import apiClient from "../lib/apiClient";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "approved"
  | "scheduled"
  | "ongoing"
  | "completed"
  | "cancelled"
  | "rejected";

export type ConsultationType = "online" | "onsite";

export interface AppointmentUser {
  user_id?: number;
  id?: number;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  name?: string;
  email?: string;
  mobile_number?: string;
  phone?: string;
}

export interface Appointment {
  id: number;
  user_id: number;
  handled_by?: number | null;
  rhu_id?: number | null;

  appointment_date: string;
  appointment_time?: string | null;

  purpose?: string | null;
  status: AppointmentStatus;
  notes?: string | null;

  consultation_type?: ConsultationType | string | null;
  reason?: string | null;
  symptoms?: string | null;
  rejection_reason?: string | null;

  approved_at?: string | null;
  scheduled_at?: string | null;

  created_at?: string;
  updated_at?: string;

  resident?: AppointmentUser | null;
  handler?: AppointmentUser | null;
  rhu?: any | null;
  consultation?: any | null;
  queue_ticket?: any | null;
  telemedicine_request?: any | null;
  telemedicine_session?: any | null;
  room_url?: string | null;
  join_url?: string | null;
  latest_follow_up?: any | null;
}

export type AppointmentBoard =
  | "active"
  | "completed"
  | "cancelled"
  | "history"
  | "all";

export interface AppointmentFilters {
  search?: string;
  status?: string;
  type?: string;
  date?: string;
  rhu_id?: string;
  board?: AppointmentBoard | string;
  include_archived?: string;
  completed_from?: string;
  completed_to?: string;
}

export interface AppointmentSummary {
  total: number;
  pending: number;
  approved: number;
  scheduled: number;
  ongoing: number;
  completed: number;
  cancelled: number;
  rejected: number;
  online: number;
  onsite: number;
  today: number;
  needsAction: number;
}

function extractArray<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.appointments)) return payload.appointments;
  return [];
}

function extractAppointment(payload: any): Appointment {
  return payload?.appointment ?? payload?.data?.appointment ?? payload?.data ?? payload;
}

function safeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown): AppointmentStatus {
  const status = safeString(value).toLowerCase();

  if (
    status === "pending" ||
    status === "confirmed" ||
    status === "approved" ||
    status === "scheduled" ||
    status === "ongoing" ||
    status === "completed" ||
    status === "cancelled" ||
    status === "rejected"
  ) {
    return status;
  }

  return "pending";
}

function normalizeType(value: unknown, purpose?: string | null): ConsultationType {
  const raw = `${safeString(value)} ${safeString(purpose)}`.toLowerCase();

  if (raw.includes("online") || raw.includes("telemedicine")) {
    return "online";
  }

  return "onsite";
}

export function normalizeAppointment(raw: any): Appointment {
  const appointment = raw?.appointment ?? raw;

  const telemedicineRequest =
    appointment?.telemedicine_request ??
    appointment?.telemedicineRequest ??
    null;

  const telemedicineSession =
    appointment?.telemedicine_session ??
    appointment?.telemedicineSession ??
    telemedicineRequest?.session ??
    null;

  return {
    id: Number(appointment?.id ?? 0),
    user_id: Number(appointment?.user_id ?? appointment?.resident?.user_id ?? 0),

    handled_by:
      appointment?.handled_by !== undefined && appointment?.handled_by !== null
        ? Number(appointment.handled_by)
        : null,

    rhu_id:
      appointment?.rhu_id !== undefined && appointment?.rhu_id !== null
        ? Number(appointment.rhu_id)
        : null,

    appointment_date: safeString(appointment?.appointment_date),
    appointment_time: appointment?.appointment_time ?? null,

    purpose: appointment?.purpose ?? null,
    status: normalizeStatus(appointment?.status),
    notes: appointment?.notes ?? null,

    consultation_type: normalizeType(
      appointment?.consultation_type,
      appointment?.purpose
    ),
    reason: appointment?.reason ?? null,
    symptoms: appointment?.symptoms ?? null,
    rejection_reason: appointment?.rejection_reason ?? null,

    approved_at: appointment?.approved_at ?? null,
    scheduled_at: appointment?.scheduled_at ?? null,

    created_at: appointment?.created_at ?? null,
    updated_at: appointment?.updated_at ?? null,

    resident: appointment?.resident ?? null,
    handler: appointment?.handler ?? null,
    rhu: appointment?.rhu ?? null,
    consultation: appointment?.consultation ?? null,
    queue_ticket: appointment?.queue_ticket ?? appointment?.queueTicket ?? null,
    telemedicine_request: telemedicineRequest,
    telemedicine_session: telemedicineSession,

    room_url:
      appointment?.room_url ??
      appointment?.roomUrl ??
      telemedicineSession?.room_url ??
      telemedicineSession?.roomUrl ??
      null,

    join_url:
      appointment?.join_url ??
      appointment?.joinUrl ??
      telemedicineSession?.join_url ??
      telemedicineSession?.joinUrl ??
      null,

    latest_follow_up:
      appointment?.latest_follow_up ?? appointment?.latestFollowUp ?? null,
  };
}

export interface AppointmentFollowUpInfo {
  date: string | null;
  status: string | null;
  active: boolean;
}

/**
 * Follow-up summary for an appointment — used to show a "Has follow-up"
 * indicator on the board even after the appointment has moved to history.
 */
export function getAppointmentFollowUp(
  appointment: Appointment
): AppointmentFollowUpInfo | null {
  const f = appointment.latest_follow_up;
  if (!f) return null;

  const status = String(f.status ?? "").toLowerCase() || null;

  return {
    date:
      f.follow_up_at ??
      f.follow_up_date ??
      f.follow_up_start_date ??
      null,
    status,
    active: status === "pending" || status === "scheduled",
  };
}

export async function getAppointments(
  filters: AppointmentFilters = {}
): Promise<Appointment[]> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "all") {
      params.append(key, value);
    }
  });

  const query = params.toString();
  const url = query ? `/admin/appointments?${query}` : "/admin/appointments";

  const response = await apiClient.get(url);

  return extractArray<any>(response.data).map(normalizeAppointment);
}

export async function getAppointment(id: string | number): Promise<Appointment> {
  const response = await apiClient.get(`/admin/appointments/${id}`);
  return normalizeAppointment(extractAppointment(response.data));
}

export async function updateAppointmentStatus(
  id: string | number,
  status: AppointmentStatus,
  payload: {
    notes?: string | null;
    rejection_reason?: string | null;
    appointment_date?: string | null;
    appointment_time?: string | null;
  } = {}
): Promise<Appointment> {
  const response = await apiClient.patch(`/admin/appointments/${id}/status`, {
    status,
    ...payload,
  });

  return normalizeAppointment(extractAppointment(response.data));
}

export async function approveAppointment(
  id: string | number
): Promise<Appointment> {
  return updateAppointmentStatus(id, "approved", {
    notes: "Appointment approved by RHU staff.",
  });
}

export async function scheduleAppointment(
  id: string | number,
  schedule?: {
    appointment_date?: string | null;
    appointment_time?: string | null;
    notes?: string | null;
  }
): Promise<Appointment> {
  return updateAppointmentStatus(id, "scheduled", {
    appointment_date: schedule?.appointment_date ?? undefined,
    appointment_time: schedule?.appointment_time ?? undefined,
    notes: schedule?.notes ?? "Appointment scheduled by RHU staff.",
  });
}

export async function rejectAppointment(
  id: string | number,
  notes?: string
): Promise<Appointment> {
  const reason = notes || "Appointment rejected by RHU staff.";

  return updateAppointmentStatus(id, "rejected", {
    notes: reason,
    rejection_reason: reason,
  });
}

export async function cancelAppointment(
  id: string | number,
  notes?: string
): Promise<Appointment> {
  const reason = notes || "Appointment cancelled by RHU staff.";

  return updateAppointmentStatus(id, "cancelled", {
    notes: reason,
    rejection_reason: reason,
  });
}

export async function completeAppointment(
  id: string | number,
  notes?: string
): Promise<Appointment> {
  return updateAppointmentStatus(id, "completed", {
    notes: notes || "Appointment completed.",
  });
}

export async function startConsultationFromAppointment(
  id: string | number
): Promise<any> {
  const response = await apiClient.post(
    `/admin/appointments/${id}/start-consultation`
  );

  return response.data?.data ?? response.data;
}

export async function addAppointmentToQueue(
  id: string | number
): Promise<Appointment> {
  const response = await apiClient.post(
    `/admin/appointments/${id}/add-to-queue`
  );

  return normalizeAppointment(extractAppointment(response.data));
}

/**
 * Robust telemedicine room mapper.
 * This prevents the false error:
 * "Telemedicine room was not returned by the backend."
 */
export function getStartResultRoomUrl(result: any): string | null {
  const candidates = [
    result?.room?.url,
    result?.room?.join_url,
    result?.room?.room_url,

    result?.room_url,
    result?.join_url,
    result?.roomUrl,
    result?.joinUrl,

    result?.telemedicine_session?.room_url,
    result?.telemedicine_session?.join_url,
    result?.telemedicine_session?.roomUrl,
    result?.telemedicine_session?.joinUrl,

    result?.telemedicineSession?.room_url,
    result?.telemedicineSession?.join_url,
    result?.telemedicineSession?.roomUrl,
    result?.telemedicineSession?.joinUrl,

    result?.session?.room_url,
    result?.session?.join_url,
    result?.session?.roomUrl,
    result?.session?.joinUrl,

    result?.appointment?.room_url,
    result?.appointment?.join_url,
    result?.appointment?.roomUrl,
    result?.appointment?.joinUrl,

    result?.appointment?.telemedicine_session?.room_url,
    result?.appointment?.telemedicine_session?.join_url,
    result?.appointment?.telemedicine_session?.roomUrl,
    result?.appointment?.telemedicine_session?.joinUrl,

    result?.appointment?.telemedicine_request?.session?.room_url,
    result?.appointment?.telemedicine_request?.session?.join_url,
    result?.appointment?.telemedicine_request?.session?.roomUrl,
    result?.appointment?.telemedicine_request?.session?.joinUrl,

    result?.telemedicine_request?.session?.room_url,
    result?.telemedicine_request?.session?.join_url,
    result?.telemedicine_request?.session?.roomUrl,
    result?.telemedicine_request?.session?.joinUrl,
  ];

  const direct = candidates.find(
    (value) => typeof value === "string" && value.trim()
  );

  if (direct) {
    return direct.trim();
  }

  const sessionId =
    result?.telemedicine_session?.id ??
    result?.telemedicineSession?.id ??
    result?.session?.id ??
    result?.appointment?.telemedicine_session?.id ??
    result?.appointment?.telemedicine_request?.session?.id ??
    result?.telemedicine_request?.session?.id ??
    null;

  if (sessionId) {
    return `/telemedicine/room/${sessionId}`;
  }

  return null;
}

export function getQueueTicketStatus(appointment: Appointment): string | null {
  const status = appointment.queue_ticket?.status;
  return status ? String(status).toLowerCase() : null;
}

// =============================================================================
// EFFECTIVE STATUS HELPERS
//
// The raw appointment.status can lag behind reality (e.g. the SOAP consultation
// is already completed but the appointment row still says "ongoing"). These
// helpers derive the TRUE state from the consultation + telemedicine session so
// the UI never shows a completed consultation as still ongoing / Open Room.
// =============================================================================

export type EffectiveAppointmentStatus = AppointmentStatus | "needs_soap";

export function getTelemedicineSession(appointment: Appointment): any {
  return (
    appointment.telemedicine_session ??
    appointment.telemedicine_request?.session ??
    null
  );
}

export function getConsultationStatus(appointment: Appointment): string | null {
  const raw =
    appointment.consultation?.status ??
    getTelemedicineSession(appointment)?.consultation?.status ??
    null;

  return raw ? String(raw).toLowerCase() : null;
}

export function isConsultationCompleted(appointment: Appointment): boolean {
  return getConsultationStatus(appointment) === "completed";
}

export function getTelemedicineSessionStatus(
  appointment: Appointment
): string | null {
  const raw = getTelemedicineSession(appointment)?.status ?? null;
  return raw ? String(raw).toLowerCase() : null;
}

export function isTelemedicineSessionActive(appointment: Appointment): boolean {
  const status = getTelemedicineSessionStatus(appointment);
  return status !== null && ["active", "waiting", "paused"].includes(status);
}

export function isTelemedicineSessionEnded(appointment: Appointment): boolean {
  const status = getTelemedicineSessionStatus(appointment);
  return status !== null && ["ended", "no_show", "cancelled"].includes(status);
}

/**
 * Effective status rule:
 *  1. consultation completed              -> "completed"
 *  2. telemedicine session ended but the
 *     consultation is not yet completed   -> "needs_soap"
 *  3. otherwise                           -> raw appointment.status
 */
export function getEffectiveAppointmentStatus(
  appointment: Appointment
): EffectiveAppointmentStatus {
  if (isConsultationCompleted(appointment)) {
    return "completed";
  }

  if (
    getAppointmentType(appointment) === "online" &&
    isTelemedicineSessionEnded(appointment)
  ) {
    return "needs_soap";
  }

  return normalizeStatus(appointment.status);
}

export function getConsultationId(appointment: Appointment): number | null {
  const id =
    appointment.consultation?.id ??
    appointment.telemedicine_session?.consultation_id ??
    appointment.telemedicine_session?.consultation?.id ??
    appointment.telemedicine_request?.session?.consultation_id ??
    appointment.telemedicine_request?.session?.consultation?.id ??
    null;

  const parsed = Number(id);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getPatientName(appointment: Appointment): string {
  const user = appointment.resident;

  if (user) {
    if (user.full_name?.trim()) return user.full_name.trim();
    if (user.name?.trim()) return user.name.trim();

    const composed = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (composed) return composed;

    if (user.email?.trim()) return user.email.trim();
    if (user.mobile_number?.trim()) return user.mobile_number.trim();
    if (user.phone?.trim()) return user.phone.trim();
  }

  return `Patient #${appointment.user_id || "—"}`;
}

export function getPatientMobile(appointment: Appointment): string {
  return (
    appointment.resident?.mobile_number ||
    appointment.resident?.phone ||
    "No mobile number"
  );
}

export function getAppointmentType(appointment: Appointment): ConsultationType {
  return normalizeType(appointment.consultation_type, appointment.purpose);
}

export function getAppointmentReason(appointment: Appointment): string {
  if (appointment.reason?.trim()) {
    return appointment.reason.trim();
  }

  const purpose = appointment.purpose || "";

  const reasonLine = purpose
    .split("\n")
    .find((line) => line.toLowerCase().startsWith("reason:"));

  if (reasonLine) {
    return reasonLine.replace(/^reason:\s*/i, "").trim();
  }

  return purpose.trim() || "—";
}

export function getAppointmentSymptoms(appointment: Appointment): string {
  if (appointment.symptoms?.trim()) {
    return appointment.symptoms.trim();
  }

  const purpose = appointment.purpose || "";

  const symptomsLine = purpose
    .split("\n")
    .find((line) => line.toLowerCase().startsWith("symptoms:"));

  if (symptomsLine) {
    return symptomsLine.replace(/^symptoms:\s*/i, "").trim();
  }

  return "—";
}

export function getAppointmentScheduleLabel(appointment: Appointment): string {
  const date = formatAppointmentDate(appointment.appointment_date);
  const time = formatAppointmentTime(appointment.appointment_time);

  return `${date} · ${time}`;
}

export function formatAppointmentDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatAppointmentTime(value?: string | null): string {
  if (!value) return "No time";

  return String(value).slice(0, 5);
}

export function getAppointmentStatusLabel(
  status: string | null | undefined
): string {
  switch (status) {
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

export function getAppointmentNextStep(appointment: Appointment): string {
  switch (appointment.status) {
    case "pending":
      return "Review request, then approve or reject.";
    case "approved":
    case "confirmed":
      return getAppointmentType(appointment) === "online"
        ? "Open telemedicine when staff and patient are ready."
        : "Schedule appointment or start consultation.";
    case "scheduled":
      return getAppointmentType(appointment) === "online"
        ? "Open telemedicine room when staff and patient are ready."
        : "Patient is ready for consultation.";
    case "ongoing":
      return getAppointmentType(appointment) === "online"
        ? "Telemedicine consultation is ongoing. Continue SOAP documentation."
        : "Consultation is ongoing. Complete SOAP when finished.";
    case "completed":
      return "Consultation has been completed.";
    case "cancelled":
      return "Appointment was cancelled.";
    case "rejected":
      return "Appointment was rejected.";
    default:
      return "Review appointment.";
  }
}

export function buildAppointmentSummary(
  appointments: Appointment[]
): AppointmentSummary {
  const today = new Date().toISOString().slice(0, 10);

  return {
    total: appointments.length,
    pending: appointments.filter((item) => item.status === "pending").length,
    approved: appointments.filter((item) => item.status === "approved").length,
    scheduled: appointments.filter((item) =>
      ["confirmed", "approved", "scheduled"].includes(item.status)
    ).length,
    ongoing: appointments.filter((item) => item.status === "ongoing").length,
    completed: appointments.filter((item) => item.status === "completed").length,
    cancelled: appointments.filter((item) => item.status === "cancelled").length,
    rejected: appointments.filter((item) => item.status === "rejected").length,
    online: appointments.filter((item) => getAppointmentType(item) === "online")
      .length,
    onsite: appointments.filter((item) => getAppointmentType(item) === "onsite")
      .length,
    today: appointments.filter(
      (item) => item.appointment_date?.slice(0, 10) === today
    ).length,
    needsAction: appointments.filter((item) => item.status === "pending").length,
  };
}