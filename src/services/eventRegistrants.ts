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