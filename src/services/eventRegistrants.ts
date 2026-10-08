// src/services/eventRegistrants.ts

import apiClient from "../lib/apiClient";

export type EventRegistrantStatus =
  | "registered"
  | "cancelled"
  | "attended"
  | "no_show";

export interface EventRegistrant {
  id: number;
  event_id: number;
  user_id: number;

  name: string;
  email?: string | null;

  status: EventRegistrantStatus;

  queue_number?: string | null;

  registered_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;

  /** Came without registering in the app. */
  is_walk_in?: boolean;
  /** False for a walk-in recorded by name and barangay only. */
  has_account?: boolean;
}

export interface EventRegistrantEvent {
  id: number;
  title: string;
  event_type: string;
  event_date?: string | null;
  location?: string | null;
  max_slots?: number | null;
  slots_available?: number | null;
  total_registered: number;
}

export interface EventRegistrantsResponse {
  event: EventRegistrantEvent;
  data: EventRegistrant[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export async function getEventRegistrants(params: {
  eventId: number;
  status?: "all" | EventRegistrantStatus;
  page?: number;
  per_page?: number;
}): Promise<EventRegistrantsResponse> {
  const res = await apiClient.get(
    `/admin/events/${params.eventId}/registrants`,
    {
      params: {
        status: params.status ?? "all",
        page: params.page ?? 1,
        per_page: params.per_page ?? 50,
      },
    }
  );

  return res.data;
}
/**
 * Mark a registrant attended or no-show, or back to registered to undo a
 * slip. Who marked it and when is kept and audited on the server; the event
 * report counts from these.
 */
export async function markAttendance(
  eventId: number,
  registrationId: number,
  status: "attended" | "no_show" | "registered"
): Promise<EventRegistrant> {
  const res = await apiClient.patch(
    `/admin/events/${eventId}/registrants/${registrationId}/attendance`,
    { status }
  );

  return res.data?.data as EventRegistrant;
}

export interface EventReport {
  event: {
    id: number;
    title: string;
    event_type?: string | null;
    category?: string | null;
    location?: string | null;
    barangays: string;
    services: string[];
    starts_at?: string | null;
    ends_at?: string | null;
    has_ended: boolean;
    max_slots?: number | null;
    host_rhu: string;
    posted_by?: string | null;
    report_generated_at?: string | null;
  };
  summary: {
    /** Registered in the app (and did not cancel). */
    registered: number;
    /** Of those, came. */
    attended: number;
    /** Came without registering. */
    walk_ins: number;
    /** Everyone who came: attended + walk_ins. */
    present: number;
    no_show: number;
    not_marked: number;
    cancelled: number;
    items_dispensed: number;
  };
  attendees: {
    id: number;
    name: string;
    barangay?: string | null;
    status: EventRegistrantStatus;
    registered_at?: string | null;
    marked_by?: string | null;
    marked_at?: string | null;
    walk_in?: boolean;
    patient_account?: boolean;
  }[];
  dispensed: {
    id: number;
    item: string;
    unit?: string | null;
    quantity: number;
    reason?: string | null;
    notes?: string | null;
    recorded_by?: string | null;
    recorded_at: string;
  }[];
  dispensed_totals: { item: string; unit?: string | null; quantity: number }[];
  generated_at: string;
}

/** Who registered, who came, and what was handed out at an event. */
export async function getEventReport(eventId: number): Promise<EventReport> {
  const res = await apiClient.get(`/admin/events/${eventId}/report`);
  return res.data?.data as EventReport;
}

/**
 * Someone who came without registering in the app: a patient account
 * (user_id), or -- with no account -- a name and barangay. A patient who had
 * registered after all is simply marked as came.
 */
export async function addWalkIn(
  eventId: number,
  person: { user_id: number } | { name: string; barangay_id?: number | null }
): Promise<EventRegistrant> {
  const res = await apiClient.post(`/admin/events/${eventId}/walk-ins`, person);
  return res.data?.data as EventRegistrant;
}

/** Take back a walk-in added by mistake (only walk-ins can be removed). */
export async function removeWalkIn(eventId: number, registrationId: number): Promise<void> {
  await apiClient.delete(`/admin/events/${eventId}/walk-ins/${registrationId}`);
}
