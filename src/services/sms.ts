// src/services/sms.ts
// Ka-Agapay SMS Service
// Clean API wrapper for RHU SMS center: account credits, logs, preview recipients, and send SMS.

import apiClient from "../lib/apiClient";

export type SmsMode = "single" | "barangay" | "all" | "custom" | "targeted";

export type SmsStatus =
  | "queued"
  | "pending"
  | "processing"
  | "sent"
  | "delivered"
  | "success"
  | "failed"
  | "error"
  | string;

export interface SmsLog {
  id?: number;
  sms_log_id?: number;

  user_id?: number | null;
  sent_by?: number | null;

  recipient_name: string;
  recipient?: string | null;
  mobile_number: string;

  message: string;
  mode: string;

  target_filters?: Record<string, unknown> | null;
  notification_type?: string | null;

  provider?: string | null;
  provider_message_id?: string | null;

  status: SmsStatus;
  error_message?: string | null;

  sent_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SmsRecipientPreview {
  user_id?: number | string | null;
  recipient_name: string;
  name?: string | null;
  mobile_number: string;
  barangay?: string | null;
  gender?: string | null;
  sex?: string | null;
  age?: number | string | null;
  role?: string | null;
  account_status?: string | null;
  id_verified?: boolean | null;
}

export interface SmsPreviewResponse {
  mode: string;
  count: number;
  estimated_credits: number;
  recipients: SmsRecipientPreview[];
}

export interface SmsAccountResponse {
  provider?: string;
  status?: string;
  credit_balance?: number | string | null;
  balance?: number | string | null;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface SendSmsPayload {
  mode?: SmsMode | string;

  recipient_name?: string;
  mobile_number?: string;
  number?: string;
  phone?: string;
  recipient?: string;

  message: string;
  notification_type?: string;

  role?: string;
  barangay?: string;
  gender?: string;
  sex?: string;
  age_group?: string;

  age_min?: number;
  age_max?: number;

  account_status?: string;
  id_verified?: boolean;
  rhu_id?: number;

  limit?: number;

  target_filters?: Record<string, unknown>;
  filters?: Record<string, unknown>;
}

function normalizeStatus(value: unknown): SmsStatus {
  if (value === true || value === 1 || value === "1") return "sent";
  if (value === false || value === 0 || value === "0") return "failed";

  const status = String(value ?? "").trim().toLowerCase();

  if (["sent", "success", "successful", "delivered", "true"].includes(status)) {
    return "sent";
  }

  if (["queued", "pending", "processing"].includes(status)) {
    return "queued";
  }

  if (["failed", "error", "undelivered", "refunded", "false"].includes(status)) {
    return "failed";
  }

  return status || "queued";
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.logs)) return payload.logs;
  if (Array.isArray(payload?.recipients)) return payload.recipients;

  return [];
}

function normalizeLog(raw: any): SmsLog {
  return {
    id: raw.id ?? raw.sms_log_id,
    sms_log_id: raw.sms_log_id ?? raw.id,

    user_id: raw.user_id ?? null,
    sent_by: raw.sent_by ?? null,

    recipient_name:
      raw.recipient_name ??
      raw.recipient ??
      raw.name ??
      "Manual Recipient",

    recipient: raw.recipient ?? raw.recipient_name ?? null,
    mobile_number: String(raw.mobile_number ?? raw.number ?? raw.phone ?? ""),

    message: String(raw.message ?? ""),
    mode: String(raw.mode ?? "single"),

    target_filters: raw.target_filters ?? null,
    notification_type: raw.notification_type ?? "manual",

    provider: raw.provider ?? "semaphore",
    provider_message_id: raw.provider_message_id ?? null,

    status: normalizeStatus(raw.status),
    error_message: raw.error_message ?? raw.error ?? null,

    sent_at: raw.sent_at ?? null,
    created_at: raw.created_at ?? null,
    updated_at: raw.updated_at ?? null,
  };
}

function normalizeRecipient(raw: any): SmsRecipientPreview {
  return {
    user_id: raw.user_id ?? raw.id ?? null,
    recipient_name:
      raw.recipient_name ??
      raw.name ??
      raw.full_name ??
      "Recipient",
    name: raw.name ?? raw.recipient_name ?? raw.full_name ?? null,
    mobile_number: String(raw.mobile_number ?? raw.number ?? raw.phone ?? ""),
    barangay: raw.barangay ?? raw.barangay_name ?? null,
    gender: raw.gender ?? raw.sex ?? null,
    sex: raw.sex ?? raw.gender ?? null,
    age: raw.age ?? null,
    role: raw.role ?? raw.role_name ?? null,
    account_status: raw.account_status ?? raw.status ?? null,
    id_verified:
      raw.id_verified ??
      raw.is_verified ??
      raw.verified ??
      null,
  };
}

function cleanPayload(payload: SendSmsPayload): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string" && value.trim() === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;

      return true;
    })
  );
}

export async function getSmsAccount(): Promise<SmsAccountResponse> {
  const response = await apiClient.get<SmsAccountResponse>("/admin/sms/account");

  return response.data;
}

export async function getSmsLogs(params?: {
  search?: string;
  status?: string;
  provider?: string;
  per_page?: number;
  /** ISO date (YYYY-MM-DD). Additive backend filters — omit for full history. */
  date_from?: string;
  date_to?: string;
}): Promise<SmsLog[]> {
  const response = await apiClient.get("/admin/sms/logs", {
    params: {
      search: params?.search || undefined,
      status:
        params?.status && params.status !== "all"
          ? params.status
          : undefined,
      provider:
        params?.provider && params.provider !== "all"
          ? params.provider
          : undefined,
      per_page: params?.per_page ?? 100,
      date_from: params?.date_from || undefined,
      date_to: params?.date_to || undefined,
    },
  });

  return extractArray(response.data).map(normalizeLog);
}

export async function getBarangays(): Promise<string[]> {
  const response = await apiClient.get("/barangays", {
    suppressErrorToast: true,
  } as any);

  const raw = response.data?.data ?? response.data ?? [];

  const names = (Array.isArray(raw) ? raw : [])
    .map((barangay: any) =>
      typeof barangay === "string"
        ? barangay
        : String(barangay?.name ?? barangay?.barangay_name ?? "")
    )
    .filter(Boolean);

  return Array.from(new Set(names))
    .sort((a: string, b: string) => a.localeCompare(b));
}

export async function previewSmsRecipients(
  payload: SendSmsPayload
): Promise<SmsPreviewResponse> {
  const response = await apiClient.post(
    "/admin/sms/preview",
    cleanPayload(payload)
  );

  const data = response.data?.data ?? response.data ?? {};

  return {
    mode: String(data.mode ?? payload.mode ?? "single"),
    count: Number(data.count ?? extractArray(data).length ?? 0),
    estimated_credits: Number(data.estimated_credits ?? 0),
    recipients: extractArray(data.recipients ?? data).map(normalizeRecipient),
  };
}

export async function sendSms(payload: SendSmsPayload): Promise<{
  message?: string;
  provider?: string;
  count?: number;
  estimated_credits?: number;
  data?: unknown;
  provider_response?: unknown;
}> {
  const response = await apiClient.post(
    "/admin/sms/send",
    cleanPayload(payload)
  );

  return response.data;
}
