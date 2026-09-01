// src/services/announcements.ts

import apiClient from "../lib/apiClient";
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementStatus,
  CreateAnnouncementPayload,
  UpdateAnnouncementPayload,
} from "../types/cms";

type AnnouncementListResponse = {
  data: Announcement[];
};

export type StaffAnnouncementNotifyPayload = {
  notify_staff?: boolean;
  audience?: "residents" | "staff" | "both";
  staff_roles?: string[];
};

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.announcements)) return payload.announcements;
  return [];
}

function normalizeCategory(value: any): AnnouncementCategory {
  const category = String(value ?? "general");

  if (category === "health_alert") return "health_alert";
  if (category === "program") return "program";
  return "general";
}

function normalizeStatus(value: any): AnnouncementStatus {
  const status = String(value ?? "draft");

  if (status === "published") return "published";
  if (status === "archived") return "archived";
  return "draft";
}

function normalizeAnnouncement(raw: any): Announcement {
  return {
    id: Number(raw.id),
    title: String(raw.title ?? ""),
    body: String(raw.body ?? raw.description ?? raw.content ?? ""),
    description: raw.description ?? raw.body ?? raw.content ?? null,

    category: normalizeCategory(raw.category),
    status: normalizeStatus(raw.status),

    banner_url: raw.banner_url ?? raw.image_url ?? null,
    banner_path: raw.banner_path ?? raw.image_path ?? null,

    published_at: raw.published_at ?? null,
    archived_at: raw.archived_at ?? null,
    archived_by: raw.archived_by ?? null,

    created_by: raw.created_by ?? null,
    created_at: raw.created_at ?? null,
    updated_at: raw.updated_at ?? null,

    audience: raw.audience ?? "residents",
    notify_staff: Boolean(raw.notify_staff),
    staff_roles: raw.staff_roles ?? [],
    staff_notified_at: raw.staff_notified_at ?? null,
    staff_notifications_count: Number(raw.staff_notifications_count ?? 0),

    ...raw,
  };
}

function toFormData(
  payload:
    | (CreateAnnouncementPayload & StaffAnnouncementNotifyPayload)
    | (UpdateAnnouncementPayload & StaffAnnouncementNotifyPayload)
): FormData {
  const form = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (value instanceof File) {
      form.append(key, value);
      return;
    }

    if (Array.isArray(value)) {
      form.append(key, JSON.stringify(value));
      return;
    }

    if (typeof value === "boolean") {
      form.append(key, value ? "1" : "0");
      return;
    }

    form.append(key, String(value));
  });

  return form;
}

export const announcementsService = {
  async getAnnouncements(params?: {
    search?: string;
    status?: "draft" | "published" | "archived" | "all";
    category?: string;
  }): Promise<AnnouncementListResponse> {
    const response = await apiClient.get("/admin/announcements", {
      params: {
        search: params?.search || undefined,
        status:
          params?.status && params.status !== "all"
            ? params.status
            : undefined,
        category: params?.category || undefined,
        per_page: 100,
      },
    });

    return {
      data: extractArray(response.data).map(normalizeAnnouncement),
    };
  },

  async createAnnouncement(
    payload: CreateAnnouncementPayload & StaffAnnouncementNotifyPayload
  ): Promise<Announcement> {
    const response = await apiClient.post(
      "/admin/announcements",
      toFormData(payload),
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    const created = normalizeAnnouncement(response.data?.data ?? response.data);

    if (payload.notify_staff && payload.status === "published") {
      await this.notifyStaff(created.id, {
        roles: payload.staff_roles,
        message: payload.body,
      });
    }

    return created;
  },

  async updateAnnouncement(
    id: number,
    payload: UpdateAnnouncementPayload & StaffAnnouncementNotifyPayload
  ): Promise<Announcement> {
    const response = await apiClient.post(
      `/admin/announcements/${id}`,
      toFormData(payload),
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    const updated = normalizeAnnouncement(response.data?.data ?? response.data);

    if (payload.notify_staff && payload.status === "published") {
      await this.notifyStaff(id, {
        roles: payload.staff_roles,
        message: payload.body,
      });
    }

    return updated;
  },

  async publishAnnouncement(
    id: number,
    isPublished: boolean,
    options?: {
      notify_staff?: boolean;
      staff_roles?: string[];
      message?: string;
    }
  ): Promise<Announcement> {
    const response = await apiClient.patch(
      `/admin/announcements/${id}/publish`,
      {
        is_published: isPublished,
      }
    );

    const updated = normalizeAnnouncement(response.data?.data ?? response.data);

    if (isPublished && options?.notify_staff) {
      await this.notifyStaff(id, {
        roles: options.staff_roles,
        message: options.message,
      });
    }

    return updated;
  },

  async notifyStaff(
    id: number,
    payload?: {
      roles?: string[];
      message?: string;
    }
  ): Promise<{ notified_count: number; message?: string }> {
    const response = await apiClient.post(
      `/admin/announcements/${id}/notify-staff`,
      payload ?? {}
    );

    return {
      notified_count: Number(response.data?.notified_count ?? 0),
      message: response.data?.message,
    };
  },

  async archiveAnnouncement(id: number): Promise<Announcement> {
    const response = await apiClient.patch(
      `/admin/announcements/${id}/archive`
    );

    return normalizeAnnouncement(response.data?.data ?? response.data);
  },

  async deleteAnnouncement(
    id: number,
    reason = "Deleted from RHU admin CMS."
  ): Promise<void> {
    await apiClient.delete(`/admin/announcements/${id}`, {
      data: { reason, delete_reason: reason },
    });
  },
};

export async function getAnnouncements(params?: {
  search?: string;
  status?: "draft" | "published" | "archived" | "all";
  category?: string;
}): Promise<AnnouncementListResponse> {
  return announcementsService.getAnnouncements(params);
}

export async function createAnnouncement(
  payload: CreateAnnouncementPayload & StaffAnnouncementNotifyPayload
): Promise<Announcement> {
  return announcementsService.createAnnouncement(payload);
}

export async function updateAnnouncement(
  id: number,
  payload: UpdateAnnouncementPayload & StaffAnnouncementNotifyPayload
): Promise<Announcement> {
  return announcementsService.updateAnnouncement(id, payload);
}

export async function publishAnnouncement(
  id: number,
  isPublished: boolean,
  options?: {
    notify_staff?: boolean;
    staff_roles?: string[];
    message?: string;
  }
): Promise<Announcement> {
  return announcementsService.publishAnnouncement(id, isPublished, options);
}

export async function notifyStaffAboutAnnouncement(
  id: number,
  payload?: {
    roles?: string[];
    message?: string;
  }
): Promise<{ notified_count: number; message?: string }> {
  return announcementsService.notifyStaff(id, payload);
}

export async function archiveAnnouncement(id: number): Promise<Announcement> {
  return announcementsService.archiveAnnouncement(id);
}

export async function deleteAnnouncement(
  id: number,
  reason?: string
): Promise<void> {
  return announcementsService.deleteAnnouncement(id, reason);
}

export default announcementsService;