// src/pages/HeatmapAnalytics.tsx
//
// RHU Health Situation Map — operational redesign (visual pass only).
//
// One clear hierarchy (top to bottom):
//   1. Hero: title, range + active-signal + refresh controls, RHU focus chips,
//      five summary metrics, one shared risk legend, top-2 Barangay Watch.
//   2. RHU Facility Queue Overview: one card per RHU + event crowding +
//      recommended action + quick actions.
//   3. Operational maps SIDE-BY-SIDE: facility queue map (left) and barangay
//      disease heatmap with top-8 ranking + compact trend (right). One shared
//      RHU focus filter drives both.
//   4. Detailed diagnosis signals: collapsed by default (progressive
//      disclosure) — the full sortable table + export stays intact.
//
// Data: the SAME two requests as before (heatmap analytics + diagnosis/ITR
// signals) plus the facility queue feed. Every figure on this page derives
// from the shared page state — no duplicate fetching.
//
// NOTE: this pass only touches presentation (style objects + minor layout
// wrappers). State, effects, memoized computations, and handlers are
// unchanged from the previous version.

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  MapPinned,
  RefreshCw,
  Search,
  ShieldAlert,
  Siren,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import FacilityQueueHeatmapMap from "../components/FacilityQueueHeatmapMap";
import BarangayHeatmapPanel from "../components/heatmap/BarangayHeatmapPanel";
import RhuFilterChips, { type RhuFocus } from "../components/heatmap/RhuFilterChips";
import SortableTh from "../components/ui/SortableTh";
import { useSortableRows } from "../hooks/useSortableRows";
import { t } from "../i18n/translations";
import {
  downloadCsv,
  getHeatmapDiagnosisItrSignals,
  type CsvColumn,
  type HeatmapDiagnosisItrSignal,
} from "../services/analytics";
import {
  fetchFacilityHeatmapData,
  RHU_FACILITIES,
  type FacilityHeatmapData,
  type FacilityHeatmapFacility,
  type PressureLevel,
} from "../services/facilityHeatmap";
import {
  fetchHeatmapAnalytics,
  filterCasePoints,
  type HeatmapPoint,
} from "../services/heatmap";
import { useLangStore } from "../store/langStore";

// ── design tokens (presentation only — nothing below reads these as data) ──

const INK = "#0F172A";
const SLATE = "#334155";
const MUTED = "#64748B";
const FAINT = "#94A3B8";
const BORDER = "#E2E8F0";
const BORDER_STRONG = "#CBD5E1";
const SURFACE = "#FFFFFF";
const CANVAS = "#F8FAFC";
const ACCENT = "#0F766E";
const ACCENT_DARK = "#0B4F4A";
const ACCENT_SOFT_BG = "#F0FDFA";
const ACCENT_SOFT_BORDER = "#99F6E4";

const RADIUS_SM = 10;
const RADIUS_MD = 14;
const RADIUS_LG = 18;

type MetricTone = "teal" | "red" | "amber" | "blue";
type HeatmapWorkspace = "queue" | "barangay";
type BarangayWorkspaceView = "overview" | "trend" | "signals";

const HEATMAP_DASHBOARD_CSS = `
  .ka-signal-table tbody tr {
    transition: background .18s ease, box-shadow .18s ease;
  }
  .ka-signal-table tbody tr:hover {
    background: #F0FDFA !important;
    box-shadow: inset 3px 0 0 #0F766E;
  }
`;

// ── helpers ─────────────────────────────────────────────────────────────────

function formatTime(value?: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Colors match FacilityQueueHeatmapMap's levelColor() and
// MalasiquiHeatmapMap's riskColor() so the legend dot, badge, and map marker
// for the same risk level use one shared visual language.
const RISK_LEGEND: { key: string; label: string; fill: string }[] = [
  { key: "low", label: "Low", fill: "#10B981" },
  { key: "moderate", label: "Moderate", fill: "#D6A400" },
  { key: "high", label: "High", fill: "#E07A2F" },
  { key: "critical", label: "Critical / Cluster", fill: "#E5484D" },
];

function riskBadge(level?: string): React.CSSProperties {
  switch (String(level || "").toLowerCase()) {
    case "critical":
      return { background: "#FEE2E2", color: "#991B1B" };
    case "high":
      return { background: "#FFEDD5", color: "#9A3412" };
    case "moderate":
      return { background: "#FEF9C3", color: "#854D0E" };
    default:
      return { background: "#DCFCE7", color: "#166534" };
  }
}

function riskWatchTone(level?: string) {
  switch (String(level || "").toLowerCase()) {
    case "critical":
      return {
        accent: "#E5484D",
        background: "linear-gradient(135deg, #FFF7F7 0%, #FFFFFF 66%)",
        border: "#FCA5A5",
      };
    case "high":
      return {
        accent: "#E07A2F",
        background: "linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 68%)",
        border: "#FDBA74",
      };
    case "moderate":
      return {
        accent: "#D6A400",
        background: "linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 68%)",
        border: "#FDE68A",
      };
    default:
      return {
        accent: "#10B981",
        background: "linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 68%)",
        border: "#BBF7D0",
      };
  }
}

function metricToneStyle(tone: MetricTone): React.CSSProperties {
  switch (tone) {
    case "red":
      return { background: "#FFE4E6", color: "#E5484D" };
    case "amber":
      return { background: "#FEF3C7", color: "#D6A400" };
    case "blue":
      return { background: "#DBEAFE", color: "#2563EB" };
    default:
      return { background: "#CCFBF1", color: ACCENT };
  }
}

function riskRank(level?: string) {
  switch (String(level || "").toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "moderate":
      return 2;
    default:
      return 1;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function todayMinus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function heatmapSignalFilters(
  range: "week" | "month",
  disease: string,
  rhuId?: RhuFocus
) {
  return {
    date_from: todayMinus(range === "month" ? 30 : 7),
    date_to: todayIso(),
    diagnosis: disease.trim() || undefined,
    rhu_id: typeof rhuId === "number" ? rhuId : undefined,
  };
}

function signalAgeSex(row: HeatmapDiagnosisItrSignal): string {
  const age = row.age !== null && row.age !== undefined ? String(row.age) : "—";
  const sex = String(row.sex_gender || "").trim();

  if (age !== "—" && sex) return `${age} / ${sex}`;
  if (age !== "—") return age;
  return sex || "—";
}

function signalStatusStyle(fresh: boolean): React.CSSProperties {
  return fresh
    ? { background: "#DCFCE7", color: "#166534" }
    : { background: "#F1F5F9", color: "#475569" };
}

function emptyFacilityData(): FacilityHeatmapData {
  return {
    facilities: RHU_FACILITIES.map((facility) => ({
      ...facility,
      hasLiveQueueData: false,
      queueCount: 0,
      waitingCount: 0,
      inServiceCount: 0,
      priorityCount: 0,
      activeEventCount: 0,
      highestEventLevel: "low",
      congestionLevel: "low",
      label: t("hm_low_queue", useLangStore.getState().lang),
      suggestedAction: t("hm_no_live_queue", useLangStore.getState().lang),
      intensity: 0,
      events: [],
    })),
    events: [],
    lastUpdated: "",
    hasLiveQueueData: false,
  };
}

function levelRank(level?: string) {
  return riskRank(level);
}

function levelBadge(level?: PressureLevel): React.CSSProperties {
  return riskBadge(level);
}

// Curated columns for the barangay active-cases export.
const HEATMAP_CASES_CSV: CsvColumn[] = [
  { key: "barangay", label: "Barangay" },
  { key: "rhu_label", label: "RHU" },
  { key: "risk_level", label: "Risk Level" },
  { key: "risk_score", label: "Risk Score" },
  { key: "total_cases", label: "Total Cases" },
  { key: "queue_density", label: "Queue Density" },
  {
    key: "top_case_type",
    label: "Top Case / Complaint",
    format: (_value, row) => String(row.top_case_type || row.top_complaint || ""),
  },
];

// ── page ────────────────────────────────────────────────────────────────────

export default function HeatmapAnalytics() {
  const lang = useLangStore((state) => state.lang);
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [diagnosisSignals, setDiagnosisSignals] = useState<HeatmapDiagnosisItrSignal[]>(
    []
  );
  const [facilityHeatmap, setFacilityHeatmap] = useState<FacilityHeatmapData>(
    emptyFacilityData
  );
  const [range, setRange] = useState<"week" | "month">("week");
  const [activeOnly, setActiveOnly] = useState(true);
  const [focusRhu, setFocusRhu] = useState<RhuFocus>("all");
  const [disease, setDisease] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState("");
  const [showSignals, setShowSignals] = useState(false);
  const [activeWorkspace, setActiveWorkspace] =
    useState<HeatmapWorkspace>("queue");
  const [barangayView, setBarangayView] =
    useState<BarangayWorkspaceView>("overview");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [facilityError, setFacilityError] = useState("");

  const inFlightRef = useRef(false);

  async function load(silent = false) {
    if (inFlightRef.current) return;

    inFlightRef.current = true;

    if (!silent) setLoading(true);
    setRefreshing(true);
    setError("");

    try {
      const requestedRhu = typeof focusRhu === "number" ? focusRhu : undefined;

      const [response, signals] = await Promise.all([
        fetchHeatmapAnalytics({
          range,
          disease: disease.trim() || undefined,
          active_only: activeOnly,
          rhu_id: requestedRhu,
        }),
        getHeatmapDiagnosisItrSignals(
          heatmapSignalFilters(range, disease, focusRhu)
        ),
      ]);

      setPoints(response.data);
      setDiagnosisSignals(signals);
      setGeneratedAt(response.generated_at);
      setLastRefresh(new Date().toISOString());

      try {
        const facilityData = await fetchFacilityHeatmapData();
        setFacilityHeatmap(facilityData);
        setFacilityError("");
      } catch (facilityErr: any) {
        setFacilityError(
          facilityErr?.response?.data?.message ||
            facilityErr?.message ||
            t("hm_no_live_queue", lang)
        );
        setFacilityHeatmap(emptyFacilityData());
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load heatmap analytics."
      );
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, activeOnly, focusRhu]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = window.setInterval(() => {
      load(true);
    }, 30000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, range, activeOnly, disease, focusRhu]);

  const casePoints = useMemo(() => filterCasePoints(points), [points]);

  // RHU chip badge counts — barangays with active case signals per facility.
  const rhuCounts = useMemo(
    () => ({
      all: casePoints.length,
      rhu1: casePoints.filter((point) => point.rhu_id === 1).length,
      rhu2: casePoints.filter((point) => point.rhu_id === 2).length,
    }),
    [casePoints]
  );

  // The shared focus filter: drives both operational maps + the ranking.
  const focusPoints = useMemo(() => {
    if (focusRhu === "all") return casePoints;
    return casePoints.filter((point) => point.rhu_id === focusRhu);
  }, [casePoints, focusRhu]);

  const focusFacilities = useMemo(() => {
    if (focusRhu === "all") return facilityHeatmap.facilities;
    return facilityHeatmap.facilities.filter((facility) => facility.id === focusRhu);
  }, [facilityHeatmap.facilities, focusRhu]);

  const summary = useMemo(() => {
    const totalCases = casePoints.reduce(
      (sum, point) => sum + Number(point.total_cases ?? 0),
      0
    );

    const highRisk = casePoints.filter((point) =>
      ["high", "critical"].includes(String(point.risk_level).toLowerCase())
    ).length;

    const critical = casePoints.filter(
      (point) => String(point.risk_level).toLowerCase() === "critical"
    ).length;

    const queueLoad = facilityHeatmap.facilities.reduce(
      (sum, facility) => sum + Number(facility.waitingCount ?? 0),
      0
    );

    return {
      barangays: points.length,
      totalCases,
      queueLoad,
      highRisk,
      critical,
    };
  }, [casePoints, points.length, facilityHeatmap.facilities]);

  const sortedRows = useMemo(() => {
    return [...focusPoints].sort((a, b) => {
      const levelDiff = riskRank(b.risk_level) - riskRank(a.risk_level);

      if (levelDiff !== 0) return levelDiff;

      return Number(b.risk_score ?? 0) - Number(a.risk_score ?? 0);
    });
  }, [focusPoints]);

  // Barangay Watch — the two highest-priority barangays, municipality-wide.
  const watchList = useMemo(() => {
    return casePoints
      .filter((point) =>
        ["high", "critical"].includes(String(point.risk_level).toLowerCase())
      )
      .sort((a, b) => {
        const levelDiff = riskRank(b.risk_level) - riskRank(a.risk_level);

        if (levelDiff !== 0) return levelDiff;

        return Number(b.risk_score ?? 0) - Number(a.risk_score ?? 0);
      })
      .slice(0, 2);
  }, [casePoints]);

  const sortedDiagnosisSignals = useMemo(() => {
    return [...diagnosisSignals].sort((a, b) => {
      const freshDiff = Number(b.is_fresh_signal) - Number(a.is_fresh_signal);
      if (freshDiff !== 0) return freshDiff;

      const riskDiff = riskRank(b.risk) - riskRank(a.risk);
      if (riskDiff !== 0) return riskDiff;

      return Number(b.case_count ?? 0) - Number(a.case_count ?? 0);
    });
  }, [diagnosisSignals]);

  const signalTable = useSortableRows(sortedDiagnosisSignals, {
    barangay: (r) => r.barangay ?? "",
    risk: (r) => riskRank(r.risk),
    diagnosis_or_signal: (r) => r.diagnosis_or_signal ?? "",
    case_count: (r) => Number(r.case_count ?? 0),
    fresh_until: (r) => r.fresh_until ?? "",
    patient_name: (r) => r.patient_name ?? "",
    status: (r) => (r.is_fresh_signal ? 1 : 0),
  });

  const highestFacility = useMemo(() => {
    return [...facilityHeatmap.facilities].sort(
      (a, b) =>
        levelRank(b.congestionLevel) - levelRank(a.congestionLevel) ||
        b.waitingCount - a.waitingCount
    )[0];
  }, [facilityHeatmap.facilities]);

  // When every RHU reports the SAME suggested action, say it once at system
  // level instead of repeating it on each facility card AND the action card.
  // Derived purely from live queue state — the moment RHU 1 and RHU 2 diverge,
  // per-RHU advice reappears automatically.
  const sharedQueueAction = useMemo(() => {
    const actions = facilityHeatmap.facilities.map((facility) =>
      String(facility.suggestedAction || "").trim()
    );

    if (actions.length === 0) return null;

    return actions.every((action) => action === actions[0]) ? actions[0] : null;
  }, [facilityHeatmap.facilities]);

  const allQueuesLow = useMemo(
    () =>
      facilityHeatmap.facilities.every(
        (facility) => String(facility.congestionLevel).toLowerCase() === "low"
      ),
    [facilityHeatmap.facilities]
  );

  const highestCrowdingEvent = useMemo(() => {
    return [...facilityHeatmap.events].sort(
      (a, b) => levelRank(b.crowdingLevel) - levelRank(a.crowdingLevel)
    )[0];
  }, [facilityHeatmap.events]);

  const exportActiveCases = () =>
    downloadCsv(
      "ka-agapay-heatmap-active-cases.csv",
      focusPoints as any,
      HEATMAP_CASES_CSV
    );

  return (
    <div style={pageShellStyle}>
      <style>{HEATMAP_DASHBOARD_CSS}</style>
      {/* ── 1. HERO — the 5-second overview ─────────────────────────────── */}
      <section style={heroStyle}>
        <div style={heroTopRowStyle}>
          <div style={{ minWidth: 260, flex: "1 1 320px" }}>
            <div style={eyebrowStyle}>Ka-Agapay RHU Intelligence</div>
            <h1 style={heroTitleStyle}>Heatmap Analytics</h1>
            <p style={heroTextStyle}>
              Separate operational workspaces for RHU queue monitoring and
              barangay disease cluster surveillance.
            </p>
            <p style={heroSmallStyle}>
              Last refreshed: {formatTime(lastRefresh || generatedAt)}
              {refreshing ? " · Updating live data…" : ""}
            </p>
          </div>

          <div style={heroControlsStyle}>
            <div style={segmentGroupStyle} role="tablist" aria-label="Date range">
              <button
                type="button"
                onClick={() => setRange("week")}
                style={{ ...segmentStyle, ...(range === "week" ? segmentActiveStyle : {}) }}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setRange("month")}
                style={{ ...segmentStyle, ...(range === "month" ? segmentActiveStyle : {}) }}
              >
                30 Days
              </button>
            </div>

            <button
              type="button"
              onClick={() => setActiveOnly((previous) => !previous)}
              title="Show only barangays with active (fresh) case signals"
              style={{ ...heroToggleStyle, ...(activeOnly ? heroToggleOnStyle : {}) }}
            >
              Active Signals
            </button>

            <button
              type="button"
              onClick={() => setAutoRefresh((previous) => !previous)}
              title="Automatically refresh every 30 seconds"
              style={{ ...heroToggleStyle, ...(autoRefresh ? heroToggleOnStyle : {}) }}
            >
              Auto 30s
            </button>

            <button
              type="button"
              onClick={() => load()}
              disabled={refreshing}
              style={{ ...heroRefreshStyle, opacity: refreshing ? 0.7 : 1 }}
            >
              <RefreshCw size={15} />
              {refreshing ? "Updating…" : "Refresh"}
            </button>
          </div>
        </div>

        <RhuFilterChips value={focusRhu} onChange={setFocusRhu} counts={rhuCounts} />

        {/* Labels spell out the unit (barangays vs case signals vs patients)
            so barangay-level counts can never be misread as case totals. */}
        <div style={heroMetricsRowStyle}>
          {activeWorkspace === "queue" ? (
            <>
              <HeroMetric label="RHU Facilities" value={facilityHeatmap.facilities.length} icon={Building2} />
              <HeroMetric label="Patients Waiting" value={summary.queueLoad} icon={UsersRound} tone="amber" />
              <HeroMetric label="Active Events" value={facilityHeatmap.events.length} icon={Activity} tone="blue" />
              <HeroMetric label="Priority Patients" value={facilityHeatmap.facilities.reduce((sum, facility) => sum + facility.priorityCount, 0)} icon={ShieldAlert} tone="red" />
            </>
          ) : (
            <>
              <HeroMetric label="Barangays Monitored" value={summary.barangays} icon={Building2} />
              <HeroMetric label="High-Risk Barangays" value={summary.highRisk} warn={summary.highRisk > 0} icon={ShieldAlert} tone="red" />
              <HeroMetric label="Active Case Signals" value={summary.totalCases} icon={Activity} tone="blue" />
              <HeroMetric label="Critical Barangays" value={summary.critical} warn={summary.critical > 0} icon={Siren} tone="red" />
            </>
          )}
        </div>

        {/* Round dots = CASE SEVERITY (barangay disease signals). The facility
            queue map below uses square swatches labeled "Queue Load" — a
            different axis, so the two scales stay visually distinct. Colors
            match RISK_LEGEND / riskColor() / levelColor() exactly. */}
        {activeWorkspace === "barangay" && (
        <div style={heroLegendRowStyle} aria-label="Case severity legend">
          <span style={heroLegendTitleStyle}>Case Severity</span>
          <span style={heroLegendDividerStyle} />
          {RISK_LEGEND.map((item) => (
            <span key={item.key} style={heroLegendItemStyle}>
              <span style={{ ...legendDotStyle, background: item.fill }} />
              {item.label}
            </span>
          ))}
        </div>
        )}
      </section>

      {/* ── Barangay Watch — top 2 alerts ───────────────────────────────── */}
      <section style={workspaceNavStyle}>
        <div style={workspaceTabGroupStyle} role="tablist" aria-label="Heatmap workspace">
          <button
            type="button"
            role="tab"
            aria-selected={activeWorkspace === "queue"}
            onClick={() => setActiveWorkspace("queue")}
            style={{
              ...workspaceTabStyle,
              ...(activeWorkspace === "queue" ? workspaceTabActiveStyle : {}),
            }}
          >
            <Building2 size={17} />
            RHU Queue Monitoring
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeWorkspace === "barangay"}
            onClick={() => setActiveWorkspace("barangay")}
            style={{
              ...workspaceTabStyle,
              ...(activeWorkspace === "barangay" ? workspaceTabActiveStyle : {}),
            }}
          >
            <MapPinned size={17} />
            Barangay Disease Cluster
          </button>
        </div>
        <div style={workspaceMetaStyle}>
          {activeWorkspace === "queue"
            ? "RHU queue pressure, facility workload, and recommended actions"
            : "Disease surveillance, hotspot ranking, case trends, and diagnosis signals"}
        </div>
      </section>

      {activeWorkspace === "barangay" && (
        <section style={secondaryTabsShellStyle}>
          <div style={secondaryTabsStyle} role="tablist" aria-label="Barangay disease views">
            <button
              type="button"
              role="tab"
              aria-selected={barangayView === "overview"}
              onClick={() => setBarangayView("overview")}
              style={{
                ...secondaryTabStyle,
                ...(barangayView === "overview" ? secondaryTabActiveStyle : {}),
              }}
            >
              <MapPinned size={15} />
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={barangayView === "trend"}
              onClick={() => setBarangayView("trend")}
              style={{
                ...secondaryTabStyle,
                ...(barangayView === "trend" ? secondaryTabActiveStyle : {}),
              }}
            >
              <BarChart3 size={15} />
              Case-signal Trend
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={barangayView === "signals"}
              onClick={() => {
                setBarangayView("signals");
                setShowSignals(true);
              }}
              style={{
                ...secondaryTabStyle,
                ...(barangayView === "signals" ? secondaryTabActiveStyle : {}),
              }}
            >
              <FileText size={15} />
              Diagnosis Signals
              <span style={secondaryTabCountStyle}>{sortedDiagnosisSignals.length}</span>
            </button>
          </div>
        </section>
      )}

      {activeWorkspace === "barangay" && barangayView === "overview" && (
      <section style={watchSectionStyle}>
        <div style={watchHeaderStyle}>
          <span
            style={{
              ...watchIconWrapStyle,
              background: watchList.length > 0 ? "#FEF3C7" : "#DCFCE7",
            }}
          >
            <AlertTriangle size={15} color={watchList.length > 0 ? "#B45309" : "#047857"} />
          </span>
          <strong style={{ color: INK, fontSize: 15 }}>Barangay Watch</strong>
          <span style={watchHintStyle}>
            {watchList.length > 0
              ? "Highest-priority barangays right now"
              : "No barangay currently needs urgent attention"}
          </span>
        </div>

        {watchList.length > 0 && (
          <div style={watchGridStyle}>
            {watchList.map((item, index) => {
              const tone = riskWatchTone(item.risk_level);

              return (
              <div
                key={item.barangay_id || item.barangay}
                style={{
                  ...watchCardStyle,
                  background: tone.background,
                  borderColor: tone.border,
                  borderLeft: `5px solid ${tone.accent}`,
                }}
              >
                <div style={watchCardTopStyle}>
                  <div style={watchNameRowStyle}>
                    <span style={{ ...watchRankStyle, background: tone.accent }}>
                      {index + 1}
                    </span>
                    <strong style={watchNameStyle} title={item.barangay}>
                      {item.barangay}
                    </strong>
                  </div>
                  <span style={{ ...watchBadgeStyle, ...riskBadge(item.risk_level) }}>
                    {String(item.risk_level || "low")}
                  </span>
                </div>

                <div style={watchMetaStyle}>
                  <span>{item.rhu_label || "RHU —"}</span>
                  <span style={watchMetaDotStyle}>•</span>
                  <span>{Number(item.total_cases ?? 0)} active cases</span>
                </div>

                <div style={watchSignalStyle} title={String(item.top_case_type || item.top_complaint || "")}>
                  {item.top_case_type || item.top_complaint || "No dominant symptom"}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {error && <div style={errorStyle}>{error}</div>}

      {/* ── 2. RHU FACILITY QUEUE OVERVIEW ──────────────────────────────── */}
      {activeWorkspace === "queue" && <>
      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <h2 style={sectionTitleStyle}>{t("hm_facility_queue_heatmap", lang)}</h2>
            <p style={mutedTextStyle}>
              Live queue workload per facility. Counts come from live queue and
              admin event records; missing data stays at zero instead of being
              guessed.
            </p>
          </div>

          <button
type="button"
            onClick={() => load()}
            disabled={refreshing}
            style={secondaryButtonStyle}
          >
            <RefreshCw size={15} />
            {t("hm_refresh_heatmap", lang)}
          </button>
        </div>

        {facilityError ? (
          <div style={{ ...errorStyle, marginBottom: 12 }}>{facilityError}</div>
        ) : null}

        {!facilityHeatmap.hasLiveQueueData ? (
          <div style={emptyNoticeStyle}>{t("hm_no_live_queue", lang)}</div>
        ) : null}

        <div style={facilitySummaryGridStyle}>
          {facilityHeatmap.facilities.map((facility) => (
            <FacilitySummaryCard
              key={facility.id}
              facility={facility}
              showAction={sharedQueueAction === null}
            />
          ))}

          <section style={miniSummaryCardStyle}>
            <div style={miniLabelStyle}>{t("hm_event_crowding", lang)}</div>
            <strong style={miniValueStyle}>{facilityHeatmap.events.length}</strong>
            <p style={miniTextStyle}>
              {highestCrowdingEvent
                ? `${highestCrowdingEvent.title}: ${highestCrowdingEvent.registrants ?? "No data"}/${highestCrowdingEvent.slots ?? "unlimited"}`
                : "No active events today"}
            </p>
          </section>

          <section style={{ ...miniSummaryCardStyle, borderColor: ACCENT_SOFT_BORDER, background: ACCENT_SOFT_BG }}>
            <div style={miniLabelStyle}>{t("hm_recommended_action", lang)}</div>
            <strong style={{ ...miniValueStyle, fontSize: 17, color: ACCENT_DARK }}>
              {sharedQueueAction
                ? allQueuesLow
                  ? "All queues normal — no action needed"
                  : sharedQueueAction
                : highestFacility?.suggestedAction || "Continue monitoring"}
            </strong>
            <p style={miniTextStyle}>
              {sharedQueueAction
                ? "Same status across all RHUs. Per-RHU advice appears here when facilities differ."
                : highestFacility
                ? `${highestFacility.name}: ${highestFacility.label}`
                : "RHU queue pressure is low"}
            </p>
          </section>
        </div>

        <div style={mapActionRowStyle}>
          <a href="/queue" style={actionButtonStyle}>{t("hm_open_queue", lang)}</a>
          <a href="/cms/events" style={actionButtonStyle}>{t("hm_open_events", lang)}</a>
          <a href="/sms" style={actionButtonStyle}>{t("hm_send_sms_advisory", lang)}</a>
        </div>
      </section>

      {/* ── 3. OPERATIONAL MAPS — side by side ──────────────────────────── */}
      </>}

      {(activeWorkspace === "queue" || (activeWorkspace === "barangay" && barangayView === "overview")) && (
      <section style={activeWorkspace === "barangay" ? mapWorkspaceStyle : cardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <h2 style={sectionTitleStyle}>
              <MapPinned size={18} style={{ marginRight: 8, verticalAlign: "-3px", color: ACCENT }} />
              {activeWorkspace === "queue" ? "RHU Facility Queue Map" : "Find Barangay Case Signals"}
            </h2>
            <p style={mutedTextStyle}>
              {activeWorkspace === "queue"
                ? "Large operational view for RHU queue pressure, workload, and facility status."
                : "Use one RHU selector above, then search a complaint only when you need to narrow the map."}
            </p>
          </div>

          <div style={mapControlBarStyle}>
            {activeWorkspace === "barangay" && (
            <>
            <span style={mapControlLabelStyle}>Find complaint</span>
            <div style={searchWrapStyle}>
              <Search size={15} color={MUTED} />
              <input
                value={disease}
                onChange={(event) => setDisease(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") load();
                }}
                placeholder="Example: cough, fever, dengue"
                style={plainInputStyle}
              />
            </div>
            <button type="button" onClick={() => load()} disabled={refreshing} style={secondaryButtonStyle}>
              <RefreshCw size={15} />
              Update map
            </button>
            </>
            )}
          </div>
        </div>

        <div style={mapsSplitStyle}>
          {activeWorkspace === "queue" && (
          <div style={queueMapFocusStyle}>
            <div style={mapPanelHeaderStyle}>
              <strong style={mapPanelTitleStyle}>RHU Facility Map</strong>
              <span style={mapPanelHintStyle}>
                Queue status and current waiting per facility
              </span>
            </div>

            <FacilityQueueHeatmapMap
              facilities={focusFacilities}
              events={facilityHeatmap.events}
            />
          </div>

          )}

          {activeWorkspace === "barangay" && (
          <div style={diseaseMapFocusStyle}>
            {loading ? (
              <div style={emptyNoticeStyle}>Loading barangay heatmap…</div>
            ) : (
              // Panel keeps its own severity legend: it is the maps-zone key
              // (the hero legend serves the overview zone far above). The map
              // itself renders in plain mode so there is no third copy.
              <BarangayHeatmapPanel
                mapPoints={focusPoints}
                ranking={sortedRows}
                signals={diagnosisSignals}
                range={range}
                onExport={exportActiveCases}
                maxRanking={8}
              />
            )}
          </div>
          )}
        </div>
      </section>
      )}

      {/* ── 4. Detailed diagnosis signals (progressive disclosure) ──────── */}
      {activeWorkspace === "barangay" && barangayView === "trend" && (
        <CaseSignalTrendSection signals={diagnosisSignals} range={range} />
      )}

      {activeWorkspace === "barangay" && barangayView === "signals" && (
      <section style={cardStyle}>
        <button
          type="button"
          onClick={() => setShowSignals((previous) => !previous)}
          style={disclosureButtonStyle}
          aria-expanded={showSignals}
        >
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            Detailed diagnosis signals
            <span style={disclosureCountStyle}>{sortedDiagnosisSignals.length}</span>
          </span>
          {showSignals ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {(showSignals || barangayView === "signals") && (
          <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
            <div style={sectionHeaderStyle}>
              <p style={{ ...mutedTextStyle, margin: 0 }}>
                Completed consultation heatmap signals. Fresh records are within
                the 3-hour signal window; older completed consultations remain
                visible as historical expired signals.
              </p>

              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    "diagnosis-itr-heatmap-signals.csv",
                    sortedDiagnosisSignals as any
                  )
                }
                style={secondaryButtonStyle}
              >
                <Download size={15} />
                Export Signals
              </button>
            </div>

            <div style={diagnosisTableWrapStyle}>
              <table className="ka-signal-table" style={{ ...tableStyle, tableLayout: "fixed", minWidth: 980 }}>
                <colgroup>
                  <col style={{ width: 150 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 240 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 132 }} />
                  <col style={{ width: 182 }} />
                  <col style={{ width: 132 }} />
                </colgroup>
                <thead>
                  <tr>
                    <SortableTh label="Barangay" sortKey="barangay" sort={signalTable.sort} onSort={signalTable.toggle} style={thStyle} />
                    <SortableTh label="Risk" sortKey="risk" sort={signalTable.sort} onSort={signalTable.toggle} style={thStyle} />
                    <SortableTh label="Diagnosis / Top Signal" sortKey="diagnosis_or_signal" sort={signalTable.sort} onSort={signalTable.toggle} style={thStyle} />
                    <SortableTh label="Cases" sortKey="case_count" sort={signalTable.sort} onSort={signalTable.toggle} style={thStyle} />
                    <SortableTh label="Fresh until" sortKey="fresh_until" sort={signalTable.sort} onSort={signalTable.toggle} style={thStyle} />
                    <SortableTh label="Patient Age/Sex Summary" sortKey="patient_name" sort={signalTable.sort} onSort={signalTable.toggle} style={thStyle} />
                    <SortableTh label="Status" sortKey="status" sort={signalTable.sort} onSort={signalTable.toggle} style={thStyle} />
                  </tr>
                </thead>

                <tbody>
                  {signalTable.sorted.map((item, index) => (
                    <tr
                      key={`${item.consultation_id}-${item.diagnosis_or_signal}`}
                      style={index % 2 === 0 ? tableRowStyle : tableRowAltStyle}
                    >
                      <td style={tdStyle}>
                        <strong style={signalBarangayStyle} title={item.barangay || "Unspecified"}>
                          {item.barangay || "Unspecified"}
                        </strong>
                        <div style={{ color: FAINT, fontSize: 12 }}>
                          Consultation #{item.consultation_id}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgePillStyle,
                            ...riskBadge(item.risk),
                            textTransform: "capitalize",
                          }}
                        >
                          {item.risk}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={clampTwoStyle} title={item.diagnosis_or_signal || "No signal"}>
                          {item.diagnosis_or_signal || "No signal"}
                        </div>
                      </td>

                      <td style={tdStyle}>{item.case_count}</td>

                      <td style={tdStyle}>{formatTime(item.fresh_until || undefined)}</td>

                      <td style={tdStyle}>
                        <div style={signalPatientStyle} title={item.patient_name || "Patient"}>
                          {item.patient_name || "Patient"}
                        </div>
                        <div style={{ color: FAINT, fontSize: 12, whiteSpace: "nowrap" }}>
                          {signalAgeSex(item)}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <span style={{ ...badgePillStyle, ...signalStatusStyle(item.is_fresh_signal) }}>
                          {item.is_fresh_signal ? "Fresh" : "Expired"}
                        </span>
                        <div style={{ color: FAINT, fontSize: 11.5, marginTop: 4, whiteSpace: "nowrap" }}>
                          {item.is_fresh_signal ? "within 3 hours" : "historical signal"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {signalTable.sorted.length === 0 && (
              <div style={emptyNoticeStyle}>
                No completed Diagnosis + ITR heatmap signals found for the
                selected range.
              </div>
            )}
          </div>
        )}
      </section>
      )}
    </div>
  );
}

// ── small components ────────────────────────────────────────────────────────

function HeroMetric({
  label,
  value,
  icon: Icon,
  warn = false,
  tone = "teal",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  warn?: boolean;
  tone?: MetricTone;
}) {
  return (
    <div style={heroMetricStyle}>
      {warn && <span style={heroMetricWarnBarStyle} />}
      <div style={heroMetricContentStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={heroMetricLabelStyle}>{label}</div>
          <div style={heroMetricValueStyle}>{value}</div>
        </div>
        <span style={{ ...heroMetricIconStyle, ...metricToneStyle(tone) }}>
          <Icon size={25} strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

function FacilitySummaryCard({
  facility,
  showAction,
}: {
  facility: FacilityHeatmapFacility;
  /** False when all RHUs share one action — the Recommended Action card says it once. */
  showAction: boolean;
}) {
  return (
    <section style={miniSummaryCardStyle}>
      <div style={miniSummaryTopStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={miniLabelStyle}>{facility.name}</div>
          <strong style={miniValueStyle}>{facility.waitingCount}</strong>
          <span style={miniTextStyle}>Current waiting queue</span>
        </div>

        <span style={{ ...facilityLevelPillStyle, ...levelBadge(facility.congestionLevel) }}>
          {facility.label}
        </span>
      </div>

      <div style={facilityStatRowStyle}>
        <span>Waiting: {facility.waitingCount}</span>
        <span style={facilityStatDotStyle} />
        <span>In service: {facility.inServiceCount}</span>
        <span style={facilityStatDotStyle} />
        <span>Priority: {facility.priorityCount}</span>
        <span style={facilityStatDotStyle} />
        <span>Total active: {facility.queueCount}</span>
      </div>

      {showAction && (
        <p style={miniTextStyle}>
          {facility.hasLiveQueueData
            ? facility.suggestedAction
            : t("hm_no_live_queue", useLangStore.getState().lang)}
        </p>
      )}
    </section>
  );
}

interface CaseTrendPoint {
  key: string;
  label: string;
  value: number;
}

function signalDayKey(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildCaseTrend(
  signals: HeatmapDiagnosisItrSignal[],
  range: "week" | "month"
): CaseTrendPoint[] {
  const days = range === "month" ? 30 : 7;
  const buckets: CaseTrendPoint[] = [];
  const index = new Map<string, number>();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);

    index.set(key, buckets.length);
    buckets.push({
      key,
      label: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
      value: 0,
    });
  }

  for (const signal of signals) {
    const key = signalDayKey(signal.consultation_date ?? signal.completed_at);
    if (!key) continue;
    const at = index.get(key);
    if (at === undefined) continue;
    buckets[at].value += Math.max(1, Number(signal.case_count ?? 0));
  }

  return buckets;
}

function CaseSignalTrendSection({
  signals,
  range,
}: {
  signals: HeatmapDiagnosisItrSignal[];
  range: "week" | "month";
}) {
  const trend = buildCaseTrend(signals, range);
  const total = trend.reduce((sum, item) => sum + item.value, 0);

  return (
    <section style={cardStyle}>
      <div style={sectionHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <h2 style={sectionTitleStyle}>
            <BarChart3 size={18} style={{ marginRight: 8, verticalAlign: "-3px", color: ACCENT }} />
            Case-signal Trend
          </h2>
          <p style={mutedTextStyle}>
            Daily completed case signals across all barangays. Total signals in
            this view: {total}.
          </p>
        </div>
      </div>

      <TrendChart data={trend} />
    </section>
  );
}

function TrendChart({ data }: { data: CaseTrendPoint[] }) {
  const W = 980;
  const H = 260;
  const padX = 46;
  const padY = 30;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;

  if (n === 0) {
    return <div style={emptyNoticeStyle}>No case-signal history for this range yet.</div>;
  }

  const x = (i: number) => padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padY + innerH - (v / max) * innerH;
  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${(padY + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;
  const labelEvery = Math.ceil(n / 8);

  return (
    <div style={trendChartShellStyle}>
      <svg
        viewBox={`0 0 ${W} ${H + 32}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Daily case-signal trend"
        style={{ minWidth: 680, display: "block" }}
      >
        <defs>
          <linearGradient id="ka-page-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.34" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((frac) => {
          const gy = padY + innerH - frac * innerH;
          return (
            <g key={frac}>
              <line x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="#E2E8F0" strokeWidth={1} />
              <text x={padX - 10} y={gy + 4} textAnchor="end" fontSize={12} fill="#64748B" fontWeight={800}>
                {Math.round(frac * max)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#ka-page-trend-fill)" stroke="none" />
        <path d={linePath} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <g key={d.key}>
            <circle cx={x(i)} cy={y(d.value)} r={d.value > 0 ? 4.2 : 2.5} fill={ACCENT} />
            {i % labelEvery === 0 || i === n - 1 ? (
              <text x={x(i)} y={H + 12} textAnchor="middle" fontSize={12} fill="#64748B" fontWeight={800}>
                {d.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────

const pageShellStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
};

const workspaceNavStyle: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_LG,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  boxShadow: "0 12px 28px rgba(15,23,42,.05)",
};

const workspaceTabGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const workspaceTabStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  background: "#FFFFFF",
  color: SLATE,
  borderRadius: RADIUS_MD,
  padding: "12px 16px",
  minHeight: 46,
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  boxShadow: "0 8px 18px rgba(15,23,42,.04)",
};

const workspaceTabActiveStyle: React.CSSProperties = {
  background: ACCENT,
  color: "#FFFFFF",
  borderColor: ACCENT,
  boxShadow: "0 14px 28px rgba(15,118,110,.24)",
};

const workspaceMetaStyle: React.CSSProperties = {
  color: MUTED,
  fontSize: 13,
  fontWeight: 750,
};

const secondaryTabsShellStyle: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_LG,
  padding: 10,
  boxShadow: "0 10px 24px rgba(15,23,42,.04)",
};

const secondaryTabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const secondaryTabStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  background: "#FFFFFF",
  color: SLATE,
  borderRadius: RADIUS_SM,
  padding: "10px 13px",
  minHeight: 40,
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 850,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};

const secondaryTabActiveStyle: React.CSSProperties = {
  background: ACCENT_SOFT_BG,
  color: ACCENT,
  borderColor: ACCENT_SOFT_BORDER,
};

const secondaryTabCountStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "1px 7px",
  background: "#FFFFFF",
  border: `1px solid ${ACCENT_SOFT_BORDER}`,
  color: ACCENT,
  fontSize: 11,
  fontWeight: 900,
};

const heroStyle: React.CSSProperties = {
  background:
    "radial-gradient(circle at 85% 12%, rgba(255,255,255,.72) 0%, rgba(255,255,255,.18) 31%, transparent 58%), linear-gradient(135deg, #04746C 0%, #0F766E 42%, #DFF7F5 100%)",
  color: "white",
  borderRadius: RADIUS_LG + 4,
  padding: "24px 26px",
  display: "grid",
  gap: 18,
  boxShadow: "0 18px 44px rgba(15,23,42,.14)",
  border: "1px solid rgba(255,255,255,.36)",
  overflow: "hidden",
};

const heroTopRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11.5,
  letterSpacing: ".07em",
  textTransform: "uppercase",
  fontWeight: 800,
  color: "rgba(255,255,255,.68)",
};

const heroTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 26,
  lineHeight: 1.15,
  fontWeight: 800,
  letterSpacing: "-.01em",
};

const heroTextStyle: React.CSSProperties = {
  margin: "8px 0 0",
  maxWidth: 620,
  lineHeight: 1.55,
  color: "rgba(255,255,255,.9)",
  fontSize: 14.5,
  fontWeight: 650,
};

const heroSmallStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "rgba(255,255,255,.78)",
  fontWeight: 750,
  fontSize: 12.5,
};

const heroControlsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
};

const segmentGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: RADIUS_SM,
  padding: 2,
};

const segmentStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,.78)",
  borderRadius: RADIUS_SM - 2,
  padding: "7px 13px",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const segmentActiveStyle: React.CSSProperties = {
  background: "#FFFFFF",
  color: ACCENT_DARK,
};

const heroToggleStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.2)",
  background: "rgba(255,255,255,.06)",
  color: "rgba(255,255,255,.78)",
  borderRadius: RADIUS_SM,
  padding: "8px 13px",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const heroToggleOnStyle: React.CSSProperties = {
  background: "#FFFFFF",
  color: ACCENT_DARK,
  borderColor: "#FFFFFF",
};

const heroRefreshStyle: React.CSSProperties = {
  border: "none",
  background: "#FFFFFF",
  color: ACCENT_DARK,
  borderRadius: RADIUS_SM,
  padding: "8px 15px",
  fontFamily: "inherit",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};

const heroMetricsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(178px, 1fr))",
  gap: 12,
};

const heroMetricStyle: React.CSSProperties = {
  position: "relative",
  background: "rgba(255,255,255,.94)",
  border: "1px solid rgba(255,255,255,.72)",
  borderRadius: RADIUS_MD - 2,
  padding: "15px 16px",
  minWidth: 0,
  overflow: "hidden",
  boxShadow: "0 12px 26px rgba(15,23,42,.10)",
};

const heroMetricWarnBarStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  width: 3,
  background: "#F43F5E",
};

const heroMetricContentStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const heroMetricLabelStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const heroMetricValueStyle: React.CSSProperties = {
  color: INK,
  fontSize: 27,
  fontWeight: 800,
  lineHeight: 1.1,
  marginTop: 6,
};

const heroMetricIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const heroLegendRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  alignItems: "center",
  paddingTop: 4,
  borderTop: "1px solid rgba(255,255,255,.14)",
};

const heroLegendTitleStyle: React.CSSProperties = {
  color: "rgba(255,255,255,.7)",
  fontSize: 11.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const heroLegendDividerStyle: React.CSSProperties = {
  width: 1,
  height: 12,
  background: "rgba(255,255,255,.24)",
};

const heroLegendItemStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "rgba(255,255,255,.92)",
  fontSize: 12.5,
  fontWeight: 650,
};

const legendDotStyle: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 999,
  flexShrink: 0,
};

const watchSectionStyle: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_LG,
  padding: "18px 20px",
  display: "grid",
  gap: 12,
  boxShadow: "0 12px 32px rgba(15,23,42,.06)",
};

const watchHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const watchIconWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: 999,
  flexShrink: 0,
};

const watchHintStyle: React.CSSProperties = {
  color: MUTED,
  fontSize: 13,
  fontWeight: 600,
};

const watchGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
};

const watchCardStyle: React.CSSProperties = {
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  borderRadius: RADIUS_MD,
  padding: 15,
  display: "grid",
  gap: 7,
  minWidth: 0,
  boxShadow: "0 10px 24px rgba(15,23,42,.05)",
};

const watchCardTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const watchNameRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  minWidth: 0,
};

const watchRankStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  color: "#FFFFFF",
  fontSize: 15,
  fontWeight: 900,
  flexShrink: 0,
};

const watchNameStyle: React.CSSProperties = {
  color: INK,
  fontSize: 17,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
};

const watchBadgeStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 11.5,
  fontWeight: 800,
  textTransform: "capitalize",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const watchMetaStyle: React.CSSProperties = {
  display: "flex",
  gap: 7,
  alignItems: "center",
  color: "#78350F",
  fontSize: 12.5,
  fontWeight: 650,
  flexWrap: "wrap",
};

const watchMetaDotStyle: React.CSSProperties = {
  opacity: 0.5,
};

const watchSignalStyle: React.CSSProperties = {
  color: SLATE,
  fontSize: 12.5,
  fontWeight: 550,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cardStyle: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_LG,
  padding: 22,
  boxShadow: "0 14px 36px rgba(15,23,42,.06)",
};

const mapWorkspaceStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: INK,
  fontSize: 17,
  fontWeight: 800,
};

const mutedTextStyle: React.CSSProperties = {
  margin: "5px 0 0",
  color: MUTED,
  fontSize: 13,
  lineHeight: 1.55,
  maxWidth: 560,
};

const facilitySummaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const miniSummaryCardStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  borderRadius: RADIUS_MD,
  padding: 15,
  display: "grid",
  gap: 8,
  minHeight: 128,
  minWidth: 0,
};

const miniSummaryTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const miniLabelStyle: React.CSSProperties = {
  color: MUTED,
  fontSize: 11.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".02em",
};

const miniValueStyle: React.CSSProperties = {
  display: "block",
  marginTop: 3,
  color: INK,
  fontSize: 26,
  lineHeight: 1,
  fontWeight: 800,
};

const miniTextStyle: React.CSSProperties = {
  margin: 0,
  color: SLATE,
  fontSize: 12.5,
  lineHeight: 1.45,
  fontWeight: 550,
};

const facilityStatRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  color: SLATE,
  fontSize: 12,
  fontWeight: 650,
};

const facilityStatDotStyle: React.CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: 999,
  background: BORDER_STRONG,
  flexShrink: 0,
};

const facilityLevelPillStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 11.5,
  fontWeight: 800,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const mapActionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const actionButtonStyle: React.CSSProperties = {
  border: `1px solid ${ACCENT_SOFT_BORDER}`,
  background: ACCENT_SOFT_BG,
  color: ACCENT,
  borderRadius: RADIUS_SM,
  padding: "10px 15px",
  fontWeight: 750,
  fontSize: 13,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${ACCENT_SOFT_BORDER}`,
  background: ACCENT_SOFT_BG,
  color: ACCENT,
  borderRadius: RADIUS_SM,
  padding: "9px 13px",
  fontFamily: "inherit",
  fontWeight: 750,
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
  flexShrink: 0,
};

const mapControlBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 9,
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
};

const mapControlLabelStyle: React.CSSProperties = {
  color: MUTED,
  fontSize: 12,
  fontWeight: 850,
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const searchWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${BORDER_STRONG}`,
  borderRadius: RADIUS_SM,
  padding: "8px 12px",
  background: SURFACE,
  minWidth: 220,
};

const plainInputStyle: React.CSSProperties = {
  border: "none",
  outline: "none",
  fontFamily: "inherit",
  fontSize: 13,
  color: INK,
  width: "100%",
  minWidth: 0,
  background: "transparent",
};

// Two map panels that sit side-by-side on wide screens and wrap into a single
// column when there is not enough width — no fixed widths, no overflow.
const mapsSplitStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "stretch",
};

// Flex column so the facility map stretches to the full row height and never
// leaves dead space when the disease panel beside it is taller.
const mapPanelStyle: React.CSSProperties = {
  flex: "1 1 460px",
  minWidth: 320,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minHeight: 0,
};

const queueMapFocusStyle: React.CSSProperties = {
  flex: "1 1 780px",
  minWidth: 320,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minHeight: 0,
};

const diseaseMapFocusStyle: React.CSSProperties = {
  flex: "1 1 100%",
  minWidth: 320,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minHeight: 0,
};

const mapPanelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  flexWrap: "wrap",
};

const mapPanelTitleStyle: React.CSSProperties = {
  color: INK,
  fontSize: 14.5,
  fontWeight: 800,
};

const mapPanelHintStyle: React.CSSProperties = {
  color: MUTED,
  fontSize: 12.5,
  fontWeight: 550,
};

const disclosureButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  border: "none",
  background: "transparent",
  color: INK,
  fontFamily: "inherit",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  padding: 0,
};

const disclosureCountStyle: React.CSSProperties = {
  background: ACCENT_SOFT_BG,
  color: ACCENT,
  border: `1px solid ${ACCENT_SOFT_BORDER}`,
  borderRadius: 999,
  padding: "2px 9px",
  fontSize: 12,
  fontWeight: 800,
  marginLeft: 9,
};

const errorStyle: React.CSSProperties = {
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
  borderRadius: RADIUS_MD,
  padding: "12px 15px",
  fontWeight: 700,
  fontSize: 13,
};

const emptyNoticeStyle: React.CSSProperties = {
  border: `1px dashed ${BORDER_STRONG}`,
  borderRadius: RADIUS_MD,
  padding: 16,
  textAlign: "center",
  color: MUTED,
  fontWeight: 700,
  fontSize: 13,
  marginBottom: 12,
};

const diagnosisTableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_MD,
  background: SURFACE,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.8)",
  maxHeight: 760,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "11px 12px",
  background: CANVAS,
  color: SLATE,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".03em",
  fontWeight: 800,
  borderBottom: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const tdStyle: React.CSSProperties = {
  padding: "13px 12px",
  borderBottom: "1px solid #F1F5F9",
  color: INK,
  fontSize: 13,
  fontWeight: 550,
  verticalAlign: "top",
};

const tableRowStyle: React.CSSProperties = {
  background: "#FFFFFF",
};

const tableRowAltStyle: React.CSSProperties = {
  background: "#FCFDFE",
};

const badgePillStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
  display: "inline-block",
};

const clampTwoStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  lineHeight: 1.45,
};

const signalBarangayStyle: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const signalPatientStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 700,
};

const trendChartShellStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_LG,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
  padding: 18,
  overflowX: "auto",
};
