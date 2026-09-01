// src/services/dashboard.ts

import apiClient from "../lib/apiClient";

export interface DashboardCards {
  patients: number;
  active_patients: number;
  appointments_today: number;
  open_consultations: number;
  completed_consultations: number;
  pending_telemedicine: number;
  waiting_queue: number;
  low_inventory: number;
  prescriptions_today: number;
  active_prescriptions: number;
}

export interface PriorityAction {
  type: string;
  priority: "high" | "medium" | "low" | string;
  title: string;
  patient_name?: string | null;
  description: string;
  count?: number;
  due_at?: string | null;
  action_label: string;
  action_url: string;
}

export interface FollowUpCounts {
  total: number;
  overdue: number;
  due_today: number;
  upcoming: number;
  completed_this_month: number;
  missed: number;
}

export interface TelemedicineWorklist {
  pending_screening: number;
  scheduled: number;
  active: number;
  needs_soap: number;
  completed_today: number;
}

export interface QueueSnapshot {
  waiting: number;
  called: number;
  serving: number;
  completed: number;
  no_show: number;
  skipped: number;
  priority_waiting: number;
  average_wait_minutes: number;
}

export interface RealtimeDashboardData {
  generated_at: string;
  cards: DashboardCards & {
    patients_served_today?: number;
    average_wait_minutes?: number;
    pending_appointments?: number;
    follow_ups_due_today?: number;
    overdue_follow_ups?: number;
    telemedicine_needs_soap?: number;
  };
  priority_actions: PriorityAction[];
  follow_ups: FollowUpCounts;
  queue_snapshot: QueueSnapshot;
  appointments_today: Array<any>;
  telemedicine_worklist: TelemedicineWorklist;
  consultation_trend: Array<{
    date: string;
    total: number;
  }>;
  queue_summary: Array<{
    status: string;
    total: number;
    avg_wait_minutes: number;
  }>;
  telemedicine_summary: {
    total: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  top_barangays: Array<{
    barangay: string;
    total: number;
  }>;
  top_complaints: Array<{
    complaint: string;
    total: number;
  }>;
  recent_consultations: Array<any>;
  recent_prescriptions?: Array<any>;
  inventory_alerts: Array<any>;
}

export interface HeatmapPoint {
  barangay: string;
  total_cases: number;
  queue_density: number;
  top_complaint?: string;
  heatmap_intensity?: number;
  risk_level?: "low" | "moderate" | "high" | "critical" | string;
}

export interface OutbreakAlert {
  id: string | number;
  barangay?: string;
  case_type?: string;
  disease_type?: string;
  total_cases?: number;
  severity?: string;
  status?: string;
  message?: string;
  trigger_message?: string;
}

function normalizeDashboard(payload: any): RealtimeDashboardData {
  const data = payload?.data ?? payload;
  const cards = data?.cards ?? {};

  return {
    generated_at:
      payload?.generated_at ?? data?.generated_at ?? new Date().toISOString(),
    cards: {
      patients: Number(cards.patients ?? 0),
      active_patients: Number(cards.active_patients ?? 0),
      appointments_today: Number(cards.appointments_today ?? 0),
      open_consultations: Number(cards.open_consultations ?? 0),
      completed_consultations: Number(cards.completed_consultations ?? 0),
      pending_telemedicine: Number(cards.pending_telemedicine ?? 0),
      waiting_queue: Number(cards.waiting_queue ?? 0),
      low_inventory: Number(cards.low_inventory ?? 0),
      prescriptions_today: Number(cards.prescriptions_today ?? 0),
      active_prescriptions: Number(cards.active_prescriptions ?? 0),
      patients_served_today: Number(cards.patients_served_today ?? 0),
      average_wait_minutes: Number(cards.average_wait_minutes ?? 0),
      pending_appointments: Number(cards.pending_appointments ?? 0),
      follow_ups_due_today: Number(cards.follow_ups_due_today ?? 0),
      overdue_follow_ups: Number(cards.overdue_follow_ups ?? 0),
      telemedicine_needs_soap: Number(cards.telemedicine_needs_soap ?? 0),
    },
    priority_actions: Array.isArray(data?.priority_actions) ? data.priority_actions : [],
    follow_ups: {
      total: Number(data?.follow_ups?.total ?? 0),
      overdue: Number(data?.follow_ups?.overdue ?? 0),
      due_today: Number(data?.follow_ups?.due_today ?? 0),
      upcoming: Number(data?.follow_ups?.upcoming ?? 0),
      completed_this_month: Number(data?.follow_ups?.completed_this_month ?? 0),
      missed: Number(data?.follow_ups?.missed ?? 0),
    },
    queue_snapshot: {
      waiting: Number(data?.queue_snapshot?.waiting ?? 0),
      called: Number(data?.queue_snapshot?.called ?? 0),
      serving: Number(data?.queue_snapshot?.serving ?? 0),
      completed: Number(data?.queue_snapshot?.completed ?? 0),
      no_show: Number(data?.queue_snapshot?.no_show ?? 0),
      skipped: Number(data?.queue_snapshot?.skipped ?? 0),
      priority_waiting: Number(data?.queue_snapshot?.priority_waiting ?? 0),
      average_wait_minutes: Number(data?.queue_snapshot?.average_wait_minutes ?? 0),
    },
    appointments_today: Array.isArray(data?.appointments_today) ? data.appointments_today : [],
    telemedicine_worklist: {
      pending_screening: Number(data?.telemedicine_worklist?.pending_screening ?? 0),
      scheduled: Number(data?.telemedicine_worklist?.scheduled ?? 0),
      active: Number(data?.telemedicine_worklist?.active ?? 0),
      needs_soap: Number(data?.telemedicine_worklist?.needs_soap ?? 0),
      completed_today: Number(data?.telemedicine_worklist?.completed_today ?? 0),
    },
    consultation_trend: data?.consultation_trend ?? [],
    queue_summary: data?.queue_summary ?? [],
    telemedicine_summary: data?.telemedicine_summary ?? {
      total: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
    },
    top_barangays: data?.top_barangays ?? [],
    top_complaints: data?.top_complaints ?? [],
    recent_consultations: data?.recent_consultations ?? [],
    recent_prescriptions: data?.recent_prescriptions ?? [],
    inventory_alerts: data?.inventory_alerts ?? [],
  };
}

function normalizeArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

export async function fetchRealtimeDashboard(): Promise<RealtimeDashboardData> {
  const res = await apiClient.get("/dashboard/admin");
  return normalizeDashboard(res.data);
}

export async function fetchQueueHeatmap(): Promise<HeatmapPoint[]> {
  const res = await apiClient.get("/analytics/queue-heatmap");
  return normalizeArray(res.data);
}

export async function fetchBarangayRisk(): Promise<HeatmapPoint[]> {
  const res = await apiClient.get("/analytics/barangay-risk");
  return normalizeArray(res.data);
}

export async function fetchOutbreakAlerts(): Promise<OutbreakAlert[]> {
  const res = await apiClient.get("/analytics/outbreak-alerts");
  return normalizeArray(res.data);
}

export async function resolveOutbreakAlert(id: string | number): Promise<void> {
  await apiClient.post(`/analytics/outbreak-alerts/${id}/resolve`);
}