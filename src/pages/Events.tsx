// src/pages/Events.tsx
// Ka-Agapay Events / Programs Management
// User-friendly RHU CMS page for real-life event posting, publishing, slot control, and registrant monitoring.

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit2,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { eventsService } from "../services/events";
import { authService } from "../services/auth";
import { ImageUploader } from "../components/ImageUploader";
import MultiSelectDropdown from "../components/cms/MultiSelectDropdown";
import { ALL_RHU_SERVICES, RHU_SERVICE_GROUPS } from "../constants/rhuServices";
import { takeCmsDraft } from "../utils/cmsDraftHandoff";
import { TARGET_AUDIENCE_OPTIONS } from "../constants/targetAudiences";
import { getRecordLifecycleStatus } from "../lib/recordLifecycle";
import type { LifecycleStatus } from "../lib/recordLifecycle";
import { useAuthStore } from "../store/authStore";
import {
  EVENT_TYPE_CONFIG,
  type Event,
  type EventCreatePayload,
  type EventPriority,
  type EventStatus,
  type EventType,
  type EventUpdatePayload,
  type EventVisibility,
} from "../types/cms";

type AnyUser = {
  role?: string;
  role_name?: string;
  user_role?: string;
  account_type?: string;
  capabilities?: string[];
  [key: string]: unknown;
} | null;

type NoticeType = "success" | "error" | "warning" | "info";

type NoticeState = {
  type: NoticeType;
  message: string;
} | null;

type ModalMode = "create" | "edit" | null;
type LifecycleFilter = "all" | "active" | "upcoming" | "past" | "draft" | "archived";

type FormState = {
  title: string;
  description: string;
  event_type: EventType;
  category: string;
  event_date: string;
  ends_at: string;
  location: string;
  target_audience: string;
  barangay_target: string;
  max_slots: string;
  tags: string;
  /** RHU Service Offered — one event may cover several program services. */
  services: string[];
  sms_summary: string;
  priority: EventPriority;
  visibility: EventVisibility;
  is_published: boolean;
  banner_image: File | null;
};

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "green" | "red" | "yellow" | "blue";
  matchText?: string;
  onConfirm: () => Promise<void>;
} | null;

const DEFAULT_FORM: FormState = {
  title: "",
  description: "",
  event_type: "event",
  category: "",
  event_date: "",
  ends_at: "",
  location: "",
  target_audience: "",
  barangay_target: "all",
  max_slots: "",
  tags: "",
  services: [],
  sms_summary: "",
  priority: "normal",
  visibility: "public",
  is_published: false,
  banner_image: null,
};

function normalizeRole(user: AnyUser): string {
  if (!user) {
    return (
      localStorage.getItem("ka_agapay_role") ||
      localStorage.getItem("role") ||
      ""
    )
      .toLowerCase()
      .trim();
  }

  return String(
    user.role ||
      user.role_name ||
      user.user_role ||
      user.account_type ||
      ""
  )
    .toLowerCase()
    .trim();
}

function canManageEvents(user: AnyUser): boolean {
  const role = normalizeRole(user);

  const allowedRoles = [
    "admin",
    "staff",
    "staff_admin",
    "rhu_admin",
    "mho",
    "super_admin",
    "superadmin",
    "doctor",
    "nurse",
    "midwife",
    "bhw",
  ];

  const capabilities = Array.isArray(user?.capabilities)
    ? user.capabilities.map((capability) =>
        String(capability).toLowerCase().trim()
      )
    : [];

  return (
    allowedRoles.includes(role) ||
    capabilities.includes("cms") ||
    capabilities.includes("full_access")
  );
}

function getErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === "object" && error !== null) {
    const anyError = error as any;
    const validationErrors = anyError?.response?.data?.errors;

    if (validationErrors) {
      return Object.values(validationErrors).flat().join("\n");
    }

    return (
      anyError?.response?.data?.message ||
      anyError?.message ||
      fallback
    );
  }

  return fallback;
}

function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);

  return localDate.toISOString().slice(0, 16);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "No schedule";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "No schedule";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value?: string | null): string {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function eventStart(item: Event): string | null {
  return item.event_date || item.starts_at || null;
}

function isUpcoming(item: Event): boolean {
  const start = eventStart(item);

  if (!start) return false;

  const date = new Date(start);

  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() >= Date.now();
}

function isPastEvent(item: Event): boolean {
  const start = eventStart(item);

  if (!start) return false;

  const date = new Date(start);

  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() < Date.now();
}

function getEventLifecycle(item: Event): LifecycleStatus {
  return getRecordLifecycleStatus(
    {
      ...item,
      status:
        item.status ||
        (item.is_published ? "published" : "draft"),
      schedule_date: item.event_date || item.starts_at,
      end_date: item.ends_at || item.event_date || item.starts_at,
    },
    {
      module: item.event_type === "announcement" ? "announcement" : "event",
      dateFields: ["schedule_date", "event_date", "starts_at", "created_at"],
      endDateFields: ["end_date", "ends_at"],
      archivedStatuses: ["archived"],
      pendingStatuses: ["draft", "published", "active", "scheduled"],
      activeLabel: item.is_published ? "Active" : "Pending",
      expiredLabel: "Past / History",
    }
  );
}

function getSlotsLabel(item: Event): string {
  if (item.event_type === "announcement") return "No registration needed";

  if (!item.max_slots) return "Unlimited slots";

  const available = item.slots_available ?? item.max_slots;

  return `${available}/${item.max_slots} slots left`;
}

function getRegistrantsLabel(item: Event): string {
  if (!item.max_slots) return "View Registrants";

  const totalRegistered =
    item.total_registered ??
    (item.slots_available !== null && item.slots_available !== undefined
      ? Math.max(0, item.max_slots - item.slots_available)
      : 0);

  return `View Registrants (${totalRegistered}/${item.max_slots})`;
}

function isFull(item: Event): boolean {
  return (
    item.max_slots !== null &&
    item.max_slots !== undefined &&
    item.slots_available !== null &&
    item.slots_available !== undefined &&
    item.slots_available <= 0
  );
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getTypeIcon(type: EventType | string | undefined | null): ReactNode {
  if (type === "program") return <ShieldCheck size={16} />;
  if (type === "announcement") return <Megaphone size={16} />;
  return <CalendarDays size={16} />;
}

function getTypeConfig(type: EventType | string | undefined | null) {
  if (type === "program") return EVENT_TYPE_CONFIG.program;
  if (type === "announcement") return EVENT_TYPE_CONFIG.announcement;

  return EVENT_TYPE_CONFIG.event;
}

function getReadableType(type: EventType | string | undefined | null): string {
  if (type === "program") return "Program";
  if (type === "announcement") return "Announcement";
  return "Event";
}

function getNextStep(item: Event): string {
  if (!item.is_published) return "Draft. Review and publish when ready.";
  if (item.event_type !== "announcement" && isPastEvent(item)) {
    return "Past event - saved for records. View registrants or renew with a new date.";
  }
  if (isFull(item)) return "Slots full. Monitor registrants.";
  if (item.is_published) return "Live on resident mobile app.";
  return "Review details.";
}

function lifecyclePillStyle(lifecycle: LifecycleStatus): CSSProperties {
  const tones = {
    success: { background: "#DCFCE7", color: "#166534", border: "#BBF7D0" },
    warning: { background: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
    danger: { background: "#FEE2E2", color: "#B91C1C", border: "#FECACA" },
    info: { background: "#DBEAFE", color: "#1D4ED8", border: "#BFDBFE" },
    slate: { background: "#F1F5F9", color: "#475569", border: "#CBD5E1" },
    brand: { background: "#CCFBF1", color: "#0F766E", border: "#99F6E4" },
    violet: { background: "#F5F3FF", color: "#6D28D9", border: "#DDD6FE" },
  }[lifecycle.tone];

  return {
    background: tones.background,
    color: tones.color,
    border: `1px solid ${tones.border}`,
  };
}

function validateForm(form: FormState, publishNow: boolean): string | null {
  if (!form.title.trim()) return "Please enter a title.";

  if (form.title.trim().length < 5) {
    return "The title is too short. Use a clear title residents can understand.";
  }

  if (!form.description.trim()) {
    return "Please enter a description.";
  }

  if (form.description.trim().length < 10) {
    return "The description is too short. Add enough details for residents.";
  }

  if (form.event_type !== "announcement") {
    if (!form.event_date) {
      return "Please select the event/program date and time.";
    }

    if (!form.location.trim()) {
      return "Please enter the event/program location.";
    }
  }

  if (form.ends_at && form.event_date) {
    const start = new Date(form.event_date).getTime();
    const end = new Date(form.ends_at).getTime();

    if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
      return "End date/time cannot be earlier than the start date/time.";
    }
  }

  if (form.max_slots.trim()) {
    const slots = Number(form.max_slots);

    if (!Number.isFinite(slots) || slots < 1) {
      return "Maximum slots must be at least 1.";
    }
  }

  if (form.sms_summary.length > 160) {
    return "SMS summary must be 160 characters or less.";
  }

  if (publishNow && form.event_type !== "announcement" && form.event_date) {
    const start = new Date(form.event_date).getTime();

    if (!Number.isNaN(start) && start < Date.now()) {
      return "You cannot publish an event/program with a past schedule. Please update the date first.";
    }
  }

  return null;
}

function makePayload(form: FormState, publishNow: boolean): EventCreatePayload {
  const maxSlots = form.max_slots.trim() ? Number(form.max_slots) : undefined;

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    event_type: form.event_type,

    category: form.category.trim() || undefined,

    event_date:
      form.event_type === "announcement" && !form.event_date
        ? undefined
        : form.event_date || undefined,

    ends_at: form.ends_at || undefined,

    location: form.location.trim() || undefined,
    target_audience: form.target_audience.trim() || undefined,
    barangay_target: form.barangay_target.trim() || "all",

    max_slots: maxSlots,
    slots_available: maxSlots,

    tags: splitTags(form.tags),
    services: form.services,
    sms_summary: form.sms_summary.trim() || undefined,

    priority: form.priority,
    visibility: form.visibility,

    is_published: publishNow,
    banner_image: form.banner_image || undefined,
  };
}

export default function Events() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user) as AnyUser;

  const allowed = canManageEvents(user);

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EventStatus | "all">("all");
  const [type, setType] = useState<EventType | "all">("all");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [previewEvent, setPreviewEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const [notice, setNotice] = useState<NoticeState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const showNotice = useCallback((type: NoticeType, message: string) => {
    setNotice({ type, message });

    window.setTimeout(() => {
      setNotice(null);
    }, 4200);
  }, []);

  const loadEvents = useCallback(async () => {
    if (!allowed) return;

    setLoading(true);

    try {
      const response = await eventsService.fetchEvents({
        search: search.trim() || undefined,
        status,
        type,
        page,
        per_page: 12,
      });

      setEvents(response.data);
      setTotalPages(response.meta?.last_page ?? 1);
      setTotalRecords(response.meta?.total ?? response.data.length);
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to load events and programs."
      );

      setEvents([]);
      showNotice("error", message);
    } finally {
      setLoading(false);
    }
  }, [allowed, page, search, showNotice, status, type]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const stats = useMemo(() => {
    return {
      total: totalRecords || events.length,
      published: events.filter((item) => item.is_published).length,
      drafts: events.filter((item) => !item.is_published).length,
      upcoming: events.filter((item) => item.event_type !== "announcement" && isUpcoming(item)).length,
      full: events.filter(isFull).length,
    };
  }, [events, totalRecords]);

  const warnings = useMemo(() => {
    const list: string[] = [];

    const pastPublished = events.filter(
      (item) =>
        item.is_published &&
        item.event_type !== "announcement" &&
        isPastEvent(item)
    ).length;

    const fullEvents = events.filter(isFull).length;

    const missingLocation = events.filter(
      (item) =>
        item.event_type !== "announcement" &&
        item.is_published &&
        !item.location
    ).length;

    if (pastPublished > 0) {
      list.push(`${pastPublished} published post has a past schedule.`);
    }

    if (fullEvents > 0) {
      list.push(`${fullEvents} event/program is already full.`);
    }

    if (missingLocation > 0) {
      list.push(`${missingLocation} published event/program has no location.`);
    }

    return list;
  }, [events]);

  const boardEvents = useMemo(() => {
    return events.filter((item) => {
      const lifecycle = getEventLifecycle(item);

      if (lifecycleFilter === "all") return true;
      if (lifecycleFilter === "draft") return !item.is_published;
      if (lifecycleFilter === "archived") {
        return String(item.status || "").toLowerCase() === "archived";
      }
      if (lifecycleFilter === "past") {
        return lifecycle.isHistory || lifecycle.key === "history_only";
      }
      if (lifecycleFilter === "upcoming") return lifecycle.key === "upcoming";

      return !lifecycle.isHistory && lifecycle.key !== "upcoming" && item.is_published;
    });
  }, [events, lifecycleFilter]);

  function openCreate() {
    setActiveEvent(null);
    setForm(DEFAULT_FORM);
    setModalMode("create");
  }

  /*
   * The AI assistant can draft a full post from any page and hand it here.
   * Read it once on mount (takeCmsDraft clears it), open the Create modal
   * pre-filled, and tell staff to review before publishing — the draft is a
   * starting point, not an approved post. Values the assistant proposed that
   * are not selectable options are reported rather than silently dropped.
   */
  useEffect(() => {
    const draft = takeCmsDraft();

    if (!draft) return;

    setActiveEvent(null);
    setForm({
      ...DEFAULT_FORM,
      title: draft.title,
      description: draft.description,
      event_type: draft.event_type as FormState["event_type"],
      category: draft.category,
      event_date: draft.event_date,
      ends_at: draft.ends_at,
      location: draft.location,
      target_audience: draft.target_audience,
      barangay_target: draft.barangay_target,
      max_slots: draft.max_slots,
      tags: draft.tags,
      services: draft.services,
      sms_summary: draft.sms_summary,
      priority: draft.priority as FormState["priority"],
      visibility: draft.visibility as FormState["visibility"],
      is_published: false,
    });
    setModalMode("create");

    showNotice(
      "info",
      draft.unmatched.length
        ? `AI draft loaded. Please review every field before publishing. Could not auto-select: ${draft.unmatched.join(", ")}.`
        : "AI draft loaded. Please review every field before publishing."
    );
  }, []);

  function openEdit(item: Event) {
    setActiveEvent(item);
    setForm({
      title: item.title ?? "",
      description: item.description ?? "",
      event_type: item.event_type ?? "event",
      category: item.category ?? "",
      event_date: toDateTimeLocal(item.event_date ?? item.starts_at),
      ends_at: toDateTimeLocal(item.ends_at),
      location: item.location ?? "",
      target_audience: item.target_audience ?? "",
      barangay_target: item.barangay_target ?? "all",
      max_slots: item.max_slots ? String(item.max_slots) : "",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      services: Array.isArray(item.services) ? item.services : [],
      sms_summary: item.sms_summary ?? "",
      priority: item.priority ?? "normal",
      visibility: item.visibility ?? "public",
      is_published: Boolean(item.is_published),
      banner_image: null,
    });
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setActiveEvent(null);
    setForm(DEFAULT_FORM);
  }

  async function saveForm(publishNow: boolean) {
    const validation = validateForm(form, publishNow);

    if (validation) {
      showNotice("warning", validation);
      return;
    }

    setSaving(true);

    try {
      const payload = makePayload(form, publishNow);

      if (modalMode === "edit" && activeEvent) {
        const updated = await eventsService.updateEvent(
          activeEvent.id,
          payload as EventUpdatePayload
        );

        setEvents((previous) =>
          previous.map((item) => (item.id === updated.id ? updated : item))
        );

        showNotice(
          "success",
          publishNow
            ? "Post updated and published."
            : "Post updated and saved as draft."
        );
      } else {
        const created = await eventsService.createEvent(payload);

        setEvents((previous) => [created, ...previous]);
        setTotalRecords((previous) => previous + 1);

        showNotice(
          "success",
          publishNow
            ? "Post created and published to the resident app."
            : "Draft saved. Review it before publishing."
        );
      }

      closeModal();
      await loadEvents();
    } catch (error) {
      showNotice(
        "error",
        getErrorMessage(error, "Failed to save event/program.")
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmTogglePublish(item: Event) {
    const publish = !item.is_published;

    if (publish && item.event_type !== "announcement" && isPastEvent(item)) {
      showNotice(
        "warning",
        "This event/program has a past schedule. Edit the date before publishing."
      );
      return;
    }

    if (publish && item.event_type !== "announcement" && !item.location) {
      showNotice(
        "warning",
        "Please add a location before publishing this event/program."
      );
      return;
    }

    setConfirm({
      title: publish ? "Publish Post" : "Move Back to Draft",
      message: publish
        ? `"${item.title}" will become visible to residents in the Ka-Agapay mobile app.`
        : `"${item.title}" will be hidden from residents but kept as a draft.`,
      confirmLabel: publish ? "Publish Now" : "Move to Draft",
      tone: publish ? "green" : "yellow",
      onConfirm: async () => {
        const updated = await eventsService.publishEvent(item.id, publish);

        setEvents((previous) =>
          previous.map((oldItem) =>
            oldItem.id === updated.id ? updated : oldItem
          )
        );

        showNotice(
          "success",
          publish
            ? "Post published and visible to residents."
            : "Post moved back to draft."
        );

        setConfirm(null);
      },
    });
  }

  function confirmDelete(item: Event) {
    setConfirm({
      title: "Delete Post",
      message:
        "Use delete only for duplicate or wrong posts. For real RHU records, moving back to draft is safer.",
      confirmLabel: "Delete Permanently",
      tone: "red",
      matchText: item.title,
      onConfirm: async () => {
        await eventsService.deleteEvent(item.id);

        setEvents((previous) =>
          previous.filter((oldItem) => oldItem.id !== item.id)
        );

        setTotalRecords((previous) => Math.max(0, previous - 1));

        showNotice("success", "Post deleted.");
        setConfirm(null);
      },
    });
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatus(value: EventStatus | "all") {
    setStatus(value);
    setPage(1);
  }

  function handleType(value: EventType | "all") {
    setType(value);
    setPage(1);
  }

  if (!allowed) {
    return (
      <div style={S.card}>
        <h1 style={S.pageTitle}>Unauthorized</h1>
        <p style={S.muted}>
          Your account does not have permission to manage events and programs.
        </p>
        <div style={S.warningBox}>
          <AlertTriangle size={18} />
          <span>
            Detected role: <strong>{normalizeRole(user) || "none"}</strong>.
            Required role: admin, staff, RHU admin, MHO, or CMS capability.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      {notice ? (
        <ToastNotice
          notice={notice}
          onClose={() => setNotice(null)}
        />
      ) : null}

      <section style={S.hero}>
        <div>
          <div style={S.eyebrow}>Ka-Agapay RHU CMS</div>
          <h1 style={S.heroTitle}>Events & Programs Management</h1>
          <p style={S.heroText}>
            Create clear RHU events, health programs, and public advisories.
            This screen uses big cards, simple actions, and safety checks so
            RHU personnel can publish without confusion.
          </p>

          <div style={S.heroMeta}>
            <span>Step 1: Create draft</span>
            <span>Step 2: Review details</span>
            <span>Step 3: Publish to residents</span>
          </div>
        </div>

        <button type="button" onClick={openCreate} style={S.heroButton}>
          <Plus size={22} />
          New Post
        </button>
      </section>

      <section style={S.statsGrid}>
        <StatCard
          icon={<FileText size={24} />}
          label="Total Posts"
          value={stats.total}
          hint="All matching records"
          tone="teal"
        />
        <StatCard
          icon={<Globe size={24} />}
          label="Published"
          value={stats.published}
          hint="Visible to residents"
          tone="green"
        />
        <StatCard
          icon={<Clock size={24} />}
          label="Drafts"
          value={stats.drafts}
          hint="Not visible yet"
          tone="yellow"
        />
        <StatCard
          icon={<CalendarDays size={24} />}
          label="Upcoming"
          value={stats.upcoming}
          hint="Future events/programs"
          tone="blue"
        />
      </section>

      {warnings.length > 0 ? (
        <section style={S.warningPanel}>
          <AlertTriangle size={22} />
          <div>
            <strong>Real-life safety reminders</strong>
            <ul style={S.warningList}>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section style={S.goodPanel}>
          <CheckCircle2 size={22} />
          <div>
            <strong>No urgent CMS warning right now.</strong>
            <p>Continue reviewing drafts and monitoring registrants.</p>
          </div>
        </section>
      )}

      <section style={S.toolbar}>
        <div style={S.searchBox}>
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search title, category, location..."
            style={S.searchInput}
          />
        </div>

        <select
          value={status}
          onChange={(event) =>
            handleStatus(event.target.value as EventStatus | "all")
          }
          style={S.select}
        >
          <option value="all">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>

        <select
          value={lifecycleFilter}
          onChange={(event) =>
            setLifecycleFilter(event.target.value as LifecycleFilter)
          }
          style={S.select}
        >
          <option value="all">All History</option>
          <option value="active">Active</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past / History</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>

        <select
          value={type}
          onChange={(event) =>
            handleType(event.target.value as EventType | "all")
          }
          style={S.select}
        >
          <option value="all">All Types</option>
          <option value="event">Event</option>
          <option value="program">Program</option>
          <option value="announcement">Announcement</option>
        </select>

        <button
          type="button"
          onClick={loadEvents}
          disabled={loading}
          style={S.refreshButton}
        >
          <RefreshCw size={18} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      <section style={S.board}>
        <div style={S.boardHeader}>
          <div>
            <h2 style={S.sectionTitle}>Event Board</h2>
            <p style={S.muted}>
              Cards are easier than long tables. Staff can quickly see status,
              date, slots, and the safest next action.
            </p>
          </div>
          <div style={S.pageControls}>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              style={S.smallButton}
            >
              Previous
            </button>
            <span style={S.pageNumber}>
              Page {page} of {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((value) => value + 1)}
              style={S.smallButton}
            >
              Next
            </button>
          </div>
        </div>

        {loading ? (
          <div style={S.emptyState}>
            <RefreshCw size={34} />
            <strong>Loading posts...</strong>
            <span>Please wait while the system reads the database.</span>
          </div>
        ) : boardEvents.length === 0 ? (
          <div style={S.emptyState}>
            <CalendarDays size={42} />
            <strong>No events or programs found in this view.</strong>
            <span>Create your first RHU event or adjust the filters.</span>
            <button type="button" onClick={openCreate} style={S.primaryButton}>
              <Plus size={18} />
              Create New Post
            </button>
          </div>
        ) : (
          <div style={S.cardGrid}>
            {boardEvents.map((item) => (
              <EventCard
                key={item.id}
                item={item}
                onEdit={() => openEdit(item)}
                onPreview={() => setPreviewEvent(item)}
                onTogglePublish={() => confirmTogglePublish(item)}
                onDelete={() => confirmDelete(item)}
                onRegistrants={() => navigate(`/cms/events/${item.id}/registrants`)}
              />
            ))}
          </div>
        )}
      </section>

      {modalMode ? (
        <ModalShell
          title={modalMode === "create" ? "Create Event / Program" : "Edit Event / Program"}
          subtitle="Complete the important details before publishing to residents."
          onClose={closeModal}
          fitViewport
        >
          <EventFormPanel
            mode={modalMode}
            form={form}
            setForm={setForm}
            activeEvent={activeEvent}
            saving={saving}
            onCancel={closeModal}
            onSaveDraft={() => saveForm(false)}
            onPublish={() => saveForm(true)}
          />
        </ModalShell>
      ) : null}

      {previewEvent ? (
        <ModalShell
          title="Resident Preview"
          subtitle="This preview helps RHU staff check if residents can understand the post."
          onClose={() => setPreviewEvent(null)}
        >
          <ResidentPreview item={previewEvent} />
        </ModalShell>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          onClose={() => setConfirm(null)}
          onError={(message) => showNotice("error", message)}
        />
      ) : null}
    </div>
  );
}

function EventCard({
  item,
  onEdit,
  onPreview,
  onTogglePublish,
  onDelete,
  onRegistrants,
}: {
  item: Event;
  onEdit: () => void;
  onPreview: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onRegistrants: () => void;
}) {
  const cfg = getTypeConfig(item.event_type);
  const typeLabel = getReadableType(item.event_type);
  const start = eventStart(item);
  const full = isFull(item);
  const upcoming = isUpcoming(item);
  const past = isPastEvent(item);
  const lifecycle = getEventLifecycle(item);

  return (
    <article style={S.eventCard}>
      <div style={S.imageArea}>
        {item.banner_url || item.image_url ? (
          <img
            src={item.banner_url || item.image_url || ""}
            alt={item.title}
            style={S.cardImage}
          />
        ) : (
          <div
            style={{
              ...S.imageFallback,
              background: cfg.bg,
              color: cfg.color,
            }}
          >
            {getTypeIcon(item.event_type)}
            <span>{typeLabel}</span>
          </div>
        )}
      </div>

      <div style={S.cardBody}>
        <div style={S.badgeRow}>
          <span
            style={{
              ...S.pill,
              background: cfg.bg,
              color: cfg.color,
            }}
          >
            {getTypeIcon(item.event_type)}
            {typeLabel}
          </span>

          <span
            style={{
              ...S.pill,
              ...(item.is_published ? S.publishedPill : S.draftPill),
            }}
          >
            {item.is_published ? (
              <>
                <Globe size={14} />
                Published
              </>
            ) : (
              <>
                <FileText size={14} />
                Draft
              </>
            )}
          </span>

          <span style={{ ...S.pill, ...lifecyclePillStyle(lifecycle) }}>
            {lifecycle.isHistory ? <Archive size={14} /> : <Clock size={14} />}
            {lifecycle.label}
          </span>

          {item.priority === "urgent" ? (
            <span style={{ ...S.pill, ...S.urgentPill }}>
              <AlertTriangle size={14} />
              Urgent
            </span>
          ) : null}
        </div>

        <h3 style={S.cardTitle}>{item.title}</h3>

        <p style={S.cardDescription}>
          {item.description || "No description provided."}
        </p>

        <div style={S.infoGrid}>
          <InfoBlock
            icon={<CalendarDays size={16} />}
            label="Schedule"
            value={formatDateTime(start)}
            danger={item.event_type !== "announcement" && past && item.is_published}
          />
          <InfoBlock
            icon={<MapPin size={16} />}
            label="Location"
            value={item.location || "Not set"}
            danger={item.event_type !== "announcement" && !item.location && item.is_published}
          />
          <InfoBlock
            icon={<Users size={16} />}
            label="Slots"
            value={getSlotsLabel(item)}
            danger={full}
          />
          <InfoBlock
            icon={<CheckCircle2 size={16} />}
            label="Next Step"
            value={getNextStep(item)}
          />
        </div>

        {item.tags && item.tags.length > 0 ? (
          <div style={S.tagRow}>
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag} style={S.tag}>
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        {item.event_type !== "announcement" ? (
          <button
            type="button"
            onClick={onRegistrants}
            style={S.registrantsButton}
          >
            <Users size={17} />
            {getRegistrantsLabel(item)}
          </button>
        ) : null}

        {item.event_type !== "announcement" && !item.max_slots ? (
          <div style={S.infoValue}>Unlimited slots</div>
        ) : null}

        <div style={S.actionRow}>
          <button type="button" onClick={onPreview} style={S.lightButton}>
            <Eye size={16} />
            Preview
          </button>

          <button type="button" onClick={onEdit} style={S.lightButton}>
            <Edit2 size={16} />
            Edit
          </button>

          <button
            type="button"
            onClick={onTogglePublish}
            style={item.is_published ? S.warningButton : S.successButton}
          >
            {item.is_published ? (
              <>
                <FileText size={16} />
                Draft
              </>
            ) : (
              <>
                <Send size={16} />
                Publish
              </>
            )}
          </button>

          <button type="button" onClick={onDelete} style={S.dangerButton}>
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Redesigned Event Creation form ─────────────────────────────────────────
// Collapsible numbered sections (chosen over a wizard: staff with limited
// digital literacy keep the whole familiar form visible, with completion
// marks per section instead of hidden steps), live field validation, a live
// publishing checklist, and a sticky footer so Cancel / Save Draft /
// Create & Publish never scroll away.

type FieldCheck = { tone: "ok" | "warn" | "error"; message: string } | null;

function FieldMessage({ check }: { check: FieldCheck }) {
  if (!check) return null;

  const palette =
    check.tone === "ok"
      ? { color: "#047857", icon: <CheckCircle2 size={13} /> }
      : check.tone === "warn"
        ? { color: "#B45309", icon: <AlertTriangle size={13} /> }
        : { color: "#B91C1C", icon: <AlertTriangle size={13} /> };

  return (
    <small
      role={check.tone === "error" ? "alert" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: palette.color,
        fontSize: 12.5,
        fontWeight: 800,
      }}
    >
      {palette.icon}
      {check.message}
    </small>
  );
}

/**
 * Segmented single-choice control (radio-group semantics). Used for Priority
 * and Visibility so all 2–3 options are visible at once with a plain-language
 * hint — friendlier for low digital literacy than a native dropdown.
 */
function ChoiceGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; hint: string; tone?: "warn" | "danger" }[];
}) {
  return (
    <div style={S.field}>
      <span id={`choice-${label}`}>{label}</span>
      <div role="radiogroup" aria-labelledby={`choice-${label}`} style={S.choiceRow}>
        {options.map((option) => {
          const on = option.value === value;
          const accent =
            option.tone === "danger"
              ? { border: "#FECACA", bg: "#FEF2F2", fg: "#B91C1C" }
              : option.tone === "warn"
                ? { border: "#FDE68A", bg: "#FFFBEB", fg: "#B45309" }
                : { border: "#A7F3D0", bg: "#ECFDF5", fg: "#047857" };

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option.value)}
              style={{
                ...S.choiceCard,
                ...(on
                  ? {
                      borderColor: accent.border,
                      background: accent.bg,
                      boxShadow: `inset 0 0 0 1px ${accent.border}`,
                    }
                  : null),
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span
                  style={{
                    ...S.choiceDot,
                    ...(on ? { borderColor: accent.fg, background: accent.fg } : null),
                  }}
                >
                  {on ? <CheckCircle2 size={13} color="#FFFFFF" /> : null}
                </span>
                <strong style={{ fontSize: 14, color: on ? accent.fg : "#0F172A" }}>
                  {option.label}
                </strong>
              </span>
              <span style={S.choiceHint}>{option.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SectionState = "done" | "attention" | "idle";

function FormSection({
  id,
  index,
  title,
  subtitle,
  state,
  open,
  onToggle,
  children,
}: {
  /** DOM id so the checklist chips can scroll straight to this section. */
  id?: string;
  index: number;
  title: string;
  subtitle: string;
  state: SectionState;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} style={S.section}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={S.sectionHeaderBtn}
      >
        <span
          style={{
            ...S.sectionBadge,
            ...(state === "done"
              ? { background: "#0F766E", color: "#FFFFFF", borderColor: "#0F766E" }
              : state === "attention"
                ? { background: "#FEF2F2", color: "#B91C1C", borderColor: "#FECACA" }
                : {}),
          }}
        >
          {state === "done" ? (
            <CheckCircle2 size={16} />
          ) : state === "attention" ? (
            <AlertTriangle size={15} />
          ) : (
            index
          )}
        </span>

        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <strong style={S.sectionHeadTitle}>{title}</strong>
          <span style={S.sectionHeadSubtitle}>{subtitle}</span>
        </span>

        <ChevronDown
          size={19}
          style={{
            flexShrink: 0,
            color: "#64748B",
            transition: "transform .18s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open ? <div style={S.sectionBody}>{children}</div> : null}
    </section>
  );
}

function EventFormPanel({
  mode,
  form,
  setForm,
  activeEvent,
  saving,
  onCancel,
  onSaveDraft,
  onPublish,
}: {
  mode: "create" | "edit";
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  activeEvent: Event | null;
  saving: boolean;
  onCancel: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  const cfg = getTypeConfig(form.event_type);
  const isAnnouncement = form.event_type === "announcement";

  const [dirty, setDirty] = useState(false);
  const [barangays, setBarangays] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  // Landscape layout: with two side-by-side columns there is room to show
  // every section expanded by default — staff see the whole form at once and
  // can still collapse sections they are done with.
  const [openSections, setOpenSections] = useState({
    basic: true,
    schedule: true,
    audience: true,
    service: true,
    publication: true,
    banner: true,
  });

  // Checklist chip → expand that section and scroll the form body to it.
  const jumpToSection = (key: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [key]: true }));
    document
      .getElementById(`event-section-${key}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    authService
      .getBarangays()
      .then(setBarangays)
      .catch(() => setBarangays([]));
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setDirty(true);
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));

  // ── Live, human-readable field validation ────────────────────────────────
  const titleCheck: FieldCheck = !form.title.trim()
    ? { tone: "error", message: "A title is required." }
    : form.title.trim().length < 5
      ? { tone: "warn", message: "Title is very short — make it clear for residents." }
      : { tone: "ok", message: "Title looks good." };

  const descriptionCheck: FieldCheck = !form.description.trim()
    ? { tone: "error", message: "A description is required." }
    : form.description.trim().length < 10
      ? { tone: "warn", message: "Description is too short — add what to bring and who can join." }
      : { tone: "ok", message: "Description looks good." };

  const startMs = form.event_date ? new Date(form.event_date).getTime() : NaN;
  const endMs = form.ends_at ? new Date(form.ends_at).getTime() : NaN;

  const scheduleCheck: FieldCheck = (() => {
    if (!form.event_date) {
      return isAnnouncement
        ? { tone: "ok", message: "Announcements do not need a schedule." }
        : { tone: "error", message: "Please pick the start date and time." };
    }
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs) {
      return { tone: "error", message: "End date must be after the start date." };
    }
    if (!Number.isNaN(startMs) && startMs < Date.now()) {
      return {
        tone: "warn",
        message: "This schedule is already in the past — publishing will be blocked until you update it.",
      };
    }
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
      const hours = Math.round(((endMs - startMs) / 36e5) * 10) / 10;
      return { tone: "ok", message: `Schedule looks good (runs about ${hours} hour${hours === 1 ? "" : "s"}).` };
    }
    return { tone: "ok", message: "Schedule looks good." };
  })();

  const locationCheck: FieldCheck = form.location.trim()
    ? { tone: "ok", message: "Location provided." }
    : isAnnouncement
      ? null
      : { tone: "error", message: "Please enter where residents should go." };

  const slotsCheck: FieldCheck = !form.max_slots.trim()
    ? null
    : !Number.isFinite(Number(form.max_slots)) || Number(form.max_slots) < 1
      ? { tone: "error", message: "Maximum slots must be at least 1." }
      : { tone: "ok", message: `${Number(form.max_slots)} slot(s) will be available.` };

  const smsLength = form.sms_summary.length;
  const smsCheck: FieldCheck = smsLength === 0
    ? null
    : smsLength > 160
      ? { tone: "error", message: "SMS exceeds 160 characters — it will be cut or cost extra credits." }
      : smsLength > 140
        ? { tone: "warn", message: `${160 - smsLength} characters left.` }
        : { tone: "ok", message: "Fits in one SMS." };

  // ── Target Audience multi-select (serialized into the existing
  // target_audience comma string; "All Residents" = the select-all state).
  // Legacy free-text values from older posts are merged into the option list
  // so they stay visible and removable. ──────────────────────────────────
  const audienceAll = form.target_audience.trim().toLowerCase() === "all residents";
  const selectedAudiences = audienceAll
    ? []
    : form.target_audience
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);

  const audienceOptions = [
    ...TARGET_AUDIENCE_OPTIONS,
    ...selectedAudiences.filter((name) => !TARGET_AUDIENCE_OPTIONS.includes(name)),
  ];

  const onAudiencesChange = (selected: string[], all: boolean) => {
    update("target_audience", all ? "All Residents" : selected.join(", "));
  };

  // ── Barangay multi-select (serialized into the existing barangay_target
  // string: 'all' or a comma-separated list, so the API shape is unchanged) ──
  const barangayAll = form.barangay_target.trim().toLowerCase() === "all";
  const selectedBarangays = barangayAll
    ? []
    : form.barangay_target
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "" && name.toLowerCase() !== "all");

  const onBarangaysChange = (selected: string[], all: boolean) => {
    update("barangay_target", all ? "all" : selected.join(", "));
  };

  // ── Services multi-select ────────────────────────────────────────────────
  const allServicesSelected =
    form.services.length > 0 &&
    ALL_RHU_SERVICES.every((service) => form.services.includes(service));

  const onServicesChange = (selected: string[], all: boolean) => {
    update("services", all ? [...ALL_RHU_SERVICES] : selected);
  };

  // ── Tags as chips (still stored as the same comma string) ───────────────
  const tagList = splitTags(form.tags);

  const addTag = (raw: string) => {
    const cleaned = raw.trim().replace(/,+$/, "");
    if (!cleaned) return;
    if (!tagList.includes(cleaned)) {
      update("tags", [...tagList, cleaned].join(", "));
    }
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    update("tags", tagList.filter((item) => item !== tag).join(", "));
  };

  // ── Section states + live publishing checklist ──────────────────────────
  const basicState: SectionState =
    titleCheck.tone === "error" || descriptionCheck.tone === "error"
      ? form.title || form.description
        ? "attention"
        : "idle"
      : "done";

  const scheduleState: SectionState =
    scheduleCheck?.tone === "error" || locationCheck?.tone === "error"
      ? form.event_date || form.location
        ? "attention"
        : "idle"
      : "done";

  const audienceState: SectionState =
    slotsCheck?.tone === "error"
      ? "attention"
      : form.target_audience.trim() || barangayAll || selectedBarangays.length > 0
        ? "done"
        : "idle";

  const serviceState: SectionState = form.services.length > 0 ? "done" : "idle";

  const publicationState: SectionState =
    smsCheck?.tone === "error" ? "attention" : "done";

  const hasBanner = Boolean(form.banner_image || activeEvent?.banner_url || activeEvent?.image_url);
  const bannerState: SectionState = hasBanner ? "done" : "idle";

  const readyToPublish =
    titleCheck.tone !== "error" &&
    descriptionCheck.tone !== "error" &&
    scheduleCheck?.tone !== "error" &&
    locationCheck?.tone !== "error" &&
    slotsCheck?.tone !== "error" &&
    smsCheck?.tone !== "error" &&
    (isAnnouncement || Number.isNaN(startMs) || startMs >= Date.now());

  const checklist: {
    label: string;
    state: "done" | "todo" | "optional";
    section: keyof typeof openSections;
  }[] = [
    {
      label: "Title",
      state: titleCheck.tone !== "error" ? "done" : "todo",
      section: "basic",
    },
    {
      label: "Schedule",
      state: isAnnouncement
        ? "done"
        : scheduleCheck?.tone !== "error" && form.event_date
          ? "done"
          : "todo",
      section: "schedule",
    },
    {
      label: "Location",
      state: isAnnouncement || form.location.trim() ? "done" : "todo",
      section: "schedule",
    },
    {
      label: "Audience",
      state:
        form.target_audience.trim() || barangayAll || selectedBarangays.length > 0
          ? "done"
          : "optional",
      section: "audience",
    },
    {
      label: "Service",
      state: form.services.length > 0 ? "done" : "optional",
      section: "service",
    },
    {
      label: "SMS",
      state: smsLength === 0 ? "optional" : smsCheck?.tone !== "error" ? "done" : "todo",
      section: "publication",
    },
    { label: "Banner", state: hasBanner ? "done" : "optional", section: "banner" },
  ];

  // Publishing with problems: open every section that needs attention so the
  // inline messages are visible, then let the parent's validator report.
  const handlePublish = () => {
    if (!readyToPublish) {
      setOpenSections({
        basic: true,
        schedule: true,
        audience: true,
        service: openSections.service,
        publication: true,
        banner: openSections.banner,
      });
    }
    onPublish();
  };

  return (
    <div style={S.panelShell}>
      {/* ── Publishing checklist — pinned at the TOP, always visible.
          Each chip is a button that expands + scrolls to its section. ── */}
      <div style={S.checklistBar} role="navigation" aria-label="Publishing checklist">
        {checklist.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => jumpToSection(item.section)}
            title={`Go to ${item.label}`}
            style={{
              ...S.checkChip,
              ...S.checkChipButton,
              ...(item.state === "done"
                ? S.checkChipDone
                : item.state === "todo"
                  ? S.checkChipTodo
                  : S.checkChipOptional),
            }}
          >
            {item.state === "done" ? "✓" : item.state === "todo" ? "✗" : "⚠"} {item.label}
          </button>
        ))}
        <span
          style={{
            ...S.checkChip,
            ...(readyToPublish ? S.checkChipDone : S.checkChipTodo),
            marginLeft: "auto",
          }}
        >
          {readyToPublish ? "✓ Ready to Publish" : "✗ Not ready yet"}
        </span>
      </div>

      {/* ── Scrollable form body (only this part scrolls) ── */}
      <div style={S.formScroll}>
      <div style={S.form}>
        <div style={S.formGuide}>
          <div style={{ ...S.formGuideIcon, background: cfg.bg, color: cfg.color }}>
            {getTypeIcon(form.event_type)}
          </div>
          <div>
            <strong>
              {form.event_type === "event"
                ? "Use Event for one-day or scheduled RHU activities."
                : form.event_type === "program"
                  ? "Use Program for health services like immunization, TB DOTS, nutrition, or maternal care."
                  : "Use Announcement for public advisory posts that do not require registration."}
            </strong>
            <p>
              Residents need simple details: what, when, where, who can join,
              and what to bring.
            </p>
          </div>
        </div>

        {/* ── Landscape layout: two side-by-side columns of sections.
            Left: Basic → Schedule → Audience · Right: Service → Publication →
            Banner. Collapses to one column on narrow windows (auto-fit). ── */}
        <div style={S.formColumns}>
        <div style={S.formColumn}>

        {/* ── Section 1 — Basic Information ── */}
        <FormSection
          id="event-section-basic"
          index={1}
          title="Basic Information"
          subtitle="Post type, category, title, and description"
          state={basicState}
          open={openSections.basic}
          onToggle={() => toggleSection("basic")}
        >
          <div style={S.twoCol}>
            <label style={S.field}>
              <span>Post Type *</span>
              <select
                value={form.event_type}
                onChange={(event) => update("event_type", event.target.value as EventType)}
                style={S.input}
              >
                <option value="event">Event</option>
                <option value="program">Program</option>
                <option value="announcement">Announcement</option>
              </select>
            </label>

            <label style={S.field}>
              <span>Category</span>
              <input
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                placeholder="Example: Immunization, Nutrition, Medical Mission"
                style={S.input}
              />
            </label>
          </div>

          <label style={S.field}>
            <span>Title *</span>
            <input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="Example: Free Community Immunization Day"
              style={S.input}
              aria-required="true"
            />
            <FieldMessage check={form.title || dirty ? titleCheck : null} />
          </label>

          <label style={S.field}>
            <span>Description *</span>
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Write simple instructions. Example: Bring your ID and vaccination card. Pregnant women, senior citizens, and children are welcome."
              style={{ ...S.input, minHeight: 120, paddingTop: 12, resize: "vertical" }}
              aria-required="true"
            />
            <FieldMessage check={form.description || dirty ? descriptionCheck : null} />
          </label>
        </FormSection>

        {/* ── Section 2 — Schedule & Venue ── */}
        <FormSection
          id="event-section-schedule"
          index={2}
          title="Schedule & Venue"
          subtitle="When and where residents should come"
          state={scheduleState}
          open={openSections.schedule}
          onToggle={() => toggleSection("schedule")}
        >
          <div style={S.twoCol}>
            <label style={S.field}>
              <span>{isAnnouncement ? "Date & Time (optional)" : "Start Date & Time *"}</span>
              <input
                type="datetime-local"
                value={form.event_date}
                onChange={(event) => update("event_date", event.target.value)}
                style={S.input}
                aria-required={!isAnnouncement}
              />
            </label>

            <label style={S.field}>
              <span>End Date & Time</span>
              <input
                type="datetime-local"
                value={form.ends_at}
                min={form.event_date || undefined}
                onChange={(event) => update("ends_at", event.target.value)}
                style={S.input}
              />
            </label>
          </div>
          <FieldMessage check={form.event_date || dirty ? scheduleCheck : null} />

          <label style={S.field}>
            <span>{isAnnouncement ? "Location (optional)" : "Location *"}</span>
            <input
              value={form.location}
              onChange={(event) => update("location", event.target.value)}
              placeholder="Example: RHU Malasiqui Main Building"
              style={S.input}
              aria-required={!isAnnouncement}
            />
            <FieldMessage check={form.location || dirty ? locationCheck : null} />
          </label>
        </FormSection>

        {/* ── Section 3 — Target Audience ── */}
        <FormSection
          id="event-section-audience"
          index={3}
          title="Target Audience"
          subtitle="Who this post is for and which barangays"
          state={audienceState}
          open={openSections.audience}
          onToggle={() => toggleSection("audience")}
        >
          <div style={S.field}>
            <span>Target Audience</span>
            {/* Preset groups (incl. PWDs and other priority-lane groups) so
                staff pick instead of type. Same target_audience string field
                underneath — nothing changes in the API. */}
            <MultiSelectDropdown
              id="event-target-audience"
              groups={[{ options: audienceOptions }]}
              selected={selectedAudiences}
              allSelected={audienceAll}
              onChange={onAudiencesChange}
              placeholder="Open to choose who this post is for"
              selectAllLabel="All Residents (everyone)"
              allChipLabel="All Residents"
              searchPlaceholder="Search group (e.g. PWD, senior, pregnant)…"
              summaryNoun="groups"
            />
            <small style={S.helpText}>
              Pick every group this post applies to — e.g. Senior Citizens +
              PWDs. Choose "Others" for anything not on the list.
            </small>
          </div>

          <label style={S.field}>
            <span>Maximum Slots</span>
            <input
              type="number"
              min={1}
              value={form.max_slots}
              onChange={(event) => update("max_slots", event.target.value)}
              placeholder="Leave blank if unlimited"
              style={S.input}
            />
            <FieldMessage check={slotsCheck} />
          </label>

          <div style={S.field}>
            <span>Barangay Target</span>
            <MultiSelectDropdown
              id="event-barangay-target"
              groups={[{ options: barangays }]}
              selected={selectedBarangays}
              allSelected={barangayAll}
              onChange={onBarangaysChange}
              placeholder="All barangays (default) — open to choose specific ones"
              selectAllLabel="Select All Barangays"
              allChipLabel="All Barangays Selected"
              searchPlaceholder="Search barangay…"
              summaryNoun="barangays"
            />
            <small style={S.helpText}>
              Leave empty to target every barangay. Residents only see posts
              for their own barangay (or posts for all).
            </small>
          </div>
        </FormSection>

        </div>
        {/* ── Right column ── */}
        <div style={S.formColumn}>

        {/* ── Section 4 — RHU Service Offered ── */}
        <FormSection
          id="event-section-service"
          index={4}
          title="RHU Service Offered"
          subtitle="Classify this post under the RHU program services"
          state={serviceState}
          open={openSections.service}
          onToggle={() => toggleSection("service")}
        >
          <div style={S.field}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Stethoscope size={15} style={{ color: "#0F766E" }} />
              Services covered by this post
            </span>
            <MultiSelectDropdown
              id="event-services"
              groups={RHU_SERVICE_GROUPS}
              selected={form.services}
              allSelected={allServicesSelected}
              onChange={onServicesChange}
              placeholder="Open to choose one or more RHU services"
              selectAllLabel="Select All Services"
              allChipLabel="All Services Selected"
              searchPlaceholder="Search service (e.g. prenatal, dental, dengue)…"
              summaryNoun="services"
            />
            <small style={S.helpText}>
              Optional but recommended — it helps staff and reports group posts
              by RHU program.
            </small>
          </div>
        </FormSection>

        {/* ── Section 5 — Publication Settings ── */}
        <FormSection
          id="event-section-publication"
          index={5}
          title="Publication Settings"
          subtitle="Priority, visibility, tags, and the SMS text"
          state={publicationState}
          open={openSections.publication}
          onToggle={() => toggleSection("publication")}
        >
          {/* Priority and Visibility as labeled segmented choices — every
              option visible at once with a plain-language hint, instead of
              hiding them inside a native dropdown. */}
          <ChoiceGroup
            label="Priority"
            value={form.priority}
            onChange={(value) => update("priority", value as EventPriority)}
            options={[
              { value: "normal", label: "Normal", hint: "Regular post" },
              { value: "high", label: "High", hint: "Shown higher in the app", tone: "warn" },
              { value: "urgent", label: "Urgent", hint: "Time-critical advisory", tone: "danger" },
            ]}
          />

          <div style={S.field}>
            <ChoiceGroup
              label="Visibility"
              value={form.visibility}
              onChange={(value) => update("visibility", value as EventVisibility)}
              options={[
                { value: "public", label: "Public", hint: "All residents, both RHUs" },
                { value: "rhu1", label: "RHU 1", hint: "RHU 1 residents only" },
                { value: "rhu2", label: "RHU 2", hint: "RHU 2 residents only" },
              ]}
            />
            <FieldMessage
              check={
                form.visibility === "rhu1" || form.visibility === "rhu2"
                  ? {
                      tone: "warn",
                      message: `Only residents under ${form.visibility === "rhu1" ? "RHU 1" : "RHU 2"} will see this post.`,
                    }
                  : null
              }
            />
          </div>

          <div style={S.field}>
            <span>Tags</span>
            <div style={S.tagsBox}>
              {tagList.map((tag) => (
                <span key={tag} style={S.tagChip}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    style={S.tagRemove}
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTag(tagDraft);
                  } else if (event.key === "Backspace" && !tagDraft && tagList.length > 0) {
                    removeTag(tagList[tagList.length - 1]);
                  }
                }}
                onBlur={() => addTag(tagDraft)}
                placeholder={tagList.length === 0 ? "Type a tag, press Enter (e.g. vaccine, free)" : "Add another…"}
                style={S.tagsInput}
                aria-label="Add tag"
              />
            </div>
          </div>

          <label style={S.field}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <MessageSquare size={15} style={{ color: "#0F766E" }} />
              SMS Summary (optional)
            </span>
            <input
              value={form.sms_summary}
              maxLength={160}
              onChange={(event) => update("sms_summary", event.target.value)}
              placeholder="Short SMS-friendly reminder"
              style={S.input}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <FieldMessage check={smsCheck} />
              <small
                style={{
                  ...S.helpText,
                  marginLeft: "auto",
                  color: smsLength > 160 ? "#B91C1C" : smsLength > 140 ? "#B45309" : "#64748B",
                }}
              >
                {smsLength}/160
              </small>
            </div>
          </label>
        </FormSection>

        {/* ── Section 6 — Banner Upload ── */}
        <FormSection
          id="event-section-banner"
          index={6}
          title="Banner Image"
          subtitle="Optional 16:9 photo shown in the resident app"
          state={bannerState}
          open={openSections.banner}
          onToggle={() => toggleSection("banner")}
        >
          <div style={S.field}>
            {/* Crop-before-upload banner picker (same component as Announcements).
                Shows the saved banner when editing; only a NEWLY picked image opens
                the cropper — a saved banner is never re-cropped. */}
            <ImageUploader
              value={activeEvent?.banner_url ?? activeEvent?.image_url ?? null}
              onChange={(file) => update("banner_image", file)}
              label="Upload Banner"
              maxSizeMB={5}
              aspect={16 / 9}
            />
            <small style={S.helpText}>
              {form.banner_image
                ? `New banner ready: ${form.banner_image.name}`
                : activeEvent?.banner_url
                  ? "Current banner is already saved. Pick a new image only if you want to replace it."
                  : "Optional. Use a clear RHU-related photo."}
            </small>
          </div>
        </FormSection>

        </div>
        {/* end right column */}
        </div>
        {/* end two-column grid */}
      </div>
      </div>
      {/* end scrollable body */}

      {/* ── Footer: action buttons, always visible (only the body scrolls) ── */}
      <div style={S.footerBar}>
        <div style={S.modalActions}>
          {dirty ? <span style={S.unsavedHint}>● Unsaved changes</span> : null}

          <button type="button" onClick={onCancel} style={S.cancelButton}>
            Cancel
          </button>

          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            style={{ ...S.secondaryButton, opacity: saving ? 0.6 : 1 }}
          >
            <FileText size={17} />
            {saving ? "Saving..." : "Save Draft"}
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={saving}
            title={readyToPublish ? undefined : "Complete the required items in the checklist first"}
            style={{ ...S.primaryButton, opacity: saving || !readyToPublish ? 0.6 : 1 }}
          >
            <Send size={17} />
            {saving
              ? "Publishing..."
              : mode === "create"
                ? "Create & Publish"
                : "Save & Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResidentPreview({ item }: { item: Event }) {
  const cfg = getTypeConfig(item.event_type);
  const start = eventStart(item);

  return (
    <div style={S.preview}>
      <div style={S.previewImage}>
        {item.banner_url || item.image_url ? (
          <img
            src={item.banner_url || item.image_url || ""}
            alt={item.title}
            style={S.previewImg}
          />
        ) : (
          <div
            style={{
              ...S.previewFallback,
              background: cfg.bg,
              color: cfg.color,
            }}
          >
            {getTypeIcon(item.event_type)}
            <span>{getReadableType(item.event_type)}</span>
          </div>
        )}
      </div>

      <div style={S.badgeRow}>
        <span
          style={{
            ...S.pill,
            background: cfg.bg,
            color: cfg.color,
          }}
        >
          {getTypeIcon(item.event_type)}
          {getReadableType(item.event_type)}
        </span>

        <span
          style={{
            ...S.pill,
            ...(item.is_published ? S.publishedPill : S.draftPill),
          }}
        >
          {item.is_published ? "Visible to residents" : "Draft only"}
        </span>
      </div>

      <h2 style={S.previewTitle}>{item.title}</h2>

      <div style={S.previewInfo}>
        <InfoLine icon={<CalendarDays size={17} />} text={formatDateTime(start)} />
        <InfoLine icon={<MapPin size={17} />} text={item.location || "Location not set"} />
        <InfoLine icon={<Users size={17} />} text={item.target_audience || "All residents"} />
        <InfoLine icon={<ShieldCheck size={17} />} text={getSlotsLabel(item)} />
      </div>

      <p style={S.previewDescription}>{item.description}</p>

      {item.sms_summary ? (
        <div style={S.smsBox}>
          <strong>SMS Summary</strong>
          <span>{item.sms_summary}</span>
        </div>
      ) : null}
    </div>
  );
}

function InfoBlock({
  icon,
  label,
  value,
  danger,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        ...S.infoBlock,
        ...(danger ? S.infoBlockDanger : {}),
      }}
    >
      <div style={S.infoIcon}>{icon}</div>
      <div>
        <span style={S.infoLabel}>{label}</span>
        <strong style={S.infoValue}>{value}</strong>
      </div>
    </div>
  );
}

function InfoLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div style={S.infoLine}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: string;
  tone: "teal" | "green" | "yellow" | "blue";
}) {
  const toneMap = {
    teal: { bg: "#CCFBF1", color: "#0F766E" },
    green: { bg: "#DCFCE7", color: "#047857" },
    yellow: { bg: "#FEF3C7", color: "#B45309" },
    blue: { bg: "#DBEAFE", color: "#2563EB" },
  };

  const selected = toneMap[tone];

  return (
    <div style={S.statCard}>
      <div
        style={{
          ...S.statIcon,
          background: selected.bg,
          color: selected.color,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={S.statLabel}>{label}</div>
        <div style={{ ...S.statValue, color: selected.color }}>{value}</div>
        <div style={S.statHint}>{hint}</div>
      </div>
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
  fitViewport = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  /**
   * Landscape form mode: the card becomes a fixed-height flex column
   * (header / children) and the CHILD manages its own internal scrolling —
   * used by the Event form so its checklist bar and footer never move.
   * Default (preview / confirm) keeps the original whole-card scroll.
   */
  fitViewport?: boolean;
}) {
  return (
    <div style={S.modalOverlay}>
      <div
        style={{
          ...S.modalCard,
          ...(fitViewport
            ? {
                height: "92vh",
                overflowY: "hidden",
                display: "flex",
                flexDirection: "column",
              }
            : null),
        }}
      >
        <div style={S.modalHeader}>
          <div>
            <h2 style={S.modalTitle}>{title}</h2>
            {subtitle ? <p style={S.modalSubtitle}>{subtitle}</p> : null}
          </div>

          <button type="button" onClick={onClose} style={S.closeButton}>
            <X size={22} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({
  state,
  onClose,
  onError,
}: {
  state: NonNullable<ConfirmState>;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);

  const needsMatch = Boolean(state.matchText);
  const matched = !needsMatch || typed.trim() === state.matchText;

  async function handleConfirm() {
    if (!matched) {
      onError("Please type the exact title before deleting.");
      return;
    }

    setLoading(true);

    try {
      await state.onConfirm();
    } catch (error) {
      onError(getErrorMessage(error, "Action failed."));
      setLoading(false);
    }
  }

  return (
    <div style={S.modalOverlay}>
      <div style={S.confirmCard}>
        <div style={S.confirmHeader}>
          <div
            style={{
              ...S.confirmIcon,
              ...(state.tone === "red"
                ? S.confirmRed
                : state.tone === "yellow"
                ? S.confirmYellow
                : state.tone === "blue"
                ? S.confirmBlue
                : S.confirmGreen),
            }}
          >
            {state.tone === "red" ? (
              <Trash2 size={24} />
            ) : state.tone === "yellow" ? (
              <AlertTriangle size={24} />
            ) : (
              <CheckCircle2 size={24} />
            )}
          </div>

          <div>
            <h3 style={S.confirmTitle}>{state.title}</h3>
            <p style={S.confirmMessage}>{state.message}</p>
          </div>
        </div>

        {needsMatch ? (
          <label style={S.field}>
            <span>Type this title to confirm:</span>
            <code style={S.matchText}>{state.matchText}</code>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Type exact title here"
              style={S.input}
            />
          </label>
        ) : null}

        <div style={S.modalActions}>
          <button type="button" onClick={onClose} style={S.cancelButton}>
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !matched}
            style={{
              ...S.primaryButton,
              ...(state.tone === "red"
                ? { background: "#DC2626" }
                : state.tone === "yellow"
                ? { background: "#D97706" }
                : state.tone === "blue"
                ? { background: "#2563EB" }
                : {}),
              opacity: loading || !matched ? 0.6 : 1,
            }}
          >
            {loading ? "Processing..." : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastNotice({
  notice,
  onClose,
}: {
  notice: NonNullable<NoticeState>;
  onClose: () => void;
}) {
  const tone =
    notice.type === "success"
      ? S.toastSuccess
      : notice.type === "warning"
      ? S.toastWarning
      : notice.type === "info"
      ? S.toastInfo
      : S.toastError;

  return (
    <div style={{ ...S.toast, ...tone }}>
      <div style={S.toastIcon}>
        {notice.type === "success" ? (
          <CheckCircle2 size={21} />
        ) : notice.type === "warning" ? (
          <AlertTriangle size={21} />
        ) : notice.type === "info" ? (
          <FileText size={21} />
        ) : (
          <AlertTriangle size={21} />
        )}
      </div>

      <div style={{ flex: 1 }}>
        <strong>
          {notice.type === "success"
            ? "Success"
            : notice.type === "warning"
            ? "Reminder"
            : notice.type === "info"
            ? "Notice"
            : "Action failed"}
        </strong>
        <p>{notice.message}</p>
      </div>

      <button type="button" onClick={onClose} style={S.toastClose}>
        <X size={16} />
      </button>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 24,
    paddingBottom: 40,
  },

  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 170px",
    gap: 22,
    alignItems: "stretch",
    padding: 28,
    borderRadius: 28,
    color: "#FFFFFF",
    background:
      "linear-gradient(135deg, #047857 0%, #0F766E 55%, #5EEAD4 100%)",
    boxShadow: "0 24px 60px rgba(15, 118, 110, 0.22)",
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.9,
  },

  heroTitle: {
    margin: "8px 0 10px",
    fontSize: 36,
    lineHeight: 1.05,
    fontWeight: 950,
  },

  heroText: {
    margin: 0,
    maxWidth: 850,
    fontSize: 16,
    lineHeight: 1.7,
    opacity: 0.95,
  },

  heroMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
    fontSize: 13,
    fontWeight: 850,
  },

  heroButton: {
    minHeight: 130,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: 20,
    background: "rgba(6, 95, 70, 0.92)",
    color: "#FFFFFF",
    fontWeight: 950,
    cursor: "pointer",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14,
  },

  statCard: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    minHeight: 108,
    padding: 18,
    borderRadius: 22,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  },

  statIcon: {
    width: 50,
    height: 50,
    display: "grid",
    placeItems: "center",
    borderRadius: 16,
    flex: "0 0 auto",
  },

  statLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 950,
    textTransform: "uppercase",
  },

  statValue: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: 950,
  },

  statHint: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 12,
  },

  warningPanel: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 18,
    borderRadius: 20,
    background: "#FFFBEB",
    color: "#92400E",
    border: "1px solid #FDE68A",
  },

  goodPanel: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 18,
    borderRadius: 20,
    background: "#ECFDF5",
    color: "#047857",
    border: "1px solid #A7F3D0",
  },

  warningList: {
    margin: "8px 0 0",
    paddingLeft: 18,
  },

  toolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) 160px 170px 180px 140px",
    gap: 10,
    alignItems: "center",
    padding: 16,
    borderRadius: 22,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
  },

  searchBox: {
    minHeight: 46,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px",
    borderRadius: 15,
    background: "#F8FAFC",
    border: "1px solid #E5E7EB",
    color: "#64748B",
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    border: 0,
    outline: "none",
    background: "transparent",
    color: "#0F172A",
    fontWeight: 750,
  },

  select: {
    minHeight: 46,
    border: "1px solid #E5E7EB",
    borderRadius: 15,
    background: "#F8FAFC",
    color: "#334155",
    padding: "0 12px",
    fontWeight: 850,
  },

  refreshButton: {
    minHeight: 46,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid #0F766E",
    borderRadius: 15,
    background: "#FFFFFF",
    color: "#0F766E",
    fontWeight: 950,
    cursor: "pointer",
  },

  board: {
    padding: 22,
    borderRadius: 26,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.07)",
  },

  boardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 18,
  },

  sectionTitle: {
    margin: "0 0 6px",
    fontSize: 22,
    fontWeight: 950,
    color: "#0F172A",
  },

  muted: {
    margin: 0,
    color: "#64748B",
    fontSize: 14,
    lineHeight: 1.6,
  },

  pageControls: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  smallButton: {
    minHeight: 36,
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "0 12px",
    background: "#FFFFFF",
    color: "#334155",
    fontWeight: 850,
    cursor: "pointer",
  },

  pageNumber: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: 850,
  },

  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: 18,
  },

  eventCard: {
    overflow: "hidden",
    borderRadius: 24,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.08)",
  },

  imageArea: {
    height: 170,
    overflow: "hidden",
    background: "#F8FAFC",
  },

  cardImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  imageFallback: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    fontWeight: 950,
  },

  cardBody: {
    display: "grid",
    gap: 13,
    padding: 18,
  },

  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  pill: {
    minHeight: 28,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },

  publishedPill: {
    background: "#DCFCE7",
    color: "#166534",
  },

  draftPill: {
    background: "#FEF3C7",
    color: "#92400E",
  },

  urgentPill: {
    background: "#FEE2E2",
    color: "#B91C1C",
  },

  cardTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 20,
    lineHeight: 1.25,
    fontWeight: 950,
  },

  cardDescription: {
    margin: 0,
    minHeight: 68,
    color: "#475569",
    fontSize: 14,
    lineHeight: 1.65,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  infoBlock: {
    display: "flex",
    gap: 9,
    alignItems: "flex-start",
    padding: 11,
    borderRadius: 16,
    background: "#F8FAFC",
    border: "1px solid #F1F5F9",
  },

  infoBlockDanger: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
  },

  infoIcon: {
    marginTop: 2,
    color: "inherit",
  },

  infoLabel: {
    display: "block",
    color: "#64748B",
    fontSize: 11,
    fontWeight: 950,
    textTransform: "uppercase",
    marginBottom: 3,
  },

  infoValue: {
    display: "block",
    color: "#0F172A",
    fontSize: 12,
    lineHeight: 1.35,
  },

  tagRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },

  tag: {
    padding: "4px 9px",
    borderRadius: 999,
    background: "#F1F5F9",
    color: "#475569",
    fontSize: 12,
    fontWeight: 850,
  },

  registrantsButton: {
    minHeight: 42,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid #0F766E",
    borderRadius: 14,
    background: "#FFFFFF",
    color: "#0F766E",
    fontWeight: 950,
    cursor: "pointer",
  },

  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  lightButton: {
    minHeight: 38,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "0 11px",
    background: "#FFFFFF",
    color: "#334155",
    fontWeight: 900,
    cursor: "pointer",
  },

  successButton: {
    minHeight: 38,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid #A7F3D0",
    borderRadius: 12,
    padding: "0 11px",
    background: "#ECFDF5",
    color: "#047857",
    fontWeight: 950,
    cursor: "pointer",
  },

  warningButton: {
    minHeight: 38,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid #FDE68A",
    borderRadius: 12,
    padding: "0 11px",
    background: "#FFFBEB",
    color: "#B45309",
    fontWeight: 950,
    cursor: "pointer",
  },

  dangerButton: {
    minHeight: 38,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid #FECACA",
    borderRadius: 12,
    padding: "0 11px",
    background: "#FEF2F2",
    color: "#DC2626",
    fontWeight: 950,
    cursor: "pointer",
  },

  emptyState: {
    minHeight: 280,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 10,
    textAlign: "center",
    borderRadius: 22,
    background: "#F8FAFC",
    color: "#64748B",
    padding: 32,
  },

  primaryButton: {
    minHeight: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: 0,
    borderRadius: 14,
    padding: "0 16px",
    background: "#0F766E",
    color: "#FFFFFF",
    fontWeight: 950,
    cursor: "pointer",
  },

  secondaryButton: {
    minHeight: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid #CBD5E1",
    borderRadius: 14,
    padding: "0 16px",
    background: "#FFFFFF",
    color: "#334155",
    fontWeight: 950,
    cursor: "pointer",
  },

  cancelButton: {
    minHeight: 44,
    border: 0,
    borderRadius: 14,
    padding: "0 16px",
    background: "#F1F5F9",
    color: "#334155",
    fontWeight: 950,
    cursor: "pointer",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2147483000,
    display: "grid",
    placeItems: "center",
    padding: 22,
    background: "rgba(15, 23, 42, 0.55)",
    backdropFilter: "blur(5px)",
  },

  modalCard: {
    // Landscape form: 1240px fits two side-by-side section columns at
    // 1366×768 and up without horizontal scrolling; smaller windows shrink
    // the card and the column grid collapses to one column automatically.
    width: "min(1240px, 100%)",
    maxHeight: "92vh",
    overflowY: "auto",
    borderRadius: 26,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 30px 70px rgba(15, 23, 42, 0.35)",
  },

  modalHeader: {
    flexShrink: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    padding: "20px 24px 16px",
    borderBottom: "1px solid #E5E7EB",
    // Header stays visible while the long form scrolls beneath it.
    position: "sticky",
    top: 0,
    background: "#FFFFFF",
    zIndex: 5,
  },

  modalTitle: {
    margin: 0,
    fontSize: 24,
    color: "#0F172A",
    fontWeight: 950,
  },

  modalSubtitle: {
    margin: "6px 0 0",
    color: "#64748B",
    fontSize: 14,
    lineHeight: 1.5,
  },

  closeButton: {
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    border: 0,
    borderRadius: 14,
    background: "#F8FAFC",
    color: "#334155",
    cursor: "pointer",
  },

  form: {
    display: "grid",
    gap: 17,
    padding: 24,
  },

  formGuide: {
    display: "flex",
    gap: 13,
    padding: 15,
    borderRadius: 18,
    background: "#F8FAFC",
    border: "1px solid #E5E7EB",
    color: "#334155",
  },

  formGuideIcon: {
    width: 46,
    height: 46,
    display: "grid",
    placeItems: "center",
    borderRadius: 16,
    flex: "0 0 auto",
  },

  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },

  field: {
    display: "grid",
    gap: 7,
    fontSize: 13,
    color: "#334155",
    fontWeight: 950,
  },

  input: {
    width: "100%",
    minHeight: 48,
    border: "1px solid #CBD5E1",
    borderRadius: 15,
    padding: "0 12px",
    outline: "none",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 15,
    fontWeight: 750,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },

  fileInput: {
    width: "100%",
    border: "1px dashed #CBD5E1",
    borderRadius: 15,
    padding: 14,
    background: "#F8FAFC",
    color: "#334155",
    fontWeight: 850,
  },

  helpText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: 750,
  },

  publishChecklist: {
    display: "grid",
    gap: 6,
    padding: 15,
    borderRadius: 18,
    background: "#ECFDF5",
    color: "#047857",
    fontSize: 13,
    fontWeight: 850,
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  // ── Event Creation redesign: collapsible sections ─────────────────────
  section: {
    border: "1px solid #E5E7EB",
    borderRadius: 18,
    background: "#FFFFFF",
    overflow: "visible",
  },

  sectionHeaderBtn: {
    width: "100%",
    minHeight: 58,
    display: "flex",
    alignItems: "center",
    gap: 13,
    padding: "10px 16px",
    border: 0,
    borderRadius: 18,
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },

  sectionBadge: {
    width: 32,
    height: 32,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: 999,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#334155",
    fontSize: 14,
    fontWeight: 900,
  },

  sectionHeadTitle: {
    display: "block",
    fontSize: 15.5,
    fontWeight: 950,
    color: "#0F172A",
    lineHeight: 1.25,
  },

  sectionHeadSubtitle: {
    display: "block",
    fontSize: 12.5,
    fontWeight: 700,
    color: "#64748B",
    marginTop: 2,
  },

  sectionBody: {
    display: "grid",
    gap: 15,
    padding: "4px 16px 18px",
    borderTop: "1px solid #F1F5F9",
    paddingTop: 15,
  },

  // ── Landscape form layout: header / checklist bar / scroll body / footer.
  // The panel is a flex column filling the fixed-height modal card — ONLY
  // the form body scrolls, so the checklist and actions never move. ───────
  panelShell: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },

  checklistBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    padding: "10px 24px",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    flexShrink: 0,
  },

  formScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },

  formColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: 16,
    alignItems: "start",
  },

  formColumn: {
    display: "grid",
    gap: 15,
    minWidth: 0,
  },

  footerBar: {
    flexShrink: 0,
    padding: "12px 24px 16px",
    background: "#FFFFFF",
    borderTop: "1px solid #E5E7EB",
    boxShadow: "0 -10px 24px rgba(15, 23, 42, 0.05)",
  },

  checkChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11.5,
    fontWeight: 900,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  },

  checkChipDone: {
    background: "#ECFDF5",
    color: "#047857",
    borderColor: "#A7F3D0",
  },

  checkChipTodo: {
    background: "#FEF2F2",
    color: "#B91C1C",
    borderColor: "#FECACA",
  },

  checkChipOptional: {
    background: "#FFFBEB",
    color: "#B45309",
    borderColor: "#FDE68A",
  },

  // Checklist chips in the top bar are BUTTONS that jump to their section.
  checkChipButton: {
    cursor: "pointer",
    fontFamily: "inherit",
    minHeight: 30,
  },

  unsavedHint: {
    marginRight: "auto",
    fontSize: 12,
    fontWeight: 800,
    color: "#B45309",
  },

  // ── Segmented choice cards (Priority / Visibility) ────────────────────
  choiceRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
  },

  choiceCard: {
    minHeight: 62,
    display: "grid",
    gap: 4,
    alignContent: "center",
    justifyItems: "start",
    padding: "10px 14px",
    borderRadius: 15,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },

  choiceDot: {
    width: 18,
    height: 18,
    flexShrink: 0,
    borderRadius: 999,
    border: "2px solid #CBD5E1",
    background: "#FFFFFF",
    display: "grid",
    placeItems: "center",
  },

  choiceHint: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    lineHeight: 1.35,
  },

  // ── Tags-as-chips input ────────────────────────────────────────────────
  tagsBox: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    border: "1px solid #CBD5E1",
    borderRadius: 15,
    padding: "6px 10px",
    background: "#FFFFFF",
    boxSizing: "border-box",
  },

  tagChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    border: "1px solid #A7F3D0",
    background: "#ECFDF5",
    color: "#047857",
    padding: "4px 7px 4px 10px",
    fontSize: 12.5,
    fontWeight: 800,
  },

  tagRemove: {
    border: "none",
    background: "transparent",
    color: "#047857",
    width: 16,
    height: 16,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
  },

  tagsInput: {
    flex: 1,
    minWidth: 160,
    border: "none",
    outline: "none",
    fontSize: 14,
    fontWeight: 750,
    fontFamily: "inherit",
    color: "#0F172A",
    minHeight: 32,
    background: "transparent",
  },

  preview: {
    display: "grid",
    gap: 16,
    padding: 24,
  },

  previewImage: {
    height: 230,
    borderRadius: 20,
    overflow: "hidden",
    background: "#F8FAFC",
  },

  previewImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  previewFallback: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    fontWeight: 950,
  },

  previewTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 28,
    lineHeight: 1.15,
    fontWeight: 950,
  },

  previewInfo: {
    display: "grid",
    gap: 9,
    padding: 16,
    borderRadius: 18,
    background: "#F8FAFC",
    color: "#334155",
  },

  infoLine: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    fontWeight: 850,
  },

  previewDescription: {
    margin: 0,
    color: "#334155",
    fontSize: 15,
    lineHeight: 1.8,
    whiteSpace: "pre-wrap",
  },

  smsBox: {
    display: "grid",
    gap: 5,
    padding: 14,
    borderRadius: 16,
    background: "#EFF6FF",
    color: "#1D4ED8",
  },

  confirmCard: {
    width: "min(560px, 100%)",
    borderRadius: 24,
    background: "#FFFFFF",
    padding: 24,
    boxShadow: "0 30px 70px rgba(15, 23, 42, 0.35)",
  },

  confirmHeader: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 18,
  },

  confirmIcon: {
    width: 54,
    height: 54,
    display: "grid",
    placeItems: "center",
    borderRadius: 18,
    flex: "0 0 auto",
  },

  confirmRed: {
    background: "#FEF2F2",
    color: "#DC2626",
  },

  confirmYellow: {
    background: "#FFFBEB",
    color: "#B45309",
  },

  confirmBlue: {
    background: "#EFF6FF",
    color: "#2563EB",
  },

  confirmGreen: {
    background: "#ECFDF5",
    color: "#047857",
  },

  confirmTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 20,
    fontWeight: 950,
  },

  confirmMessage: {
    margin: "6px 0 0",
    color: "#475569",
    fontSize: 14,
    lineHeight: 1.6,
  },

  matchText: {
    display: "block",
    padding: "9px 11px",
    borderRadius: 12,
    background: "#F8FAFC",
    color: "#0F172A",
    whiteSpace: "normal",
  },

  toast: {
    position: "fixed",
    right: 22,
    bottom: 22,
    zIndex: 2147483647,
    width: "min(430px, calc(100vw - 32px))",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 18,
    border: "1px solid",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
  },

  toastSuccess: {
    background: "#ECFDF5",
    color: "#047857",
    borderColor: "#A7F3D0",
  },

  toastWarning: {
    background: "#FFFBEB",
    color: "#B45309",
    borderColor: "#FDE68A",
  },

  toastInfo: {
    background: "#EFF6FF",
    color: "#2563EB",
    borderColor: "#BFDBFE",
  },

  toastError: {
    background: "#FEF2F2",
    color: "#B91C1C",
    borderColor: "#FECACA",
  },

  toastIcon: {
    paddingTop: 2,
  },

  toastClose: {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    border: 0,
    borderRadius: 10,
    background: "rgba(255,255,255,.55)",
    color: "inherit",
    cursor: "pointer",
  },

  card: {
    padding: 22,
    borderRadius: 22,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  },

  pageTitle: {
    margin: 0,
    fontSize: 28,
    color: "#0F172A",
    fontWeight: 950,
  },

  warningBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "#FEF2F2",
    color: "#B91C1C",
    border: "1px solid #FECACA",
  },
};
