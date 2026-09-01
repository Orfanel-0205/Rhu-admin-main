// src/components/DashboardShell.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  Globe2,
  Menu,
  UserCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import AIChatAssistant from "./AIChatAssistant";
import GlobalSearch from "./GlobalSearch";

import { useAuthStore } from "../store/authStore";
import { useLangStore } from "../store/langStore";
import { t } from "../i18n/translations";

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../services/notifications";
import { useToast } from "../contexts/ToastContext";
import { authService } from "../services/auth";
import { openGettingStarted } from "../lib/tutorialBus";

interface DashboardShellProps {
  children: React.ReactNode;
}

type AnyUser = {
  id?: number;
  user_id?: number;

  name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;

  email?: string | null;
  mobile_number?: string | null;

  role?: string | null;
  role_name?: string | null;

  avatar?: string | null;
  avatar_url?: string | null;
  profile_picture?: string | null;
  profile_picture_url?: string | null;

  [key: string]: any;
};

function formatTime(value?: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRoute(notification: AppNotification): string | null {
  const actionUrl = notification.action_url;

  if (actionUrl && actionUrl.startsWith("/")) {
    return actionUrl;
  }

  const data = notification.data ?? {};
  const relatedType = String(
    notification.related_type ?? data.related_type ?? data.module ?? ""
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
  if (relatedType.includes("event")) return "/cms/events";
  if (relatedType.includes("announcement")) return "/cms";

  return null;
}

function getDisplayName(user?: AnyUser | null): string {
  if (!user) return "Admin User";

  const direct = String(user.full_name || user.name || "").trim();

  if (direct) return direct;

  const joined = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return joined || "Admin User";
}

function getInitials(user?: AnyUser | null): string {
  const name = getDisplayName(user);

  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return "AD";
}

function normalizeRole(role?: string | null): string {
  return String(role || "staff")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function apiRootFromEnv(): string {
  const raw = String(import.meta.env.VITE_API_URL || "").trim();

  if (!raw) return "";

  return raw.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

function resolveProfileImageUrl(user?: AnyUser | null): string | null {
  if (!user) return null;

  const raw =
    user.profile_picture_url ||
    user.avatar_url ||
    user.avatar ||
    user.profile_picture ||
    null;

  if (!raw) return null;

  const value = String(raw).trim();

  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const apiRoot = apiRootFromEnv();

  if (value.startsWith("/storage/")) {
    return apiRoot ? `${apiRoot}${value}` : value;
  }

  if (value.startsWith("storage/")) {
    return apiRoot ? `${apiRoot}/${value}` : `/${value}`;
  }

  if (value.startsWith("profile-pictures/")) {
    return apiRoot ? `${apiRoot}/storage/${value}` : `/storage/${value}`;
  }

  return value;
}

function langLabel(value: string): string {
  const safe = String(value || "en").toLowerCase();

  if (safe === "pag") return "PAG";
  if (safe === "tag" || safe === "tl" || safe === "fil") return "TAG";

  return "EN";
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const navigate = useNavigate();

  const authUser = useAuthStore((state) => state.user) as AnyUser | null;
  const patchUser = useAuthStore((state) => state.patchUser);
  const lang = useLangStore((state) => state.lang);

  // Guards against a second fire from a re-render/StrictMode double-invoke
  // before the patched user has propagated.
  const onboardingFiredRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Sidebar collapse is owned here so the content <main> reflows into the freed
  // width (the fixed-position sidebar shrinks 248→72 on collapse). Persisted for
  // the session so it survives page navigation.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("ka_sidebar_collapsed") === "1")
  );
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  /*
   * FIRST-EVER-LOGIN "Getting Started" auto-open.
   *
   * Runs here, in the shell that mounts AFTER the post-login redirect has
   * already landed, so it can never delay or interfere with authentication or
   * the redirect itself. It opens the SAME tutorial mode the sidebar entry and
   * the header toggle use.
   *
   * Strictly `=== false`: an older backend, or a cached user object without the
   * field, leaves it undefined and must NOT trigger the tour.
   *
   * The flag is flipped locally and persisted immediately (not when the tour is
   * finished or dismissed), so closing the panel, refreshing, or never opening
   * it again all still count as "shown once". The sidebar entry remains the way
   * back in.
   */
  useEffect(() => {
    if (onboardingFiredRef.current || !authUser) {
      return;
    }

    if (authUser.has_seen_onboarding !== false) {
      return;
    }

    onboardingFiredRef.current = true;

    patchUser({ has_seen_onboarding: true });
    void authService.markOnboardingSeen();

    // Let the dashboard paint first so the tour appears over a loaded page
    // rather than racing the first render.
    const timer = window.setTimeout(() => openGettingStarted({ firstLogin: true }), 800);

    return () => window.clearTimeout(timer);
  }, [authUser, patchUser]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const inFlightRef = useRef(false);
  const toast = useToast();
  // Track notification ids already seen so we only toast NEW arrivals, and skip
  // toasting the existing backlog on the very first poll.
  const seenNotifRef = useRef<Set<string>>(new Set());
  const notifiedInitRef = useRef(false);

  const displayName = getDisplayName(authUser);
  const initials = getInitials(authUser);
  const role = normalizeRole(authUser?.role_name ?? authUser?.role);
  const profilePhoto = useMemo(
    () => resolveProfileImageUrl(authUser),
    [authUser]
  );

  const loadNotifications = useCallback(async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setLoadingNotifications(true);

    try {
      const res = await fetchNotifications({ per_page: 5 });

      // Give staff a visible toast for newly-arrived unread notifications
      // (Part 2 #4 inventory alerts, plus any other new item). The first poll
      // only seeds the "seen" set so we never toast the existing backlog.
      if (!notifiedInitRef.current) {
        res.data.forEach((n) => seenNotifRef.current.add(n.id));
        notifiedInitRef.current = true;
      } else {
        const fresh = res.data.filter(
          (n) => !seenNotifRef.current.has(n.id) && !n.read_at
        );
        res.data.forEach((n) => seenNotifRef.current.add(n.id));

        // The Notice banner is SINGLE-SLOT (ToastProvider replaces, never
        // stacks) — so with 2+ new arrivals the earlier show() was invisibly
        // overwritten and a burst looked like one lone event. Coalesce
        // instead: one banner for one arrival, one SUMMARY banner for many
        // (panelist follow-up round). unread_count covers arrivals beyond
        // the per_page:5 poll window during a large burst.
        if (fresh.length === 1) {
          const n = fresh[0];
          const text = n.title || n.message || "New notification";
          if (/inventory|low_stock|expir/i.test(n.type)) {
            toast.warning(text);
          } else {
            toast.info(text);
          }
        } else if (fresh.length > 1) {
          // The poll window is per_page:5, so a very large burst shows as
          // "5+" — the bell badge carries the exact unread total.
          const suffix = res.data.length >= 5 ? "+" : "";
          toast.info(
            `${fresh.length}${suffix} new notifications — open the bell to review them.`
          );
        }
      }

      setNotifications(res.data);
      setUnreadCount(res.unread_count);
    } catch {
      // Do not break the whole shell if notifications fail.
    } finally {
      inFlightRef.current = false;
      setLoadingNotifications(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();

    const timer = window.setInterval(() => {
      loadNotifications();
    }, 15000);

    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    function syncViewport() {
      setIsMobile(window.innerWidth < 900);
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  async function handleOpenNotification(notification: AppNotification) {
    try {
      if (!notification.read_at) {
        await markNotificationRead(notification.id);
      }

      setOpen(false);
      await loadNotifications();

      const route = getRoute(notification);

      if (route) {
        navigate(route);
      } else {
        navigate("/notifications");
      }
    } catch {
      navigate("/notifications");
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      await loadNotifications();
    } catch {
      // Silent fail; full page can show detailed error.
    }
  }

  function handleLanguageChange(value: string) {
    useLangStore.setState({ lang: value as any });
  }

  return (
    <div
      className="dashboard-layout"
      style={{
        minHeight: "100vh",
        background: "#F8FAFC",
      }}
    >
      {(!isMobile || mobileSidebarOpen) && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() =>
            setSidebarCollapsed((prev) => {
              const next = !prev;
              try {
                localStorage.setItem("ka_sidebar_collapsed", next ? "1" : "0");
              } catch {
                /* ignore */
              }
              return next;
            })
          }
        />
      )}

      {isMobile && mobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 35,
            border: 0,
            background: "rgba(15,23,42,0.38)",
            cursor: "pointer",
          }}
        />
      ) : null}

      <main
        className="dashboard-main"
        style={{
          marginLeft: isMobile ? 0 : sidebarCollapsed ? 72 : 248,
          transition: "margin-left 0.2s ease",
          minHeight: "100vh",
          padding: isMobile ? 16 : 28,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar"
              title="Open sidebar"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                border: "1px solid #E5E7EB",
                background: "#FFFFFF",
                color: "#065F46",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Menu size={19} />
            </button>
          ) : null}

          {/* Part 3e — real global search (pages + users/patients), replacing
              what used to be a decorative input with no handler. */}
          <GlobalSearch />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              position: "relative",
            }}
          >
            <div
              style={{
                height: 38,
                borderRadius: 10,
                border: "1px solid #E5E7EB",
                background: "#FFFFFF",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 10px",
                color: "#065F46",
                fontWeight: 900,
              }}
              title="Language"
            >
              <Globe2 size={15} />

              <select
                value={lang}
                onChange={(event) => handleLanguageChange(event.target.value)}
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "#064E3B",
                  fontWeight: 900,
                  cursor: "pointer",
                  appearance: "auto",
                }}
              >
                <option value="en">{langLabel("en")}</option>
                <option value="tag">{langLabel("tag")}</option>
                <option value="pag">{langLabel("pag")}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              style={{
                position: "relative",
                width: 38,
                height: 38,
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#4B5563",
              }}
              title={t("top_notifications", lang)}
            >
              <Bell size={18} />

              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    background: "#EF4444",
                    borderRadius: 999,
                    border: "2px solid #FFFFFF",
                    color: "#FFFFFF",
                    fontSize: 10,
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {open && (
              <div
                style={{
                  position: "absolute",
                  top: 48,
                  right: 50,
                  width: 360,
                  background: "#FFFFFF",
                  border: "1px solid #E5E7EB",
                  borderRadius: 16,
                  boxShadow: "0 20px 45px rgba(15,23,42,0.18)",
                  zIndex: 100,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: 14,
                    borderBottom: "1px solid #F1F5F9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div>
                    <strong style={{ color: "#0F172A" }}>
                      {t("top_notifications", lang)}
                    </strong>
                    <div
                      style={{
                        color: "#64748B",
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {unreadCount} {t("top_unread", lang)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    style={{
                      border: "1px solid #CBD5E1",
                      background: "#FFFFFF",
                      color: "#0F766E",
                      borderRadius: 10,
                      padding: "7px 9px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontWeight: 900,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <CheckCheck size={14} />
                    {t("top_read_all", lang)}
                  </button>
                </div>

                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {loadingNotifications && notifications.length === 0 ? (
                    <div style={dropdownEmpty}>{t("top_loading_notifications", lang)}</div>
                  ) : notifications.length === 0 ? (
                    <div style={dropdownEmpty}>{t("top_no_notifications", lang)}</div>
                  ) : (
                    notifications.map((item) => {
                      const unread = !item.read_at;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleOpenNotification(item)}
                          style={{
                            width: "100%",
                            border: "none",
                            borderBottom: "1px solid #F1F5F9",
                            background: unread ? "#ECFDF5" : "#FFFFFF",
                            padding: 14,
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <strong
                              style={{
                                color: "#0F172A",
                                fontSize: 13,
                              }}
                            >
                              {item.title}
                            </strong>

                            <span
                              style={{
                                color: "#94A3B8",
                                fontSize: 11,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatTime(item.created_at)}
                            </span>
                          </div>

                          <div
                            style={{
                              color: "#475569",
                              fontSize: 12,
                              marginTop: 4,
                              lineHeight: 1.45,
                            }}
                          >
                            {item.message || t("top_no_message", lang)}
                          </div>

                          {unread && (
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: 8,
                                background: "#0F766E",
                                color: "#FFFFFF",
                                borderRadius: 999,
                                padding: "3px 8px",
                                fontSize: 10,
                                fontWeight: 900,
                              }}
                            >
                              {t("top_new", lang)}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate("/notifications");
                  }}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "#F8FAFC",
                    padding: 13,
                    color: "#0F766E",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {t("top_view_all_notifications", lang)}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate("/profile")}
              title={`Open profile: ${displayName}`}
              style={{
                width: 42,
                height: 42,
                background: "#E8F5F1",
                border: "1px solid #D1FAE5",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 14,
                color: "#047857",
                cursor: "pointer",
                overflow: "hidden",
                boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
              }}
            >
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt={displayName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : authUser ? (
                initials
              ) : (
                <UserCircle size={22} />
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate("/profile")}
              title={`Open profile: ${displayName}`}
              style={{
                border: "none",
                background: "transparent",
                color: "#334155",
                display: "none",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <strong>{displayName}</strong>
              <span>{role}</span>
            </button>
          </div>
        </div>

        <div className="page-enter">{children}</div>
      </main>

      <div
        style={{
          position: "relative",
          zIndex: 20,
        }}
      >
        <AIChatAssistant />
      </div>
    </div>
  );
}

const dropdownEmpty: React.CSSProperties = {
  padding: 18,
  color: "#64748B",
  fontWeight: 800,
  background: "#FFFFFF",
};
