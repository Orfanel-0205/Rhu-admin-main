// src/types/cms.ts

// ============================================================================
// SHARED / API
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  current_page?: number;
  first_page_url?: string | null;
  from?: number | null;
  last_page?: number;
  last_page_url?: string | null;
  links?: any[];
  next_page_url?: string | null;
  path?: string;
  per_page?: number;
  prev_page_url?: string | null;
  to?: number | null;
  total?: number;
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

// ============================================================================
// AUTH / ADMIN USER TYPES
// ============================================================================

export type Capability =
  | "dashboard"
  | "queue"
  | "appointments"
  | "consultations"
  | "telemedicine"
  | "prescriptions"
  | "inventory"
  | "analytics"
  | "cms"
  | "sms"
  | "users"
  | "full_access"
  | string;

export type AdminRole =
  | "super_admin"
  | "superadmin"
  | "admin"
  | "rhu_admin"
  | "staff_admin"
  | "staff"
  | "doctor"
  | "nurse"
  | "midwife"
  | "mho"
  | "bhw"
  | string;

export interface AdminUser {
  id?: number;
  user_id?: number;
  role_id?: number | null;

  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;

  email?: string | null;
  mobile?: string | null;
  phone?: string | null;

  avatar?: string | null;
  avatar_url?: string | null;
  profile_picture?: string | null;

  role?: AdminRole | string | null | {
    id?: number;
    role_id?: number;
    name?: string;
    role_name?: string;
    slug?: string;
    code?: string;
    [key: string]: any;
  };

  role_name?: AdminRole | string | null;
  user_role?: AdminRole | string | null;
  account_type?: AdminRole | string | null;

  capabilities?: Capability[];
  permissions?: Capability[];

  account_status?: string | null;
  status?: string | null;
  is_active?: boolean;

  /**
   * False only until the one-time "Getting Started" tour has been shown.
   * Absent/undefined is treated as "already seen" so an older backend (or a
   * cached user object) can never surprise-open the tour.
   */
  has_seen_onboarding?: boolean;

  rhu_id?: number | null;
  assigned_rhu_id?: number | null;
  barangay_id?: number | null;
  barangay?: string | null;

  created_at?: string | null;
  updated_at?: string | null;

  [key: string]: any;
}

// ============================================================================
// ANNOUNCEMENTS
// ============================================================================

export type AnnouncementCategory = "health_alert" | "program" | "general";

export type AnnouncementStatus = "draft" | "published" | "archived";

export interface Announcement {
  id: number;
  title: string;
  body: string;
  description?: string | null;

  category: AnnouncementCategory;
  status: AnnouncementStatus;

  banner_url?: string | null;
  banner_path?: string | null;

  published_at?: string | null;
  archived_at?: string | null;
  archived_by?: number | string | null;

  created_by?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;

  [key: string]: any;
}

export interface CreateAnnouncementPayload {
  title: string;
  body: string;
  category: AnnouncementCategory;
  status?: "draft" | "published";
  banner_image?: File | null;
}

export interface UpdateAnnouncementPayload {
  title?: string;
  body?: string;
  category?: AnnouncementCategory;
  status?: AnnouncementStatus;
  banner_image?: File | null;
}

// ============================================================================
// EVENTS / PROGRAMS / PUBLIC EVENTS
// ============================================================================

export type EventType = "event" | "program" | "announcement";

export type EventStatus = "draft" | "published" | "archived" | "cancelled";

export type EventPriority = "low" | "normal" | "high" | "urgent";

export type EventVisibility =
  | "public"
  | "private"
  | "barangay"
  | "staff_only"
  | "rhu_only"
  // Facility-scoped visibility — matches the backend Rule::in(['public','rhu1','rhu2']).
  | "rhu1"
  | "rhu2";

export type EventCategory =
  | "immunization"
  | "medical_mission"
  | "maternal_health"
  | "dental"
  | "nutrition"
  | "general"
  | "other"
  | string;

export interface Event {
  id: number;

  title: string;
  description: string;
  body?: string | null;

  event_type: EventType;
  type?: EventType;

  category?: EventCategory | null;

  event_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;

  location?: string | null;
  target_audience?: string | null;
  barangay_target?: string | null;

  max_slots?: number | null;
  slots_available?: number | null;
  total_registered?: number | null;

  is_published: boolean;
  status?: EventStatus | string | null;

  priority?: EventPriority;
  visibility?: EventVisibility;

  tags?: string[];
  /** RHU Service Offered classification — one event may cover several services. */
  services?: string[];
  sms_summary?: string | null;

  latitude?: number | string | null;
  longitude?: number | string | null;

  is_registered?: boolean;
  banner_url?: string | null;
  banner_path?: string | null;
  image_url?: string | null;
  image_path?: string | null;

  published_at?: string | null;
  archived_at?: string | null;
  archived_by?: number | string | null;

  created_by?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;

  [key: string]: any;
}

export type PublicEvent = Event;

export interface CreateEventPayload {
  title: string;
  description?: string;
  body?: string;

  location?: string;
  event_date?: string;
  starts_at?: string;
  ends_at?: string;

  event_type: EventType;
  type?: EventType;

  category?: EventCategory;
  target_audience?: string;
  barangay_target?: string;

  max_slots?: number;
  slots_available?: number;
  total_registered?: number;

  is_published?: boolean;
  status?: EventStatus;

  priority?: EventPriority;
  visibility?: EventVisibility;

  tags?: string[] | string;
  services?: string[];
  sms_summary?: string;

  latitude?: number | string | null;
  longitude?: number | string | null;

  banner_image?: File | null;
}

export interface UpdateEventPayload {
  title?: string;
  description?: string;
  body?: string;

  location?: string;
  event_date?: string;
  starts_at?: string;
  ends_at?: string;

  event_type?: EventType;
  type?: EventType;

  category?: EventCategory;
  target_audience?: string;
  barangay_target?: string;

  max_slots?: number;
  slots_available?: number;
  total_registered?: number;

  is_published?: boolean;
  status?: EventStatus;

  priority?: EventPriority;
  visibility?: EventVisibility;

  tags?: string[] | string;
  services?: string[];
  sms_summary?: string;

  latitude?: number | string | null;
  longitude?: number | string | null;

  banner_image?: File | null;
}

// Compatibility aliases used by your existing pages/components.
export type EventCreatePayload = CreateEventPayload;
export type EventUpdatePayload = UpdateEventPayload;

export const EVENT_TYPE_CONFIG: Record<
  EventType,
  {
    label: string;
    color: string;
    bg: string;
    icon?: string;
    description?: string;
  }
> = {
  event: {
    label: "Event",
    color: "#2563EB",
    bg: "#EFF6FF",
    icon: "📅",
    description: "One-time activity, mission, or scheduled RHU service.",
  },
  program: {
    label: "Program",
    color: "#0F766E",
    bg: "#F0FDF9",
    icon: "🏥",
    description: "Ongoing health program or recurring public service.",
  },
  announcement: {
    label: "Announcement",
    color: "#7C3AED",
    bg: "#F5F3FF",
    icon: "📢",
    description: "Public advisory or information post.",
  },
};

export const EVENT_TYPE_OPTIONS: Array<{
  value: EventType;
  label: string;
  color: string;
  bg: string;
  icon: string;
  description: string;
}> = [
  {
    value: "event",
    label: "Event",
    color: "#2563EB",
    bg: "#EFF6FF",
    icon: "📅",
    description: "One-time activity, mission, or scheduled RHU service.",
  },
  {
    value: "program",
    label: "Program",
    color: "#0F766E",
    bg: "#F0FDF9",
    icon: "🏥",
    description: "Ongoing health program or recurring public service.",
  },
  {
    value: "announcement",
    label: "Announcement",
    color: "#7C3AED",
    bg: "#F5F3FF",
    icon: "📢",
    description: "Public advisory or information post.",
  },
];

export const ANNOUNCEMENT_CATEGORY_CONFIG: Record<
  AnnouncementCategory,
  {
    label: string;
    color: string;
    bg: string;
  }
> = {
  health_alert: {
    label: "Health Alert",
    color: "#DC2626",
    bg: "#FEF2F2",
  },
  program: {
    label: "Program",
    color: "#0F766E",
    bg: "#F0FDF9",
  },
  general: {
    label: "General",
    color: "#6B7280",
    bg: "#F3F4F6",
  },
};