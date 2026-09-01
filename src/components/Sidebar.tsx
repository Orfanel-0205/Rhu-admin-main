// src/components/Sidebar.tsx

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flame,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  Package,
  Pill,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useLangStore } from "../store/langStore";
import { t } from "../i18n/translations";
import { useAuthStore } from "../store/authStore";
import { authService } from "../services/auth";
import { fetchRealtimeDashboard } from "../services/dashboard";
import { getSmsLogs } from "../services/sms";
import { getUnreadCount as getTeamChatUnread } from "../services/teamChat";
import { openGettingStarted } from "../lib/tutorialBus";

type SidebarProps = {
  collapsed?: boolean;
  onToggle?: () => void;
};

type NavLeaf = {
  labelKey: string;
  fallback: string;
  path: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  /** Visible to the registration approvers only: Super Admin OR MHO (Part 1). */
  approverOnly?: boolean;
};

type NavGroup = {
  labelKey: string;
  fallback: string;
  icon: LucideIcon;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const navConfig: NavEntry[] = [
  {
    labelKey: "nav_dashboard",
    fallback: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    labelKey: "nav_patient_care",
    fallback: "Patient Care",
    icon: Stethoscope,
    children: [
      {
        labelKey: "nav_patient_registry",
        fallback: "Patient Registry",
        path: "/patients",
        icon: Users,
      },
      {
        labelKey: "nav_queue",
        fallback: "Queue",
        path: "/queue",
        icon: Activity,
      },
      {
        labelKey: "nav_appointments",
        fallback: "Appointments",
        path: "/appointments",
        icon: CalendarDays,
      },
      {
        labelKey: "nav_consultations",
        fallback: "Consultations",
        path: "/consultations",
        icon: Stethoscope,
      },
      {
        labelKey: "nav_eprescription",
        fallback: "E-Prescription / Lab Request",
        path: "/prescriptions",
        icon: Pill,
      },
      {
        labelKey: "nav_telemedicine",
        fallback: "Telemedicine",
        path: "/telemedicine",
        icon: Video,
      },
      {
        labelKey: "nav_health_followup",
        fallback: "Health Follow-up",
        path: "/follow-up",
        icon: MessageSquare,
      },
    ],
  },
  {
    labelKey: "nav_content_outreach",
    fallback: "Content & Outreach",
    icon: Megaphone,
    children: [
      {
        labelKey: "nav_announcements",
        fallback: "Announcements",
        path: "/cms",
        icon: Megaphone,
      },
      {
        labelKey: "nav_events",
        fallback: "Events",
        path: "/cms/events",
        icon: CalendarDays,
      },
      {
        labelKey: "nav_sms",
        fallback: "SMS",
        path: "/sms",
        icon: MessageSquare,
      },
      {
        labelKey: "nav_notifications",
        fallback: "Notifications",
        path: "/notifications",
        icon: Bell,
      },
    ],
  },
  {
    labelKey: "nav_analytics_reports",
    fallback: "Analytics & Reports",
    icon: BarChart3,
    children: [
      {
        labelKey: "nav_analytics",
        fallback: "Analytics",
        path: "/analytics",
        icon: BarChart3,
      },
      {
        labelKey: "nav_heatmap_analytics",
        fallback: "Heatmap Analytics",
        path: "/heatmap-analytics",
        icon: Flame,
      },
      {
        labelKey: "nav_reports",
        fallback: "Reports",
        path: "/reports",
        icon: FileText,
      },
    ],
  },
  {
    labelKey: "nav_team_chat",
    fallback: "Team Chat",
    path: "/team-chat",
    icon: MessageSquare,
  },
  {
    labelKey: "nav_inventory",
    fallback: "Inventory",
    path: "/inventory",
    icon: Package,
  },
  {
    labelKey: "nav_administration",
    fallback: "Administration",
    icon: Settings,
    children: [
      {
        labelKey: "nav_admin_profile",
        fallback: "Admin Profile",
        path: "/profile",
        icon: ShieldCheck,
      },
      {
        labelKey: "nav_registration_approvals",
        fallback: "Registration Approvals",
        path: "/registrations",
        icon: UserCheck,
        approverOnly: true,
      },
      {
        labelKey: "nav_users",
        fallback: "Users",
        path: "/users",
        icon: Users,
      },
      {
        labelKey: "nav_delete_history",
        fallback: "History",
        path: "/delete-history",
        icon: History,
      },
      {
        labelKey: "nav_settings",
        fallback: "Settings",
        path: "/settings",
        icon: Settings,
      },
    ],
  },
];

const STAFF_NAV_ROLES = new Set([
  "admin",
  "staff",
  "rhu_admin",
  "super_admin",
  "superadmin",
  "mho",
  "doctor",
  "nurse",
  "midwife",
]);

const STAFF_ONLY_PATHS = new Set([
  "/queue",
  "/analytics",
  "/heatmap-analytics",
  "/reports",
]);

function normalizeRoleName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function canViewStaffNav(user: any): boolean {
  const role = normalizeRoleName(user?.role_name ?? user?.role?.name ?? user?.role);
  const capabilities = Array.isArray(user?.capabilities) ? user.capabilities : [];
  return capabilities.includes("full_access") || !role || STAFF_NAV_ROLES.has(role);
}

function isSuperAdmin(user: any): boolean {
  const role = normalizeRoleName(user?.role_name ?? user?.role?.name ?? user?.role);
  return role === "super_admin" || role === "superadmin";
}

// Registration approvers = Super Admin (any row) or MHO (clinical rows). Both
// need the Registration Approvals nav entry; the backend still enforces which
// rows each may actually decide.
function isApprover(user: any): boolean {
  const role = normalizeRoleName(user?.role_name ?? user?.role?.name ?? user?.role);
  return ["super_admin", "superadmin", "mho", "mho_admin"].includes(role);
}

function filterNavConfig(entries: NavEntry[], user: any): NavEntry[] {
  const superAdmin = isSuperAdmin(user);

  // Strip super-admin-only leaves first (applies even to other staff roles), so
  // the backend's super_admin guard is mirrored in the UI. The backend still
  // enforces access regardless of what the sidebar shows.
  const approver = isApprover(user);

  const superFiltered = entries
    .map((entry) => {
      if (!isGroup(entry)) {
        const hidden =
          (entry.superAdminOnly && !superAdmin) ||
          (entry.approverOnly && !approver);
        return hidden ? null : entry;
      }

      const children = entry.children.filter(
        (child) =>
          !(
            (child.superAdminOnly && !superAdmin) ||
            (child.approverOnly && !approver)
          )
      );

      return children.length > 0 ? { ...entry, children } : null;
    })
    .filter(Boolean) as NavEntry[];

  if (canViewStaffNav(user)) return superFiltered;

  return superFiltered
    .map((entry) => {
      if (!isGroup(entry)) {
        return STAFF_ONLY_PATHS.has(entry.path) ? null : entry;
      }

      const children = entry.children.filter(
        (child) => !STAFF_ONLY_PATHS.has(child.path)
      );

      return children.length > 0 ? { ...entry, children } : null;
    })
    .filter(Boolean) as NavEntry[];
}

function safeText(key: string, fallback: string, lang: any) {
  const value = t(key as any, lang);
  return value && value !== key ? value : fallback;
}

function createInitialOpenGroups() {
  const initial: Record<string, boolean> = {};

  navConfig.forEach((entry) => {
    if (isGroup(entry)) {
      initial[entry.labelKey] = true;
    }
  });

  return initial;
}

function groupContainsPath(group: NavGroup, pathname: string): boolean {
  return group.children.some(
    (child) => pathname === child.path || pathname.startsWith(child.path + "/")
  );
}

function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span
      style={{
        marginLeft: "auto",
        background: "#EF4444",
        color: "#FFFFFF",
        fontSize: 11,
        fontWeight: 800,
        borderRadius: 999,
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 0 0 2px rgba(15,118,110,0.9)",
      }}
    >
      {formatBadge(count)}
    </span>
  );
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const lang = useLangStore((state) => state.lang);
  const authUser = useAuthStore((state) => state.user);
  const visibleNavConfig = useMemo(
    () => filterNavConfig(navConfig, authUser),
    [authUser]
  );

  const isControlled =
    typeof collapsed === "boolean" && typeof onToggle === "function";

  const [internalCollapsed, setInternalCollapsed] = useState(
    Boolean(collapsed)
  );

  const isCollapsed = isControlled ? Boolean(collapsed) : internalCollapsed;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    createInitialOpenGroups
  );

  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isControlled) {
      setInternalCollapsed(Boolean(collapsed));
    }
  }, [collapsed, isControlled]);

  useEffect(() => {
    let active = true;

    async function loadCounts() {
      const [dashboardResult, smsResult, chatResult] = await Promise.allSettled([
        fetchRealtimeDashboard(),
        getSmsLogs({ status: "failed" }),
        getTeamChatUnread(),
      ]);

      if (!active) return;

      setModuleCounts((prev) => {
        const next = { ...prev };

        if (dashboardResult.status === "fulfilled") {
          const cards = (dashboardResult.value as any)?.cards ?? {};

          next["/queue"] = Number(cards.waiting_queue ?? 0);
          next["/inventory"] = Number(cards.low_inventory ?? 0);
          next["/telemedicine"] = Number(cards.pending_telemedicine ?? 0);
        }

        if (smsResult.status === "fulfilled") {
          const smsLogs = smsResult.value as any;

          next["/sms"] = Array.isArray(smsLogs)
            ? smsLogs.length
            : Array.isArray(smsLogs?.data)
            ? smsLogs.data.length
            : 0;
        }

        if (chatResult.status === "fulfilled") {
          next["/team-chat"] = Number(chatResult.value ?? 0);
        }

        return next;
      });
    }

    loadCounts();

    const timer = window.setInterval(loadCounts, 30000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };

      visibleNavConfig.forEach((entry) => {
        if (isGroup(entry) && groupContainsPath(entry, location.pathname)) {
          next[entry.labelKey] = true;
        }
      });

      return next;
    });
  }, [location.pathname, visibleNavConfig]);

  function toggleSidebar() {
    if (typeof onToggle === "function") {
      onToggle();
    }

    if (!isControlled) {
      setInternalCollapsed((prev) => !prev);
    }
  }

  function toggleGroup(labelKey: string) {
    setOpenGroups((prev) => ({
      ...prev,
      [labelKey]: !prev[labelKey],
    }));
  }

  function groupBadgeCount(group: NavGroup): number {
    return group.children.reduce(
      (sum, child) => sum + (moduleCounts[child.path] ?? 0),
      0
    );
  }

  async function handleLogout() {
    const confirmed = window.confirm(
      safeText("logout_confirm", "Are you sure you want to logout?", lang)
    );

    if (!confirmed) return;

    try {
      await authService.logout();
    } catch {
      // Continue clearing local session even if backend logout fails.
    } finally {
      useAuthStore.getState().clearAuth();
      navigate("/login", { replace: true });
    }
  }

  const leafLinkStyle = (
    isActive: boolean,
    indented: boolean
  ): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: isCollapsed ? "center" : "flex-start",
    gap: 12,
    minHeight: 40,
    padding: isCollapsed
      ? "0 12px"
      : indented
      ? "0 14px 0 40px"
      : "0 14px",
    borderRadius: 12,
    color: "#FFFFFF",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
    opacity: isActive ? 1 : 0.9,
    background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
    cursor: "pointer",
    pointerEvents: "auto",
    transition: "background 0.15s ease, opacity 0.15s ease",
    whiteSpace: "nowrap",
  });

  const collapsedLeaves: NavLeaf[] = visibleNavConfig.flatMap((entry) =>
    isGroup(entry) ? entry.children : [entry]
  );

  return (
    <aside
      style={{
        width: isCollapsed ? 72 : 248,
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #064E3B 0%, #065F46 48%, #0F766E 100%)",
        color: "#FFFFFF",
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 40,
        transition: "width 0.2s ease",
        boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
        overflow: "visible",
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        onClick={toggleSidebar}
        title={
          isCollapsed
            ? safeText("sidebar_expand", "Expand sidebar", lang)
            : safeText("sidebar_collapse", "Collapse sidebar", lang)
        }
        aria-label={
          isCollapsed
            ? safeText("sidebar_expand", "Expand sidebar", lang)
            : safeText("sidebar_collapse", "Collapse sidebar", lang)
        }
        style={{
          position: "absolute",
          top: 18,
          right: -14,
          width: 28,
          height: 28,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.28)",
          background: "#FFFFFF",
          color: "#065F46",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
          zIndex: 45,
        }}
      >
        {isCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>

      <div
        style={{
          height: 64,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: isCollapsed ? "0 12px" : "0 18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <img
          src="/logo.png"
          alt="Ka-Agapay logo"
          width={48}
          height={48}
          style={{
            width: 48,
            height: 48,
            objectFit: "contain",
            flexShrink: 0,
          }}
        />

        {!isCollapsed && (
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontWeight: 900,
                fontSize: 17,
                letterSpacing: 0.2,
                lineHeight: 1,
              }}
            >
              Ka-Agapay
            </div>

            <div
              style={{
                fontSize: 11,
                opacity: 0.75,
                marginTop: 4,
              }}
            >
              {safeText("brand_subtitle", "RHU Admin", lang)}
            </div>
          </div>
        )}
      </div>

      <nav
        style={{
          flex: 1,
          padding: "14px 10px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {isCollapsed
          ? collapsedLeaves.map(({ labelKey, fallback, path, icon: Icon }) => {
              const badgeCount = moduleCounts[path] ?? 0;

              return (
                <NavLink
                  key={path}
                  to={path}
                  end={path === "/cms"}
                  title={safeText(labelKey, fallback, lang)}
                  style={({ isActive }) => ({
                    ...leafLinkStyle(isActive, false),
                    position: "relative",
                  })}
                >
                  <Icon size={19} style={{ flexShrink: 0 }} />

                  {badgeCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 8,
                        background: "#EF4444",
                        color: "#FFFFFF",
                        fontSize: 10,
                        fontWeight: 800,
                        borderRadius: 999,
                        minWidth: 16,
                        height: 16,
                        padding: "0 4px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 0 0 2px #065F46",
                      }}
                    >
                      {formatBadge(badgeCount)}
                    </span>
                  )}
                </NavLink>
              );
            })
          : visibleNavConfig.map((entry) => {
              if (!isGroup(entry)) {
                const { labelKey, fallback, path, icon: Icon } = entry;
                const badgeCount = moduleCounts[path] ?? 0;

                return (
                  <NavLink
                    key={path}
                    to={path}
                    end={path === "/cms"}
                    title={safeText(labelKey, fallback, lang)}
                    style={({ isActive }) => leafLinkStyle(isActive, false)}
                  >
                    <Icon size={19} style={{ flexShrink: 0 }} />

                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {safeText(labelKey, fallback, lang)}
                    </span>

                    <NavBadge count={badgeCount} />
                  </NavLink>
                );
              }

              const { labelKey, fallback, icon: Icon, children } = entry;
              const open = openGroups[labelKey] ?? false;
              const active = groupContainsPath(entry, location.pathname);
              const badgeCount = groupBadgeCount(entry);

              return (
                <div key={labelKey}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(labelKey)}
                    aria-expanded={open}
                    title={safeText(labelKey, fallback, lang)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      minHeight: 42,
                      padding: "0 14px",
                      border: "none",
                      borderRadius: 12,
                      color: "#FFFFFF",
                      fontSize: 14,
                      fontWeight: 800,
                      textAlign: "left",
                      opacity: active ? 1 : 0.9,
                      background:
                        active && !open
                          ? "rgba(255,255,255,0.14)"
                          : "transparent",
                      cursor: "pointer",
                      transition: "background 0.15s ease, opacity 0.15s ease",
                    }}
                  >
                    <Icon size={19} style={{ flexShrink: 0 }} />

                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {safeText(labelKey, fallback, lang)}
                    </span>

                    {!open && <NavBadge count={badgeCount} />}

                    <ChevronDown
                      size={16}
                      style={{
                        flexShrink: 0,
                        transition: "transform 0.18s ease",
                        transform: open ? "rotate(180deg)" : "rotate(0deg)",
                        opacity: 0.85,
                      }}
                    />
                  </button>

                  {open && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        marginTop: 2,
                      }}
                    >
                      {children.map(
                        ({
                          labelKey: childLabelKey,
                          fallback: childFallback,
                          path,
                          icon: ChildIcon,
                        }) => (
                          <NavLink
                            key={path}
                            to={path}
                            end={path === "/cms"}
                            title={safeText(childLabelKey, childFallback, lang)}
                            style={({ isActive }) =>
                              leafLinkStyle(isActive, true)
                            }
                          >
                            <ChildIcon
                              size={17}
                              style={{ flexShrink: 0, opacity: 0.9 }}
                            />

                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {safeText(childLabelKey, childFallback, lang)}
                            </span>

                            <NavBadge count={moduleCounts[path] ?? 0} />
                          </NavLink>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
      </nav>

      <div
        style={{
          flexShrink: 0,
          padding: isCollapsed ? "10px" : "10px 10px 16px",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        {/*
          Opens the EXISTING assistant in its EXISTING Getting Started mode via
          tutorialBus — no tutorial content is defined here. It lives in the
          pinned footer (not the scrolling nav list) and is role-independent, so
          it is reachable at all times by every logged-in staff user.
        */}
        <button
          type="button"
          onClick={() => openGettingStarted()}
          title={safeText("nav_getting_started", "Getting Started", lang)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "flex-start",
            gap: 12,
            width: "100%",
            minHeight: 42,
            marginBottom: 8,
            padding: isCollapsed ? "0" : "0 14px",
            border: "1px solid rgba(255,255,255,0.28)",
            borderRadius: 12,
            background: "rgba(255,255,255,0.14)",
            color: "#FFFFFF",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          <GraduationCap size={18} style={{ flexShrink: 0 }} />

          {!isCollapsed && (
            <span>{safeText("nav_getting_started", "Getting Started", lang)}</span>
          )}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          title={safeText("nav_logout", "Logout", lang)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "flex-start",
            gap: 12,
            width: "100%",
            minHeight: 42,
            padding: isCollapsed ? "0" : "0 14px",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 12,
            background: "rgba(0,0,0,0.12)",
            color: "#FFFFFF",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />

          {!isCollapsed && (
            <span>{safeText("nav_logout", "Logout", lang)}</span>
          )}
        </button>
      </div>
    </aside>
  );
}

export interface SearchableNavLeaf {
  label: string;
  path: string;
  icon: LucideIcon;
}

/**
 * Flat list of nav destinations the CURRENT user may open — reuses the exact
 * same role filtering as the rendered sidebar, so the global search bar can
 * never suggest a page the user would be blocked from. (Part 3e)
 */
export function getSearchableNav(user: any, lang: any): SearchableNavLeaf[] {
  const leaves: SearchableNavLeaf[] = [];

  filterNavConfig(navConfig, user).forEach((entry) => {
    if (isGroup(entry)) {
      entry.children.forEach((child) =>
        leaves.push({
          label: safeText(child.labelKey, child.fallback, lang),
          path: child.path,
          icon: child.icon,
        })
      );
    } else {
      leaves.push({
        label: safeText(entry.labelKey, entry.fallback, lang),
        path: entry.path,
        icon: entry.icon,
      });
    }
  });

  return leaves;
}

export default Sidebar;
