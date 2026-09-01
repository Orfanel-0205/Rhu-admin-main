// src/services/notifications.ts

import apiClient from "../lib/apiClient";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  action_url?: string | null;
  action_type?: string | null;
  related_type?: string | null;
  related_id?: string | number | null;
  data?: Record<string, any>;
}

export interface NotificationsResponse {
  data: AppNotification[];
  unread_count: number;
  pagination: {
    total: number;
    current_page: number;
    last_page: number;
  };
}

function safeJson(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    const parsed = JSON.parse(String(value));
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeNotification(raw: any): AppNotification {
  const data = safeJson(raw?.data);

  return {
    id: String(raw?.id ?? ""),
    type: String(
      data?.notification_type ??
        data?.type ??
        raw?.type ??
        "notification"
    ),
    title: String(data?.title ?? raw?.title ?? "Notification"),
    message: String(data?.message ?? data?.body ?? raw?.message ?? ""),
    read_at: raw?.read_at ?? null,
    created_at: raw?.created_at ?? new Date().toISOString(),
    action_url: data?.action_url ?? data?.url ?? raw?.action_url ?? null,
    action_type: data?.action_type ?? raw?.action_type ?? null,
    related_type: data?.related_type ?? raw?.related_type ?? null,
    related_id: data?.related_id ?? raw?.related_id ?? null,
    data,
  };
}

function extractArray(payload: any): AppNotification[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.data?.data)
        ? payload.data.data
        : [];

  return rows.map(normalizeNotification);
}

export async function fetchNotifications(params?: {
  page?: number;
  per_page?: number;
  unread_only?: boolean;
}): Promise<NotificationsResponse> {
  const cleanParams: Record<string, any> = {};

  if (params?.page) cleanParams.page = params.page;
  if (params?.per_page) cleanParams.per_page = params.per_page;

  // Laravel sometimes rejects unread_only=false.
  // Send only 1 when true.
  if (params?.unread_only === true) {
    cleanParams.unread_only = 1;
  }

  const res = await apiClient.get("/notifications", {
    params: cleanParams,
  });

  return {
    data: extractArray(res.data),
    unread_count: Number(res.data?.unread_count ?? 0),
    pagination: {
      total: Number(res.data?.pagination?.total ?? 0),
      current_page: Number(res.data?.pagination?.current_page ?? 1),
      last_page: Number(res.data?.pagination?.last_page ?? 1),
    },
  };
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await apiClient.get("/notifications/unread-count");
  return Number(res.data?.unread_count ?? 0);
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post("/notifications/read-all");
}

export async function deleteNotification(id: string): Promise<void> {
  await apiClient.delete(`/notifications/${id}`);
}