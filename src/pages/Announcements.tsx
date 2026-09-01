// src/pages/Announcements.tsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Info,
  MapPin,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  Users,
  X,
} from "lucide-react";

import { ImageUploader } from "../components/ImageUploader";
import ModuleTabs from "../components/ui/ModuleTabs";
import { announcementsService } from "../services/announcements";
import { eventsService } from "../services/events";

import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementStatus,
  CreateAnnouncementPayload,
  CreateEventPayload,
  Event,
  EventType,
  UpdateAnnouncementPayload,
  UpdateEventPayload,
} from "../types/cms";

type CmsTab = "announcements" | "events";
type NoticeType = "success" | "error" | "warning" | "info";

type Notice = {
  message: string;
  type: NoticeType;
};

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "green" | "red" | "yellow" | "blue";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  defaultReason?: string;
  onConfirm: (reason?: string) => Promise<void>;
};

type AnnouncementForm = {
  title: string;
  body: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  banner_image?: File;
};

type EventForm = {
  title: string;
  description: string;
  location: string;
  event_date: string;
  ends_at: string;
  event_type: EventType;
  max_slots: string;
  barangay_target: string;
  is_published: boolean;
  banner_image?: File;
};

const ANNOUNCEMENT_DEFAULTS: AnnouncementForm = {
  title: "",
  body: "",
  category: "general",
  status: "draft",
};

const EVENT_DEFAULTS: EventForm = {
  title: "",
  description: "",
  location: "",
  event_date: "",
  ends_at: "",
  event_type: "event",
  max_slots: "",
  barangay_target: "all",
  is_published: false,
};

const CATEGORY_CONFIG: Record<
  AnnouncementCategory,
  {
    label: string;
    helper: string;
    color: string;
    bg: string;
    icon: ReactNode;
  }
> = {
  health_alert: {
    label: "Health Alert",
    helper: "For urgent health advisories, outbreaks, warnings, and safety reminders.",
    color: "#DC2626",
    bg: "#FEF2F2",
    icon: <AlertTriangle size={16} />,
  },
  program: {
    label: "Program",
    helper: "For vaccination, feeding, family planning, and RHU health programs.",
    color: "#0F766E",
    bg: "#ECFDF5",
    icon: <ShieldCheck size={16} />,
  },
  general: {
    label: "General",
    helper: "For regular RHU announcements and public information.",
    color: "#475569",
    bg: "#F1F5F9",
    icon: <Megaphone size={16} />,
  },
};

const EVENT_TYPE_CONFIG: Record<
  EventType,
  {
    label: string;
    color: string;
    bg: string;
    icon: ReactNode;
  }
> = {
  event: {
    label: "Event",
    color: "#2563EB",
    bg: "#EFF6FF",
    icon: <Calendar size={16} />,
  },
  program: {
    label: "Program",
    color: "#0F766E",
    bg: "#ECFDF5",
    icon: <ShieldCheck size={16} />,
  },
  announcement: {
    label: "Announcement",
    color: "#7C3AED",
    bg: "#F5F3FF",
    icon: <Megaphone size={16} />,
  },
};

function getAnnouncementBody(item: Announcement): string {
  return String(item.body ?? item.description ?? "");
}

function getAnnouncementStatus(item: Announcement): AnnouncementStatus {
  const raw = String(item.status ?? "draft");

  if (raw === "published") return "published";
  if (raw === "archived") return "archived";

  return "draft";
}

function getAnnouncementCategory(item: Announcement): AnnouncementCategory {
  const raw = String(item.category ?? "general");

  if (raw === "health_alert") return "health_alert";
  if (raw === "program") return "program";

  return "general";
}

function formatDate(value?: string | null): string {
  if (!value) return "Not set";

  try {
    return new Date(value).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Not set";

  try {
    return new Date(value).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";

  try {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);

    return localDate.toISOString().slice(0, 16);
  } catch {
    return String(value).slice(0, 16);
  }
}

function isEventUpcoming(item: Event): boolean {
  if (!item.event_date) return false;

  try {
    return new Date(item.event_date).getTime() >= Date.now();
  } catch {
    return false;
  }
}

function getStatusLabel(status: AnnouncementStatus | string): string {
  if (status === "published") return "Published";
  if (status === "archived") return "Archived";

  return "Draft";
}

function getStatusDescription(status: AnnouncementStatus | string): string {
  if (status === "published") {
    return "Visible to residents.";
  }

  if (status === "archived") {
    return "Hidden from residents but kept for records.";
  }

  return "Not yet visible to residents.";
}

function getAnnouncementNextStep(item: Announcement): string {
  const status = getAnnouncementStatus(item);

  if (status === "draft") {
    return "Review content, then publish when ready.";
  }

  if (status === "published") {
    return "Residents can already see this announcement.";
  }

  return "Archived. Restore only if it needs to be shown again.";
}

function validateAnnouncement(form: AnnouncementForm): string | null {
  if (!form.title.trim()) {
    return "Please enter an announcement title.";
  }

  if (form.title.trim().length < 5) {
    return "The title is too short. Use a clear title residents can understand.";
  }

  if (!form.body.trim()) {
    return "Please enter the announcement message.";
  }

  if (form.body.trim().length < 10) {
    return "The message is too short. Add enough details for residents.";
  }

  return null;
}

function validateEvent(form: EventForm): string | null {
  if (!form.title.trim()) {
    return "Please enter an event or program title.";
  }

  if (!form.description.trim()) {
    return "Please enter a description.";
  }

  if (!form.location.trim()) {
    return "Please enter the location.";
  }

  if (!form.event_date) {
    return "Please select the start date and time.";
  }

  if (form.ends_at && new Date(form.ends_at).getTime() < new Date(form.event_date).getTime()) {
    return "End date cannot be earlier than start date.";
  }

  if (form.max_slots && Number(form.max_slots) < 1) {
    return "Maximum slots must be at least 1.";
  }

  return null;
}

export default function Announcements() {
  const [activeTab, setActiveTab] = useState<CmsTab>("announcements");

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Ka-Agapay Content Management</div>
          <h1 style={heroTitleStyle}>Content Management</h1>
          <p style={heroSubtitleStyle}>
            Create simple, readable, and timely public information for Ka-Agapay residents.
            This page is designed for RHU personnel who need clear buttons, clear status,
            and fewer confusing steps.
          </p>
        </div>

        <div style={guideCardStyle}>
          <div style={guideTitleStyle}>
            <Info size={18} />
            Real-life workflow
          </div>
          <div style={guideStepsStyle}>
            <span>1. Write clear title</span>
            <span>2. Preview resident view</span>
            <span>3. Publish only when final</span>
            <span>4. Archive old advisories</span>
          </div>
        </div>
      </section>

      {/*
        Segmented-pill standard via the shared ModuleTabs component. This page
        was the last one still on the retired underline tab look.
      */}
      <section style={tabShellStyle}>
        <ModuleTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as CmsTab)}
          tabs={[
            { key: "announcements", label: "Announcements", icon: <Megaphone size={18} /> },
            { key: "events", label: "Events & Programs", icon: <Calendar size={18} /> },
          ]}
        />
      </section>

      {activeTab === "announcements" ? <AnnouncementsTab /> : <EventsTab />}
    </div>
  );
}

function AnnouncementsTab() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft" | "archived">("all");

  const [modal, setModal] = useState<"create" | "edit" | "preview" | null>(null);
  const [active, setActive] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(ANNOUNCEMENT_DEFAULTS);
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function showNotice(type: NoticeType, message: string) {
    setNotice({ type, message });

    window.setTimeout(() => {
      setNotice(null);
    }, 4500);
  }

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await announcementsService.getAnnouncements({
        search: search.trim() || undefined,
        status: "all",
      });

      setItems(response.data);
    } catch (err: any) {
      setItems([]);
      showNotice(
        "error",
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load announcements. Check your backend API connection."
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === "all") return true;

      return getAnnouncementStatus(item) === filter;
    });
  }, [items, filter]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      published: items.filter((item) => getAnnouncementStatus(item) === "published").length,
      draft: items.filter((item) => getAnnouncementStatus(item) === "draft").length,
      archived: items.filter((item) => getAnnouncementStatus(item) === "archived").length,
      healthAlerts: items.filter((item) => getAnnouncementCategory(item) === "health_alert").length,
    };
  }, [items]);

  const nextAction = useMemo(() => {
    const draft = items.find((item) => getAnnouncementStatus(item) === "draft");
    const healthAlert = items.find(
      (item) =>
        getAnnouncementCategory(item) === "health_alert" &&
        getAnnouncementStatus(item) === "published"
    );

    if (draft) {
      return {
        title: draft.title,
        body: "Draft waiting for review. Preview it before publishing.",
      };
    }

    if (healthAlert) {
      return {
        title: healthAlert.title,
        body: "Active health alert is visible to residents.",
      };
    }

    return {
      title: "No pending announcement action",
      body: "Create a new announcement when the RHU has public information to share.",
    };
  }, [items]);

  function openCreate() {
    setActive(null);
    setForm(ANNOUNCEMENT_DEFAULTS);
    setModal("create");
  }

  function openEdit(item: Announcement) {
    setActive(item);
    setForm({
      title: item.title ?? "",
      body: getAnnouncementBody(item),
      category: getAnnouncementCategory(item),
      status: getAnnouncementStatus(item),
    });
    setModal("edit");
  }

  function openPreview(item: Announcement) {
    setActive(item);
    setModal("preview");
  }

  async function saveAnnouncement(nextStatus?: AnnouncementStatus) {
    const validation = validateAnnouncement(form);

    if (validation) {
      showNotice("warning", validation);
      return;
    }

    setSaving(true);

    try {
      const cleanStatus = nextStatus ?? form.status;

      const safeCreateStatus: "draft" | "published" =
        cleanStatus === "published" ? "published" : "draft";

      if (modal === "create") {
        const payload: CreateAnnouncementPayload = {
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category,
          status: safeCreateStatus,
          banner_image: form.banner_image,
        };

        const created = await announcementsService.createAnnouncement(payload);

        setItems((previous) => [created, ...previous]);
        showNotice(
          "success",
          safeCreateStatus === "published"
            ? "Announcement created and published."
            : "Announcement saved as draft."
        );
      }

      if (modal === "edit" && active) {
        const payload: UpdateAnnouncementPayload = {
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category,
          status: cleanStatus,
          banner_image: form.banner_image,
        };

        const updated = await announcementsService.updateAnnouncement(active.id, payload);

        setItems((previous) =>
          previous.map((item) => (item.id === active.id ? updated : item))
        );

        showNotice(
          "success",
          cleanStatus === "published"
            ? "Announcement updated and published."
            : "Announcement updated."
        );
      }

      setModal(null);
      setActive(null);
      setForm(ANNOUNCEMENT_DEFAULTS);
    } catch (err: any) {
      showNotice(
        "error",
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save announcement."
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmPublish(item: Announcement) {
    const status = getAnnouncementStatus(item);
    const shouldPublish = status !== "published";

    setConfirm({
      title: shouldPublish ? "Publish Announcement" : "Move Back to Draft",
      message: shouldPublish
        ? `Publish "${item.title}"? Residents will be able to see it in Ka-Agapay.`
        : `Move "${item.title}" back to draft? Residents will no longer see it.`,
      confirmLabel: shouldPublish ? "Publish Now" : "Move to Draft",
      tone: shouldPublish ? "green" : "yellow",
      onConfirm: async () => {
        const updated = await announcementsService.publishAnnouncement(
          item.id,
          shouldPublish
        );

        setItems((previous) =>
          previous.map((oldItem) => (oldItem.id === item.id ? updated : oldItem))
        );

        showNotice(
          "success",
          shouldPublish
            ? "Announcement published."
            : "Announcement moved back to draft."
        );

        setConfirm(null);
      },
    });
  }

  function confirmArchive(item: Announcement) {
    setConfirm({
      title: "Archive Announcement",
      message: `Archive "${item.title}"? It will be hidden from residents but kept in the system for records.`,
      confirmLabel: "Archive",
      tone: "yellow",
      onConfirm: async () => {
        const archived = await announcementsService.archiveAnnouncement(item.id);

        setItems((previous) =>
          previous.map((oldItem) => (oldItem.id === item.id ? archived : oldItem))
        );

        showNotice("success", "Announcement archived.");
        setConfirm(null);
      },
    });
  }

  function confirmDelete(item: Announcement) {
    setConfirm({
      title: "Delete Announcement",
      message:
        "This should only be used for wrong or duplicate announcements. For old announcements, use Archive instead.",
      confirmLabel: "Delete",
      tone: "red",
      requireReason: true,
      reasonLabel: "Reason for deletion",
      reasonPlaceholder: "Example: Duplicate announcement created by mistake.",
      defaultReason: "Deleted from RHU admin CMS.",
      onConfirm: async (reason) => {
        await announcementsService.deleteAnnouncement(
          item.id,
          reason || "Deleted from RHU admin CMS."
        );

        setItems((previous) => previous.filter((oldItem) => oldItem.id !== item.id));

        showNotice("success", "Announcement deleted.");
        setConfirm(null);
      },
    });
  }

  return (
    <section style={sectionStyle}>
      {notice ? (
        <ToastNotice
          message={notice.message}
          type={notice.type}
          onClose={() => setNotice(null)}
        />
      ) : null}

      <div style={summaryGridStyle}>
        <SummaryCard
          icon={<FileText size={22} />}
          label="Total"
          value={stats.total}
          hint="All announcements"
          tone="teal"
        />
        <SummaryCard
          icon={<Globe size={22} />}
          label="Published"
          value={stats.published}
          hint="Visible to residents"
          tone="green"
        />
        <SummaryCard
          icon={<Clock size={22} />}
          label="Drafts"
          value={stats.draft}
          hint="Needs review"
          tone="yellow"
        />
        <SummaryCard
          icon={<Archive size={22} />}
          label="Archived"
          value={stats.archived}
          hint="Hidden but saved"
          tone="gray"
        />
      </div>

      <div style={actionGuideStyle}>
        <div>
          <div style={guideSmallLabelStyle}>Recommended next action</div>
          <strong>{nextAction.title}</strong>
          <p>{nextAction.body}</p>
        </div>

        <button type="button" onClick={openCreate} style={primaryButtonStyle}>
          <Plus size={18} />
          New Announcement
        </button>
      </div>

      <div style={toolbarStyle}>
        <div style={filterTabsStyle}>
          {(["all", "published", "draft", "archived"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              style={{
                ...smallTabStyle,
                ...(filter === value ? activeSmallTabStyle : {}),
              }}
            >
              {value === "all" ? "All" : getStatusLabel(value)}
            </button>
          ))}
        </div>

        <div style={toolbarRightStyle}>
          <div style={searchBoxStyle}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search announcement..."
              style={searchInputStyle}
            />
          </div>

          <button type="button" onClick={load} style={secondaryButtonStyle}>
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>
      </div>

      {stats.healthAlerts > 0 ? (
        <div style={healthAlertInfoStyle}>
          <AlertTriangle size={18} />
          <span>
            There {stats.healthAlerts === 1 ? "is" : "are"} {stats.healthAlerts} health
            alert{stats.healthAlerts === 1 ? "" : "s"} in your CMS. Keep health alerts
            short, clear, and updated.
          </span>
        </div>
      ) : null}

      {loading ? (
        <LoadingList />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={42} />}
          title="No announcements found"
          body="Create your first announcement or adjust the selected filter."
          action={
            <button type="button" onClick={openCreate} style={primaryButtonStyle}>
              <Plus size={18} />
              Create Announcement
            </button>
          }
        />
      ) : (
        <div style={announcementListStyle}>
          {visibleItems.map((item) => {
            const status = getAnnouncementStatus(item);
            const category = getAnnouncementCategory(item);
            const categoryConfig = CATEGORY_CONFIG[category];

            return (
              <article
                key={item.id}
                style={{
                  ...announcementCardStyle,
                  ...(status === "archived" ? archivedCardStyle : {}),
                }}
              >
                <div style={announcementImageStyle}>
                  {item.banner_url ? (
                    <img
                      src={item.banner_url}
                      alt=""
                      style={announcementImgStyle}
                    />
                  ) : (
                    <div
                      style={{
                        ...imageFallbackStyle,
                        background: categoryConfig.bg,
                        color: categoryConfig.color,
                      }}
                    >
                      <ImageIcon size={28} />
                    </div>
                  )}
                </div>

                <div style={announcementContentStyle}>
                  <div style={badgeRowStyle}>
                    <Pill
                      icon={categoryConfig.icon}
                      label={categoryConfig.label}
                      color={categoryConfig.color}
                      bg={categoryConfig.bg}
                    />
                    <StatusPill status={status} />
                  </div>

                  <h3 style={cardTitleStyle}>{item.title}</h3>

                  <p style={cardBodyStyle}>{getAnnouncementBody(item)}</p>

                  <div style={cardMetaStyle}>
                    <span>Created: {formatDateTime(item.created_at)}</span>
                    <span>{getStatusDescription(status)}</span>
                    <span>{getAnnouncementNextStep(item)}</span>
                  </div>
                </div>

                <div style={cardActionsStyle}>
                  <button
                    type="button"
                    onClick={() => openPreview(item)}
                    style={lightActionButtonStyle}
                  >
                    <Eye size={15} />
                    Preview
                  </button>

                  <button
                    type="button"
                    onClick={() => confirmPublish(item)}
                    style={
                      status === "published"
                        ? warningActionButtonStyle
                        : successActionButtonStyle
                    }
                  >
                    {status === "published" ? (
                      <>
                        <Undo2 size={15} />
                        Draft
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        {status === "archived" ? "Restore" : "Publish"}
                      </>
                    )}
                  </button>

                  {status !== "archived" ? (
                    <button
                      type="button"
                      onClick={() => confirmArchive(item)}
                      style={archiveActionButtonStyle}
                    >
                      <Archive size={15} />
                      Archive
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    style={lightActionButtonStyle}
                  >
                    <Edit2 size={15} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => confirmDelete(item)}
                    style={dangerActionButtonStyle}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {(modal === "create" || modal === "edit") ? (
        <ModalShell
          title={modal === "create" ? "Create Announcement" : "Edit Announcement"}
          subtitle="Use simple words, complete details, and preview before publishing."
          onClose={() => {
            setModal(null);
            setActive(null);
          }}
        >
          <AnnouncementFormPanel
            form={form}
            setForm={setForm}
            active={active}
            saving={saving}
            mode={modal}
            onCancel={() => {
              setModal(null);
              setActive(null);
            }}
            onSaveDraft={() => saveAnnouncement("draft")}
            onPublish={() => saveAnnouncement("published")}
          />
        </ModalShell>
      ) : null}

      {modal === "preview" && active ? (
        <ModalShell
          title="Resident Preview"
          subtitle="This is how the announcement may be understood by residents."
          onClose={() => {
            setModal(null);
            setActive(null);
          }}
        >
          <AnnouncementPreview item={active} />
        </ModalShell>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          onClose={() => setConfirm(null)}
          onError={(message) => showNotice("error", message)}
        />
      ) : null}
    </section>
  );
}

function EventsTab() {
  const [items, setItems] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [active, setActive] = useState<Event | null>(null);
  const [form, setForm] = useState<EventForm>(EVENT_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function showNotice(type: NoticeType, message: string) {
    setNotice({ type, message });

    window.setTimeout(() => {
      setNotice(null);
    }, 4500);
  }

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await eventsService.fetchEvents({
        search: search.trim() || undefined,
      });

      setItems(response.data);
    } catch (err: any) {
      setItems([]);
      showNotice(
        "error",
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load events and programs."
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      published: items.filter((item) => item.is_published).length,
      upcoming: items.filter(isEventUpcoming).length,
      slots: items.reduce((total, item) => total + Number(item.max_slots ?? 0), 0),
    };
  }, [items]);

  function openCreate() {
    setActive(null);
    setForm(EVENT_DEFAULTS);
    setModal("create");
  }

  function openEdit(item: Event) {
    setActive(item);
    setForm({
      title: item.title ?? "",
      description: item.description ?? "",
      location: item.location ?? "",
      event_date: toDateTimeLocal(item.event_date),
      ends_at: toDateTimeLocal(item.ends_at),
      event_type: item.event_type ?? "event",
      max_slots: item.max_slots ? String(item.max_slots) : "",
      barangay_target: item.barangay_target ?? "all",
      is_published: Boolean(item.is_published),
    });
    setModal("edit");
  }

  async function saveEvent(nextPublished?: boolean) {
    const validation = validateEvent(form);

    if (validation) {
      showNotice("warning", validation);
      return;
    }

    setSaving(true);

    try {
      const payload: CreateEventPayload = {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        event_date: form.event_date,
        ends_at: form.ends_at || undefined,
        event_type: form.event_type,
        max_slots: form.max_slots ? Number(form.max_slots) : undefined,
        barangay_target: form.barangay_target.trim() || "all",
        is_published: nextPublished ?? form.is_published,
        banner_image: form.banner_image,
      };

      if (modal === "create") {
        const created = await eventsService.createEvent(payload);
        setItems((previous) => [created, ...previous]);

        showNotice(
          "success",
          payload.is_published
            ? "Event created and published."
            : "Event saved as draft."
        );
      }

      if (modal === "edit" && active) {
        const updated = await eventsService.updateEvent(
          active.id,
          payload as UpdateEventPayload
        );

        setItems((previous) =>
          previous.map((item) => (item.id === active.id ? updated : item))
        );

        showNotice("success", "Event updated.");
      }

      setModal(null);
      setActive(null);
      setForm(EVENT_DEFAULTS);
    } catch (err: any) {
      showNotice(
        "error",
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save event or program."
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmPublishEvent(item: Event) {
    const shouldPublish = !item.is_published;

    setConfirm({
      title: shouldPublish ? "Publish Event" : "Unpublish Event",
      message: shouldPublish
        ? `Publish "${item.title}"? Residents will be able to see and register if registration is enabled.`
        : `Unpublish "${item.title}"? Residents will no longer see this event.`,
      confirmLabel: shouldPublish ? "Publish" : "Unpublish",
      tone: shouldPublish ? "green" : "yellow",
      onConfirm: async () => {
        const updated = await eventsService.publishEvent(item.id, shouldPublish);

        setItems((previous) =>
          previous.map((oldItem) => (oldItem.id === item.id ? updated : oldItem))
        );

        showNotice(
          "success",
          shouldPublish ? "Event published." : "Event unpublished."
        );

        setConfirm(null);
      },
    });
  }

  function confirmDeleteEvent(item: Event) {
    setConfirm({
      title: "Delete Event or Program",
      message:
        "Delete this only if it was created by mistake. If the event already happened, keeping it is better for RHU records.",
      confirmLabel: "Delete",
      tone: "red",
      requireReason: true,
      reasonLabel: "Reason for deletion",
      reasonPlaceholder: "Example: Duplicate event entry.",
      defaultReason: "Deleted from RHU admin CMS.",
      onConfirm: async () => {
        await eventsService.deleteEvent(item.id);

        setItems((previous) => previous.filter((oldItem) => oldItem.id !== item.id));

        showNotice("success", "Event deleted.");
        setConfirm(null);
      },
    });
  }

  return (
    <section style={sectionStyle}>
      {notice ? (
        <ToastNotice
          message={notice.message}
          type={notice.type}
          onClose={() => setNotice(null)}
        />
      ) : null}

      <div style={summaryGridStyle}>
        <SummaryCard
          icon={<Calendar size={22} />}
          label="Total"
          value={stats.total}
          hint="All events/programs"
          tone="teal"
        />
        <SummaryCard
          icon={<Globe size={22} />}
          label="Published"
          value={stats.published}
          hint="Visible to residents"
          tone="green"
        />
        <SummaryCard
          icon={<Clock size={22} />}
          label="Upcoming"
          value={stats.upcoming}
          hint="Still scheduled"
          tone="blue"
        />
        <SummaryCard
          icon={<Users size={22} />}
          label="Slots"
          value={stats.slots}
          hint="Total capacity"
          tone="purple"
        />
      </div>

      <div style={toolbarStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Events & Programs</h2>
          <p style={sectionSubtitleStyle}>
            Use this for scheduled RHU activities such as vaccination, feeding programs,
            seminars, and community health events.
          </p>
        </div>

        <div style={toolbarRightStyle}>
          <div style={searchBoxStyle}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events..."
              style={searchInputStyle}
            />
          </div>

          <button type="button" onClick={load} style={secondaryButtonStyle}>
            <RefreshCw size={17} />
            Refresh
          </button>

          <button type="button" onClick={openCreate} style={primaryButtonStyle}>
            <Plus size={18} />
            New Event
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingCards />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Calendar size={42} />}
          title="No events or programs found"
          body="Create your first RHU event or check the API connection."
          action={
            <button type="button" onClick={openCreate} style={primaryButtonStyle}>
              <Plus size={18} />
              Create Event
            </button>
          }
        />
      ) : (
        <div style={eventGridStyle}>
          {items.map((item) => {
            const config = EVENT_TYPE_CONFIG[item.event_type] ?? EVENT_TYPE_CONFIG.event;

            return (
              <article key={item.id} style={eventCardStyle}>
                {item.banner_url ? (
                  <img src={item.banner_url} alt="" style={eventImageStyle} />
                ) : (
                  <div
                    style={{
                      ...eventImageFallbackStyle,
                      background: config.bg,
                      color: config.color,
                    }}
                  >
                    {config.icon}
                  </div>
                )}

                <div style={eventBodyStyle}>
                  <div style={badgeRowStyle}>
                    <Pill
                      icon={config.icon}
                      label={config.label}
                      color={config.color}
                      bg={config.bg}
                    />
                    <EventStatusPill published={Boolean(item.is_published)} />
                  </div>

                  <h3 style={eventTitleStyle}>{item.title}</h3>

                  <p style={eventDescriptionStyle}>{item.description}</p>

                  <div style={eventInfoStyle}>
                    <span>
                      <Calendar size={14} />
                      {formatDateTime(item.event_date)}
                    </span>
                    <span>
                      <MapPin size={14} />
                      {item.location || "No location set"}
                    </span>
                    <span>
                      <Users size={14} />
                      {item.max_slots
                        ? `${item.slots_available ?? item.max_slots}/${item.max_slots} slots`
                        : "No slot limit"}
                    </span>
                  </div>

                  <div style={eventActionsStyle}>
                    <button
                      type="button"
                      onClick={() => confirmPublishEvent(item)}
                      style={
                        item.is_published
                          ? warningActionButtonStyle
                          : successActionButtonStyle
                      }
                    >
                      {item.is_published ? "Unpublish" : "Publish"}
                    </button>

                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      style={lightActionButtonStyle}
                    >
                      <Edit2 size={15} />
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => confirmDeleteEvent(item)}
                      style={dangerActionButtonStyle}
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {(modal === "create" || modal === "edit") ? (
        <ModalShell
          title={modal === "create" ? "Create Event or Program" : "Edit Event or Program"}
          subtitle="Complete the schedule, location, target audience, and capacity before publishing."
          onClose={() => {
            setModal(null);
            setActive(null);
          }}
        >
          <EventFormPanel
            form={form}
            setForm={setForm}
            active={active}
            saving={saving}
            onCancel={() => {
              setModal(null);
              setActive(null);
            }}
            onSaveDraft={() => saveEvent(false)}
            onPublish={() => saveEvent(true)}
          />
        </ModalShell>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          onClose={() => setConfirm(null)}
          onError={(message) => showNotice("error", message)}
        />
      ) : null}
    </section>
  );
}

function AnnouncementFormPanel({
  form,
  setForm,
  active,
  saving,
  mode,
  onCancel,
  onSaveDraft,
  onPublish,
}: {
  form: AnnouncementForm;
  setForm: React.Dispatch<React.SetStateAction<AnnouncementForm>>;
  active: Announcement | null;
  saving: boolean;
  mode: "create" | "edit";
  onCancel: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  const categoryConfig = CATEGORY_CONFIG[form.category];

  return (
    <div style={modalContentStyle}>
      <div style={formGridStyle}>
        <label style={fieldStyle}>
          <span>Title *</span>
          <input
            value={form.title}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                title: event.target.value,
              }))
            }
            placeholder="Example: Free vaccination schedule in RHU 1"
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>Category *</span>
          <select
            value={form.category}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                category: event.target.value as AnnouncementCategory,
              }))
            }
            style={inputStyle}
          >
            <option value="general">General</option>
            <option value="program">Program</option>
            <option value="health_alert">Health Alert</option>
          </select>
        </label>
      </div>

      <div
        style={{
          ...categoryHelpStyle,
          background: categoryConfig.bg,
          color: categoryConfig.color,
        }}
      >
        {categoryConfig.icon}
        <span>{categoryConfig.helper}</span>
      </div>

      <label style={fieldStyle}>
        <span>Message *</span>
        <textarea
          value={form.body}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              body: event.target.value,
            }))
          }
          placeholder="Write the full announcement here. Use short sentences so residents can understand easily."
          style={{
            ...inputStyle,
            minHeight: 160,
            paddingTop: 12,
            resize: "vertical",
          }}
        />
      </label>

      <ImageUploader
        value={active?.banner_url}
        onChange={(file) =>
          setForm((previous) => ({
            ...previous,
            banner_image: file ?? undefined,
          }))
        }
        label="Banner image optional, max 5 MB"
        maxSizeMB={5}
      />

      <div style={publishingRulesStyle}>
        <strong>Before publishing, check:</strong>
        <span>• Is the title clear?</span>
        <span>• Is the date, place, or instruction included if needed?</span>
        <span>• Is this safe for residents to follow without confusion?</span>
      </div>

      <div style={modalActionsStyle}>
        <button type="button" onClick={onCancel} style={modalCancelButtonStyle}>
          Cancel
        </button>

        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving}
          style={modalSecondaryButtonStyle}
        >
          <FileText size={17} />
          {saving ? "Saving..." : "Save Draft"}
        </button>

        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          style={modalPrimaryButtonStyle}
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
  );
}

function EventFormPanel({
  form,
  setForm,
  active,
  saving,
  onCancel,
  onSaveDraft,
  onPublish,
}: {
  form: EventForm;
  setForm: React.Dispatch<React.SetStateAction<EventForm>>;
  active: Event | null;
  saving: boolean;
  onCancel: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  return (
    <div style={modalContentStyle}>
      <label style={fieldStyle}>
        <span>Title *</span>
        <input
          value={form.title}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              title: event.target.value,
            }))
          }
          placeholder="Example: Barangay immunization day"
          style={inputStyle}
        />
      </label>

      <div style={formGridStyle}>
        <label style={fieldStyle}>
          <span>Type *</span>
          <select
            value={form.event_type}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                event_type: event.target.value as EventType,
              }))
            }
            style={inputStyle}
          >
            <option value="event">Event</option>
            <option value="program">Program</option>
            <option value="announcement">Announcement</option>
          </select>
        </label>

        <label style={fieldStyle}>
          <span>Barangay Target</span>
          <input
            value={form.barangay_target}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                barangay_target: event.target.value,
              }))
            }
            placeholder="all / barangay name"
            style={inputStyle}
          />
        </label>
      </div>

      <label style={fieldStyle}>
        <span>Description *</span>
        <textarea
          value={form.description}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              description: event.target.value,
            }))
          }
          placeholder="Explain what residents need to know."
          style={{
            ...inputStyle,
            minHeight: 130,
            paddingTop: 12,
            resize: "vertical",
          }}
        />
      </label>

      <label style={fieldStyle}>
        <span>Location *</span>
        <input
          value={form.location}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              location: event.target.value,
            }))
          }
          placeholder="Example: RHU 1 Malasiqui"
          style={inputStyle}
        />
      </label>

      <div style={formGridStyle}>
        <label style={fieldStyle}>
          <span>Start Date & Time *</span>
          <input
            type="datetime-local"
            value={form.event_date}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                event_date: event.target.value,
              }))
            }
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>End Date & Time</span>
          <input
            type="datetime-local"
            value={form.ends_at}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                ends_at: event.target.value,
              }))
            }
            style={inputStyle}
          />
        </label>
      </div>

      <label style={fieldStyle}>
        <span>Maximum Slots</span>
        <input
          type="number"
          min={1}
          value={form.max_slots}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              max_slots: event.target.value,
            }))
          }
          placeholder="Leave blank if unlimited"
          style={inputStyle}
        />
      </label>

      <ImageUploader
        value={active?.banner_url}
        onChange={(file) =>
          setForm((previous) => ({
            ...previous,
            banner_image: file ?? undefined,
          }))
        }
        label="Banner image optional, max 5 MB"
        maxSizeMB={5}
      />

      <div style={publishingRulesStyle}>
        <strong>Before publishing, check:</strong>
        <span>• Is the date correct?</span>
        <span>• Is the location clear?</span>
        <span>• Are slots/capacity correct?</span>
      </div>

      <div style={modalActionsStyle}>
        <button type="button" onClick={onCancel} style={modalCancelButtonStyle}>
          Cancel
        </button>

        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving}
          style={modalSecondaryButtonStyle}
        >
          <FileText size={17} />
          {saving ? "Saving..." : "Save Draft"}
        </button>

        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          style={modalPrimaryButtonStyle}
        >
          <Send size={17} />
          {saving ? "Publishing..." : "Save & Publish"}
        </button>
      </div>
    </div>
  );
}

function AnnouncementPreview({ item }: { item: Announcement }) {
  const category = getAnnouncementCategory(item);
  const status = getAnnouncementStatus(item);
  const categoryConfig = CATEGORY_CONFIG[category];

  return (
    <div style={previewShellStyle}>
      {item.banner_url ? (
        <img src={item.banner_url} alt="" style={previewImageStyle} />
      ) : (
        <div
          style={{
            ...previewImageFallbackStyle,
            background: categoryConfig.bg,
            color: categoryConfig.color,
          }}
        >
          {categoryConfig.icon}
          <span>No banner image</span>
        </div>
      )}

      <div style={badgeRowStyle}>
        <Pill
          icon={categoryConfig.icon}
          label={categoryConfig.label}
          color={categoryConfig.color}
          bg={categoryConfig.bg}
        />
        <StatusPill status={status} />
      </div>

      <h2 style={previewTitleStyle}>{item.title}</h2>

      <p style={previewBodyStyle}>{getAnnouncementBody(item)}</p>

      <div style={residentNoteStyle}>
        <Info size={17} />
        <span>
          Resident-friendly check: The message should be short, direct, and easy to
          understand for people with low digital literacy.
        </span>
      </div>
    </div>
  );
}

function ConfirmDialog({
  state,
  onClose,
  onError,
}: {
  state: ConfirmState;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState(state.defaultReason ?? "");

  async function handleConfirm() {
    if (state.requireReason && !reason.trim()) {
      onError("Please enter a reason before continuing.");
      return;
    }

    setLoading(true);

    try {
      await state.onConfirm(reason.trim());
    } catch (err: any) {
      onError(
        err?.response?.data?.message ||
          err?.message ||
          "Action failed. Please try again."
      );
      setLoading(false);
    }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={confirmCardStyle}>
        <div style={confirmHeaderStyle}>
          <div
            style={{
              ...confirmIconStyle,
              background:
                state.tone === "red"
                  ? "#FEF2F2"
                  : state.tone === "yellow"
                  ? "#FFFBEB"
                  : state.tone === "blue"
                  ? "#EFF6FF"
                  : "#ECFDF5",
              color:
                state.tone === "red"
                  ? "#DC2626"
                  : state.tone === "yellow"
                  ? "#B45309"
                  : state.tone === "blue"
                  ? "#2563EB"
                  : "#047857",
            }}
          >
            {state.tone === "red" ? (
              <AlertTriangle size={24} />
            ) : state.tone === "yellow" ? (
              <Archive size={24} />
            ) : (
              <CheckCircle2 size={24} />
            )}
          </div>

          <div>
            <h3 style={confirmTitleStyle}>{state.title}</h3>
            <p style={confirmMessageStyle}>{state.message}</p>
          </div>
        </div>

        {state.requireReason ? (
          <label style={fieldStyle}>
            <span>{state.reasonLabel ?? "Reason"}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={state.reasonPlaceholder}
              style={{
                ...inputStyle,
                minHeight: 110,
                paddingTop: 12,
                resize: "vertical",
              }}
            />
          </label>
        ) : null}

        <div style={modalActionsStyle}>
          <button type="button" onClick={onClose} style={modalCancelButtonStyle}>
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{
              ...modalPrimaryButtonStyle,
              background:
                state.tone === "red"
                  ? "#DC2626"
                  : state.tone === "yellow"
                  ? "#D97706"
                  : state.tone === "blue"
                  ? "#2563EB"
                  : "#047857",
            }}
          >
            {loading ? "Processing..." : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div style={modalOverlayStyle}>
      <div style={modalCardStyle}>
        <div style={modalHeaderStyle}>
          <div>
            <h2 style={modalTitleStyle}>{title}</h2>
            {subtitle ? <p style={modalSubtitleStyle}>{subtitle}</p> : null}
          </div>

          <button type="button" onClick={onClose} style={closeButtonStyle}>
            <X size={22} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function ToastNotice({
  message,
  type,
  onClose,
}: {
  message: string;
  type: NoticeType;
  onClose: () => void;
}) {
  const tone =
    type === "success"
      ? {
          bg: "#ECFDF5",
          color: "#047857",
          border: "#A7F3D0",
          icon: <CheckCircle2 size={20} />,
          title: "Success",
        }
      : type === "warning"
      ? {
          bg: "#FFFBEB",
          color: "#B45309",
          border: "#FDE68A",
          icon: <AlertTriangle size={20} />,
          title: "Reminder",
        }
      : type === "info"
      ? {
          bg: "#EFF6FF",
          color: "#2563EB",
          border: "#BFDBFE",
          icon: <Info size={20} />,
          title: "Notice",
        }
      : {
          bg: "#FEF2F2",
          color: "#B91C1C",
          border: "#FECACA",
          icon: <AlertTriangle size={20} />,
          title: "Action failed",
        };

  return (
    <div
      style={{
        ...toastStyle,
        background: tone.bg,
        color: tone.color,
        borderColor: tone.border,
      }}
    >
      <div style={toastIconStyle}>{tone.icon}</div>
      <div style={{ flex: 1 }}>
        <strong>{tone.title}</strong>
        <p>{message}</p>
      </div>
      <button type="button" onClick={onClose} style={toastCloseButtonStyle}>
        <X size={16} />
      </button>
    </div>
  );
}

function SummaryCard({
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
  tone: "teal" | "green" | "yellow" | "gray" | "blue" | "purple";
}) {
  const toneStyle = {
    teal: { bg: "#CCFBF1", color: "#0F766E" },
    green: { bg: "#DCFCE7", color: "#047857" },
    yellow: { bg: "#FEF3C7", color: "#B45309" },
    gray: { bg: "#F1F5F9", color: "#475569" },
    blue: { bg: "#DBEAFE", color: "#2563EB" },
    purple: { bg: "#F5F3FF", color: "#7C3AED" },
  }[tone];

  return (
    <div style={summaryCardStyle}>
      <div
        style={{
          ...summaryIconStyle,
          background: toneStyle.bg,
          color: toneStyle.color,
        }}
      >
        {icon}
      </div>

      <div>
        <div style={summaryLabelStyle}>{label}</div>
        <div style={{ ...summaryValueStyle, color: toneStyle.color }}>{value}</div>
        <div style={summaryHintStyle}>{hint}</div>
      </div>
    </div>
  );
}

function Pill({
  icon,
  label,
  color,
  bg,
}: {
  icon?: ReactNode;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        ...pillStyle,
        color,
        background: bg,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: AnnouncementStatus | string }) {
  if (status === "published") {
    return (
      <Pill
        icon={<Globe size={14} />}
        label="Published"
        color="#047857"
        bg="#ECFDF5"
      />
    );
  }

  if (status === "archived") {
    return (
      <Pill
        icon={<Archive size={14} />}
        label="Archived"
        color="#475569"
        bg="#F1F5F9"
      />
    );
  }

  return (
    <Pill
      icon={<FileText size={14} />}
      label="Draft"
      color="#B45309"
      bg="#FFFBEB"
    />
  );
}

function EventStatusPill({ published }: { published: boolean }) {
  if (published) {
    return (
      <Pill
        icon={<Globe size={14} />}
        label="Published"
        color="#047857"
        bg="#ECFDF5"
      />
    );
  }

  return (
    <Pill
      icon={<FileText size={14} />}
      label="Draft"
      color="#B45309"
      bg="#FFFBEB"
    />
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div style={emptyStateStyle}>
      <div style={emptyIconStyle}>{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function LoadingList() {
  return (
    <div style={announcementListStyle}>
      {[1, 2, 3].map((item) => (
        <div key={item} style={loadingRowStyle} />
      ))}
    </div>
  );
}

function LoadingCards() {
  return (
    <div style={eventGridStyle}>
      {[1, 2, 3, 4].map((item) => (
        <div key={item} style={loadingCardStyle} />
      ))}
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 24,
  paddingBottom: 40,
};

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: 22,
  alignItems: "stretch",
  padding: 28,
  borderRadius: 28,
  background: "linear-gradient(135deg, #047857 0%, #0F766E 55%, #5EEAD4 100%)",
  color: "#FFFFFF",
  boxShadow: "0 24px 60px rgba(15, 118, 110, 0.22)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1,
  textTransform: "uppercase",
  opacity: 0.92,
};

const heroTitleStyle: CSSProperties = {
  margin: "8px 0 10px",
  fontSize: 36,
  fontWeight: 950,
  lineHeight: 1.05,
};

const heroSubtitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: 860,
  fontSize: 16,
  lineHeight: 1.7,
  opacity: 0.95,
};

const guideCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  alignContent: "center",
  padding: 20,
  borderRadius: 22,
  background: "rgba(255,255,255,0.16)",
  border: "1px solid rgba(255,255,255,0.28)",
};

const guideTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 950,
};

const guideStepsStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 13,
  fontWeight: 800,
};

const tabShellStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  borderBottom: "1px solid #E5E7EB",
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: 22,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
};

const summaryCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  minHeight: 108,
  padding: 18,
  borderRadius: 22,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const summaryIconStyle: CSSProperties = {
  width: 50,
  height: 50,
  display: "grid",
  placeItems: "center",
  borderRadius: 16,
  flex: "0 0 auto",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 950,
  textTransform: "uppercase",
};

const summaryValueStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 28,
  fontWeight: 950,
};

const summaryHintStyle: CSSProperties = {
  marginTop: 4,
  color: "#64748B",
  fontSize: 12,
  lineHeight: 1.35,
};

const actionGuideStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "center",
  padding: 20,
  borderRadius: 22,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
};

const guideSmallLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 950,
  textTransform: "uppercase",
  marginBottom: 4,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  padding: 16,
  borderRadius: 22,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
};

const toolbarRightStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const filterTabsStyle: CSSProperties = {
  display: "flex",
  gap: 5,
  padding: 4,
  borderRadius: 14,
  background: "#F1F5F9",
};

const smallTabStyle: CSSProperties = {
  minHeight: 36,
  padding: "0 14px",
  border: 0,
  borderRadius: 11,
  background: "transparent",
  color: "#64748B",
  fontWeight: 900,
  cursor: "pointer",
};

const activeSmallTabStyle: CSSProperties = {
  background: "#FFFFFF",
  color: "#0F172A",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
};

const searchBoxStyle: CSSProperties = {
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 12px",
  borderRadius: 14,
  background: "#F8FAFC",
  border: "1px solid #E5E7EB",
};

const searchInputStyle: CSSProperties = {
  width: 250,
  border: 0,
  outline: "none",
  background: "transparent",
  color: "#0F172A",
  fontWeight: 700,
};

const primaryButtonStyle: CSSProperties = {
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
};

const secondaryButtonStyle: CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: "1px solid #CBD5E1",
  borderRadius: 14,
  padding: "0 14px",
  background: "#FFFFFF",
  color: "#334155",
  fontWeight: 900,
  cursor: "pointer",
};

const healthAlertInfoStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 14,
  borderRadius: 18,
  background: "#FEF2F2",
  color: "#B91C1C",
  border: "1px solid #FECACA",
  fontWeight: 850,
};

const announcementListStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const announcementCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "110px minmax(0, 1fr) auto",
  gap: 16,
  alignItems: "center",
  padding: 18,
  borderRadius: 22,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const archivedCardStyle: CSSProperties = {
  opacity: 0.78,
  background: "#F8FAFC",
};

const announcementImageStyle: CSSProperties = {
  width: 110,
  height: 82,
  borderRadius: 16,
  overflow: "hidden",
};

const announcementImgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const imageFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
};

const announcementContentStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 8,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 28,
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 18,
  fontWeight: 950,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cardBodyStyle: CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.55,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const cardMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  color: "#64748B",
  fontSize: 12,
  fontWeight: 800,
};

const cardActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  maxWidth: 310,
};

const lightActionButtonStyle: CSSProperties = {
  minHeight: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "0 10px",
  background: "#FFFFFF",
  color: "#334155",
  fontWeight: 900,
  cursor: "pointer",
};

const successActionButtonStyle: CSSProperties = {
  ...lightActionButtonStyle,
  border: "1px solid #A7F3D0",
  background: "#ECFDF5",
  color: "#047857",
};

const warningActionButtonStyle: CSSProperties = {
  ...lightActionButtonStyle,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#B45309",
};

const archiveActionButtonStyle: CSSProperties = {
  ...lightActionButtonStyle,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  color: "#475569",
};

const dangerActionButtonStyle: CSSProperties = {
  ...lightActionButtonStyle,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#DC2626",
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  fontSize: 21,
  fontWeight: 950,
  color: "#0F172A",
};

const sectionSubtitleStyle: CSSProperties = {
  margin: 0,
  color: "#64748B",
  fontSize: 13,
};

const eventGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: 16,
};

const eventCardStyle: CSSProperties = {
  overflow: "hidden",
  borderRadius: 22,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const eventImageStyle: CSSProperties = {
  width: "100%",
  height: 150,
  objectFit: "cover",
  display: "block",
};

const eventImageFallbackStyle: CSSProperties = {
  height: 150,
  display: "grid",
  placeItems: "center",
  fontSize: 34,
};

const eventBodyStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
};

const eventTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 17,
  fontWeight: 950,
  lineHeight: 1.25,
};

const eventDescriptionStyle: CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.55,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const eventInfoStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#64748B",
  fontSize: 13,
  fontWeight: 800,
};

const eventActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 6,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483000,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "rgba(15, 23, 42, 0.55)",
  backdropFilter: "blur(5px)",
};

const modalCardStyle: CSSProperties = {
  width: "min(720px, 100%)",
  maxHeight: "92vh",
  overflowY: "auto",
  borderRadius: 26,
  background: "#FFFFFF",
  boxShadow: "0 30px 70px rgba(15, 23, 42, 0.35)",
  border: "1px solid #E5E7EB",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  padding: "24px 24px 18px",
  borderBottom: "1px solid #E5E7EB",
};

const modalTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  color: "#0F172A",
  fontWeight: 950,
};

const modalSubtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.45,
};

const closeButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  display: "grid",
  placeItems: "center",
  border: 0,
  borderRadius: 14,
  background: "#F8FAFC",
  color: "#334155",
  cursor: "pointer",
};

const modalContentStyle: CSSProperties = {
  display: "grid",
  gap: 18,
  padding: 24,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  fontSize: 13,
  color: "#334155",
  fontWeight: 950,
};

const inputStyle: CSSProperties = {
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
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const categoryHelpStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 14,
  borderRadius: 16,
  fontWeight: 850,
  fontSize: 13,
};

const publishingRulesStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 14,
  borderRadius: 16,
  background: "#F8FAFC",
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
};

const modalActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
  paddingTop: 8,
};

const modalCancelButtonStyle: CSSProperties = {
  minHeight: 46,
  border: 0,
  borderRadius: 15,
  padding: "0 18px",
  background: "#F1F5F9",
  color: "#334155",
  fontWeight: 950,
  cursor: "pointer",
};

const modalSecondaryButtonStyle: CSSProperties = {
  minHeight: 46,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: "1px solid #CBD5E1",
  borderRadius: 15,
  padding: "0 18px",
  background: "#FFFFFF",
  color: "#334155",
  fontWeight: 950,
  cursor: "pointer",
};

const modalPrimaryButtonStyle: CSSProperties = {
  minHeight: 46,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 15,
  padding: "0 18px",
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 950,
  cursor: "pointer",
};

const previewShellStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 24,
};

const previewImageStyle: CSSProperties = {
  width: "100%",
  height: 230,
  objectFit: "cover",
  borderRadius: 20,
};

const previewImageFallbackStyle: CSSProperties = {
  height: 190,
  display: "grid",
  placeItems: "center",
  gap: 8,
  borderRadius: 20,
  fontWeight: 900,
};

const previewTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 28,
  lineHeight: 1.15,
  fontWeight: 950,
};

const previewBodyStyle: CSSProperties = {
  margin: 0,
  color: "#334155",
  fontSize: 16,
  lineHeight: 1.8,
  whiteSpace: "pre-wrap",
};

const residentNoteStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  padding: 14,
  borderRadius: 16,
  background: "#EFF6FF",
  color: "#1D4ED8",
  fontWeight: 850,
};

const confirmCardStyle: CSSProperties = {
  width: "min(540px, 100%)",
  borderRadius: 24,
  background: "#FFFFFF",
  padding: 24,
  boxShadow: "0 30px 70px rgba(15, 23, 42, 0.35)",
};

const confirmHeaderStyle: CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  marginBottom: 18,
};

const confirmIconStyle: CSSProperties = {
  width: 52,
  height: 52,
  display: "grid",
  placeItems: "center",
  borderRadius: 18,
  flex: "0 0 auto",
};

const confirmTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 20,
  fontWeight: 950,
};

const confirmMessageStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#475569",
  fontSize: 14,
  lineHeight: 1.6,
};

const toastStyle: CSSProperties = {
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
};

const toastIconStyle: CSSProperties = {
  paddingTop: 2,
};

const toastCloseButtonStyle: CSSProperties = {
  width: 30,
  height: 30,
  display: "grid",
  placeItems: "center",
  border: 0,
  borderRadius: 10,
  background: "rgba(255,255,255,.55)",
  color: "inherit",
  cursor: "pointer",
};

const emptyStateStyle: CSSProperties = {
  minHeight: 320,
  display: "grid",
  placeItems: "center",
  gap: 8,
  textAlign: "center",
  padding: 40,
  borderRadius: 24,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  color: "#64748B",
};

const emptyIconStyle: CSSProperties = {
  color: "#CBD5E1",
};

const loadingRowStyle: CSSProperties = {
  height: 118,
  borderRadius: 22,
  background: "linear-gradient(90deg, #F1F5F9, #F8FAFC, #F1F5F9)",
  border: "1px solid #E5E7EB",
};

const loadingCardStyle: CSSProperties = {
  height: 330,
  borderRadius: 22,
  background: "linear-gradient(90deg, #F1F5F9, #F8FAFC, #F1F5F9)",
  border: "1px solid #E5E7EB",
};