// src/pages/Notifications.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Megaphone,
  MessageSquare,
  Pill,
  RefreshCw,
  Search,
  Stethoscope,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../services/notifications";

type NoticeState = {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
} | null;

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;

  return formatDate(value);
}

function getNotificationRoute(notification: AppNotification): string | null {
  const actionUrl = notification.action_url;

  if (actionUrl && actionUrl.startsWith("/")) {
    return actionUrl;
  }

  const data = notification.data ?? {};
  const relatedType = String(
    notification.related_type ??
      data.related_type ??
      data.module ??
      notification.type ??
      ""
  ).toLowerCase();

  const relatedId = notification.related_id ?? data.related_id ?? data.id;

  if (relatedType.includes("appointment")) return "/appointments";

  if (relatedType.includes("consultation") && relatedId) {
    return `/consultations/${relatedId}`;
  }

  if (relatedType.includes("consultation")) return "/consultations";
  if (relatedType.includes("prescription")) return "/prescriptions";
  if (relatedType.includes("inventory")) return "/inventory";
  if (relatedType.includes("queue")) return "/queue";
  if (relatedType.includes("telemedicine")) return "/telemedicine";

  if (relatedType.includes("event") && relatedId) {
    return `/cms/events/${relatedId}/registrants`;
  }

  if (relatedType.includes("event")) return "/cms/events";
  if (relatedType.includes("announcement")) return "/cms";
  if (relatedType.includes("sms")) return "/sms";
  if (relatedType.includes("user") || relatedType.includes("account")) {
    return "/users";
  }

  return null;
}

function getNotificationKind(notification: AppNotification): {
  label: string;
  icon: ReactNode;
  tone: "teal" | "blue" | "green" | "yellow" | "red" | "violet";
} {
  const type = `${notification.type} ${notification.related_type ?? ""}`.toLowerCase();

  if (type.includes("queue")) {
    return {
      label: "Queue",
      icon: <Users size={18} />,
      tone: "teal",
    };
  }

  if (type.includes("appointment")) {
    return {
      label: "Appointment",
      icon: <CalendarDays size={18} />,
      tone: "blue",
    };
  }

  if (type.includes("telemedicine")) {
    return {
      label: "Telemedicine",
      icon: <Video size={18} />,
      tone: "violet",
    };
  }

  if (type.includes("prescription")) {
    return {
      label: "Prescription",
      icon: <Pill size={18} />,
      tone: "green",
    };
  }

  if (type.includes("event") || type.includes("announcement")) {
    return {
      label: "RHU Post",
      icon: <Megaphone size={18} />,
      tone: "yellow",
    };
  }

  if (type.includes("consultation")) {
    return {
      label: "Consultation",
      icon: <Stethoscope size={18} />,
      tone: "blue",
    };
  }

  if (type.includes("failed") || type.includes("rejected") || type.includes("cancelled")) {
    return {
      label: "Alert",
      icon: <AlertTriangle size={18} />,
      tone: "red",
    };
  }

  return {
    label: "System",
    icon: <Bell size={18} />,
    tone: "teal",
  };
}

function getToneStyle(tone: "teal" | "blue" | "green" | "yellow" | "red" | "violet") {
  const map = {
    teal: {
      bg: "#CCFBF1",
      color: "#0F766E",
      border: "#99F6E4",
    },
    blue: {
      bg: "#DBEAFE",
      color: "#2563EB",
      border: "#BFDBFE",
    },
    green: {
      bg: "#DCFCE7",
      color: "#047857",
      border: "#BBF7D0",
    },
    yellow: {
      bg: "#FEF3C7",
      color: "#B45309",
      border: "#FDE68A",
    },
    red: {
      bg: "#FEE2E2",
      color: "#B91C1C",
      border: "#FECACA",
    },
    violet: {
      bg: "#EDE9FE",
      color: "#6D28D9",
      border: "#DDD6FE",
    },
  };

  return map[tone];
}

function getErrorMessage(error: any, fallback: string): string {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

export default function Notifications() {
  const navigate = useNavigate();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [notice, setNotice] = useState<NoticeState>(null);

  const inFlightRef = useRef(false);

  const showNotice = useCallback(
    (type: NonNullable<NoticeState>["type"], title: string, message: string) => {
      setNotice({ type, title, message });

      window.setTimeout(() => {
        setNotice(null);
      }, 4200);
    },
    []
  );

  const load = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;

      inFlightRef.current = true;

      if (!silent) setLoading(true);
      setRefreshing(true);

      try {
        const res = await fetchNotifications({
          page,
          per_page: 15,
          unread_only: unreadOnly,
        });

        setItems(res.data);
        setUnreadCount(res.unread_count);
        setTotal(res.pagination.total);
        setLastPage(res.pagination.last_page || 1);
      } catch (error: any) {
        showNotice(
          "error",
          "Could not load notifications",
          getErrorMessage(error, "Please check the notification API.")
        );
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, showNotice, unreadOnly]
  );

  useEffect(() => {
    load(false);

    const timer = window.setInterval(() => {
      load(true);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [load]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return items;

    return items.filter((item) => {
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.message.toLowerCase().includes(keyword) ||
        item.type.toLowerCase().includes(keyword) ||
        String(item.related_type ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [items, search]);

  const pageUnread = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items]
  );

  const stats = useMemo(() => {
    return {
      total,
      unread: unreadCount,
      queue: items.filter((item) =>
        `${item.type} ${item.related_type}`.toLowerCase().includes("queue")
      ).length,
      mobileRequests: items.filter((item) => {
        const text = `${item.type} ${item.related_type} ${item.title}`.toLowerCase();
        return (
          text.includes("appointment") ||
          text.includes("telemedicine") ||
          text.includes("request")
        );
      }).length,
    };
  }, [items, total, unreadCount]);

  async function openNotification(notification: AppNotification) {
    try {
      if (!notification.read_at) {
        await markNotificationRead(notification.id);
      }

      const route = getNotificationRoute(notification);

      await load(true);

      if (route) {
        navigate(route);
      } else {
        showNotice(
          "info",
          "Notification opened",
          "This notification has no linked page."
        );
      }
    } catch (error: any) {
      showNotice(
        "error",
        "Could not open notification",
        getErrorMessage(error, "Please try again.")
      );
    }
  }

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      await load(true);

      showNotice(
        "success",
        "All notifications read",
        "Your notification inbox has been updated."
      );
    } catch (error: any) {
      showNotice(
        "error",
        "Could not mark all as read",
        getErrorMessage(error, "Please try again.")
      );
    }
  }

  async function removeNotification(notification: AppNotification) {
    const ok = window.confirm(
      `Delete this notification?\n\n${notification.title}`
    );

    if (!ok) return;

    try {
      await deleteNotification(notification.id);
      await load(true);

      showNotice("success", "Notification deleted", "The item was removed.");
    } catch (error: any) {
      showNotice(
        "error",
        "Could not delete notification",
        getErrorMessage(error, "Please try again.")
      );
    }
  }

  return (
    <div style={S.page}>
      {notice ? (
        <NoticeToast notice={notice} onClose={() => setNotice(null)} />
      ) : null}

      <section style={S.hero}>
        <div>
          <div style={S.eyebrow}>Ka-Agapay RHU Alerts</div>
          <h1 style={S.heroTitle}>Notifications</h1>
          <p style={S.heroText}>
            View mobile requests, queue updates, telemedicine reminders,
            appointment notices, RHU posts, and important system alerts in one
            simple inbox.
          </p>

          <div style={S.heroMeta}>
            <span>Unread: {unreadCount}</span>
            <span>{refreshing ? "Refreshing..." : "Auto-refresh ON"}</span>
            <span>Mobile + Admin alerts</span>
          </div>
        </div>

        <div style={S.heroActions}>
          <button
            type="button"
            onClick={() => load(false)}
            disabled={refreshing}
            style={S.whiteButton}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button type="button" onClick={markAllRead} style={S.whiteButton}>
            <CheckCheck size={18} />
            Mark All Read
          </button>
        </div>
      </section>

      <section style={S.statsGrid}>
        <Metric
          icon={<Bell size={22} />}
          label="Total"
          value={String(stats.total)}
          hint="All notifications"
          tone="teal"
        />
        <Metric
          icon={<MessageSquare size={22} />}
          label="Unread"
          value={String(stats.unread)}
          hint="Needs attention"
          tone="red"
        />
        <Metric
          icon={<Users size={22} />}
          label="Queue"
          value={String(stats.queue)}
          hint="Queue-related"
          tone="blue"
        />
        <Metric
          icon={<SmartphoneIcon />}
          label="Mobile Requests"
          value={String(stats.mobileRequests)}
          hint="Resident requests"
          tone="green"
        />
      </section>

      <section style={S.card}>
        <div style={S.toolbar}>
          <div>
            <h2 style={S.sectionTitle}>Notification Inbox</h2>
            <p style={S.sectionSub}>
              Showing {filteredItems.length} item(s). {pageUnread} unread on
              this page.
            </p>
          </div>

          <div style={S.toolbarRight}>
            <div style={S.searchBox}>
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title/message..."
                style={S.searchInput}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setUnreadOnly(false);
                setPage(1);
              }}
              style={{
                ...S.filterButton,
                ...(unreadOnly ? {} : S.filterButtonActive),
              }}
            >
              All
            </button>

            <button
              type="button"
              onClick={() => {
                setUnreadOnly(true);
                setPage(1);
              }}
              style={{
                ...S.filterButton,
                ...(unreadOnly ? S.filterButtonActive : {}),
              }}
            >
              Unread
            </button>
          </div>
        </div>

        {loading ? (
          <div style={S.emptyState}>
            <RefreshCw size={38} />
            <strong>Loading notifications...</strong>
            <span>Please wait while the system reads your inbox.</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={S.emptyState}>
            <Bell size={44} />
            <strong>No notifications yet.</strong>
            <span>
              Mobile requests, published RHU posts, and queue alerts will appear
              here once created.
            </span>
          </div>
        ) : (
          <div style={S.list}>
            {filteredItems.map((notification) => {
              const isUnread = !notification.read_at;
              const route = getNotificationRoute(notification);
              const kind = getNotificationKind(notification);
              const tone = getToneStyle(kind.tone);

              return (
                <article
                  key={notification.id}
                  style={{
                    ...S.notificationCard,
                    background: isUnread ? "#ECFDF5" : "#FFFFFF",
                    borderColor: isUnread ? "#99F6E4" : "#E5E7EB",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    style={S.notificationMain}
                  >
                    <div
                      style={{
                        ...S.notificationIcon,
                        background: tone.bg,
                        color: tone.color,
                        borderColor: tone.border,
                      }}
                    >
                      {kind.icon}
                    </div>

                    <div style={S.notificationBody}>
                      <div style={S.notificationTop}>
                        <strong style={S.notificationTitle}>
                          {notification.title}
                        </strong>

                        {isUnread ? <span style={S.newBadge}>New</span> : null}

                        <span
                          style={{
                            ...S.kindBadge,
                            background: tone.bg,
                            color: tone.color,
                          }}
                        >
                          {kind.label}
                        </span>
                      </div>

                      <p style={S.notificationMessage}>
                        {notification.message || "No message."}
                      </p>

                      <div style={S.notificationMeta}>
                        <span>
                          <Clock size={13} />
                          {timeAgo(notification.created_at)}
                        </span>
                        <span>{formatDate(notification.created_at)}</span>
                      </div>
                    </div>

                    {route ? (
                      <div style={S.openHint}>
                        <ExternalLink size={17} />
                        Open
                      </div>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => removeNotification(notification)}
                    style={S.deleteButton}
                    title="Delete notification"
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <div style={S.pagination}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            style={S.pageButton}
          >
            Previous
          </button>

          <span style={S.pageText}>
            Page {page} of {lastPage}
          </span>

          <button
            type="button"
            disabled={page >= lastPage}
            onClick={() =>
              setPage((current) => Math.min(lastPage, current + 1))
            }
            style={S.pageButton}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}

function SmartphoneIcon() {
  return <MessageSquare size={22} />;
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "teal" | "blue" | "green" | "red";
}) {
  const toneMap = {
    teal: {
      bg: "#CCFBF1",
      color: "#0F766E",
    },
    blue: {
      bg: "#DBEAFE",
      color: "#2563EB",
    },
    green: {
      bg: "#DCFCE7",
      color: "#047857",
    },
    red: {
      bg: "#FEE2E2",
      color: "#B91C1C",
    },
  };

  const selected = toneMap[tone];

  return (
    <div style={S.metricCard}>
      <div
        style={{
          ...S.metricIcon,
          background: selected.bg,
          color: selected.color,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={S.metricLabel}>{label}</div>
        <div style={{ ...S.metricValue, color: selected.color }}>{value}</div>
        <div style={S.metricHint}>{hint}</div>
      </div>
    </div>
  );
}

function NoticeToast({
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
      <div>
        {notice.type === "success" ? (
          <CheckCircle2 size={22} />
        ) : (
          <AlertTriangle size={22} />
        )}
      </div>

      <div style={{ flex: 1 }}>
        <strong>{notice.title}</strong>
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
    gap: 22,
    paddingBottom: 40,
  },

  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
    padding: 28,
    borderRadius: 28,
    color: "#FFFFFF",
    background:
      "linear-gradient(135deg, #064E3B 0%, #0F766E 55%, #14B8A6 100%)",
    boxShadow: "0 22px 55px rgba(15, 118, 110, 0.24)",
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.9,
  },

  heroTitle: {
    margin: "6px 0 8px",
    fontSize: 36,
    fontWeight: 950,
    lineHeight: 1.05,
  },

  heroText: {
    margin: 0,
    maxWidth: 850,
    lineHeight: 1.7,
    fontSize: 16,
    opacity: 0.96,
  },

  heroMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
    fontSize: 13,
    fontWeight: 900,
  },

  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  whiteButton: {
    minHeight: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: 0,
    borderRadius: 14,
    padding: "0 16px",
    background: "#FFFFFF",
    color: "#0F766E",
    fontWeight: 950,
    cursor: "pointer",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },

  metricCard: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    minHeight: 105,
    padding: 17,
    borderRadius: 20,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  },

  metricIcon: {
    width: 50,
    height: 50,
    display: "grid",
    placeItems: "center",
    borderRadius: 16,
    flex: "0 0 auto",
  },

  metricLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 950,
    textTransform: "uppercase",
  },

  metricValue: {
    marginTop: 2,
    fontSize: 30,
    fontWeight: 950,
  },

  metricHint: {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B",
  },

  card: {
    padding: 20,
    borderRadius: 22,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.07)",
  },

  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 16,
  },

  toolbarRight: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },

  sectionTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 21,
    fontWeight: 950,
  },

  sectionSub: {
    margin: "5px 0 0",
    color: "#64748B",
    lineHeight: 1.55,
    fontSize: 13,
  },

  searchBox: {
    minHeight: 42,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    color: "#64748B",
  },

  searchInput: {
    width: 220,
    border: 0,
    outline: "none",
    background: "transparent",
    color: "#0F172A",
    fontWeight: 750,
  },

  filterButton: {
    minHeight: 42,
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "0 14px",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 950,
    cursor: "pointer",
  },

  filterButtonActive: {
    background: "#0F766E",
    color: "#FFFFFF",
    borderColor: "#0F766E",
  },

  list: {
    display: "grid",
    gap: 12,
  },

  notificationCard: {
    display: "flex",
    gap: 0,
    alignItems: "stretch",
    border: "1px solid #E5E7EB",
    borderRadius: 18,
    overflow: "hidden",
  },

  notificationMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 13,
    padding: 15,
    border: 0,
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
  },

  notificationIcon: {
    width: 48,
    height: 48,
    display: "grid",
    placeItems: "center",
    borderRadius: 16,
    border: "1px solid",
    flex: "0 0 auto",
  },

  notificationBody: {
    flex: 1,
    minWidth: 0,
  },

  notificationTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  notificationTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: 950,
  },

  notificationMessage: {
    margin: "6px 0 0",
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.6,
  },

  notificationMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
    color: "#64748B",
    fontSize: 12,
    fontWeight: 800,
  },

  newBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    background: "#0F766E",
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: 950,
  },

  kindBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 950,
  },

  openHint: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "#0F766E",
    fontWeight: 950,
    fontSize: 12,
    flex: "0 0 auto",
  },

  deleteButton: {
    width: 52,
    border: 0,
    borderLeft: "1px solid #E5E7EB",
    background: "#FFFFFF",
    color: "#B91C1C",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },

  emptyState: {
    minHeight: 250,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    textAlign: "center",
    padding: 24,
    borderRadius: 18,
    background: "#F8FAFC",
    color: "#64748B",
    border: "1px dashed #CBD5E1",
  },

  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 18,
  },

  pageButton: {
    minHeight: 40,
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "0 14px",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 950,
    cursor: "pointer",
  },

  pageText: {
    color: "#64748B",
    fontWeight: 900,
  },

  toast: {
    position: "fixed",
    right: 22,
    bottom: 22,
    zIndex: 2147483647,
    width: "min(440px, calc(100vw - 32px))",
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
};