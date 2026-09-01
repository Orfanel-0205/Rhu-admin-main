// src/services/events.ts
// Ka-Agapay CMS Events Service
// Uses real Laravel API and real database posts.

import apiClient from "../lib/apiClient";
import type {
  Event,
  EventCreatePayload,
  EventUpdatePayload,
  EventStatus,
  EventType,
  PaginatedResponse,
} from "../types/cms";

type RawEvent = Record<string, any>;

function normalizeEvent(raw: RawEvent): Event {
  return {
    id: raw.id,

    title: raw.title ?? "",
    description: raw.description ?? "",

    event_type: raw.event_type ?? raw.content_type ?? "event",

    category: raw.category ?? null,

    event_date: raw.event_date ?? raw.starts_at ?? null,
    starts_at: raw.starts_at ?? raw.event_date ?? null,
    ends_at: raw.ends_at ?? null,

    location: raw.location ?? null,
    target_audience: raw.target_audience ?? null,
    barangay_target: raw.barangay_target ?? "all",

    latitude:
      raw.latitude === undefined || raw.latitude === null
        ? null
        : Number(raw.latitude),

    longitude:
      raw.longitude === undefined || raw.longitude === null
        ? null
        : Number(raw.longitude),

    max_slots:
      raw.max_slots === undefined || raw.max_slots === null
        ? null
        : Number(raw.max_slots),

    slots_available:
      raw.slots_available === undefined || raw.slots_available === null
        ? null
        : Number(raw.slots_available),

    total_registered:
      raw.total_registered === undefined || raw.total_registered === null
        ? raw.registrants_count === undefined || raw.registrants_count === null
          ? null
          : Number(raw.registrants_count)
        : Number(raw.total_registered),

    tags: Array.isArray(raw.tags)
      ? raw.tags
      : typeof raw.tags === "string"
        ? raw.tags
            .split(",")
            .map((tag: string) => tag.trim())
            .filter(Boolean)
        : [],

    services: Array.isArray(raw.services)
      ? raw.services.map((service: any) => String(service)).filter(Boolean)
      : [],

    banner_image: raw.banner_image ?? null,
    banner_url: raw.banner_url ?? raw.image_url ?? null,
    image_url: raw.image_url ?? raw.banner_url ?? null,

    sms_summary: raw.sms_summary ?? null,

    priority: raw.priority ?? "normal",
    visibility: raw.visibility ?? "public",

    is_published: Boolean(raw.is_published),
    published_at: raw.published_at ?? null,

    created_by: raw.created_by ?? null,
    created_at: raw.created_at ?? null,
    updated_at: raw.updated_at ?? null,
  };
}

function extractArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  return [];
}

function extractMeta(raw: any) {
  return (
    raw?.meta ??
    raw?.data?.meta ?? {
      current_page: 1,
      last_page: 1,
      per_page: 12,
      total: extractArray(raw).length,
    }
  );
}

function getBackendErrorMessage(error: any, fallback: string): string {
  const validationErrors = error?.response?.data?.errors;

  if (validationErrors) {
    return Object.values(validationErrors).flat().join("\n");
  }

  return error?.response?.data?.message || error?.message || fallback;
}

function buildFormData(
  payload: EventCreatePayload | EventUpdatePayload
): FormData {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (key === "tags" && Array.isArray(value)) {
      value.forEach((tag) => {
        formData.append("tags[]", tag);
      });
      return;
    }

    if (key === "services" && Array.isArray(value)) {
      if (value.length === 0) {
        // One blank marker so the backend receives services=[] explicitly and
        // an edit that clears every service actually clears them.
        formData.append("services[]", "");
      } else {
        value.forEach((service) => {
          formData.append("services[]", service);
        });
      }
      return;
    }

    if (typeof value === "boolean") {
      formData.append(key, value ? "1" : "0");
      return;
    }

    formData.append(key, value as any);
  });

  return formData;
}

export const eventsService = {
  async fetchEvents(params?: {
    search?: string;
    status?: EventStatus | "all";
    type?: EventType | "all";
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Event>> {
    try {
      const res = await apiClient.get("/admin/events", {
        params,
      });

      return {
        data: extractArray(res.data).map(normalizeEvent),
        meta: extractMeta(res.data),
      };
    } catch (error: any) {
      console.error("[EventsService] Fetch admin events failed:", {
        status: error?.response?.status,
        data: error?.response?.data,
        message: error?.message,
      });

      throw new Error(
        getBackendErrorMessage(error, "Failed to load CMS posts.")
      );
    }
  },

  async fetchPublicEvents(params?: {
    search?: string;
    type?: EventType | "all";
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Event>> {
    try {
      const res = await apiClient.get("/programs", {
        params,
      });

      return {
        data: extractArray(res.data).map(normalizeEvent),
        meta: extractMeta(res.data),
      };
    } catch (error: any) {
      console.error("[EventsService] Fetch public events failed:", {
        status: error?.response?.status,
        data: error?.response?.data,
        message: error?.message,
      });

      throw new Error(
        getBackendErrorMessage(error, "Failed to load published posts.")
      );
    }
  },

  async fetchEventById(id: number): Promise<Event> {
    try {
      const res = await apiClient.get(`/programs/${id}`);

      return normalizeEvent(res.data.data ?? res.data);
    } catch (error: any) {
      console.error("[EventsService] Fetch event by ID failed:", {
        id,
        status: error?.response?.status,
        data: error?.response?.data,
        message: error?.message,
      });

      throw new Error(
        getBackendErrorMessage(error, "Failed to load selected post.")
      );
    }
  },

  async createEvent(payload: EventCreatePayload): Promise<Event> {
    try {
      const formData = buildFormData(payload);

      console.log("[EventsService] Creating event payload:", payload);

      const res = await apiClient.post("/admin/events", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("[EventsService] Create success:", res.data);

      return normalizeEvent(res.data.data ?? res.data);
    } catch (error: any) {
      console.error("[EventsService] Create failed:", {
        status: error?.response?.status,
        data: error?.response?.data,
        message: error?.message,
      });

      throw new Error(
        getBackendErrorMessage(error, "Failed to create post.")
      );
    }
  },

  async updateEvent(
    id: number,
    payload: EventUpdatePayload
  ): Promise<Event> {
    try {
      const formData = buildFormData(payload);
      formData.append("_method", "PUT");

      console.log("[EventsService] Updating event:", id, payload);

      const res = await apiClient.post(`/admin/events/${id}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("[EventsService] Update success:", res.data);

      return normalizeEvent(res.data.data ?? res.data);
    } catch (error: any) {
      console.error("[EventsService] Update failed:", {
        status: error?.response?.status,
        data: error?.response?.data,
        message: error?.message,
      });

      throw new Error(
        getBackendErrorMessage(error, "Failed to update post.")
      );
    }
  },

  async deleteEvent(id: number): Promise<void> {
    try {
      console.log("[EventsService] Deleting event:", id);

      await apiClient.delete(`/admin/events/${id}`);

      console.log("[EventsService] Delete success:", id);
    } catch (error: any) {
      console.error("[EventsService] Delete failed:", {
        id,
        status: error?.response?.status,
        data: error?.response?.data,
        message: error?.message,
      });

      throw new Error(
        getBackendErrorMessage(error, "Failed to delete post.")
      );
    }
  },

  async publishEvent(id: number, publish: boolean): Promise<Event> {
    try {
      console.log("[EventsService] Publishing event:", {
        id,
        publish,
      });

      const res = await apiClient.patch(`/admin/events/${id}/publish`, {
        publish,
      });

      console.log("[EventsService] Publish success:", res.data);

      return normalizeEvent(res.data.data ?? res.data);
    } catch (error: any) {
      console.error("[EventsService] Publish failed:", {
        id,
        publish,
        status: error?.response?.status,
        data: error?.response?.data,
        message: error?.message,
      });

      throw new Error(
        getBackendErrorMessage(error, "Failed to update publish status.")
      );
    }
  },
};
