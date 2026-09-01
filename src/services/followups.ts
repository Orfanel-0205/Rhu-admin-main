// src/services/followups.ts
// Staff follow-up reminders created from the SOAP page (+ optional SMS alert).

import apiClient from "../lib/apiClient";

export type FollowUpUrgency = "routine" | "watch" | "urgent";
export type FollowUpStatus =
  | "pending"
  | "scheduled"
  | "completed"
  | "missed"
  | "cancelled";
export type FollowUpSmsStatus = "not_sent" | "pending" | "sent" | "failed";
export type FollowUpType = "single" | "range";

export interface FollowUpReminder {
  id: number;
  consultation_id?: number | null;
  appointment_id?: number | null;
  user_id?: number | null;
  rhu_id?: number | null;
  patient_name?: string | null;
  mobile_number?: string | null;
  follow_up_at?: string | null;
  follow_up_type?: FollowUpType | string | null;
  follow_up_date?: string | null;
  follow_up_start_date?: string | null;
  follow_up_end_date?: string | null;
  follow_up_time?: string | null;
  reason?: string | null;
  instructions?: string | null;
  urgency?: FollowUpUrgency | string | null;
  status?: FollowUpStatus | string | null;
  sms_enabled?: boolean;
  sms_status?: FollowUpSmsStatus | string | null;
  sms_sent_at?: string | null;
  sms_last_attempt_at?: string | null;
  sms_error_message?: string | null;
  sms_error?: string | null;
  sms_log_id?: number | null;
  created_at?: string | null;
  user?: any;
  rhu?: any;
  created_by?: number | null;
  createdBy?: any;
}

export interface SaveFollowUpPayload {
  consultation_id?: number | null;
  appointment_id?: number | null;
  needs_follow_up: boolean;
  follow_up_type?: FollowUpType;
  follow_up_date?: string | null;
  follow_up_start_date?: string | null;
  follow_up_end_date?: string | null;
  follow_up_time?: string | null;
  reason?: string | null;
  instructions?: string | null;
  urgency?: FollowUpUrgency;
  sms_enabled?: boolean;
  // Optional editable mobile number (overrides profile lookup on the backend).
  mobile_number?: string | null;
}

export type FollowUpBoardStatus =
  | "all"
  | "overdue"
  | "today"
  | "upcoming"
  | "completed"
  | "cancelled"
  | "missed";

export interface FollowUpListParams {
  status?: string;
  urgency?: string;
  rhu_id?: number;
  barangay_id?: number;
  assigned_to?: number;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

export interface FollowUpListResult {
  data: FollowUpReminder[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface FollowUpSummary {
  total: number;
  overdue: number;
  due_today: number;
  upcoming: number;
  completed_this_month: number;
  missed: number;
}

function normalizeArray(payload: any): FollowUpReminder[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

export async function getFollowUps(params?: {
  status?: string;
  urgency?: string;
  rhu_id?: number;
  per_page?: number;
}): Promise<FollowUpReminder[]> {
  const res = await apiClient.get("/follow-up-reminders", {
    params: {
      ...params,
      status: params?.status === "all" ? undefined : params?.status,
      per_page: params?.per_page ?? 100,
    },
  });

  return normalizeArray(res.data);
}

/**
 * Paginated, fully-filterable follow-up list for the Health Follow-up board.
 */
export async function getFollowUpList(
  params: FollowUpListParams = {}
): Promise<FollowUpListResult> {
  const res = await apiClient.get("/follow-up-reminders", {
    params: {
      status: !params.status || params.status === "all" ? undefined : params.status,
      urgency: params.urgency === "all" ? undefined : params.urgency,
      rhu_id: params.rhu_id,
      barangay_id: params.barangay_id,
      assigned_to: params.assigned_to,
      search: params.search?.trim() || undefined,
      date_from: params.date_from || undefined,
      date_to: params.date_to || undefined,
      page: params.page ?? 1,
      per_page: params.per_page ?? 20,
    },
  });

  const payload = res.data ?? {};

  return {
    data: normalizeArray(payload),
    current_page: Number(payload.current_page ?? payload.meta?.current_page ?? 1),
    last_page: Number(payload.last_page ?? payload.meta?.last_page ?? 1),
    per_page: Number(payload.per_page ?? payload.meta?.per_page ?? 20),
    total: Number(payload.total ?? payload.meta?.total ?? normalizeArray(payload).length),
  };
}

export async function getFollowUpSummary(): Promise<FollowUpSummary> {
  const res = await apiClient.get("/follow-up-reminders/summary");
  const data = res.data?.data ?? res.data ?? {};

  return {
    total: Number(data.total ?? 0),
    overdue: Number(data.overdue ?? 0),
    due_today: Number(data.due_today ?? 0),
    upcoming: Number(data.upcoming ?? 0),
    completed_this_month: Number(data.completed_this_month ?? 0),
    missed: Number(data.missed ?? 0),
  };
}

/**
 * Derive the effective board status of a single follow-up (overdue/today/etc.).
 */
export function classifyFollowUp(
  item: FollowUpReminder
): "overdue" | "today" | "upcoming" | "completed" | "cancelled" | "missed" {
  const status = String(item.status || "").toLowerCase();

  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "missed") return "missed";

  const raw =
    item.follow_up_at ||
    `${item.follow_up_date || item.follow_up_start_date || ""}T${
      item.follow_up_time || "00:00"
    }`;
  const target = new Date(raw);

  if (Number.isNaN(target.getTime())) return "upcoming";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(target);
  day.setHours(0, 0, 0, 0);

  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);

  if (diffDays < -7) return "missed";
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  return "upcoming";
}

export function getFollowUpStatusMeta(
  key: ReturnType<typeof classifyFollowUp>
): { label: string; bg: string; color: string; border: string } {
  switch (key) {
    case "overdue":
      return { label: "Overdue", bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" };
    case "today":
      return { label: "Due Today", bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" };
    case "upcoming":
      return { label: "Upcoming", bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" };
    case "completed":
      return { label: "Completed", bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" };
    case "missed":
      return { label: "Missed", bg: "#FEF2F2", color: "#991B1B", border: "#FCA5A5" };
    case "cancelled":
    default:
      return { label: "Cancelled", bg: "#F8FAFC", color: "#475569", border: "#E2E8F0" };
  }
}

export async function saveFollowUp(
  payload: SaveFollowUpPayload
): Promise<FollowUpReminder | null> {
  const res = await apiClient.post("/follow-up-reminders", payload);
  return res.data?.data ?? null;
}

export async function updateFollowUpStatus(
  id: number,
  status: FollowUpStatus
): Promise<FollowUpReminder | null> {
  const res = await apiClient.patch(`/follow-up-reminders/${id}/status`, {
    status,
  });
  return res.data?.data ?? null;
}

/**
 * Manually resend the SMS for a saved reminder (bypasses the anti-spam guard).
 */
export async function resendFollowUpSms(
  id: number
): Promise<FollowUpReminder | null> {
  const res = await apiClient.post(`/follow-up-reminders/${id}/resend-sms`);
  return res.data?.data ?? null;
}

export function getFollowUpSmsLabel(item: FollowUpReminder): string {
  const s = String(item.sms_status || "").toLowerCase();
  switch (s) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "not_sent":
      return "Not sent";
    default:
      return item.sms_enabled === false ? "SMS off" : "—";
  }
}
