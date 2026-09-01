// src/services/queue.ts

import apiClient from "../lib/apiClient";
import {
  calculateAge,
  normalizeBarangayName,
  normalizePatientName,
  normalizeQueuePriority,
} from "../utils/rhuAnalyticsHelpers";

export type QueueServiceType =
  | "opd_consultation"
  | "prenatal_checkup"
  | "immunization"
  | "family_planning"
  | "tb_dots"
  | "laboratory"
  | "dental"
  | "emergency"
  | "medicine_release"
  | "bhw_assisted";

export type QueueStatus =
  | "waiting"
  | "called"
  | "in_service"
  | "completed"
  | "skipped"
  | "cancelled"
  | "no_show"
  | string;

export interface QueueTicket {
  id: number | string;
  ticket_number: string;

  patient_name?: string | null;
  resident_name?: string | null;
  patient_age?: number | null;
  patient_age_label?: string | null;
  patient_barangay?: string | null;
  chief_complaint?: string | null;

  rhu_id?: number | null;
  rhu_name?: string | null;

  service_type: QueueServiceType | string;
  service_label?: string | null;

  queue_type?: string | null;
  source?: string | null;
  appointment_id?: number | null;
  consultation_id?: number | null;
  status: QueueStatus;

  priority_category?: string | null;
  priority_level?: string | null;
  priority_score?: number | null;
  priority_reason?: string | null;
  priority_display_label?: string | null;

  queue_position?: number | null;
  call_attempt?: number | null;

  issued_at?: string | null;
  called_at?: string | null;
  service_started_at?: string | null;
  service_ended_at?: string | null;
  cancelled_at?: string | null;

  wait_time_minutes?: number | null;
  current_wait_minutes?: number | null;
  service_time_minutes?: number | null;

  is_senior?: boolean;
  is_pregnant?: boolean;
  is_pwd?: boolean;
  is_pediatric?: boolean;
  is_emergency?: boolean;
  is_bhw_endorsed?: boolean;

  notes?: string | null;
  cancellation_reason?: string | null;

  notification?: QueueNotificationResult | null;
}

export interface QueueNotificationResult {
  database_created?: boolean;
  push_configured?: boolean;
  push_tokens?: number;
  push_sent?: boolean;
  sound?: "default" | "custom" | string;
  message?: string;
}

export interface QueueSummary {
  total_issued: number;
  total_served_today: number;
  currently_waiting: number;
  waiting: number;
  called: number;
  in_service: number;
  completed: number;
  skipped: number;
  cancelled: number;
  no_show: number;
  emergency_waiting: number;
  priority_waiting: number;
  average_wait_minutes: number;
  average_service_minutes: number;
  total_active_queues: number;
  congestion_level?: "low" | "moderate" | "high" | "critical" | string;
}

export interface LiveQueueResponse {
  waiting: QueueTicket[];
  called: QueueTicket[];
  in_service: QueueTicket[];
  tickets: QueueTicket[];
}

export interface QueueParams {
  rhu_id?: number;
  service_type?: QueueServiceType | string;
  date?: string;
}

export const DEFAULT_QUEUE_SERVICE_TYPE: QueueServiceType = "opd_consultation";

export const QUEUE_SERVICE_OPTIONS: Array<{
  value: QueueServiceType;
  label: string;
  helper: string;
}> = [
  {
    value: "opd_consultation",
    label: "OPD Consultation",
    helper: "General check-up and common illness concerns",
  },
  {
    value: "prenatal_checkup",
    label: "Prenatal Checkup",
    helper: "Pregnant patients and maternal care",
  },
  {
    value: "immunization",
    label: "Immunization",
    helper: "Vaccination and child immunization",
  },
  {
    value: "family_planning",
    label: "Family Planning",
    helper: "Family planning consultation and services",
  },
  {
    value: "tb_dots",
    label: "TB DOTS",
    helper: "Tuberculosis treatment and follow-up",
  },
  {
    value: "laboratory",
    label: "Laboratory",
    helper: "Lab request and specimen processing",
  },
  {
    value: "dental",
    label: "Dental",
    helper: "Dental consultation and treatment",
  },
  {
    value: "emergency",
    label: "Emergency",
    helper: "Urgent cases that need immediate attention",
  },
  {
    value: "medicine_release",
    label: "Medicine Release",
    helper: "Prescription claiming and medicine release",
  },
  {
    value: "bhw_assisted",
    label: "BHW Assisted",
    helper: "Barangay Health Worker endorsed patients",
  },
];

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function readStorageNumber(keys: string[], fallback: number): number {
  if (typeof window === "undefined") return fallback;

  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    const parsed = Number(value);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function readPersistedAdminUser(): any | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("ka_agapay_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readUserRoleName(user: any): string {
  if (!user) return "";

  const role = user.role;

  const raw =
    (typeof role === "string" ? role : role?.name ?? role?.role_name ?? role?.slug) ??
    user.role_name ??
    user.user_role ??
    user.account_type ??
    "";

  return String(raw).toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * RHU the logged-in staff/admin is bound to.
 * Mirrors the backend: prefer assigned_rhu_id, then rhu_id, then barangay_id.
 */
export function getCurrentUserRhuId(): number {
  const user = readPersistedAdminUser();

  const candidate = Number(
    user?.assigned_rhu_id ?? user?.rhu_id ?? user?.barangay_id ?? 0
  );

  if (Number.isFinite(candidate) && candidate > 0) {
    return candidate;
  }

  return readStorageNumber(["ka_agapay_rhu_id", "rhu_id"], 1);
}

/**
 * super_admin / mho may view and filter ALL RHUs. Everyone else is locked to
 * their own RHU (the backend enforces this regardless of what is sent).
 */
export function isGlobalRhuRole(): boolean {
  const role = readUserRoleName(readPersistedAdminUser());
  return role === "super_admin" || role === "superadmin" || role === "mho";
}

export function getDefaultRhuId(): number {
  return getCurrentUserRhuId();
}

export function getServiceLabel(serviceType?: string | null): string {
  const found = QUEUE_SERVICE_OPTIONS.find((item) => item.value === serviceType);

  if (found) return found.label;

  return String(serviceType || "opd_consultation")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeTicketPayload(item: any): QueueTicket {
  const priority = item?.priority ?? {};
  const flags = priority?.flags ?? {};
  const patient =
    item?.patient ??
    item?.resident ??
    item?.user ??
    item?.resident_profile ??
    item?.appointment?.patient ??
    item?.appointment?.resident ??
    item?.appointment?.user ??
    null;
  const serviceType = String(item?.service_type ?? "opd_consultation");
  const patientName = normalizePatientName(
    item?.patient_name,
    item?.resident_name,
    patient,
    item?.resident_profile,
    item?.patient,
    item?.resident,
    item?.user
  );
  const patientAge = calculateAge(
    item,
    patient,
    item?.resident_profile,
    item?.patient,
    item?.resident,
    item?.user
  );
  const chiefComplaint =
    item?.chief_complaint ??
    item?.complaint ??
    item?.reason_for_visit ??
    item?.visit_reason ??
    item?.appointment?.reason ??
    item?.appointment?.chief_complaint ??
    item?.notes ??
    null;
  const barangay = normalizeBarangayName(
    item?.barangay ??
      item?.patient_barangay ??
      patient?.barangay ??
      patient?.barangay_name ??
      patient?.address?.barangay ??
      item?.resident_profile?.barangay
  );
  const priorityDisplay = normalizeQueuePriority({
    ...item,
    notes: chiefComplaint ?? item?.notes,
    is_senior: toBoolean(item?.is_senior ?? flags?.is_senior),
    is_pregnant: toBoolean(item?.is_pregnant ?? flags?.is_pregnant),
    is_pwd: toBoolean(item?.is_pwd ?? flags?.is_pwd),
    is_pediatric: toBoolean(item?.is_pediatric ?? flags?.is_pediatric),
    is_emergency: toBoolean(item?.is_emergency ?? flags?.is_emergency),
    is_bhw_endorsed: toBoolean(item?.is_bhw_endorsed ?? flags?.is_bhw_endorsed),
    priority_category: item?.priority_category ?? priority?.category ?? item?.queue_type,
    priority_level: item?.priority_level ?? priority?.level,
    priority_score: item?.priority_score ?? priority?.score,
  });

  return {
    id: item?.id ?? item?.ticket_number ?? item?.queue_number ?? crypto.randomUUID(),
    ticket_number: String(
      item?.ticket_number ?? item?.queue_number ?? item?.id ?? "—"
    ),

    patient_name: patientName,

    resident_name:
      normalizePatientName(
        item?.resident_name,
        item?.resident_profile,
        item?.resident,
        item?.patient_name
      ) || patientName,
    patient_age: patientAge,
    patient_age_label:
      typeof patientAge === "number" ? `${patientAge} yrs old` : "Age not available",
    patient_barangay: barangay === "Unspecified" ? null : barangay,
    chief_complaint: chiefComplaint,

    rhu_id: item?.rhu_id !== undefined ? toNumber(item.rhu_id, 0) : null,
    rhu_name: item?.rhu_name ?? item?.rhu?.name ?? item?.rhu?.barangay_name ?? null,

    service_type: serviceType,
    service_label: item?.service_label ?? getServiceLabel(serviceType),

    queue_type: item?.queue_type ?? null,
    source: item?.source ?? null,
    appointment_id:
      item?.appointment_id !== undefined && item?.appointment_id !== null
        ? toNumber(item.appointment_id, 0)
        : null,
    consultation_id:
      item?.consultation_id !== undefined && item?.consultation_id !== null
        ? toNumber(item.consultation_id, 0)
        : null,
    status: String(item?.status ?? "waiting"),

    priority_category:
      item?.priority_category ?? priority?.category ?? item?.queue_type ?? "regular",
    priority_level: item?.priority_level ?? priority?.level ?? priorityDisplay.level,
    priority_score: toNumber(item?.priority_score ?? priority?.score ?? 0, 0),
    priority_reason: item?.priority_reason ?? priority?.reason ?? priorityDisplay.reason,
    priority_display_label: priorityDisplay.label,

    queue_position:
      item?.queue_position !== undefined && item?.queue_position !== null
        ? toNumber(item.queue_position, 0)
        : null,

    call_attempt:
      item?.call_attempt !== undefined && item?.call_attempt !== null
        ? toNumber(item.call_attempt, 0)
        : null,

    issued_at: item?.issued_at ?? item?.created_at ?? null,
    called_at: item?.called_at ?? null,
    service_started_at: item?.service_started_at ?? null,
    service_ended_at: item?.service_ended_at ?? null,
    cancelled_at: item?.cancelled_at ?? null,

    wait_time_minutes:
      item?.wait_time_minutes !== undefined && item?.wait_time_minutes !== null
        ? toNumber(item.wait_time_minutes, 0)
        : null,

    current_wait_minutes:
      item?.current_wait_minutes !== undefined && item?.current_wait_minutes !== null
        ? toNumber(item.current_wait_minutes, 0)
        : null,

    service_time_minutes:
      item?.service_time_minutes !== undefined && item?.service_time_minutes !== null
        ? toNumber(item.service_time_minutes, 0)
        : null,

    is_senior: toBoolean(item?.is_senior ?? flags?.is_senior),
    is_pregnant: toBoolean(item?.is_pregnant ?? flags?.is_pregnant),
    is_pwd: toBoolean(item?.is_pwd ?? flags?.is_pwd),
    is_pediatric: toBoolean(item?.is_pediatric ?? flags?.is_pediatric),
    is_emergency: toBoolean(item?.is_emergency ?? flags?.is_emergency),
    is_bhw_endorsed: toBoolean(
      item?.is_bhw_endorsed ?? flags?.is_bhw_endorsed
    ),

    notes: item?.notes ?? null,
    cancellation_reason: item?.cancellation_reason ?? null,
  };
}

function normalizeLivePayload(payload: any): LiveQueueResponse {
  const root = payload?.data ?? payload ?? {};

  const waiting = extractArray(root.waiting).map(normalizeTicketPayload);
  const called = extractArray(root.called).map(normalizeTicketPayload);
  const inService = extractArray(root.in_service).map(normalizeTicketPayload);

  const merged = [...waiting, ...called, ...inService];

  return {
    waiting,
    called,
    in_service: inService,
    tickets: merged,
  };
}

export async function getQueueStatus(
  params?: QueueParams
): Promise<QueueTicket[]> {
  const response = await apiClient.get("/queue", {
    params: {
      rhu_id: params?.rhu_id ?? getDefaultRhuId(),
      service_type: params?.service_type || undefined,
      date: params?.date || undefined,
      per_page: 100,
    },
  });

  return extractArray(response.data).map(normalizeTicketPayload);
}

export async function getLiveQueue(
  params?: QueueParams
): Promise<LiveQueueResponse> {
  const response = await apiClient.get("/queue/live", {
    params: {
      rhu_id: params?.rhu_id ?? getDefaultRhuId(),
      service_type: params?.service_type || undefined,
    },
  });

  return normalizeLivePayload(response.data);
}

export async function getQueueSummary(
  params?: QueueParams
): Promise<QueueSummary> {
  const response = await apiClient.get("/queue/summary", {
    params: {
      rhu_id: params?.rhu_id ?? getDefaultRhuId(),
      date: params?.date || undefined,
    },
  });

  const data = response.data?.data ?? response.data ?? {};

  return {
    total_issued: toNumber(data.total_issued, 0),
    total_served_today: toNumber(
      data.total_served_today ?? data.served_today ?? data.completed_today ?? data.completed,
      0
    ),
    currently_waiting: toNumber(data.currently_waiting ?? data.waiting, 0),
    waiting: toNumber(data.waiting, 0),
    called: toNumber(data.called, 0),
    in_service: toNumber(data.in_service, 0),
    completed: toNumber(data.completed, 0),
    skipped: toNumber(data.skipped, 0),
    cancelled: toNumber(data.cancelled, 0),
    no_show: toNumber(data.no_show, 0),
    emergency_waiting: toNumber(data.emergency_waiting, 0),
    priority_waiting: toNumber(data.priority_waiting, 0),
    average_wait_minutes: toNumber(
      data.average_wait_minutes ?? data.avg_wait_minutes,
      0
    ),
    average_service_minutes: toNumber(
      data.average_service_minutes ?? data.avg_service_minutes,
      0
    ),
    total_active_queues: toNumber(
      data.total_active_queues ?? data.active_queues,
      0
    ),
    congestion_level: data.congestion_level ?? "low",
  };
}

export async function callNextInQueue(payload?: {
  rhu_id?: number;
  service_type?: QueueServiceType | string;
}): Promise<QueueTicket | null> {
  const response = await apiClient.post("/queue/call-next", {
    rhu_id: payload?.rhu_id ?? getDefaultRhuId(),
    service_type: payload?.service_type ?? DEFAULT_QUEUE_SERVICE_TYPE,
  });

  const data = response.data?.data ?? null;

  if (!data) return null;

  return {
    ...normalizeTicketPayload(data),
    notification: response.data?.notification ?? null,
  };
}

/**
 * Explicitly call the next PRIORITY patient (senior / PWD / pregnant /
 * pediatric / emergency / high score). Returns null when none are waiting.
 */
export async function callPriorityNextInQueue(payload?: {
  rhu_id?: number;
  service_type?: QueueServiceType | string;
}): Promise<QueueTicket | null> {
  const response = await apiClient.post("/queue/call-priority-next", {
    rhu_id: payload?.rhu_id ?? getDefaultRhuId(),
    service_type: payload?.service_type ?? DEFAULT_QUEUE_SERVICE_TYPE,
  });

  const data = response.data?.data ?? null;

  if (!data) return null;

  return {
    ...normalizeTicketPayload(data),
    notification: response.data?.notification ?? null,
  };
}

export async function updateQueueTicketStatus(
  ticketId: number | string,
  payload: {
    status: "called" | "in_service" | "completed" | "skipped" | "cancelled" | "no_show" | "waiting";
    notes?: string;
    cancellation_reason?: string;
  }
): Promise<QueueTicket> {
  const response = await apiClient.patch(`/queue/${ticketId}/status`, payload);

  return normalizeTicketPayload(response.data?.data ?? response.data);
}

export async function startQueueService(
  ticketId: number | string
): Promise<{ ticket: QueueTicket; consultation_id: number | null }> {
  const response = await apiClient.post(`/queue/${ticketId}/start-service`);
  const ticket = normalizeTicketPayload(response.data?.data ?? response.data);
  const consultationId = Number(
    response.data?.consultation_id ??
      response.data?.consultation?.id ??
      ticket.consultation_id ??
      0
  );

  return {
    ticket,
    consultation_id: Number.isFinite(consultationId) && consultationId > 0
      ? consultationId
      : null,
  };
}


/**
 * Service desks a walk-in ticket can be issued against. Mirrors the backend
 * IssueQueueTicketRequest `service_type` rule exactly - keep the two in sync.
 */
export const WALK_IN_SERVICE_TYPES: Array<{ value: string; label: string }> = [
  { value: "opd_consultation", label: "OPD Consultation" },
  { value: "prenatal_checkup", label: "Prenatal Check-up" },
  { value: "immunization", label: "Immunization" },
  { value: "family_planning", label: "Family Planning" },
  { value: "tb_dots", label: "TB-DOTS" },
  { value: "laboratory", label: "Laboratory" },
  { value: "dental", label: "Dental" },
  { value: "emergency", label: "Emergency" },
  { value: "medicine_release", label: "Medicine Release" },
  { value: "bhw_assisted", label: "BHW-Assisted" },
];

/**
 * Issues a queue ticket for a patient who already has a resident profile.
 *
 * rhu_id is sent for completeness only - the backend forces it through its own
 * scoped resolver, so a spoofed value cannot place a ticket in another RHU.
 */
export async function issueQueueTicket(payload: {
  resident_profile_id: number;
  service_type: string;
  rhu_id?: number;
  is_emergency?: boolean;
  is_bhw_endorsed?: boolean;
  notes?: string;
}): Promise<QueueTicket> {
  const response = await apiClient.post("/queue/issue", payload);

  return normalizeTicketPayload(response.data?.data ?? response.data);
}
