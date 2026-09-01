// src/pages/Dashboard.tsx
//
// Real-Time RHU Dashboard — redesigned for clarity, accessibility, and a
// digital-illiteracy-friendly experience (large touch targets, icon + label
// on every action, plain-language section titles, no auto-refresh).
//
// All on-screen text goes through the central i18n dictionary
// (src/i18n/translations.ts) via t(key, lang, params). There is no local
// translation fallback table anymore — add new copy directly to
// translations.ts so every page shares one source of truth.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Map as MapIcon,
  Megaphone,
  PackageX,
  Pill,
  RefreshCcw,
  Stethoscope,
  UserPlus,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useLangStore } from "../store/langStore";
import { t } from "../i18n/translations";
import StatusBadge from "../components/ui/StatusBadge";
import ModuleTabs from "../components/ui/ModuleTabs";
import AiInsightsPanel from "../components/AiInsightsPanel";
import { buildDashboardInsights } from "../lib/aiInsights";
import { useToast } from "../contexts/ToastContext";
import { getConsultationMapping } from "../services/consultations";
import { getFollowUps, type FollowUpReminder } from "../services/followups";
import {
  getInventory,
  getInventoryAlerts,
  type InventoryAlerts,
  type InventoryItem,
} from "../services/inventory";
import {
  fetchBarangayRisk,
  fetchOutbreakAlerts,
  fetchQueueHeatmap,
  fetchRealtimeDashboard,
  resolveOutbreakAlert,
  type HeatmapPoint,
  type OutbreakAlert,
  type PriorityAction,
  type RealtimeDashboardData,
} from "../services/dashboard";

const DASHBOARD_ICON = "/DASHBOARDLOGO.gif";

// ---- Brand palette (matches the RHU healthcare design system) ----
const COLORS = {
  primary: "#0F766E",
  primaryDark: "#0B5650",
  secondary: "#14B8A6",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  bg: "#F8FAFC",
  textDark: "#0F172A",
  textMuted: "#64748B",
  border: "#E2E8F0",
};

type Tone = "healthy" | "warning" | "critical" | "default";

type ChartPoint = {
  label: string;
  value: number;
  subtitle?: string;
  tone?: Tone;
};

type InventorySummary = {
  totalStock: number;
  lowStock: number;
  outOfStock: number;
  needsRestock: number;
};

// Applied to any element that renders variable-length text (patient
// complaints, AI summaries, alert messages, etc.) so a single very long,
// space-less string can never blow out the page width.
const wrapText: CSSProperties = {
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

function numberValue(value: any): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatFullDate(value: string | undefined, lang: any) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const locale = lang === "tag" ? "fil-PH" : "en-PH";

  return date.toLocaleString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getGreeting(lang: any) {
  const hour = new Date().getHours();

  if (hour < 12) return t("dash_greeting_morning", lang);
  if (hour < 18) return t("dash_greeting_afternoon", lang);
  return t("dash_greeting_evening", lang);
}

function normalizeRisk(level?: string) {
  const risk = String(level || "low").toLowerCase();

  if (risk === "critical") return "critical";
  if (risk === "high") return "high";
  if (risk === "moderate") return "moderate";
  return "low";
}

function riskColor(level?: string) {
  switch (normalizeRisk(level)) {
    case "critical":
      return { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5", fill: COLORS.danger };
    case "high":
      return { bg: "#FFEDD5", color: "#9A3412", border: "#FDBA74", fill: "#F97316" };
    case "moderate":
      return { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A", fill: COLORS.warning };
    default:
      return { bg: "#DCFCE7", color: "#166534", border: "#BBF7D0", fill: COLORS.success };
  }
}

function statusColor(level?: string) {
  switch (level) {
    case "critical":
      return { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" };
    case "warning":
      return { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" };
    case "healthy":
      return { bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" };
    default:
      return { bg: "#F8FAFC", color: "#334155", border: "#E2E8F0" };
  }
}

function translateStatus(status: string | undefined, lang: any) {
  const key = String(status || "default").toLowerCase().replace(/\s+/g, "_");
  return t(`status_${key}`, lang);
}

function translateRisk(level: string | undefined, lang: any) {
  return t(`dash_${normalizeRisk(level)}`, lang);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const lang = useLangStore((state) => state.lang);
  const toast = useToast();

  const [dashboard, setDashboard] = useState<RealtimeDashboardData | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [risk, setRisk] = useState<HeatmapPoint[]>([]);
  const [alerts, setAlerts] = useState<OutbreakAlert[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpReminder[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlerts>({
    low_stock: [],
    expiring_soon: [],
    out_of_stock: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Healthcare-dashboard IA (COVID-dashboard reference): a lean OVERVIEW tab
  // holds only the essentials (4 key metrics, top-3 priority actions, one
  // status chart, 3 recent activities); everything else lives behind the
  // Queue / Reports / Analytics tabs. Nothing was removed — only relocated.
  const [dashTab, setDashTab] = useState<"overview" | "queue" | "reports" | "analytics">("overview");

  // Priority Action Center shows only the top 3 by default ("View all"
  // expands) so the overview never floods with alerts.
  const [showAllActions, setShowAllActions] = useState(false);

  async function loadDashboard(isSilent = false) {
    if (!isSilent) setLoading(true);

    setRefreshing(true);
    setError(null);

    try {
      const [
        dashData,
        heatmapData,
        riskData,
        alertData,
        followUpData,
        inventoryData,
        inventoryAlertData,
      ] = await Promise.all([
        fetchRealtimeDashboard(),
        fetchQueueHeatmap(),
        fetchBarangayRisk(),
        fetchOutbreakAlerts(),
        getFollowUps({ per_page: 20 }),
        getInventory({ type: "all" }),
        getInventoryAlerts(),
      ]);

      setDashboard(dashData);
      setHeatmap(heatmapData);
      setRisk(riskData);
      setAlerts(alertData);
      setFollowUps(followUpData);
      setInventoryItems(inventoryData);
      setInventoryAlerts(inventoryAlertData);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.message || t("dash_error_fallback", lang)
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // Manual refresh only — there is intentionally no setInterval/auto-refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onResolveAlert(id: string | number) {
    try {
      await resolveOutbreakAlert(id);
      await loadDashboard(true);
      toast.success(t("dash_alert_resolved", lang));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || t("dash_alert_resolve_failed", lang));
    }
  }

  const cards = dashboard?.cards;

  const topComplaintData: ChartPoint[] = useMemo(
    () =>
      (dashboard?.top_complaints ?? []).slice(0, 6).map((item: any) => ({
        label: String(item.complaint || item.chief_complaint || t("dash_unspecified", lang)),
        value: numberValue(item.total ?? item.count ?? item.total_cases),
        subtitle: t("dash_cases", lang),
      })),
    [dashboard?.top_complaints, lang]
  );

  const topBarangayData: ChartPoint[] = useMemo(
    () =>
      (dashboard?.top_barangays ?? []).slice(0, 6).map((item: any) => ({
        label: String(item.barangay || t("dash_unspecified", lang)),
        value: numberValue(item.total ?? item.count ?? item.total_cases),
        subtitle: t("dash_consultations", lang),
      })),
    [dashboard?.top_barangays, lang]
  );

  const queueChartData: ChartPoint[] = useMemo(
    () =>
      (dashboard?.queue_summary ?? []).slice(0, 6).map((item: any) => ({
        label: translateStatus(item.status, lang),
        value: numberValue(item.total),
        subtitle: `${numberValue(item.avg_wait_minutes)} ${t("dash_mins_avg", lang)}`,
        tone: item.status === "waiting" ? "warning" : "default",
      })),
    [dashboard?.queue_summary, lang]
  );

  const serviceLoadData: ChartPoint[] = useMemo(
    () => [
      {
        label: t("dash_service_appointments", lang),
        value: numberValue(cards?.appointments_today),
        subtitle: t("dash_today", lang),
      },
      {
        label: t("dash_service_consultations", lang),
        value: numberValue(cards?.open_consultations) + numberValue(cards?.completed_consultations),
        subtitle: t("dash_records", lang),
      },
      {
        label: t("dash_service_telemedicine", lang),
        value: numberValue(dashboard?.telemedicine_summary?.total ?? cards?.pending_telemedicine),
        subtitle: t("dash_records", lang),
      },
      {
        label: t("dash_service_queue", lang),
        value: (dashboard?.queue_summary ?? []).reduce(
          (sum: number, item: any) => sum + numberValue(item.total),
          0
        ),
        subtitle: t("dash_tickets", lang),
      },
    ],
    [cards, dashboard?.queue_summary, dashboard?.telemedicine_summary?.total, lang]
  );

  const upcomingFollowUps = useMemo(() => {
    return [...followUps]
      .filter((item) => !["cancelled", "completed"].includes(String(item.status || "").toLowerCase()))
      .sort((a, b) => followUpTimestamp(a) - followUpTimestamp(b))
      .slice(0, 6);
  }, [followUps]);

  // Key-metric card: open follow-up reminders + how many are already overdue.
  const followUpStats = useMemo(() => {
    const open = followUps.filter(
      (item) => !["cancelled", "completed"].includes(String(item.status || "").toLowerCase())
    );
    const overdue = open.filter((item) => followUpTimestamp(item) < Date.now()).length;

    return { due: open.length, overdue };
  }, [followUps]);

  const inventorySummary: InventorySummary = useMemo(() => {
    const totalStock = inventoryItems.reduce(
      (sum, item) => sum + numberValue(item.current_stock ?? item.qty),
      0
    );
    const lowStock = inventoryAlerts.low_stock.length;
    const outOfStock =
      inventoryAlerts.out_of_stock.length ||
      inventoryItems.filter((item) => numberValue(item.current_stock ?? item.qty) <= 0).length;

    return {
      totalStock,
      lowStock,
      outOfStock,
      needsRestock: Math.max(lowStock, 0) + Math.max(outOfStock, 0),
    };
  }, [inventoryAlerts.low_stock, inventoryAlerts.out_of_stock, inventoryItems]);

  const criticalInventoryItems = useMemo(() => {
    const byId = new Map<number, InventoryItem>();

    [...inventoryAlerts.out_of_stock, ...inventoryAlerts.low_stock].forEach((item) => {
      byId.set(item.id, item);
    });

    if (byId.size === 0) {
      inventoryItems
        .filter((item) => ["out", "low"].includes(item.status))
        .forEach((item) => byId.set(item.id, item));
    }

    return Array.from(byId.values()).slice(0, 6);
  }, [inventoryAlerts.low_stock, inventoryAlerts.out_of_stock, inventoryItems]);

  // Prefer live queue/case heatmap data; fall back to the barangay risk feed
  // so the widget still shows something useful before any consultations
  // have been logged today.
  const heatmapRows = useMemo(() => {
    const source = heatmap.length > 0 ? heatmap : risk;

    return [...source]
      .sort((a: any, b: any) => {
        const scoreA =
          numberValue(a.heatmap_intensity) + numberValue(a.total_cases) + numberValue(a.queue_density);
        const scoreB =
          numberValue(b.heatmap_intensity) + numberValue(b.total_cases) + numberValue(b.queue_density);
        return scoreB - scoreA;
      })
      .slice(0, 8);
  }, [heatmap, risk]);

  // Proactive AI insights derived ONLY from data already fetched above — no
  // extra API calls, no fabricated numbers. See src/lib/aiInsights.ts.
  const aiInsights = useMemo(
    () =>
      buildDashboardInsights({
        cards,
        queueSummary: dashboard?.queue_summary ?? [],
        barangayRisk: heatmap.length > 0 ? heatmap : risk,
        followUps,
        inventoryItems,
        inventoryAlerts,
        telemedicinePending: numberValue(
          dashboard?.telemedicine_summary?.total ?? cards?.pending_telemedicine
        ),
      }),
    [
      cards,
      dashboard?.queue_summary,
      dashboard?.telemedicine_summary?.total,
      heatmap,
      risk,
      followUps,
      inventoryItems,
      inventoryAlerts,
    ]
  );

  if (loading && !dashboard) {
    return (
      <div className="ka-dash">
        <GlobalDashboardStyles />
        <div style={{ ...cardStyle, fontSize: 16 }}>{t("loading_dashboard", lang)}</div>
      </div>
    );
  }

  return (
    <div className="ka-dash" style={{ display: "grid", gap: 18, paddingBottom: 12 }}>
      <GlobalDashboardStyles />

      <HeroCard
        lang={lang}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={() => loadDashboard()}
      />

      {error && (
        <div style={errorStyle} className="ka-wrap">
          {error}
        </div>
      )}

      <ShiftSummaryStrip dashboard={dashboard} />

      {/* Healthcare-dashboard IA (COVID-dashboard reference pattern, on top of
          the AMIA / Rabiei et al. grounding from the prior round): Overview =
          4 key metrics + top-3 priority actions + ONE status chart + 3 recent
          activities; Queue / Reports / Analytics tabs hold the drill-down.
          Nothing was removed — only relocated behind tabs. */}
      <ModuleTabs
        tabs={[
          { key: "overview", label: "Overview" },
          {
            key: "queue",
            label: "Queue",
            badge: cards?.waiting_queue || undefined,
          },
          { key: "reports", label: "Reports" },
          {
            key: "analytics",
            label: "Analytics",
            badge: alerts.length || undefined,
          },
        ]}
        active={dashTab}
        onChange={(key) => setDashTab(key as typeof dashTab)}
      />

      {dashTab === "overview" ? (
      <>
      {/* Quick actions — compact pills instead of a full card grid. */}
      <section style={quickPillRowStyle} aria-label={t("dash_quick_actions", lang)}>
        <button type="button" style={quickPillStyle} className="ka-btn" onClick={() => navigate("/users?mode=add-patient")}>
          <UserPlus size={15} color={COLORS.primary} />
          {t("dash_add_patient", lang)}
        </button>
        <button type="button" style={quickPillStyle} className="ka-btn" onClick={() => navigate("/queue")}>
          <Clock size={15} color="#EA580C" />
          {t("dash_manage_queue", lang)}
        </button>
        <button type="button" style={quickPillStyle} className="ka-btn" onClick={() => navigate("/appointments")}>
          <CalendarDays size={15} color="#4F46E5" />
          {t("dash_open_appointments", lang)}
        </button>
        <button type="button" style={quickPillStyle} className="ka-btn" onClick={() => navigate("/prescriptions")}>
          <Pill size={15} color="#2563EB" />
          {t("dash_create_prescription", lang)}
        </button>
        <button type="button" style={quickPillStyle} className="ka-btn" onClick={() => navigate("/sms")}>
          <Megaphone size={15} color="#7C3AED" />
          {t("dash_send_sms", lang)}
        </button>
      </section>

      {/* KEY METRICS — exactly 4 color-coded cards (blue appointments, amber
          queue, teal follow-ups, purple telemedicine). */}
      <section style={{ display: "grid", gap: 12 }}>
        <div style={kpiGridStyle}>
          <StatCard
            title={t("kpi_appointments_today", lang)}
            value={cards?.appointments_today ?? 0}
            icon={CalendarDays}
            color="#3B82F6"
            bg="#EFF6FF"
            subtitle={t("dash_scheduled_today", lang)}
          />

          <StatCard
            title={t("kpi_waiting_queue", lang)}
            value={cards?.waiting_queue ?? 0}
            icon={Clock}
            color="#F59E0B"
            bg="#FFF7ED"
            subtitle={t("dash_needs_queue", lang)}
          />

          <StatCard
            title="Follow-ups Due"
            value={followUpStats.due}
            icon={Stethoscope}
            color="#0D9488"
            bg="#F0FDFA"
            subtitle={
              followUpStats.overdue > 0
                ? `${followUpStats.overdue} overdue — check first`
                : "None overdue"
            }
          />

          <StatCard
            title={t("kpi_telemedicine_pending", lang)}
            value={cards?.pending_telemedicine ?? 0}
            icon={Video}
            color="#A855F7"
            bg="#F5F3FF"
            subtitle={t("dash_remote_attention", lang)}
          />
        </div>

        {/* Secondary metrics — relocated, not removed. */}
        <div style={miniMetricRowStyle}>
          <span style={miniMetricPillStyle}>
            <Users size={14} color={COLORS.success} />
            {t("kpi_total_patients", lang)}: <strong>{cards?.patients ?? 0}</strong>
          </span>
          <span style={miniMetricPillStyle}>
            <Stethoscope size={14} color={COLORS.primary} />
            {t("kpi_open_consultations", lang)}: <strong>{cards?.open_consultations ?? 0}</strong>
          </span>
          <span
            style={{
              ...miniMetricPillStyle,
              ...(numberValue(cards?.low_inventory) > 0
                ? { borderColor: "#FECACA", background: "#FEF2F2", color: "#991B1B" }
                : null),
            }}
          >
            <PackageX size={14} color={COLORS.danger} />
            {t("dash_low_stock", lang)}: <strong>{cards?.low_inventory ?? 0}</strong>
          </span>
        </div>
      </section>

      {/* PRIORITY ACTIONS — top 3 only; the rest behind "View all". */}
      <PriorityActionCenter
        actions={
          showAllActions
            ? dashboard?.priority_actions ?? []
            : (dashboard?.priority_actions ?? []).slice(0, 3)
        }
        onAction={(url) => navigate(url)}
      />
      {(dashboard?.priority_actions?.length ?? 0) > 3 ? (
        <button
          type="button"
          className="ka-btn"
          onClick={() => setShowAllActions((current) => !current)}
          style={viewAllActionsStyle}
        >
          {showAllActions
            ? "Show top 3 only"
            : `View all alerts (${dashboard?.priority_actions?.length}) →`}
        </button>
      ) : null}

      {/* STATUS OVERVIEW — one chart, plus 3 recent activities. */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <HorizontalBarCard
          title={t("dash_queue_status", lang)}
          data={queueChartData}
          emptyText={t("dash_no_chart_data", lang)}
        />

        <CardPanel
          title="Recent activity"
          actionLabel={t("dash_view_all", lang)}
          onAction={() => setDashTab("queue")}
        >
          {dashboard?.recent_consultations?.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {dashboard.recent_consultations.slice(0, 3).map((item: any) => {
                const mapping = getConsultationMapping(item);
                return (
                  <div key={item.id} style={recentActivityRowStyle}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong className="ka-wrap" style={{ color: COLORS.textDark, fontSize: 14 }}>
                        {item.patient_name || item.full_name || `Patient #${item.id}`}
                      </strong>
                      <div className="ka-wrap ka-clamp-2" style={{ color: COLORS.textMuted, fontSize: 12.5, marginTop: 2 }}>
                        {item.chief_complaint || item.complaint || item.diagnosis || t("dash_no_complaint", lang)}
                      </div>
                    </div>
                    <StatusBadge label={mapping.lifecycle.label} tone={mapping.lifecycle.tone} size="sm" />
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty text={t("dash_no_recent_consults", lang)} />
          )}
        </CardPanel>
      </section>
      </>
      ) : null}

      {dashTab === "analytics" ? (
        <AiInsightsPanel insights={aiInsights} onAction={(url) => navigate(url)} />
      ) : null}

      {dashTab === "queue" ? (
      <>
      <h2 style={sectionHeadingStyle}>Operations</h2>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 16,
        }}
      >
        <CardPanel
          title={t("dash_todays_queue", lang)}
          actionLabel={t("dash_manage", lang)}
          onAction={() => navigate("/queue")}
        >
          {dashboard?.queue_summary?.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {dashboard.queue_summary.map((item: any) => (
                <MiniInfoRow
                  key={item.status}
                  title={translateStatus(item.status, lang)}
                  subtitle={t("dash_case_count", lang, { count: item.total ?? 0 })}
                  rightText={`${item.avg_wait_minutes ?? 0} ${t("dash_mins_avg", lang)}`}
                  status={item.status === "waiting" ? "warning" : "default"}
                />
              ))}
            </div>
          ) : (
            <Empty text={t("dash_no_queue", lang)} />
          )}
        </CardPanel>

        <CardPanel
          title={t("dash_recent_consultations", lang)}
          actionLabel={t("dash_view_all", lang)}
          onAction={() => navigate("/consultations")}
        >
          {dashboard?.recent_consultations?.length ? (
            /* Part 3a — compact table instead of stacked badge cards: the same
               patient / complaint / lifecycle information in roughly a third
               of the vertical space. */
            <div style={{ overflowX: "auto" }}>
              <table style={dashTableStyle}>
                <thead>
                  <tr>
                    <th style={dashThStyle}>Patient</th>
                    <th style={dashThStyle}>Complaint</th>
                    <th style={dashThStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recent_consultations.slice(0, 6).map((item: any) => {
                    const mapping = getConsultationMapping(item);
                    return (
                      <tr key={item.id}>
                        <td style={dashTdStyle}>
                          <strong className="ka-wrap">
                            {item.patient_name || item.full_name || `Patient #${item.id}`}
                          </strong>
                        </td>
                        <td style={dashTdStyle}>
                          <span className="ka-wrap ka-clamp-2" style={{ color: COLORS.textMuted, fontWeight: 700 }}>
                            {item.chief_complaint ||
                              item.complaint ||
                              item.diagnosis ||
                              item.assessment ||
                              t("dash_no_complaint", lang)}
                          </span>
                        </td>
                        <td style={dashTdStyle}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            <StatusBadge label={mapping.lifecycle.label} tone={mapping.lifecycle.tone} size="sm" />
                            <StatusBadge label={mapping.queue.label} tone={mapping.queue.tone} size="sm" />
                            <StatusBadge label={mapping.stage.label} tone={mapping.stage.tone} size="sm" />
                            <StatusBadge label={mapping.soap.label} tone={mapping.soap.tone} size="sm" />
                            <StatusBadge label={mapping.afterCare.label} tone={mapping.afterCare.tone} size="sm" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text={t("dash_no_recent_consults", lang)} />
          )}
        </CardPanel>

        <CardPanel
          title={t("dash_upcoming_followups", lang)}
          actionLabel={t("dash_view_all", lang)}
          onAction={() => navigate("/follow-up")}
        >
          {upcomingFollowUps.length ? (
            /* Part 3a — compact table replacing the tall follow-up cards; the
               reason/contact details stay as a sub-line, nothing is dropped. */
            <div style={{ overflowX: "auto" }}>
              <table style={dashTableStyle}>
                <thead>
                  <tr>
                    <th style={dashThStyle}>Patient</th>
                    <th style={dashThStyle}>Schedule</th>
                    <th style={dashThStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingFollowUps.map((item) => {
                    const badge = followUpBadge(item, lang);
                    const badgeStyle = statusColor(badge.tone);
                    return (
                      <tr key={item.id}>
                        <td style={dashTdStyle}>
                          <strong className="ka-wrap">{followUpPatientName(item)}</strong>
                          <div className="ka-wrap ka-clamp-2" style={{ color: COLORS.textMuted, fontSize: 12.5, marginTop: 2 }}>
                            {item.reason || item.instructions || t("dash_no_followup_reason", lang)}
                          </div>
                          {item.mobile_number ? (
                            <div style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 800, marginTop: 2 }}>
                              {item.mobile_number}
                            </div>
                          ) : null}
                        </td>
                        <td style={dashTdStyle}>
                          <span
                            style={{
                              ...smallPillStyle,
                              color: badgeStyle.color,
                              background: badgeStyle.bg,
                              borderColor: badgeStyle.border,
                            }}
                          >
                            {badge.label}
                          </span>
                          <div className="ka-wrap" style={{ color: COLORS.textMuted, fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>
                            {formatFullDate(item.follow_up_at || item.follow_up_date || item.follow_up_start_date || "", lang)}
                            {item.follow_up_time ? `, ${String(item.follow_up_time).slice(0, 5)}` : ""}
                          </div>
                          <div className="ka-wrap" style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                            {followUpLocation(item)}
                          </div>
                        </td>
                        <td style={dashTdStyle}>
                          <button
                            type="button"
                            onClick={() =>
                              item.consultation_id
                                ? navigate(`/consultations/${item.consultation_id}`)
                                : navigate("/consultations")
                            }
                            style={secondaryButton}
                            className="ka-btn"
                          >
                            {t("dash_view_consultation", lang)}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text={t("dash_no_followups_today", lang)} />
          )}
        </CardPanel>

        <CardPanel
          title={t("dash_important_alerts", lang)}
          actionLabel={t("dash_view_all", lang)}
          onAction={() => navigate("/inventory")}
        >
          <p style={dashAttentionHelpStyle}>
            Check this first each shift. Items in <strong>orange/red need action</strong>{" "}
            (open the module to handle them); green items are clear.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            <AlertListItem
              icon={AlertTriangle}
              tone={alerts.length > 0 ? "warning" : "healthy"}
              title={
                alerts.length > 0
                  ? t("dash_active_alerts", lang, { count: alerts.length })
                  : t("dash_no_system_alerts", lang)
              }
              subtitle={
                alerts.length > 0 ? t("dash_alert_monitoring", lang) : t("dash_all_clear", lang)
              }
            />

            <AlertListItem
              icon={Video}
              tone={(cards?.pending_telemedicine ?? 0) > 0 ? "warning" : "healthy"}
              title={t("dash_pending_telemedicine", lang, { count: cards?.pending_telemedicine ?? 0 })}
              subtitle={t("dash_telemedicine_attention", lang)}
            />

            <AlertListItem
              icon={PackageX}
              tone={(cards?.low_inventory ?? 0) > 0 ? "critical" : "healthy"}
              title={t("dash_low_stock_item", lang, { count: cards?.low_inventory ?? 0 })}
              subtitle={t("dash_inventory_low", lang)}
            />
          </div>
        </CardPanel>
      </section>
      </>
      ) : null}

      {dashTab === "reports" ? (
      <section style={cardStyle} className="ka-card">
        <SectionHeader
          icon={BarChart3}
          title={t("dash_realtime_reports", lang)}
          subtitle={t("dash_realtime_reports_subtitle", lang)}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
            gridAutoColumns: "minmax(280px, 1fr)",
            gap: 16,
            marginTop: 16,
          }}
        >
          <div style={analyticsGridStyle}>
            <HorizontalBarCard
              title={t("dash_top_complaints", lang)}
              data={topComplaintData}
              emptyText={t("dash_no_chart_data", lang)}
            />

            <HorizontalBarCard
              title={t("dash_barangay_consultations", lang)}
              data={topBarangayData}
              emptyText={t("dash_no_chart_data", lang)}
            />

            <HorizontalBarCard
              title={t("dash_queue_status", lang)}
              data={queueChartData}
              emptyText={t("dash_no_chart_data", lang)}
            />

            <HorizontalBarCard
              title={t("dash_service_load", lang)}
              data={serviceLoadData}
              emptyText={t("dash_no_chart_data", lang)}
            />
          </div>
        </div>

        <button
          type="button"
          className="ka-btn"
          onClick={() => navigate("/reports")}
          style={{ ...viewAllActionsStyle, marginTop: 14 }}
        >
          Open the full Reports page →
        </button>
      </section>
      ) : null}

      {dashTab === "analytics" ? (
      <>
      <h2 style={sectionHeadingStyle}>Health monitoring</h2>

      <CardPanel title={t("dash_heatmap_title", lang)}>
        <SectionHeader
          icon={MapIcon}
          title={t("dash_heatmap_activity", lang)}
          subtitle={t("dash_heatmap_subtitle", lang)}
          compact
        />

        <MiniChoroplethMap points={heatmapRows} lang={lang} onViewFullMap={() => navigate("/heatmap-analytics")} />
      </CardPanel>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <CardPanel title={t("dash_outbreak_alerts", lang)}>
          {alerts.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {alerts.map((a) => {
                const message = a.trigger_message || a.message || t("alert_default", lang);

                return (
                  <div
                    key={a.id}
                    style={{
                      border: "1px solid #FECACA",
                      background: "#FEF2F2",
                      borderRadius: 14,
                      padding: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 14,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: "#991B1B", fontWeight: 900, marginBottom: 4 }}>
                        {a.barangay || a.disease_type || t("alert_fallback_title", lang)}
                      </div>

                      <div className="ka-clamp-3 ka-wrap" style={{ color: "#7F1D1D", lineHeight: 1.55, fontSize: 15 }}>
                        {message}
                      </div>
                    </div>

                    <button onClick={() => onResolveAlert(a.id)} style={secondaryButton} className="ka-btn">
                      <CheckCircle2 size={15} />
                      {t("dash_resolve", lang)}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty text={t("empty_no_active_alerts", lang)} />
          )}
        </CardPanel>

        <CardPanel title={t("dash_inventory_alerts", lang)}>
          <div style={inventorySummaryGridStyle}>
            <MiniInventoryStat label={t("dash_total_stock", lang)} value={inventorySummary.totalStock} />
            <MiniInventoryStat label={t("dash_low_stock", lang)} value={inventorySummary.lowStock} tone="warning" />
            <MiniInventoryStat label={t("dash_out_of_stock", lang)} value={inventorySummary.outOfStock} tone="critical" />
            <MiniInventoryStat label={t("dash_needs_restock", lang)} value={inventorySummary.needsRestock} tone="warning" />
          </div>

          {criticalInventoryItems.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {criticalInventoryItems.map((item) => (
                <MiniInfoRow
                  key={item.id}
                  title={item.name}
                  subtitle={`${t("inv_th_reorder", lang)}: ${item.reorder_point ?? item.reorder ?? item.minimum_stock_level}`}
                  rightText={`${item.current_stock ?? item.qty} ${item.unit ?? item.unit_of_measure ?? t("dash_left", lang)}`}
                  status={inventoryTone(item)}
                />
              ))}
            </div>
          ) : (
            <Empty text={t("empty_no_low_stock", lang)} />
          )}
        </CardPanel>
      </section>

      <button
        type="button"
        className="ka-btn"
        onClick={() => navigate("/analytics")}
        style={viewAllActionsStyle}
      >
        View detailed Analytics →
      </button>
      </>
      ) : null}
    </div>
  );
}

// ── Hero (merged welcome + live status + refresh + simple guide) ──────────────

function HeroCard({
  lang,
  lastUpdated,
  refreshing,
  onRefresh,
}: {
  lang: any;
  lastUpdated: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section
      className="ka-card ka-fade-in"
      style={{
        ...cardStyle,
        padding: 0,
        overflow: "hidden",
        background: "linear-gradient(135deg, #ECFDF5 0%, #F0FDFA 45%, #EFF6FF 100%)",
        border: "1px solid #D1FAE5",
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "14px 20px", flexWrap: "wrap" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "#FFFFFF",
            border: "1px solid rgba(15,118,110,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 16px 30px rgba(15,118,110,0.13)",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <img
            src={DASHBOARD_ICON}
            alt={t("dash_mascot_alt", lang)}
            style={{ width: "120%", height: "120%", objectFit: "contain", display: "block" }}
          />
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ka-wrap" style={{ fontSize: 16, fontWeight: 900, color: COLORS.primary, marginBottom: 6 }}>
            {getGreeting(lang)}, RHU Staff! 👋
          </div>

          <h1 className="ka-hero-title ka-wrap" style={{ margin: 0, fontSize: "clamp(19px, 2.2vw, 24px)", lineHeight: 1.15, color: COLORS.textDark, fontWeight: 950 }}>
            {t("dash_title", lang)}
          </h1>

          <p className="ka-wrap" style={{ margin: "4px 0 0", color: "#475569", lineHeight: 1.5, fontSize: 13.5, maxWidth: 760 }}>
            {t("dash_subtitle", lang)}
          </p>
        </div>

        <div style={heroActionPanelStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 900 }}>
              {t("dash_current_datetime", lang)}
            </div>
            <div className="ka-wrap" style={{ color: COLORS.textDark, fontWeight: 950, marginTop: 4 }}>
              {formatFullDate(new Date().toISOString(), lang)}
            </div>
            <div className="ka-wrap" style={{ color: COLORS.textMuted, fontSize: 12.5, marginTop: 4 }}>
              {t("dash_last_refreshed", lang)}: {formatFullDate(lastUpdated, lang)}
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="ka-btn"
            style={{
              ...primarySoftButton,
              flexShrink: 0,
              opacity: refreshing ? 0.75 : 1,
              cursor: refreshing ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCcw size={16} />
            {refreshing ? t("refreshing", lang) : t("dash_refresh", lang)}
          </button>
        </div>

      </div>
    </section>
  );
}

function MiniOverviewStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 64,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: `${color}1A`,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={19} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="ka-wrap" style={{ fontSize: 22, fontWeight: 950, color: COLORS.textDark, lineHeight: 1 }}>
          {value}
        </div>
        <div className="ka-wrap" style={{ fontSize: 13, fontWeight: 800, color: COLORS.textMuted }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function GuideChip({ text }: { text: string }) {
  return (
    <span
      className="ka-wrap"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "#ECFDF5",
        border: "1px solid #A7F3D0",
        color: "#065F46",
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 800,
        lineHeight: 1.4,
      }}
    >
      <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
      {text}
    </span>
  );
}

// ── KPI cards ───────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bg,
  subtitle,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
  bg: string;
  subtitle?: string;
}) {
  return (
    <div style={{ ...cardStyle, minHeight: 168 }} className="ka-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ka-wrap" style={{ color: COLORS.textMuted, fontSize: 14, fontWeight: 900 }}>
            {title}
          </div>

          <div style={{ color: COLORS.textDark, fontSize: 40, lineHeight: 1, fontWeight: 950, marginTop: 10 }}>
            {value}
          </div>

          {subtitle && (
            <div className="ka-wrap" style={{ marginTop: 10, color: COLORS.textMuted, fontSize: 13, fontWeight: 800, lineHeight: 1.4 }}>
              {subtitle}
            </div>
          )}
        </div>

        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: bg,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}

// ── Quick actions ───────────────────────────────────────────────────────────

function ActionCard({
  title,
  description,
  icon: Icon,
  iconBg,
  iconColor,
  onClick,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ka-card ka-btn"
      style={{
        ...cardStyle,
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 14,
        minHeight: 80,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: iconBg,
          color: iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={26} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="ka-wrap" style={{ color: COLORS.textDark, fontWeight: 950, fontSize: 18, lineHeight: 1.2 }}>
          {title}
        </div>

        <div className="ka-wrap" style={{ color: COLORS.textMuted, fontSize: 14, marginTop: 3, lineHeight: 1.4, fontWeight: 700 }}>
          {description}
        </div>
      </div>
    </button>
  );
}

// ── Generic panel / section building blocks ───────────────────────────────────

function CardPanel({
  title,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section style={cardStyle} className="ka-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <h2 className="ka-wrap" style={titleStyle}>
          {title}
        </h2>

        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="ka-btn"
            style={{
              border: "none",
              background: "transparent",
              color: COLORS.primary,
              fontWeight: 950,
              fontSize: 14,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: 36,
              padding: "6px 4px",
            }}
          >
            {actionLabel}
            <ChevronRight size={15} />
          </button>
        )}
      </div>

      {children}
    </section>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div
        style={{
          width: compact ? 38 : 44,
          height: compact ? 38 : 44,
          borderRadius: 14,
          background: "#ECFDF5",
          color: COLORS.primary,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={compact ? 18 : 22} />
      </div>

      <div style={{ minWidth: 0 }}>
        <h2 className="ka-wrap" style={compact ? compactTitleStyle : titleStyle}>
          {title}
        </h2>
        <p className="ka-wrap" style={subTextStyle}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function RecentConsultationRow({ item, lang }: { item: any; lang: any }) {
  const mapping = getConsultationMapping(item);
  const patientName = item.patient_name || item.full_name || `Patient #${item.id}`;
  const complaint =
    item.chief_complaint ||
    item.complaint ||
    item.diagnosis ||
    item.assessment ||
    t("dash_no_complaint", lang);

  return (
    <div style={recentConsultRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div className="ka-wrap" style={{ color: COLORS.textDark, fontWeight: 950, lineHeight: 1.3, fontSize: 15 }}>
          {patientName}
        </div>

        <div className="ka-wrap ka-clamp-2" style={{ color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5, fontSize: 14, fontWeight: 700 }}>
          {complaint}
        </div>

        <div style={recentBadgeWrapStyle}>
          <StatusBadge label={mapping.queue.label} tone={mapping.queue.tone} size="sm" />
          <StatusBadge label={mapping.stage.label} tone={mapping.stage.tone} size="sm" />
          <StatusBadge label={mapping.soap.label} tone={mapping.soap.tone} size="sm" />
          <StatusBadge label={mapping.afterCare.label} tone={mapping.afterCare.tone} size="sm" />
        </div>
      </div>

      <StatusBadge
        label={mapping.lifecycle.label}
        tone={mapping.lifecycle.tone}
        size="sm"
      />
    </div>
  );
}

function MiniInfoRow({
  title,
  subtitle,
  rightText,
  status = "default",
  clampSubtitle = false,
}: {
  title: string;
  subtitle?: string;
  rightText?: string;
  status?: Tone;
  clampSubtitle?: boolean;
}) {
  const tone = statusColor(status);

  return (
    <div
      style={{
        border: `1px solid ${tone.border}`,
        borderRadius: 14,
        padding: 14,
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
        background: status === "default" ? "#FFFFFF" : tone.bg,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="ka-wrap" style={{ color: COLORS.textDark, fontWeight: 950, lineHeight: 1.3, fontSize: 15 }}>
          {title}
        </div>

        {subtitle && (
          <div
            className={`ka-wrap${clampSubtitle ? " ka-clamp-2" : ""}`}
            style={{ color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5, fontSize: 14, fontWeight: 700 }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {rightText && (
        <span
          className="ka-wrap"
          style={{
            background: tone.bg,
            color: tone.color,
            border: `1px solid ${tone.border}`,
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 950,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {rightText}
        </span>
      )}
    </div>
  );
}

function followUpTimestamp(item: FollowUpReminder): number {
  const date = item.follow_up_at || `${item.follow_up_date || item.follow_up_start_date || ""}T${item.follow_up_time || "00:00"}`;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
}

function followUpBadge(item: FollowUpReminder, lang: any): { label: string; tone: Tone } {
  const timestamp = followUpTimestamp(item);
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(timestamp);
  target.setHours(0, 0, 0, 0);

  if (timestamp < now.getTime() && String(item.status || "").toLowerCase() !== "completed") {
    return { label: t("dash_overdue", lang), tone: "critical" };
  }

  if (target.getTime() === today.getTime()) {
    return { label: t("dash_today", lang), tone: "warning" };
  }

  return { label: t("dash_upcoming", lang), tone: "healthy" };
}

function followUpPatientName(item: FollowUpReminder): string {
  return (
    item.patient_name ||
    item.user?.full_name ||
    item.user?.name ||
    [item.user?.first_name, item.user?.last_name].filter(Boolean).join(" ") ||
    `Patient #${item.user_id ?? item.id}`
  );
}

function followUpLocation(item: FollowUpReminder): string {
  return (
    item.rhu?.name ||
    item.rhu?.barangay_name ||
    item.rhu?.label ||
    (item.rhu_id ? `RHU ${item.rhu_id}` : "RHU / clinic")
  );
}

function FollowUpRow({
  item,
  lang,
  onOpen,
}: {
  item: FollowUpReminder;
  lang: any;
  onOpen: () => void;
}) {
  const badge = followUpBadge(item, lang);
  const badgeStyle = statusColor(badge.tone);

  return (
    <div style={followUpRowStyle}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong className="ka-wrap" style={{ color: COLORS.textDark }}>
            {followUpPatientName(item)}
          </strong>
          <span style={{ ...smallPillStyle, color: badgeStyle.color, background: badgeStyle.bg, borderColor: badgeStyle.border }}>
            {badge.label}
          </span>
        </div>

        <div className="ka-wrap" style={{ color: COLORS.textMuted, marginTop: 6, fontSize: 14, lineHeight: 1.55, fontWeight: 700 }}>
          {t("dash_followup_date", lang)}: {formatFullDate(item.follow_up_at || item.follow_up_date || item.follow_up_start_date || "", lang)}
          {item.follow_up_time ? `, ${String(item.follow_up_time).slice(0, 5)}` : ""}
        </div>

        <div className="ka-wrap" style={{ color: COLORS.textMuted, marginTop: 3, fontSize: 14, lineHeight: 1.55, fontWeight: 700 }}>
          {t("dash_followup_location", lang)}: {followUpLocation(item)}
        </div>

        <div className="ka-wrap ka-clamp-2" style={{ color: "#475569", marginTop: 4, fontSize: 14, lineHeight: 1.5 }}>
          {item.reason || item.instructions || t("dash_no_followup_reason", lang)}
        </div>

        {item.mobile_number ? (
          <div style={{ color: COLORS.textMuted, marginTop: 4, fontSize: 13, fontWeight: 800 }}>
            {item.mobile_number}
          </div>
        ) : null}
      </div>

      <button type="button" onClick={onOpen} style={secondaryButton} className="ka-btn">
        {t("dash_view_consultation", lang)}
      </button>
    </div>
  );
}

function inventoryTone(item: InventoryItem): Tone {
  const stock = numberValue(item.current_stock ?? item.qty);
  if (stock <= 0 || item.status === "out") return "critical";
  if (item.status === "low" || stock <= numberValue(item.reorder_point ?? item.reorder ?? item.minimum_stock_level)) return "warning";
  return "healthy";
}

function MiniInventoryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: Tone;
}) {
  const styles = statusColor(tone);

  return (
    <div style={{ ...miniInventoryStatStyle, background: tone === "default" ? "#F8FAFC" : styles.bg, borderColor: styles.border }}>
      <strong style={{ color: styles.color }}>{value}</strong>
      <span className="ka-wrap">{label}</span>
    </div>
  );
}

function AlertListItem({
  icon: Icon,
  title,
  subtitle,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tone: "healthy" | "warning" | "critical";
}) {
  const styles = statusColor(tone);

  return (
    <div
      style={{
        border: `1px solid ${styles.border}`,
        borderRadius: 14,
        padding: 14,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: tone === "healthy" ? "#FFFFFF" : styles.bg,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          background: styles.bg,
          color: styles.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={20} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="ka-wrap" style={{ color: COLORS.textDark, fontWeight: 950, fontSize: 15 }}>
          {title}
        </div>

        <div className="ka-wrap" style={{ color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5, fontSize: 14, fontWeight: 700 }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

// ── Horizontal bar "Health Statistics" charts ──────────────────────────────────

function HorizontalBarCard({ title, data, emptyText }: { title: string; data: ChartPoint[]; emptyText: string }) {
  return (
    <section style={{ border: "1px solid #E5E7EB", borderRadius: 16, padding: 16, background: "#FFFFFF", minWidth: 0 }}>
      <h3 className="ka-wrap" style={{ margin: 0, color: COLORS.textDark, fontSize: 16, fontWeight: 950 }}>
        {title}
      </h3>

      <HorizontalBarChart data={data} emptyText={emptyText} />
    </section>
  );
}

function HorizontalBarChart({ data, emptyText }: { data: ChartPoint[]; emptyText: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));

  if (data.length === 0) return <Empty text={emptyText} />;

  return (
    <div style={{ display: "grid", gap: 13, marginTop: 16, minWidth: 0 }}>
      {data.map((item, index) => {
        const width = Math.max(8, (item.value / max) * 100);
        const tone = statusColor(item.tone || "default");

        return (
          <div key={`${item.label}-${index}`} style={{ minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, fontWeight: 900, color: "#334155", marginBottom: 7 }}>
              <span className="ka-wrap" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.label}>
                {item.label}
              </span>

              <span style={{ color: COLORS.textDark, whiteSpace: "nowrap", flexShrink: 0 }}>
                {item.value} {item.subtitle || ""}
              </span>
            </div>

            <div style={{ height: 14, background: "#E2E8F0", borderRadius: 999, overflow: "hidden", maxWidth: "100%" }}>
              <div
                style={{
                  height: "100%",
                  width: `${width}%`,
                  background: item.tone ? tone.color : COLORS.primary,
                  borderRadius: 999,
                  transition: "width 0.25s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Mini choropleth heatmap widget ─────────────────────────────────────────────

function MiniChoroplethMap({
  points,
  lang,
  onViewFullMap,
}: {
  points: HeatmapPoint[];
  lang: any;
  onViewFullMap: () => void;
}) {
  if (points.length === 0) {
    return (
      <div style={{ marginTop: 14 }}>
        <Empty text={t("dash_heatmap_empty", lang)} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
      <div
        style={{
          border: "1px solid #D1FAE5",
          borderRadius: 18,
          padding: 16,
          background: "radial-gradient(circle at top left, #ECFDF5 0%, #F8FAFC 45%, #FFFFFF 100%)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))", gridAutoColumns: "minmax(118px, 1fr)", gap: 12 }}>
          <div style={heatmapTileGridStyle}>
            {points.map((item, index) => {
              const color = riskColor(item.risk_level);
              const cases = numberValue((item as any).total_cases);
              const queueDensity = numberValue((item as any).queue_density);
              const topDisease =
                (item as any).top_complaint || (item as any).top_case_type || (item as any).disease_type;

              return (
                <div
                  key={`${item.barangay}-${index}`}
                  title={`${item.barangay}: ${cases} ${t("dash_cases", lang)} · ${queueDensity} ${t("dash_queue_status", lang)}${
                    topDisease ? ` · ${topDisease}` : ""
                  }`}
                  style={{
                    minHeight: 100,
                    padding: 12,
                    border: `2px solid ${color.border}`,
                    background: color.bg,
                    color: color.color,
                    clipPath: "polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%)",
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                    minWidth: 0,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="ka-wrap ka-clamp-1" style={{ fontSize: 14, fontWeight: 950, lineHeight: 1.2, color: color.color }}>
                      {item.barangay}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 22, lineHeight: 1, fontWeight: 950 }}>{cases}</div>

                    <div style={{ marginTop: 5, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      {translateRisk(item.risk_level, lang)}
                    </div>

                    {topDisease && (
                      <div className="ka-wrap ka-clamp-1" style={{ marginTop: 4, fontSize: 10, fontWeight: 700, opacity: 0.85 }}>
                        {topDisease}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <strong style={{ color: COLORS.textDark, marginRight: 4, fontSize: 13 }}>{t("dash_risk_legend", lang)}:</strong>

          {(["low", "moderate", "high", "critical"] as const).map((riskKey) => {
            const color = riskColor(riskKey);

            return (
              <span
                key={riskKey}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: `1px solid ${color.border}`,
                  background: color.bg,
                  color: color.color,
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 950,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 999, background: color.fill }} />
                {translateRisk(riskKey, lang)}
              </span>
            );
          })}
        </div>

        <button type="button" onClick={onViewFullMap} className="ka-btn" style={secondaryButton}>
          <MapIcon size={15} />
          {t("dash_view_full_map", lang)}
        </button>
      </div>
    </div>
  );
}

function Empty({ text = "No data yet." }: { text?: string }) {
  return (
    <div
      className="ka-wrap"
      style={{
        color: COLORS.textMuted,
        background: "#F8FAFC",
        border: "1px dashed #CBD5E1",
        borderRadius: 14,
        padding: 16,
        fontWeight: 800,
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}

// ── Shift summary + Priority Action Center ─────────────────────────────────────

function ShiftSummaryStrip({ dashboard }: { dashboard: RealtimeDashboardData | null }) {
  if (!dashboard) return null;

  const c = dashboard.cards;
  const q = dashboard.queue_snapshot;
  const f = dashboard.follow_ups;
  const w = dashboard.telemedicine_worklist;

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))",
        gap: 12,
      }}
    >
      <MiniOverviewStat label="Appointments today" value={numberValue(c.appointments_today)} icon={CalendarDays} color="#2563EB" />
      <MiniOverviewStat label="Waiting in queue" value={numberValue(q.waiting)} icon={Clock} color={COLORS.warning} />
      <MiniOverviewStat label="Follow-ups due / overdue" value={numberValue(f.due_today) + numberValue(f.overdue)} icon={Stethoscope} color={COLORS.primary} />
      <MiniOverviewStat label="Telemedicine to screen" value={numberValue(w.pending_screening)} icon={Video} color="#7C3AED" />
    </section>
  );
}

function priorityActionIcon(type: string): LucideIcon {
  switch (type) {
    case "telemedicine":
    case "soap":
      return Video;
    case "queue":
      return Clock;
    case "appointment":
      return CalendarDays;
    case "inventory":
      return PackageX;
    case "follow_up":
      return Stethoscope;
    default:
      return AlertTriangle;
  }
}

function priorityActionTone(priority: string): { bg: string; color: string; border: string } {
  switch (priority) {
    case "high":
      return { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" };
    case "medium":
      return { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" };
    default:
      return { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" };
  }
}

function PriorityActionCenter({
  actions,
  onAction,
}: {
  actions: PriorityAction[];
  onAction: (url: string) => void;
}) {
  if (!actions || actions.length === 0) {
    return (
      <section style={cardStyle} className="ka-card">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "#ECFDF5", color: "#047857", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <CheckCircle2 size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 className="ka-wrap" style={titleStyle}>Priority Action Center</h2>
            <p className="ka-wrap" style={subTextStyle}>All clear — no urgent items need action right now.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={cardStyle} className="ka-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="ka-wrap" style={titleStyle}>Priority Action Center</h2>
          <p className="ka-wrap" style={subTextStyle}>What needs your attention right now — most urgent first.</p>
        </div>

        <span
          style={{
            background: "#FEF2F2",
            color: "#B91C1C",
            border: "1px solid #FECACA",
            borderRadius: 999,
            padding: "6px 12px",
            fontSize: 13,
            fontWeight: 950,
            whiteSpace: "nowrap",
          }}
        >
          {actions.length} item{actions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(330px, 100%), 1fr))", gap: 12 }}>
        {actions.map((action, index) => {
          const Icon = priorityActionIcon(action.type);
          const tone = priorityActionTone(action.priority);

          return (
            <div
              key={`${action.type}-${index}`}
              style={{
                border: `1px solid ${tone.border}`,
                background: tone.bg,
                borderRadius: 16,
                padding: 14,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                minWidth: 0,
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "#FFFFFF", color: tone.color, display: "grid", placeItems: "center", flexShrink: 0, border: `1px solid ${tone.border}` }}>
                <Icon size={22} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong className="ka-wrap" style={{ color: COLORS.textDark, fontSize: 15, fontWeight: 950 }}>
                    {action.title}
                  </strong>
                  <span style={{ background: tone.color, color: "#FFFFFF", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>
                    {action.priority}
                  </span>
                </div>

                <div className="ka-wrap ka-clamp-2" style={{ color: COLORS.textMuted, marginTop: 5, fontSize: 14, lineHeight: 1.5, fontWeight: 700 }}>
                  {action.patient_name ? `${action.patient_name} — ` : ""}{action.description}
                </div>

                <button
                  type="button"
                  onClick={() => onAction(action.action_url)}
                  className="ka-btn"
                  style={{ ...secondaryButton, marginTop: 10 }}
                >
                  {action.action_label}
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// One small <style> block covers the handful of things inline styles can't
// do on their own: hover/lift feedback, fade-in entrance, multi-line text
// clamping (so a very long AI summary or alert message can never blow out
// the page width), and a couple of small-screen tweaks.
function GlobalDashboardStyles() {
  return (
    <style>{`
      .ka-dash, .ka-dash * { box-sizing: border-box; }
      .ka-dash { max-width: 100%; }
      .ka-card { transition: transform .18s ease, box-shadow .18s ease; }
      .ka-card:hover { transform: translateY(-2px); box-shadow: 0 14px 28px rgba(15,23,42,0.08); }
      .ka-btn { transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease; min-height: 44px; }
      .ka-btn:hover { transform: translateY(-1px); }
      .ka-btn:active { transform: translateY(0); }
      .ka-fade-in { animation: kaFadeIn .35s ease both; }
      @keyframes kaFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) {
        .ka-card, .ka-btn, .ka-fade-in { animation: none !important; transition: none !important; }
      }
      .ka-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
      .ka-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .ka-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      @media (max-width: 520px) {
        .ka-hero-title { font-size: 24px !important; }
      }
    `}</style>
  );
}

// ── Shared inline style objects ─────────────────────────────────────────────

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  minWidth: 0,
};

// Overview declutter — quick-action pills, secondary metric pills, view-all
// toggle, and compact recent-activity rows.
const quickPillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const quickPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: COLORS.textDark,
  fontWeight: 800,
  fontSize: 13.5,
  cursor: "pointer",
  boxShadow: "0 6px 14px rgba(15,23,42,.04)",
};

const miniMetricRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const miniMetricPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: COLORS.textMuted,
  fontWeight: 700,
  fontSize: 12.5,
};

const viewAllActionsStyle: CSSProperties = {
  justifySelf: "start",
  minHeight: 40,
  padding: "0 16px",
  borderRadius: 12,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: COLORS.primary,
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  marginTop: -6,
};

const recentActivityRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #F1F5F9",
  background: "#FFFFFF",
};

// Part 3a — compact in-card tables (Recent Consultations, Follow-ups).
const dashTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13.5,
};

const dashThStyle: CSSProperties = {
  textAlign: "left",
  padding: "7px 10px",
  borderBottom: "1px solid #E5E7EB",
  color: COLORS.textMuted,
  fontWeight: 900,
  fontSize: 11.5,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const dashTdStyle: CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #F1F5F9",
  color: COLORS.textDark,
  verticalAlign: "top",
};

const recentConsultRowStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  background: "#FFFFFF",
  minWidth: 0,
};

const recentBadgeWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 8,
};

const dashAttentionHelpStyle: CSSProperties = {
  margin: "0 0 12px",
  padding: "8px 12px",
  background: "#F0FDFA",
  border: "1px solid #CCFBF1",
  borderRadius: 10,
  color: "#0F766E",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const heroActionPanelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  justifyContent: "space-between",
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(15,118,110,0.14)",
  borderRadius: 16,
  padding: 14,
  minWidth: 260,
  maxWidth: 430,
  flex: "0 1 430px",
};

const followUpRowStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  background: "#FFFFFF",
  minWidth: 0,
  flexWrap: "wrap",
};

const smallPillStyle: CSSProperties = {
  border: "1px solid",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 950,
};

const inventorySummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const miniInventoryStatStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
  width: "100%",
};

const analyticsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  width: "100%",
};

const heatmapTileGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
  gap: 12,
  width: "100%",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 22,
  fontWeight: 950,
};

const compactTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 17,
  fontWeight: 950,
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 24,
  fontWeight: 950,
};

const subTextStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748B",
  fontSize: 14,
  lineHeight: 1.5,
  fontWeight: 700,
};

const primarySoftButton: CSSProperties = {
  border: "1px solid #A7F3D0",
  borderRadius: 12,
  padding: "12px 16px",
  minHeight: 48,
  background: "#ECFDF5",
  color: "#065F46",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const secondaryButton: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "10px 14px",
  minHeight: 44,
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  border: "1px solid #FCA5A5",
  color: "#991B1B",
  borderRadius: 16,
  padding: 14,
  fontWeight: 900,
  fontSize: 15,
};
