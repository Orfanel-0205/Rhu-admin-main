// src/services/feedback.ts

import apiClient from "../lib/apiClient";

export interface FeedbackUser {
  user_id?: number;
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;
}

export interface FeedbackRhu {
  barangay_id?: number;
  name?: string | null;
  barangay_name?: string | null;
}

export interface ServiceFeedback {
  id: number;
  user_id: number;
  rhu_id?: number | null;
  appointment_id?: number | null;
  consultation_id?: number | null;
  queue_ticket_id?: number | null;
  service_type: string;
  rating: number;
  comment?: string | null;
  admin_response?: string | null;
  responded_by?: number | null;
  responded_at?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;

  // Health follow-up (medical) fields
  followup_type?: string | null;
  condition_status?: string | null;
  symptoms_present?: boolean | null;
  medication_taken?: string | null;
  side_effects?: boolean | null;
  side_effects_description?: string | null;
  patient_message?: string | null;
  needs_follow_up?: boolean | null;
  urgency_level?: string | null;
  reviewed_at?: string | null;

  user?: FeedbackUser | null;
  rhu?: FeedbackRhu | null;
  responded_by_user?: FeedbackUser | null;
}

export interface FeedbackFilters {
  service_type?: string;
  rating?: string | number;
  status?: string;
  rhu_id?: number;
}

export const FEEDBACK_SERVICE_TYPES: Array<{ value: string; label: string }> = [
  { value: "health_followup", label: "Health Follow-up" },
  { value: "onsite_consultation", label: "Onsite Consultation" },
  { value: "online_consultation", label: "Online Consultation" },
  { value: "queue_service", label: "Queue Service" },
  { value: "laboratory", label: "Laboratory" },
  { value: "prescription", label: "Prescription" },
  { value: "general_rhu_service", label: "General RHU Service" },
];

export const FEEDBACK_STATUSES = [
  "submitted",
  "reviewed",
  "responded",
  "archived",
];

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

export async function fetchFeedback(
  filters: FeedbackFilters = {}
): Promise<ServiceFeedback[]> {
  const params: Record<string, any> = { per_page: 100 };

  if (filters.service_type && filters.service_type !== "all") {
    params.service_type = filters.service_type;
  }

  if (filters.rating && String(filters.rating) !== "all") {
    params.rating = filters.rating;
  }

  if (filters.status && filters.status !== "all") {
    params.status = filters.status;
  }

  if (filters.rhu_id) {
    params.rhu_id = filters.rhu_id;
  }

  const res = await apiClient.get("/feedback", { params });

  return extractArray(res.data);
}

export async function respondFeedback(
  id: number | string,
  payload: { admin_response: string; status?: string }
): Promise<ServiceFeedback> {
  const res = await apiClient.patch(`/feedback/${id}/respond`, payload);

  return res.data?.data ?? res.data;
}

export function getFeedbackPatientName(feedback: ServiceFeedback): string {
  const user = feedback.user;

  if (!user) return `Patient #${feedback.user_id}`;
  if (user.full_name) return user.full_name;
  if (user.name) return user.name;

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");

  return name || `Patient #${feedback.user_id}`;
}

export function getFeedbackRhuLabel(feedback: ServiceFeedback): string {
  const name = feedback.rhu?.name || feedback.rhu?.barangay_name;

  if (feedback.rhu_id && name) return `RHU ${feedback.rhu_id} · ${name}`;
  if (feedback.rhu_id) return `RHU ${feedback.rhu_id}`;

  return "—";
}

export function getServiceTypeLabel(serviceType?: string | null): string {
  const found = FEEDBACK_SERVICE_TYPES.find((item) => item.value === serviceType);

  if (found) return found.label;

  return String(serviceType || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const CONDITION_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "recovered", label: "Recovered" },
  { value: "improved", label: "Improved" },
  { value: "same", label: "Same" },
  { value: "worse", label: "Worse" },
];

export const URGENCY_LEVEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "routine", label: "Routine" },
  { value: "watch", label: "Needs Monitoring" },
  { value: "urgent", label: "Urgent Follow-up" },
];

export function getConditionLabel(value?: string | null): string {
  switch (value) {
    case "recovered":
      return "Recovered";
    case "improved":
      return "Improved";
    case "same":
      return "Same";
    case "worse":
      return "Worse";
    default:
      return "—";
  }
}

export function getMedicationLabel(value?: string | null): string {
  switch (value) {
    case "yes":
      return "Took medicine";
    case "no":
      return "Did not take medicine";
    case "not_prescribed":
      return "No medicine prescribed";
    case "not_applicable":
      return "Not applicable";
    default:
      return "—";
  }
}

export function getUrgencyLabel(value?: string | null): string {
  switch (value) {
    case "watch":
      return "Needs Monitoring";
    case "urgent":
      return "Urgent Follow-up";
    case "routine":
      return "Routine";
    default:
      return "—";
  }
}

export function getYesNoLabel(value?: boolean | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

export function isHealthFollowup(feedback: ServiceFeedback): boolean {
  return (
    feedback.service_type === "health_followup" ||
    feedback.followup_type === "medical_followup" ||
    Boolean(feedback.condition_status)
  );
}
