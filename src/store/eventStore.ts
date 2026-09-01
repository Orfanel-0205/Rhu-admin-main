// src/store/eventsStore.ts
// Ka-Agapay CMS Events Zustand Store

import { create } from "zustand";
import { eventsService } from "../services/events";
import type {
  Event,
  EventCreatePayload,
  EventUpdatePayload,
  EventStatus,
  EventType,
} from "../types/cms";

interface EventsState {
  events: Event[];

  loading: boolean;
  saving: boolean;
  error: string | null;

  search: string;
  status: EventStatus | "all";
  type: EventType | "all";

  page: number;
  totalPages: number;

  fetchEvents: () => Promise<void>;
  createEvent: (payload: EventCreatePayload) => Promise<Event>;
  updateEvent: (id: number, payload: EventUpdatePayload) => Promise<Event>;
  deleteEvent: (id: number) => Promise<void>;
  publishEvent: (id: number, publish: boolean) => Promise<Event>;

  setSearch: (value: string) => void;
  setStatus: (value: EventStatus | "all") => void;
  setType: (value: EventType | "all") => void;
  setPage: (value: number) => void;

  clearError: () => void;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],

  loading: false,
  saving: false,
  error: null,

  search: "",
  status: "all",
  type: "all",

  page: 1,
  totalPages: 1,

  async fetchEvents() {
    const { search, status, type, page } = get();

    set({
      loading: true,
      error: null,
    });

    try {
      const response = await eventsService.fetchEvents({
        search: search || undefined,
        status,
        type,
        page,
        per_page: 12,
      });

      set({
        events: response.data,
        totalPages: response.meta?.last_page ?? response.last_page ?? 1,
        loading: false,
      });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to load CMS posts.",
        loading: false,
      });
    }
  },

  async createEvent(payload) {
    set({
      saving: true,
      error: null,
    });

    try {
      const created = await eventsService.createEvent(payload);

      set((state) => ({
        events: [created, ...state.events],
        saving: false,
      }));

      return created;
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to create CMS post.",
        saving: false,
      });

      throw error;
    }
  },

  async updateEvent(id, payload) {
    set({
      saving: true,
      error: null,
    });

    try {
      const updated = await eventsService.updateEvent(id, payload);

      set((state) => ({
        events: state.events.map((event) =>
          event.id === id ? updated : event
        ),
        saving: false,
      }));

      return updated;
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to update CMS post.",
        saving: false,
      });

      throw error;
    }
  },

  async deleteEvent(id) {
    set({
      saving: true,
      error: null,
    });

    try {
      await eventsService.deleteEvent(id);

      set((state) => ({
        events: state.events.filter((event) => event.id !== id),
        saving: false,
      }));
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete CMS post.",
        saving: false,
      });

      throw error;
    }
  },

  async publishEvent(id, publish) {
    set({
      saving: true,
      error: null,
    });

    try {
      const updated = await eventsService.publishEvent(id, publish);

      set((state) => ({
        events: state.events.map((event) =>
          event.id === id ? updated : event
        ),
        saving: false,
      }));

      return updated;
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to publish CMS post.",
        saving: false,
      });

      throw error;
    }
  },

  setSearch(value) {
    set({
      search: value,
      page: 1,
    });
  },

  setStatus(value) {
    set({
      status: value,
      page: 1,
    });
  },

  setType(value) {
    set({
      type: value,
      page: 1,
    });
  },

  setPage(value) {
    set({
      page: value,
    });
  },

  clearError() {
    set({
      error: null,
    });
  },
}));