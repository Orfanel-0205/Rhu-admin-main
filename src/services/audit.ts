// src/services/audit.ts

import apiClient from "../lib/apiClient";

export type AuditSeverity = "info" | "warning" | "critical" | string;

export interface AuditLog {
  id: number;
  user_id?: number | null;
  actor_id?: number | null;
  actor_name?: string | null;
  user_name?: string | null;
  user_role?: string | null;
  module?: string | null;
  action: string;
  subject_type?: string | null;
  subject_id?: number | string | null;
  subject_label?: string | null;
  severity?: AuditSeverity | null;
  ip_address?: string | null;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at?: string | null;
  user?: {
    user_id?: number;
    id?: number;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    name?: string;
    email?: string;
    mobile_number?: string;
    role_name?: string;
    role?: string | { name?: string; role_name?: string };
  } | null;
}

export interface PaginatedAuditResponse {
  data: AuditLog[];
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
}

export interface DeleteHistoryParams {
  search?: string;
  module?: string;
  severity?: string;
  from?: string;
  to?: string;
  per_page?: number;
  page?: number;
}

export interface RestoreDeletedRecordResponse {
  message: string;
  restored?: boolean;
  data?: any;
}

export interface ExpireDeletedRecordsPayload {
  retention_days: number;
  batch_size?: number;
  dry_run?: boolean;
}

export interface ExpireDeletedRecordsResponse {
  message: string;
  expired_count: number;
  dry_run?: boolean;
  retention_days?: number;
  batch_size?: number;
  cutoff?: string;
  skipped_modules?: string[];
}

function normalizeJson(value: any): Record<string, any> | null {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return null;
}

function extractArray(payload: any): AuditLog[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.logs)) return payload.logs;

  return [];
}

function normalizeAuditLog(raw: any): AuditLog {
  const metadata = normalizeJson(raw.metadata);
  const oldValues = normalizeJson(raw.old_values);
  const newValues = normalizeJson(raw.new_values);

  const joinedActorName = [raw.user?.first_name, raw.user?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    id: Number(raw.id ?? raw.audit_log_id ?? 0),

    user_id: raw.user_id ?? raw.actor_id ?? null,
    actor_id: raw.actor_id ?? raw.user_id ?? null,

    actor_name:
      raw.actor_name ??
      raw.user_name ??
      raw.user?.full_name ??
      raw.user?.name ??
      (joinedActorName || null),

    user_name: raw.user_name ?? raw.actor_name ?? null,
    user_role: raw.user_role ?? raw.role_name ?? raw.role ?? null,

    module: raw.module ?? raw.subject_module ?? metadata?.module ?? null,
    action: String(raw.action ?? "action"),

    subject_type:
      raw.subject_type ??
      raw.record_type ??
      metadata?.subject_type ??
      metadata?.record_type ??
      null,

    subject_id:
      raw.subject_id ??
      raw.record_id ??
      metadata?.subject_id ??
      metadata?.record_id ??
      metadata?.restore_id ??
      null,

    subject_label:
      raw.subject_label ??
      raw.record_label ??
      raw.record_name ??
      raw.title ??
      raw.name ??
      metadata?.subject_label ??
      metadata?.record_name ??
      metadata?.name ??
      null,

    severity: String(raw.severity ?? "info").toLowerCase(),
    ip_address: raw.ip_address ?? raw.ip ?? null,

    old_values: oldValues,
    new_values: newValues,
    metadata,

    created_at: raw.created_at ?? raw.date ?? new Date().toISOString(),
    updated_at: raw.updated_at ?? null,

    user: raw.user ?? null,
  };
}

export async function getDeleteHistory(
  params?: DeleteHistoryParams
): Promise<PaginatedAuditResponse> {
  const response = await apiClient.get("/admin/audit/delete-history", {
    params: {
      search: params?.search || undefined,
      module: params?.module || undefined,
      severity: params?.severity || undefined,
      from: params?.from || undefined,
      to: params?.to || undefined,
      per_page: params?.per_page ?? 100,
      page: params?.page,
    },
  });

  const raw = response.data;
  const data = extractArray(raw).map(normalizeAuditLog);

  return {
    data,
    current_page: raw?.current_page ?? raw?.data?.current_page,
    last_page: raw?.last_page ?? raw?.data?.last_page,
    per_page: raw?.per_page ?? raw?.data?.per_page,
    total: raw?.total ?? raw?.data?.total ?? data.length,
  };
}

export async function restoreDeletedRecord(
  auditLogId: number,
  reason?: string
): Promise<RestoreDeletedRecordResponse> {
  const response = await apiClient.post(
    `/admin/audit/delete-history/${auditLogId}/restore`,
    {
      reason:
        reason ||
        "Record restored from Delete & Archive History by authorized admin.",
    }
  );

  return response.data;
}

export async function expireDeletedRecords(
  payload: ExpireDeletedRecordsPayload
): Promise<ExpireDeletedRecordsResponse> {
  const response = await apiClient.post("/admin/audit/delete-history/expire", {
    retention_days: payload.retention_days,
    batch_size: payload.batch_size ?? 50,
    dry_run: Boolean(payload.dry_run),
  });

  return response.data;
}

export function actorName(log: AuditLog): string {
  const user = log.user;

  if (log.actor_name) return log.actor_name;
  if (log.user_name) return log.user_name;
  if (user?.full_name) return user.full_name;
  if (user?.name) return user.name;

  const joined = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return joined || "Unknown user";
}

export function formatAuditDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function csvEscape(value: any): string {
  const text =
    value === null || value === undefined
      ? ""
      : String(value).replace(/\n/g, " ");

  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function reasonOf(log: AuditLog): string {
  return (
    log.metadata?.reason ||
    log.metadata?.delete_reason ||
    log.metadata?.archive_reason ||
    log.old_values?.delete_reason ||
    log.old_values?.archive_reason ||
    "No reason recorded."
  );
}

export function downloadAuditCsv(filename: string, logs: AuditLog[]) {
  const headers = [
    "Date",
    "Actor",
    "Role",
    "Module",
    "Action",
    "Record",
    "Record ID",
    "Reason",
    "Severity",
    "IP Address",
  ];

  const rows = logs.map((log) => [
    formatAuditDate(log.created_at),
    actorName(log),
    log.user_role || "",
    log.module || "",
    log.action || "",
    log.subject_label || log.metadata?.record_name || "",
    log.subject_id || log.metadata?.restore_id || "",
    reasonOf(log),
    log.severity || "info",
    log.ip_address || "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}