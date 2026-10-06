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
    registered: number;
    attended: number;
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
