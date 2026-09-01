// src/pages/Analytics.tsx

import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Bot,
  CalendarDays,
  CheckCircle,
  Download,
  FileText,
  Filter,
  MapPinned,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUserRhuId, isGlobalRhuRole } from "../services/queue";

// Two facilities in Malasiqui. Global staff (super_admin / MHO) switch between
// them; facility-scoped staff are locked to their own (backend enforces it too).
const RHU_OPTIONS = [
  { id: "1", label: "RHU 1" },
  { id: "2", label: "RHU 2" },
];

function defaultRhuId(): string {
  const own = getCurrentUserRhuId();
  if (!isGlobalRhuRole() && own > 0) return String(own);
  return "1";
}
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ModuleTabs from "../components/ui/ModuleTabs";
import SortableTh from "../components/ui/SortableTh";
import { useSortableRows } from "../hooks/useSortableRows";

import {
  downloadCsv,
  getAnalyticsOverview,
  getBarangayRisk,
  getChatbotUsage,
  getDiagnosisItrSummary,
  getDiseaseClusters,
  getRealtimeAnalytics,
  type AnalyticsFilters,
  type DiagnosisItrSummary,
  type HeatmapItem,
} from "../services/analytics";
import { useLangStore } from "../store/langStore";
import {
  buildRhuActionSummary,
  formatPercent,
  normalizeBarangayName,
  normalizeDiagnosisLabel,
  normalizeRiskLevel,
} from "../utils/rhuAnalyticsHelpers";
import { useToast } from "../contexts/ToastContext";

type FilterState = {
  from: string;
  to: string;
  disease: string;
  rhuId: string;
  barangay: string;
};

type BarItem = {
  label: string;
  value: number;
  helper?: string;
  level?: string;
};

type AttendanceStats = {
  totalVisits: number;
  activeDays: number;
  averagePerDay: number;
  peakDay: string;
  peakTotal: number;
  slowestDay: string;
  slowestTotal: number;
  source: string;
};

function emptyDiagnosisItrSummary(): DiagnosisItrSummary {
  return {
    total_completed_consultations: 0,
    total_diagnosed_consultations: 0,
    top_diagnosis: null,
    barangays_with_diagnosed_cases: 0,
    followups_scheduled: 0,
    diagnosis_counts: [],
    barangay_diagnosis_counts: [],
    age_sex_breakdown: [],
    recent_diagnosis_itr_cases: [],
  };
}

function caseAgeSex(row: any): string {
  const age = row?.age !== null && row?.age !== undefined ? String(row.age) : "—";
  const sex = String(row?.sex_gender || "").trim();

  if (age !== "—" && sex) return `${age} / ${sex}`;
  if (age !== "—") return age;
  return sex || "—";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function todayMinus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function defaultFilters(): FilterState {
  return {
    from: todayMinus(30),
    to: todayIso(),
    disease: "",
    rhuId: defaultRhuId(),
    barangay: "",
  };
}

function numberValue(value: any): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function compactNumber(value: any): string {
  const num = numberValue(value);

  return new Intl.NumberFormat("en-PH", {
    notation: num >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(num);
}

function formatTime(value?: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isDateAfter(from: string, to: string): boolean {
  if (!from || !to) return false;

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  return start.getTime() > end.getTime();
}

function shortText(value: string, limit = 90): string {
  const text = String(value || "").trim();

  if (text.length <= limit) return text;

  return `${text.slice(0, limit - 1)}…`;
}

function riskScore(item: HeatmapItem): number {
  return numberValue(
    item.risk_score ??
      item.heatmap_intensity ??
      item.total_cases ??
      item.queue_density
  );
}

function clusterCount(item: any): number {
  return numberValue(item.total ?? item.count ?? item.total_cases ?? item.cases);
}

function clusterLabel(item: any): string {
  return String(
    item.complaint ??
      item.disease ??
      item.diagnosis ??
      item.top_complaint ??
      item.top_case_type ??
      "Unspecified"
  );
}

function promptCount(item: any): number {
  return numberValue(item.total ?? item.count ?? item.messages ?? item.uses);
}

function promptLabel(item: any): string {
  return String(item.prompt ?? item.question ?? item.message ?? "Prompt");
}

function rowLabel(item: any): string {
  return String(
    item.label ??
      item.name ??
      item.event_title ??
      item.title ??
      item.program ??
      item.event ??
      item.day ??
      item.date ??
      item.status ??
      item.triage_level ??
      item.category ??
      "Unspecified"
  );
}

function rowTotal(item: any): number {
  return numberValue(
    item.count ??
      item.total ??
      item.value ??
      item.cases ??
      item.attendees ??
      item.registrations ??
      item.messages ??
      item.uses
  );
}

function pickArray(source: any, keys: string[]): any[] {
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
  }

  return [];
}

function pickObject(source: any, keys: string[]): any {
  for (const key of keys) {
    const value = source?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }

  return null;
}

function statusRowsToBars(rows: any[], fallbackLabel = "Unspecified"): BarItem[] {
  return rows
    .map((row) => {
      const value = rowTotal(row);
      const helperParts = [
        row.helper,
        row.percentage !== undefined ? `${numberValue(row.percentage)}%` : "",
        row.average_score ? `Average score: ${Math.round(numberValue(row.average_score))}` : "",
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean);

      return {
        label:
          rowLabel(row)
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase()) || fallbackLabel,
        value,
        helper: helperParts[0],
        level: row.triage_level || row.status,
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function diagnosisCaseDate(row: any): string {
  const raw = row?.consultation_date || row?.completed_at || row?.first_attended_at;
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function diagnosisCaseBarangay(row: any): string {
  return normalizeBarangayName(row?.barangay);
}

function diagnosisCaseLabel(row: any): string {
  return normalizeDiagnosisLabel(row?.diagnosis || row?.assessment);
}

function riskLevelStyle(level?: string | null): CSSProperties {
  const safe = String(level || "low").toLowerCase();

  if (safe === "critical") {
    return {
      background: "#FEE2E2",
      color: "#991B1B",
      border: "1px solid #FECACA",
    };
  }

  if (safe === "high") {
    return {
      background: "#FFEDD5",
      color: "#9A3412",
      border: "1px solid #FED7AA",
    };
  }

  if (safe === "moderate") {
    return {
      background: "#FEF3C7",
      color: "#92400E",
      border: "1px solid #FDE68A",
    };
  }

  return {
    background: "#DCFCE7",
    color: "#166534",
    border: "1px solid #BBF7D0",
  };
}

function copyForLang(lang: string) {
  const pag = lang === "pag";
  const tag = lang === "tag" || lang === "tl" || lang === "fil";

  return {
    eyebrow: "Ka-Agapay RHU Analytics",
    title: "RHU Analytics",

    subtitle: pag
      ? "Nengnengen so patients, consultations, telemedicine, queue, disease clusters, tan chatbot questions parad mas dugan RHU planning."
      : tag
      ? "Tingnan ang patients, consultations, telemedicine, queue, disease clusters, at chatbot questions para sa mas maayos na RHU planning."
      : "Track patients, consultations, telemedicine usage, queue tickets, disease clusters, and chatbot questions for better RHU planning.",

    lastUpdated: pag ? "Na-update" : tag ? "Na-update" : "Last updated",
    refreshing: pag ? "Nagre-refresh..." : tag ? "Nagre-refresh..." : "Refreshing...",
    exportSummary: pag ? "Export Summary" : tag ? "Export Summary" : "Export Summary",
    apply: pag ? "I-apply" : tag ? "I-apply" : "Apply",
    reset: pag ? "Reset" : tag ? "Reset" : "Reset",
    refresh: pag ? "I-refresh" : tag ? "I-refresh" : "Refresh",
    csv: "CSV",

    dateFrom: "Date From",
    dateTo: "Date To",
    rhu: "Facility",
    barangay: "Barangay",
    allRhus: "Selected RHU only",
    barangayPlaceholder: "Search barangay name",

    searchPlaceholder: pag
      ? "Filter complaint, alimbawa: fever"
      : tag
      ? "Filter complaint, halimbawa: fever"
      : "Filter complaint e.g. fever",

    dateRangeError: pag
      ? "Aliwan dugan date range. Dapat mas una so Date From kaysa Date To."
      : tag
      ? "Mali ang date range. Dapat mas una ang Date From kaysa Date To."
      : "Invalid date range. Date From must be earlier than Date To.",

    partialWarning: pag
      ? "Realtime endpoint et agna-load. Ipapakita so available partial analytics."
      : tag
      ? "Hindi nag-load ang realtime endpoint. Ipapakita ang available partial analytics."
      : "Realtime endpoint failed. Showing available partial analytics.",

    loadError: pag
      ? "Agnayari ya na-load so analytics."
      : tag
      ? "Hindi ma-load ang analytics."
      : "Failed to load analytics.",

    loading: pag
      ? "Lo-load so analytics..."
      : tag
      ? "Nilo-load ang analytics..."
      : "Loading analytics...",

    safetyTitle: pag
      ? "Real-life RHU interpretation"
      : tag
      ? "Real-life RHU interpretation"
      : "Real-life RHU interpretation",

    safetyBody: pag
      ? "Say analytics et guide labat. No walay high risk, i-validate ni na RHU staff antis magdesisyon odino mansend na public advisory."
      : tag
      ? "Ang analytics ay guide lamang. Kapag may high risk, i-validate muna ng RHU staff bago magdesisyon o maglabas ng public advisory."
      : "Analytics is a guide. When risk is high, RHU staff should validate the data before making decisions or publishing public advisories.",

    patients: pag ? "Patients" : tag ? "Patients" : "Patients",
    consultations: pag ? "Consultations" : tag ? "Consultations" : "Consultations",
    telemedicine: pag ? "Telemedicine" : tag ? "Telemedicine" : "Telemedicine",
    queueTickets: pag ? "Queue Tickets" : tag ? "Queue Tickets" : "Queue Tickets",
    chatMessages: pag ? "Chat Messages" : tag ? "Chat Messages" : "Chat Messages",

    patientsHelp: pag ? "Registered users" : tag ? "Registered users" : "Registered users",
    consultationsHelp: pag ? "Clinical records" : tag ? "Clinical records" : "Clinical records",
    telemedicineHelp: pag ? "Online requests" : tag ? "Online requests" : "Online requests",
    queueHelp: pag ? "Patient flow" : tag ? "Patient flow" : "Patient flow",
    chatHelp: pag ? "AI support usage" : tag ? "AI support usage" : "AI support usage",

    barangayRiskTitle: pag
      ? "Barangay Risk Ranking"
      : tag
      ? "Barangay Risk Ranking"
      : "Barangay Risk Ranking",
    barangayRiskSub: pag
      ? "Gamitin parad BHW follow-up tan RHU supply planning."
      : tag
      ? "Gamitin para sa BHW follow-up at RHU supply planning."
      : "Use this to prioritize BHW follow-up and RHU supplies.",

    diseaseTitle: pag
      ? "Patient Cases by Disease / Illness"
      : tag
      ? "Patient Cases by Disease / Illness"
      : "Patient Cases by Disease / Illness",
    diseaseSub: pag
      ? "Shows the most common diseases or illnesses from completed consultations and ITR records."
      : tag
      ? "Shows the most common diseases or illnesses from completed consultations and ITR records."
      : "Shows the most common diseases or illnesses from completed consultations and ITR records.",

    chatbotTitle: pag
      ? "Chatbot Top Questions"
      : tag
      ? "Chatbot Top Questions"
      : "Chatbot Top Questions",
    chatbotSub: pag
      ? "Ipakita no iner naguguluhan so residents."
      : tag
      ? "Ipinapakita kung saan naguguluhan ang residents."
      : "Shows where residents need clearer guidance.",

    actionTitle: pag ? "RHU Action Summary" : tag ? "RHU Action Summary" : "RHU Action Summary",
    actionSub: pag
      ? "Simple interpretation parad staff ya aliwan technical."
      : tag
      ? "Simple interpretation para sa staff na hindi technical."
      : "Simple interpretation for staff who are not technical.",

    bhwTitle: pag
      ? "Iner isend so BHW follow-up?"
      : tag
      ? "Saan magpadala ng BHW follow-up?"
      : "Where to send BHW follow-up?",
    programTitle: pag
      ? "Antoy program so iprepare?"
      : tag
      ? "Anong program ang dapat ihanda?"
      : "What program should RHU prepare?",
    contentTitle: pag
      ? "Antoy content so ipost?"
      : tag
      ? "Anong content ang dapat i-post?"
      : "What content should be posted?",

    noRisk: pag
      ? "Anggapo barangay risk data ni."
      : tag
      ? "Wala pang barangay risk data."
      : "No barangay risk data yet.",
    noCluster: pag
      ? "No disease data available"
      : tag
      ? "No disease data available"
      : "No disease data available",
    noChatbot: pag
      ? "Anggapo chatbot pattern ni."
      : tag
      ? "Wala pang chatbot pattern."
      : "No chatbot pattern yet.",

    noChartData: pag ? "Anggapo chart data ni." : tag ? "Wala pang chart data." : "No chart data yet.",
    low: "Low",
    moderate: "Moderate",
    high: "High",
    critical: "Critical",
  };
}

function cleanFilters(filters: FilterState): AnalyticsFilters {
  return {
    from: filters.from || undefined,
    to: filters.to || undefined,
    disease: filters.disease.trim() || undefined,
    rhu_id: filters.rhuId || "1",

    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
    diagnosis: filters.disease.trim() || undefined,
  };
}

export default function Analytics() {
  const toast = useToast();
  const lang = useLangStore((state) => state.lang);
  const c = copyForLang(lang);

  const isGlobal = isGlobalRhuRole();
  const [filters, setFilters] = useState<FilterState>(() => defaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() =>
    defaultFilters()
  );
  const selectedRhuId = appliedFilters.rhuId || defaultRhuId();
  const selectedRhuLabel = `RHU ${selectedRhuId}`;
  const selectedRhuSlug = `rhu-${selectedRhuId}`;

  const [overview, setOverview] = useState<Record<string, any>>({});
  const [risk, setRisk] = useState<HeatmapItem[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [chatbot, setChatbot] = useState<any>({
    total_messages: 0,
    by_day: [],
    top_prompts: [],
  });

  const [diagnosisItr, setDiagnosisItr] = useState<DiagnosisItrSummary>(() =>
    emptyDiagnosisItrSummary()
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const inFlightRef = useRef(false);

  const loadAnalytics = useCallback(
    async (silent = false, overrideFilters?: FilterState) => {
      const activeFilters = overrideFilters ?? appliedFilters;
      const copy = copyForLang(useLangStore.getState().lang);

      if (isDateAfter(activeFilters.from, activeFilters.to)) {
        setError(copy.dateRangeError);
        setLoading(false);
        return;
      }

      if (inFlightRef.current) return;

      inFlightRef.current = true;

      if (!silent) setLoading(true);
      setRefreshing(true);
      setError("");
      setNotice("");

      try {
        const [realtime, diagnosisSummary] = await Promise.all([
          getRealtimeAnalytics(cleanFilters(activeFilters)),
          getDiagnosisItrSummary(cleanFilters(activeFilters)),
        ]);

        setOverview(realtime.overview ?? {});
        setRisk(Array.isArray(realtime.risk) ? realtime.risk : []);
        setClusters(Array.isArray(realtime.clusters) ? realtime.clusters : []);
        setChatbot(realtime.chatbot ?? { top_prompts: [] });
        setDiagnosisItr(diagnosisSummary ?? emptyDiagnosisItrSummary());
        setLastUpdated(realtime.generated_at || new Date().toISOString());
      } catch (realtimeError: any) {
        const params = cleanFilters(activeFilters);

        const [
          overviewData,
          riskData,
          clustersData,
          chatbotData,
          diagnosisData,
        ] = await Promise.all([
          getAnalyticsOverview(params).catch(() => null),
          getBarangayRisk(params).catch(() => null),
          getDiseaseClusters(params).catch(() => null),
          getChatbotUsage(params).catch(() => null),
          getDiagnosisItrSummary(params).catch(() => null),
        ]);

        const hasAnyFallback =
          overviewData ||
          riskData ||
          clustersData ||
          chatbotData ||
          diagnosisData;

        if (!hasAnyFallback) {
          setDiagnosisItr(emptyDiagnosisItrSummary());
          setError(
            realtimeError?.response?.data?.message ||
              realtimeError?.message ||
              copy.loadError
          );
        } else {
          setNotice(copy.partialWarning);
          setOverview(overviewData ?? {});
          setRisk(Array.isArray(riskData) ? riskData : []);
          setClusters(Array.isArray(clustersData) ? clustersData : []);
          setChatbot(chatbotData ?? { top_prompts: [] });
          setDiagnosisItr(diagnosisData ?? emptyDiagnosisItrSummary());
          setLastUpdated(new Date().toISOString());
        }
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadAnalytics(true);
    }, 60000);

    return () => window.clearInterval(timer);
  }, [loadAnalytics]);

  const summaryRows = useMemo(
    () => [
      { Metric: "Facility Scope", Value: selectedRhuLabel },
      { Metric: "Date From", Value: appliedFilters.from },
      { Metric: "Date To", Value: appliedFilters.to },
      { Metric: c.patients, Value: numberValue(overview?.total_patients) },
      {
        Metric: c.consultations,
        Value: numberValue(overview?.total_consultations),
      },
      {
        Metric: c.telemedicine,
        Value: numberValue(overview?.total_telemedicine_requests),
      },
      {
        Metric: c.queueTickets,
        Value: numberValue(overview?.total_queue_tickets),
      },
      {
        Metric: c.chatMessages,
        Value: numberValue(overview?.total_chat_messages),
      },
      {
        Metric: "Completed Consultations",
        Value: diagnosisItr.total_completed_consultations,
      },
      {
        Metric: "Diagnosed Consultations",
        Value: diagnosisItr.total_diagnosed_consultations,
      },
      {
        Metric: "Top Diagnosis",
        Value: normalizeDiagnosisLabel(diagnosisItr.top_diagnosis),
      },
      {
        Metric: "Follow-ups Scheduled",
        Value: diagnosisItr.followups_scheduled,
      },
    ],
    [appliedFilters.from, appliedFilters.to, c, overview, diagnosisItr, selectedRhuLabel]
  );

  const filteredDiagnosisCases = useMemo(() => {
    const barangayKeyword = appliedFilters.barangay.trim().toLowerCase();
    const rows = Array.isArray(diagnosisItr.recent_diagnosis_itr_cases)
      ? diagnosisItr.recent_diagnosis_itr_cases
      : [];

    return rows.filter((row: any) => {
      const barangayMatch =
        !barangayKeyword ||
        diagnosisCaseBarangay(row).toLowerCase().includes(barangayKeyword);
      const rhuMatch = !row.rhu_id || String(row.rhu_id) === "1";

      return barangayMatch && rhuMatch;
    });
  }, [appliedFilters.barangay, diagnosisItr.recent_diagnosis_itr_cases]);

  const attendanceByDayOfWeek: BarItem[] = useMemo(() => {
    const rows = Array.isArray(overview?.attendance_by_day_of_week)
      ? overview.attendance_by_day_of_week
      : [];

    if (rows.length > 0) {
      return rows.map((row: any) => ({
        label: row.label || row.day || "Day",
        value: rowTotal(row),
        helper: `${formatPercent(rowTotal(row), numberValue(overview?.total_patient_visits))} of visits`,
      }));
    }

    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const counts = new Map(order.map((day) => [day, 0]));

    filteredDiagnosisCases.forEach((row) => {
      const dateText = diagnosisCaseDate(row);
      if (!dateText) return;
      const day = new Date(`${dateText}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short" });
      counts.set(day, (counts.get(day) ?? 0) + 1);
    });

    const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);

    return order.map((label) => ({
      label,
      value: counts.get(label) ?? 0,
      helper: `${formatPercent(counts.get(label) ?? 0, total)} of visits`,
    }));
  }, [filteredDiagnosisCases, overview]);

  const attendanceByDate = useMemo(() => {
    const rows = Array.isArray(overview?.attendance_by_date)
      ? overview.attendance_by_date
      : [];

    if (rows.length > 0) {
      return rows
        .map((row: any) => ({
          label: row.date || row.label,
          value: rowTotal(row),
        }))
        .filter((row) => row.label)
        .sort((a, b) => String(a.label).localeCompare(String(b.label)))
        .slice(-14);
    }

    const counts = new Map<string, number>();

    filteredDiagnosisCases.forEach((row) => {
      const day = diagnosisCaseDate(row);
      if (!day) return;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-14);
  }, [filteredDiagnosisCases, overview]);

  const attendanceStats: AttendanceStats = useMemo(() => {
    const totalVisits =
      numberValue(overview?.total_patient_visits) ||
      attendanceByDate.reduce((sum, row) => sum + row.value, 0);
    const activeDays =
      numberValue(overview?.active_visit_days) ||
      attendanceByDate.filter((row) => row.value > 0).length;
    const averagePerDay =
      numberValue(overview?.average_patients_per_day) ||
      (activeDays > 0 ? Number((totalVisits / activeDays).toFixed(1)) : 0);

    const peak = attendanceByDayOfWeek.reduce(
      (best, row) => (row.value > best.value ? row : best),
      { label: "No data", value: 0 }
    );
    const slowest = attendanceByDayOfWeek.reduce(
      (best, row) => (row.value < best.value ? row : best),
      attendanceByDayOfWeek[0] ?? { label: "No data", value: 0 }
    );

    return {
      totalVisits,
      activeDays,
      averagePerDay,
      peakDay: overview?.peak_patient_day?.label || peak.label,
      peakTotal: numberValue(overview?.peak_patient_day?.total ?? peak.value),
      slowestDay: overview?.slowest_patient_day?.label || slowest.label,
      slowestTotal: numberValue(overview?.slowest_patient_day?.total ?? slowest.value),
      source: String(overview?.attendance_source || "completed_consultations"),
    };
  }, [attendanceByDate, attendanceByDayOfWeek, overview]);

  const sortedRisk = useMemo(() => {
    const barangayKeyword = appliedFilters.barangay.trim().toLowerCase();
    const rows = barangayKeyword
      ? risk.filter((item) =>
          String(item.barangay || "")
            .toLowerCase()
            .includes(barangayKeyword)
        )
      : risk;

    return [...rows].sort((a, b) => riskScore(b) - riskScore(a));
  }, [appliedFilters.barangay, risk]);

  const barangayBars: BarItem[] = useMemo(() => {
    return sortedRisk.slice(0, 8).map((item) => ({
      label: normalizeBarangayName(item.barangay || "Unknown barangay"),
      value: riskScore(item),
      helper:
        normalizeDiagnosisLabel(item.top_case_type || item.top_complaint) ||
        `${numberValue(item.total_cases)} cases`,
      level: normalizeRiskLevel(item.risk_level, riskScore(item)),
    }));
  }, [sortedRisk]);

  const diseaseBars: BarItem[] = useMemo(() => {
    const diagnosisCounts = Array.isArray(diagnosisItr.diagnosis_counts)
      ? diagnosisItr.diagnosis_counts
      : [];

    if (diagnosisCounts.length > 0) {
      return [...diagnosisCounts]
        .map((item) => ({
          label: normalizeDiagnosisLabel(item.diagnosis),
          value: numberValue(item.total),
          helper: "Completed consultation / ITR diagnosis",
        }))
        .filter((item) => item.label.trim() && item.value > 0)
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .slice(0, 10);
    }

    return [...clusters]
      .sort((a, b) => clusterCount(b) - clusterCount(a))
      .slice(0, 10)
      .map((item) => ({
        label: normalizeDiagnosisLabel(clusterLabel(item)),
        value: clusterCount(item),
        helper: item.barangay ? normalizeBarangayName(item.barangay) : item.source || undefined,
      }));
  }, [clusters, diagnosisItr.diagnosis_counts]);

  const diseaseRawRows = useMemo(() => {
    return diagnosisItr.diagnosis_counts.length > 0
      ? diagnosisItr.diagnosis_counts
      : clusters;
  }, [clusters, diagnosisItr.diagnosis_counts]);

  const diagnosisTrend = useMemo(() => {
    const counts = new Map<string, number>();

    filteredDiagnosisCases.forEach((row) => {
      const day = diagnosisCaseDate(row);
      if (!day) return;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-14);
  }, [filteredDiagnosisCases]);

  const topDiagnosisBars: BarItem[] = useMemo(() => {
    const counts = new Map<string, number>();
    const barangayByDiagnosis = new Map<string, { barangay: string; total: number }>();

    filteredDiagnosisCases.forEach((row) => {
      const label = diagnosisCaseLabel(row);
      if (!label || label === "Unspecified") return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    (Array.isArray(diagnosisItr.barangay_diagnosis_counts)
      ? diagnosisItr.barangay_diagnosis_counts
      : []
    ).forEach((row) => {
      const label = normalizeDiagnosisLabel(row.diagnosis);
      const current = barangayByDiagnosis.get(label);
      const total = numberValue(row.total);

      if (!current || total > current.total) {
        barangayByDiagnosis.set(label, {
          barangay: normalizeBarangayName(row.barangay),
          total,
        });
      }
    });

    if (counts.size > 0) {
      const totalDiagnosed = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
      return Array.from(counts.entries())
        .map(([label, value]) => {
          const barangay = barangayByDiagnosis.get(label)?.barangay;

          return {
            label,
            value,
            helper: `${formatPercent(value, totalDiagnosed)} of diagnosed cases${
              barangay ? ` · Most affected: ${barangay}` : ""
            }`,
          };
        })
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .slice(0, 10);
    }

    return diseaseBars.slice(0, 10);
  }, [diagnosisItr.barangay_diagnosis_counts, diseaseBars, filteredDiagnosisCases]);

  const followUpBars: BarItem[] = useMemo(() => {
    const counts = new Map<string, number>();

    filteredDiagnosisCases.forEach((row: any) => {
      const label = row.follow_up_needed
        ? String(row.follow_up_status || "scheduled")
        : "none";
      const normalized = label.charAt(0).toUpperCase() + label.slice(1);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [filteredDiagnosisCases]);

  const rhuServiceLoadBars: BarItem[] = useMemo(() => {
    return [
      {
        label: `${selectedRhuLabel} Service Load`,
        value: filteredDiagnosisCases.length,
        helper: `Completed ${selectedRhuLabel} Diagnosis + ITR consultations`,
      },
    ].filter((item) => item.value > 0);
  }, [filteredDiagnosisCases, selectedRhuLabel]);

  const diagnosisByBarangayRows = useMemo(() => {
    const rows = Array.isArray(diagnosisItr.barangay_diagnosis_counts)
      ? diagnosisItr.barangay_diagnosis_counts
      : [];
    const barangayKeyword = appliedFilters.barangay.trim().toLowerCase();

    return rows
      .filter((row) => {
        const barangay = String(row.barangay || "").toLowerCase();
        return !barangayKeyword || barangay.includes(barangayKeyword);
      })
      .map((row) => ({
        ...row,
        barangay: normalizeBarangayName(row.barangay),
        diagnosis: normalizeDiagnosisLabel(row.diagnosis),
      }))
      .sort((a, b) => numberValue(b.total) - numberValue(a.total))
      .slice(0, 12);
  }, [appliedFilters.barangay, diagnosisItr.barangay_diagnosis_counts]);

  const chatbotBars: BarItem[] = useMemo(() => {
    const prompts = Array.isArray(chatbot?.top_prompts)
      ? chatbot.top_prompts
      : [];

    return [...prompts]
      .sort((a, b) => promptCount(b) - promptCount(a))
      .slice(0, 8)
      .map((item) => ({
        label: promptLabel(item),
        value: promptCount(item),
        helper: item.category || undefined,
      }));
  }, [chatbot]);

  const queuePerformanceBars: BarItem[] = useMemo(
    () => {
      const rows = statusRowsToBars(
        pickArray(overview, [
          "queue_performance",
          "queuePerformance",
          "queue_by_status",
          "queueByStatus",
        ])
      );

      if (rows.length > 0) return rows;

      return [
        { label: "Total queue tickets", value: numberValue(overview?.total_queue_tickets) },
        { label: "Waiting patients", value: numberValue(overview?.waiting_queue ?? overview?.queue_waiting) },
        { label: "Currently serving", value: numberValue(overview?.currently_serving ?? overview?.in_service_queue) },
        { label: "Served patients", value: numberValue(overview?.served_queue ?? overview?.total_served_today) },
        { label: "Skipped / cancelled", value: numberValue(overview?.skipped_queue) + numberValue(overview?.cancelled_queue) },
        { label: "Priority queue", value: numberValue(overview?.priority_queue ?? overview?.priority_waiting) },
        { label: "Regular queue", value: numberValue(overview?.regular_queue) },
      ].filter((item) => item.value > 0);
    },
    [overview]
  );

  const queueByHourBars: BarItem[] = useMemo(() => {
    const rows = pickArray(overview, ["queue_by_hour", "queueByHour"]);
    const peakHour = pickObject(overview, ["peak_queue_hour", "peakQueueHour"]);

    return rows
      .map((row: any) => ({
        label: row.label || `${row.hour}:00`,
        value: rowTotal(row),
        helper:
          peakHour?.label === row.label
            ? "Peak queue hour"
            : row.helper || undefined,
      }))
      .filter((item) => item.value > 0);
  }, [overview]);

  const priorityBreakdownBars: BarItem[] = useMemo(() => {
    const rows = pickArray(overview, [
      "priority_breakdown",
      "priority_patient_breakdown",
      "priorityPatientBreakdown",
    ]);

    return statusRowsToBars(rows);
  }, [overview]);

  const aiTriageBars: BarItem[] = useMemo(() => {
    const rows = pickArray(overview, [
      "ai_triage_distribution",
      "aiTriageDistribution",
    ]);

    return statusRowsToBars(rows).map((row) => ({
      ...row,
      helper: row.helper || "AI priority classification, staff validation required",
    }));
  }, [overview]);

  const appointmentStatusBars: BarItem[] = useMemo(
    () => {
      const rows = statusRowsToBars(
        pickArray(overview, [
          "appointment_status_distribution",
          "appointmentStatusDistribution",
          "appointments_by_status",
          "appointmentsByStatus",
        ])
      );

      if (rows.length > 0) return rows;

      return [
        { label: "Pending", value: numberValue(overview?.pending_appointments) },
        { label: "Approved", value: numberValue(overview?.approved_appointments) },
        { label: "Completed", value: numberValue(overview?.completed_appointments) },
        { label: "Cancelled", value: numberValue(overview?.cancelled_appointments) },
        { label: "Rejected", value: numberValue(overview?.rejected_appointments) },
        { label: "No-show", value: numberValue(overview?.no_show_appointments) },
      ].filter((item) => item.value > 0);
    },
    [overview]
  );

  const telemedicineStatusBars: BarItem[] = useMemo(
    () => {
      const rows = statusRowsToBars(
        pickArray(overview, [
          "telemedicine_status_distribution",
          "telemedicineStatusDistribution",
          "telemedicine_by_status",
          "telemedicineByStatus",
        ])
      );

      if (rows.length > 0) return rows;

      return [
        { label: "Total requests", value: numberValue(overview?.total_telemedicine_requests) },
        { label: "Pending", value: numberValue(overview?.pending_telemedicine_requests) },
        { label: "Scheduled", value: numberValue(overview?.scheduled_telemedicine_sessions) },
        { label: "Completed", value: numberValue(overview?.completed_telemedicine_sessions) },
        { label: "Cancelled / rejected", value: numberValue(overview?.cancelled_telemedicine_requests) + numberValue(overview?.rejected_telemedicine_requests) },
      ].filter((item) => item.value > 0);
    },
    [overview]
  );

  const ageGroupBars: BarItem[] = useMemo(() => {
    const counts = new Map<string, number>();

    diagnosisItr.age_sex_breakdown.forEach((row: any) => {
      const label = String(row.age_group || "Unspecified");
      counts.set(label, (counts.get(label) ?? 0) + numberValue(row.total));
    });

    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [diagnosisItr.age_sex_breakdown]);

  const sexGenderBars: BarItem[] = useMemo(() => {
    const counts = new Map<string, number>();

    diagnosisItr.age_sex_breakdown.forEach((row: any) => {
      const label = String(row.sex_gender || "Unspecified");
      counts.set(label, (counts.get(label) ?? 0) + numberValue(row.total));
    });

    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [diagnosisItr.age_sex_breakdown]);

  const chatbotCategoryBars: BarItem[] = useMemo(() => {
    const counts = new Map<string, number>();

    (Array.isArray(chatbot?.top_prompts) ? chatbot.top_prompts : []).forEach((item: any) => {
      const label = String(item.category || "other")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
      counts.set(label, (counts.get(label) ?? 0) + promptCount(item));
    });

    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [chatbot]);

  const programParticipationBars: BarItem[] = useMemo(() => {
    const rows = pickArray(overview, [
      "program_participation",
      "programParticipation",
      "program_participation_by_event",
      "programParticipationByEvent",
      "program_participation_by_barangay",
      "programParticipationByBarangay",
      "event_participation_by_barangay",
      "eventParticipationByBarangay",
      "programs",
    ]);

    return rows
      .map((row: any) => {
        const label = String(
          row.label ??
            row.title ??
            row.program ??
            row.event ??
            row.event_title ??
            row.barangay ??
            "Program / Event"
        );

        const helper =
          row.helper ||
          (row.barangay ? `Barangay: ${row.barangay}` : undefined) ||
          row.category ||
          row.event_type ||
          "Program / event participation";

        return {
          label,
          value: rowTotal(row),
          helper,
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 10);
  }, [overview]);

  const topRisk = barangayBars[0];
  const topDisease = diseaseBars[0];
  const topQuestion = chatbotBars[0];
  const highPriorityCases = aiTriageBars
    .filter((item) => ["urgent", "high"].includes(String(item.level || item.label).toLowerCase()))
    .reduce((sum, item) => sum + item.value, 0);
  const actionSummaryText = buildRhuActionSummary({
    rhuLabel: selectedRhuLabel,
    completedConsultations: diagnosisItr.total_completed_consultations,
    diagnosedConsultations: diagnosisItr.total_diagnosed_consultations,
    averagePatientsPerDay: attendanceStats.averagePerDay,
    peakPatientDay: attendanceStats.peakDay,
    peakPatientCount: attendanceStats.peakTotal,
    peakQueueHour: pickObject(overview, ["peak_queue_hour", "peakQueueHour"])?.label,
    topBarangay: topRisk?.label,
    topDiagnosis: topDisease?.label,
    queueTickets: numberValue(overview?.total_queue_tickets),
    highPriorityCases,
    chatbotQuestion: topQuestion?.label,
    followupsScheduled: diagnosisItr.followups_scheduled,
  });

  const PRESET_RANGES: { key: string; label: string; from: () => Date }[] = [
    { key: "7d", label: "Last 7 days", from: () => { const d = new Date(); d.setDate(d.getDate() - 6); return d; } },
    { key: "30d", label: "Last 30 days", from: () => { const d = new Date(); d.setDate(d.getDate() - 29); return d; } },
    { key: "quarter", label: "This quarter", from: () => { const d = new Date(); d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); return d; } },
    { key: "ytd", label: "Year to date", from: () => { const d = new Date(); d.setMonth(0, 1); return d; } },
  ];

  const toIsoDate = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const presetIsActive = (key: string) => {
    const preset = PRESET_RANGES.find((r) => r.key === key);
    if (!preset) return false;
    return filters.from === toIsoDate(preset.from()) && filters.to === toIsoDate(new Date());
  };

  const applyPresetRange = (key: string) => {
    const preset = PRESET_RANGES.find((r) => r.key === key);
    if (!preset) return;
    const next = { ...filters, from: toIsoDate(preset.from()), to: toIsoDate(new Date()) };
    setFilters(next);
    setAppliedFilters(next);
  };

  function applyFilters() {
    if (isDateAfter(filters.from, filters.to)) {
      toast.warning(c.dateRangeError);
      return;
    }

    const next = {
      from: filters.from,
      to: filters.to,
      disease: filters.disease.trim(),
      rhuId: filters.rhuId,
      barangay: filters.barangay.trim(),
    };

    const sameFilters = JSON.stringify(next) === JSON.stringify(appliedFilters);

    if (sameFilters) {
      loadAnalytics(false, next);
      return;
    }

    setAppliedFilters(next);
  }

  function resetFilters() {
    const next = defaultFilters();

    setFilters(next);
    setAppliedFilters(next);
  }

  const [tab, setTab] = useState<
    "overview" | "clinical" | "telemedicine" | "queue"
  >("overview");

  // Compact filter bar: barangay/illness are expert filters, hidden behind
  // an Advanced toggle by default.
  const [showAdvanced, setShowAdvanced] = useState(false);

  const recentCasesTable = useSortableRows(
    diagnosisItr.recent_diagnosis_itr_cases,
    {
      patient: (r) => r.patient_name ?? "",
      barangay: (r) => normalizeBarangayName(r.barangay),
      diagnosis: (r) => normalizeDiagnosisLabel(r.diagnosis),
      date: (r) => r.consultation_date || r.completed_at || "",
      follow_up: (r) => r.follow_up_status ?? "",
    }
  );

  // Telemedicine completion + queue waiting figures for the 2-metric cards
  // and interpretation boxes (defensive against bar-shape differences).
  const barNum = (b: any) => numberValue(b?.value ?? b?.total ?? b?.count ?? 0);
  const teleTotal = (telemedicineStatusBars ?? []).reduce((sum: number, b: any) => sum + barNum(b), 0);
  const teleCompleted = (telemedicineStatusBars ?? [])
    .filter((b: any) => /complet/i.test(String(b?.label ?? b?.name ?? "")))
    .reduce((sum: number, b: any) => sum + barNum(b), 0);
  const teleRate = teleTotal > 0 ? Math.round((teleCompleted / teleTotal) * 100) : null;
  const queueWaitingBar = (queuePerformanceBars ?? []).find((b: any) =>
    /wait/i.test(String(b?.label ?? b?.name ?? ""))
  );
  const queueWaiting = queueWaitingBar ? barNum(queueWaitingBar) : null;
  const avgWaitLabel = overview?.average_wait_minutes
    ? `${Math.round(numberValue(overview.average_wait_minutes))} min`
    : "—";

  return (
    <div className="analytics-page">
      <style>{pageStyles}</style>

      <section className="analytics-hero">
        <div className="hero-content">
          <div className="hero-kicker">
            <BarChart3 size={16} />
            {c.eyebrow}
          </div>

          <h1>{c.title}</h1>

          <p>{c.subtitle}</p>

          <div className="hero-meta">
            <CalendarDays size={15} />
            {formatDate(appliedFilters.from)} – {formatDate(appliedFilters.to)}
            <span>•</span>
            {c.lastUpdated}: {formatTime(lastUpdated)}
            {refreshing ? ` • ${c.refreshing}` : ""}
          </div>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            onClick={() => loadAnalytics(false)}
            disabled={refreshing}
            className="hero-white-btn"
          >
            <RefreshCw size={16} />
            {c.refresh}
          </button>

          <button
            type="button"
            onClick={() => downloadCsv("ka-agapay-summary.csv", summaryRows)}
            className="hero-white-btn"
          >
            <Download size={16} />
            {c.exportSummary}
          </button>
        </div>
      </section>

      <section className="filter-panel">
        <div className="filter-intro">
          <strong>Choose what to view</strong>
          <span>💡 Tip: a one-week range shows daily trends most clearly.</span>
        </div>

        <div className="preset-row">
          {PRESET_RANGES.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPresetRange(preset.key)}
              className={`preset-chip${presetIsActive(preset.key) ? " active" : ""}`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label className="filter-field">
          <span>Start date</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
        </label>

        <label className="filter-field">
          <span>End date</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
        </label>

        <label className="filter-field">
          <span>{c.rhu}</span>
          {isGlobal ? (
            <select
              value={filters.rhuId}
              onChange={(event) => {
                // Switching RHU re-queries analytics for that facility.
                const next = { ...filters, rhuId: event.target.value };
                setFilters(next);
                setAppliedFilters(next);
              }}
            >
              {RHU_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="locked-filter">RHU {filters.rhuId} only</div>
          )}
        </label>

        {showAdvanced ? (
        <>
        <label className="filter-field">
          <span>Barangay, optional</span>
          <input
            value={filters.barangay}
            onChange={(event) =>
              setFilters({ ...filters, barangay: event.target.value })
            }
            placeholder={c.barangayPlaceholder}
          />
        </label>

        <div className="search-field">
          <Search size={17} />
          <input
            value={filters.disease}
            onChange={(event) =>
              setFilters({ ...filters, disease: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") applyFilters();
            }}
            placeholder="Illness or complaint, optional"
          />
        </div>
        </>
        ) : null}

        <button
          type="button"
          className="reset-btn"
          onClick={() => setShowAdvanced((current) => !current)}
          aria-expanded={showAdvanced}
        >
          <ChevronDown
            size={15}
            style={{ transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}
          />
          {showAdvanced ? "Hide Advanced" : "Advanced Filters"}
        </button>

        <button
          type="button"
          onClick={applyFilters}
          disabled={refreshing}
          className="apply-btn"
        >
          <Filter size={16} />
          {c.apply}
        </button>

        <button type="button" onClick={resetFilters} className="reset-btn">
          <RotateCcw size={16} />
          {c.reset}
        </button>
      </section>

      {notice && (
        <div className="notice-message">
          <CheckCircle size={17} />
          {notice}
        </div>
      )}

      {error && (
        <div className="error-message">
          <AlertTriangle size={17} />
          {error}
        </div>
      )}

      <section className="safety-banner">
        <ShieldAlert size={18} />
        <div>
          <strong>{c.safetyTitle}</strong>
          <p>{c.safetyBody}</p>
        </div>
      </section>

      {loading ? (
        <section className="loading-card">
          <RefreshCw size={26} />
          <strong>{c.loading}</strong>
        </section>
      ) : (
        <>
          <ModuleTabs
            tabs={[
              { key: "overview", label: "Overview" },
              { key: "clinical", label: "Clinical" },
              { key: "telemedicine", label: "Telemedicine" },
              { key: "queue", label: "Operations" },
            ]}
            active={tab}
            onChange={(key) => setTab(key as typeof tab)}
            style={{ marginBottom: 4 }}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0, maxWidth: 400 }}>
          <section className="overview-snapshot">
            <div className="snapshot-header">
              <div>
                <span>At a glance</span>
                <h2>{selectedRhuLabel} health activity</h2>
              </div>
              <p>Key numbers for the selected period.</p>
            </div>

          <section className="metric-grid overview-metrics">
            {tab === "overview" && (
            <>
            <Metric
              label="Total Patients"
              value={overview?.total_patients}
              icon={<Users size={22} />}
              helper={c.patientsHelp}
              insight={"Service-population baseline — pair with barangay data to spot under-registered areas."}
            />
            <Metric
              label="Completed Visits"
              value={diagnosisItr.total_completed_consultations}
              icon={<Stethoscope size={22} />}
              helper="Completed SOAP records"
              insight={`Averaging ${attendanceStats.averagePerDay}/day over ${attendanceStats.activeDays} active day(s) — compare with duty rosters.`}
            />
            <Metric
              label="With Diagnosis"
              value={diagnosisItr.total_diagnosed_consultations}
              icon={<Activity size={22} />}
              helper="Ready for health reporting"
              insight={numberValue(diagnosisItr.total_completed_consultations) > 0 && numberValue(diagnosisItr.total_diagnosed_consultations) < numberValue(diagnosisItr.total_completed_consultations) ? "Some visits still lack a diagnosis — close them before monthly reporting." : "Every completed visit carries a diagnosis — reporting-ready."}
            />
            <Metric
              label="Telemedicine Requests"
              value={overview?.total_telemedicine_requests}
              icon={<TrendingUp size={22} />}
              helper={c.telemedicineHelp}
              insight={"Demand signal for online care — protect telemedicine slots during clinic hours."}
            />
            </>
            )}

            {tab === "clinical" && (
            <>
            <Metric
              label="With Diagnosis"
              value={diagnosisItr.total_diagnosed_consultations}
              icon={<Activity size={22} />}
              helper={
                numberValue(diagnosisItr.total_completed_consultations) > 0
                  ? `${Math.round(
                      (numberValue(diagnosisItr.total_diagnosed_consultations) /
                        numberValue(diagnosisItr.total_completed_consultations)) * 100
                    )}% of consultations`
                  : "Records with diagnosis"
              }
              insight={"Documentation completeness drives disease surveillance — validate undiagnosed records."}
            />
            <Metric
              label="Follow-ups Due"
              value={diagnosisItr.followups_scheduled}
              icon={<CheckCircle size={22} />}
              helper="Patients to monitor after visit"
              insight={numberValue(diagnosisItr.followups_scheduled) > 0 ? "Assign BHW outreach before these lapse — overdue follow-ups break continuity of care." : "No pending follow-ups — continuity of care is on track."}
            />
            <Metric
              label="Top Diagnosis"
              value={normalizeDiagnosisLabel(diagnosisItr.top_diagnosis) || "—"}
              icon={<FileText size={22} />}
              helper="Most frequent this period"
              insight={"Stock related medicines first and prepare a short advisory for affected barangays."}
            />
            <Metric
              label="Average Patients / Day"
              value={attendanceStats.averagePerDay}
              icon={<TrendingUp size={22} />}
              helper={`${attendanceStats.activeDays} active visit days`}
              insight={"Compare against consultation-hour capacity to spot overloaded days early."}
            />
            </>
            )}

            {tab === "queue" && (
            <>
            <Metric
              label="Average Wait Time"
              value={avgWaitLabel}
              icon={<TrendingUp size={22} />}
              helper="Average waiting time, if available"
              insight={overview?.average_wait_minutes && Math.round(numberValue(overview.average_wait_minutes)) > 20 ? "Above the 20-minute comfort target — open another service window at peak hours." : "Within a comfortable range — keep watching the hourly peaks."}
            />
            <Metric
              label="Patients Waiting"
              value={queueWaiting ?? overview?.total_queue_tickets}
              icon={<BarChart3 size={22} />}
              helper={queueWaiting !== null ? "Currently in the waiting line" : c.queueHelp}
              insight={queueWaiting !== null && queueWaiting > 0 ? "Live pressure signal — call priority patients (senior, PWD, pregnant) first." : "Queue pressure is low right now."}
            />
            <Metric
              label="Queue Tickets"
              value={overview?.total_queue_tickets}
              icon={<BarChart3 size={22} />}
              helper={c.queueHelp}
              insight={"Total demand for the period — align duty schedules with the hourly chart below."}
            />
            <Metric
              label="Pending Appointments"
              value={overview?.pending_appointments ?? overview?.total_pending_appointments}
              icon={<CalendarDays size={22} />}
              helper="Requests needing RHU action"
              insight={"Approve or reschedule promptly — unanswered requests become no-shows."}
            />
            </>
            )}

            {tab === "telemedicine" && (
            <>
            <Metric
              label="Online Requests"
              value={overview?.total_telemedicine_requests}
              icon={<TrendingUp size={22} />}
              helper={c.telemedicineHelp}
              insight={"Each request avoids a facility trip — worth prioritizing for far-flung barangays."}
            />
            <Metric
              label="Completion Rate"
              value={teleRate !== null ? `${teleRate}%` : "—"}
              icon={<CheckCircle size={22} />}
              helper={
                teleRate !== null
                  ? `${compactNumber(teleCompleted)} of ${compactNumber(teleTotal)} sessions`
                  : "Completed vs all sessions"
              }
              insight={teleRate !== null && teleRate < 80 ? "Below 80% — review no-shows and connectivity before scheduled sessions." : "Sessions are completing properly — keep confirmation SMS flowing."}
            />
            <Metric
              label="Completed Sessions"
              value={compactNumber(teleCompleted)}
              icon={<Stethoscope size={22} />}
              helper="Finished online consultations"
              insight={"These count toward consultation totals — verify SOAP notes were finalized."}
            />
            <Metric
              label="All Sessions"
              value={compactNumber(teleTotal)}
              icon={<BarChart3 size={22} />}
              helper="Every telemedicine status"
              insight={"The full tele pipeline, including pending and screened requests."}
            />
            </>
            )}
          </section>
          </section>
          </div>

          <div style={{ flex: "3 1 460px", minWidth: 0, display: "grid", gap: 18 }}>

          <section className="metric-grid diagnosis-metric-grid" style={{ display: "none" }}>
            <Metric
              label="Completed Consultations"
              value={diagnosisItr.total_completed_consultations}
              icon={<Stethoscope size={22} />}
              helper="Completed SOAP records"
            />

            <Metric
              label="Diagnosed Consultations"
              value={diagnosisItr.total_diagnosed_consultations}
              icon={<Activity size={22} />}
              helper="Records with diagnosis"
            />

            <Metric
              label="Top Diagnosis"
              value={normalizeDiagnosisLabel(diagnosisItr.top_diagnosis)}
              icon={<FileText size={22} />}
              helper="Most frequent diagnosis"
            />

            <Metric
              label="Follow-ups Scheduled"
              value={diagnosisItr.followups_scheduled}
              icon={<CheckCircle size={22} />}
              helper="SOAP follow-up reminders"
            />
          </section>

          {tab === "overview" && (
          <>
          <section className="chart-grid main-grid">
            <section className="chart-card">
              <div className="section-header">
                <div className="section-title-block">
                  <h2>
                    <span><TrendingUp size={18} /></span>
                    Patient Attendance by Day
                  </h2>
                  <p>Daily attended patient trend from {selectedRhuLabel} completed visits.</p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${selectedRhuSlug}-patient-attendance-by-day.csv`, attendanceByDate as any)}
                  className="csv-btn"
                >
                  <Download size={15} />
                  {c.csv}
                </button>
              </div>
              <AnalyticsBarChart
                data={attendanceByDate}
                emptyText="No patient attendance data available"
                chartType="vertical"
              />
              <Insight
                text={`Peak day so far is ${attendanceStats.peakDay || "—"} with ${compactNumber(attendanceStats.peakTotal)} visits; the average is ${attendanceStats.averagePerDay} patient(s) per day. Plan staffing around the peak days.`}
              />
            </section>

          </section>

          <Expandable title="Weekly patterns & AI triage">
            <section className="chart-grid main-grid">
              <AveragePatientsWeekCard
                stats={attendanceStats}
                data={attendanceByDayOfWeek}
                rawRows={(overview?.attendance_by_day_of_week || attendanceByDayOfWeek) as any}
                csvLabel={c.csv}
                rhuLabel={selectedRhuLabel}
                rhuSlug={selectedRhuSlug}
              />
            </section>
            <section className="chart-grid main-grid">
              <ChartCard
                title="AI Triage Priority Distribution"
                subtitle="Urgent, high, moderate, and low priority classifications. Staff validation is required."
                icon={<ShieldAlert size={18} />}
                data={aiTriageBars}
                exportName={`${selectedRhuSlug}-ai-triage-priority-distribution.csv`}
                rawRows={(pickArray(overview, ["ai_triage_distribution", "aiTriageDistribution"]).length ? pickArray(overview, ["ai_triage_distribution", "aiTriageDistribution"]) : aiTriageBars) as any}
                emptyText="No AI triage priority data available"
                showLevel
                chartType="vertical"
                showPercent
                csvLabel={c.csv}
              />
            </section>
          </Expandable>
          </>
          )}

          {tab === "clinical" && (
          <>
          <section className="chart-grid main-grid">
            <ChartCard
              title="Top Diagnoses / Complaints"
              subtitle="Ranked diagnosis or complaint labels from completed consultations."
              icon={<FileText size={18} />}
              data={topDiagnosisBars}
              exportName="top-diagnoses-complaints.csv"
              rawRows={topDiagnosisBars as any}
              emptyText="No diagnosis data available"
              showPercent
              csvLabel={c.csv}
              insight={
                diagnosisItr.top_diagnosis
                  ? `"${normalizeDiagnosisLabel(diagnosisItr.top_diagnosis)}" is the leading diagnosis this period. Check related medicines and supplies, and consider a short health advisory for the affected barangays.`
                  : "No leading diagnosis yet for this period. Records with completed SOAP + diagnosis will appear here as staff finish consultations."
              }
            />
          </section>

          <Expandable title="More clinical charts">
          <section className="chart-grid">
            <ChartCard
              title={c.barangayRiskTitle}
              subtitle={c.barangayRiskSub}
              icon={<Activity size={18} />}
              data={barangayBars}
              exportName="barangay-risk.csv"
              rawRows={sortedRisk as any}
              emptyText={c.noChartData}
              showLevel
              csvLabel={c.csv}
            />

            <ChartCard
              title={c.diseaseTitle}
              subtitle={c.diseaseSub}
              icon={<Stethoscope size={18} />}
              data={diseaseBars}
              exportName="patient-cases-by-disease-illness.csv"
              rawRows={diseaseRawRows as any}
              emptyText={c.noCluster}
              showPercent
              csvLabel={c.csv}
            />

            <ChartCard
              title={c.chatbotTitle}
              subtitle={c.chatbotSub}
              icon={<Bot size={18} />}
              data={chatbotBars}
              exportName="chatbot-prompts.csv"
              rawRows={chatbot?.top_prompts || []}
              emptyText={c.noChartData}
              csvLabel={c.csv}
            />
          </section>

          <section className="chart-grid">
            <section className="chart-card">
              <div className="section-header">
                <div className="section-title-block">
                  <h2>
                    <span><TrendingUp size={18} /></span>
                    Diagnosis Trend Over Time
                  </h2>
                  <p>Completed Diagnosis + ITR consultation volume by date.</p>
                </div>
              </div>
              <TrendChart data={diagnosisTrend} />
            </section>

            <ChartCard
              title="Follow-up Status Distribution"
              subtitle="Follow-up status from completed Diagnosis + ITR records."
              icon={<CheckCircle size={18} />}
              data={followUpBars}
              exportName="follow-up-status-distribution.csv"
              rawRows={followUpBars as any}
              emptyText="No follow-up data available"
              csvLabel={c.csv}
            />
          </section>
          </Expandable>
          </>
          )}

          {tab === "queue" && (
          <>
          <section className="chart-grid main-grid">
            <ChartCard
              title="Queue Volume by Hour"
              subtitle={`Hourly ${selectedRhuLabel} queue arrivals to identify peak service windows.`}
              icon={<TrendingUp size={18} />}
              data={queueByHourBars}
              exportName={`${selectedRhuSlug}-queue-volume-by-hour.csv`}
              rawRows={(pickArray(overview, ["queue_by_hour", "queueByHour"]).length ? pickArray(overview, ["queue_by_hour", "queueByHour"]) : queueByHourBars) as any}
              emptyText="No queue-by-hour data available"
              chartType="vertical"
              csvLabel={c.csv}
              insight={`Average wait is ${avgWaitLabel}${queueWaiting !== null ? ` with ${compactNumber(queueWaiting)} patient(s) currently waiting` : ""}. If mid-week wait times spike, add staff on those days and review the appointment booking spread.`}
            />
          </section>

          <Expandable title="More operations charts">
          <section className="metric-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Metric
              label="Chatbot Messages"
              value={overview?.total_chat_messages}
              icon={<Bot size={22} />}
              helper={c.chatHelp}
              insight={"Resident questions only — turn repeated topics into announcements or FAQs."}
            />
            <Metric
              label="SMS / Notifications"
              value={overview?.sms_sent ?? overview?.notifications_sent ?? overview?.total_notifications_sent}
              icon={<FileText size={22} />}
              helper="Communication activity, if tracked"
              insight={"Outbound reach — after campaigns, check the SMS Center for failed sends."}
            />
          </section>
          <section className="chart-grid">
            <ChartCard
              title="Queue Performance"
              subtitle={`${selectedRhuLabel} queue workload from available ticket counters.`}
              icon={<Users size={18} />}
              data={queuePerformanceBars}
              exportName={`${selectedRhuSlug}-queue-performance.csv`}
              rawRows={queuePerformanceBars as any}
              emptyText="No queue performance data available"
              csvLabel={c.csv}
            />

            <ChartCard
              title="Priority Patient Breakdown"
              subtitle="Senior, PWD, pregnant, child, urgent, and regular queue signals."
              icon={<ShieldAlert size={18} />}
              data={priorityBreakdownBars}
              exportName={`${selectedRhuSlug}-priority-patient-breakdown.csv`}
              rawRows={(pickArray(overview, ["priority_breakdown", "priority_patient_breakdown", "priorityPatientBreakdown"]).length ? pickArray(overview, ["priority_breakdown", "priority_patient_breakdown", "priorityPatientBreakdown"]) : priorityBreakdownBars) as any}
              emptyText="No priority patient data available"
              chartType="vertical"
              csvLabel={c.csv}
            />

            <ChartCard
              title="Appointment Status Distribution"
              subtitle="Pending, approved, completed, cancelled, rejected, and no-show appointments if tracked."
              icon={<CalendarDays size={18} />}
              data={appointmentStatusBars}
              exportName={`${selectedRhuSlug}-appointment-status.csv`}
              rawRows={appointmentStatusBars as any}
              emptyText="No appointment status data available"
              chartType="vertical"
              csvLabel={c.csv}
            />

          </section>
          </Expandable>
          </>
          )}

          {tab === "telemedicine" && (
          <>
          <section className="chart-grid main-grid">
            <ChartCard
              title="Telemedicine Status Distribution"
              subtitle="Online consultation demand and completed telemedicine sessions."
              icon={<Activity size={18} />}
              data={telemedicineStatusBars}
              exportName={`${selectedRhuSlug}-telemedicine-status.csv`}
              rawRows={telemedicineStatusBars as any}
              emptyText="No telemedicine status data available"
              chartType="vertical"
              csvLabel={c.csv}
              insight={`${compactNumber(numberValue(overview?.total_telemedicine_requests))} telemedicine request(s) in this period${teleRate !== null ? `, ${teleRate}% marked completed` : ""}. Keep online consultation slots open and confirm connectivity before scheduled sessions.`}
            />
          </section>

          </>
          )}

          {tab === "clinical" && (
          <Expandable title="Demographics & services">
          <section className="chart-grid">
            <ChartCard
              title="Age Group Distribution"
              subtitle={`${selectedRhuLabel} completed consultation records grouped by age, where available.`}
              icon={<Users size={18} />}
              data={ageGroupBars}
              exportName={`${selectedRhuSlug}-age-group-distribution.csv`}
              rawRows={ageGroupBars as any}
              emptyText="No age group data available"
              chartType="vertical"
              csvLabel={c.csv}
            />

            <ChartCard
              title="Sex / Gender Distribution"
              subtitle={`${selectedRhuLabel} completed consultation records grouped by sex or gender, where available.`}
              icon={<Users size={18} />}
              data={sexGenderBars}
              exportName={`${selectedRhuSlug}-sex-gender-distribution.csv`}
              rawRows={sexGenderBars as any}
              emptyText="No sex or gender data available"
              chartType="vertical"
              csvLabel={c.csv}
            />

            <ChartCard
              title="Chatbot Inquiry Categories"
              subtitle={`Resident question categories that ${selectedRhuLabel} may convert into announcements or FAQs.`}
              icon={<Bot size={18} />}
              data={chatbotCategoryBars}
              exportName={`${selectedRhuSlug}-chatbot-inquiry-categories.csv`}
              rawRows={chatbotCategoryBars as any}
              emptyText="No chatbot category data available"
              csvLabel={c.csv}
            />

            <ChartCard
              title="Program and Event Participation"
              subtitle="Registrations or attendees by program/event title. Barangay detail is shown when the backend provides it."
              icon={<MapPinned size={18} />}
              data={programParticipationBars}
              exportName={`${selectedRhuSlug}-program-event-participation.csv`}
              rawRows={programParticipationBars as any}
              emptyText="No program or event participation data available"
              csvLabel={c.csv}
            />
          </section>

          <section className="chart-grid two-column-grid">
            <ChartCard
              title={`${selectedRhuLabel} Service Load`}
              subtitle={`${selectedRhuLabel} completed Diagnosis + ITR consultation records in the selected period.`}
              icon={<BarChart3 size={18} />}
              data={rhuServiceLoadBars}
              exportName={`${selectedRhuSlug}-service-load.csv`}
              rawRows={rhuServiceLoadBars as any}
              emptyText={`No ${selectedRhuLabel} service-load data available`}
              csvLabel={c.csv}
            />

            <section className="chart-card">
              <div className="section-header">
                <div className="section-title-block">
                  <h2>
                    <span><MapPinned size={18} /></span>
                    Diagnosis by Barangay
                  </h2>
                  <p>Barangays with the most common completed consultation diagnoses.</p>
                </div>
              </div>
              <DiagnosisByBarangayTable rows={diagnosisByBarangayRows} />
            </section>
          </section>
          </Expandable>
          )}

          {tab === "clinical" && (
          <Expandable title="Recent cases & recommended actions">
          <section className="action-card analytics-report-table">
            <div className="section-header">
              <div>
                <h2>Recent Diagnosis + ITR Cases</h2>
                <p>
                  Completed consultations with patient ITR, diagnosis,
                  treatment, and follow-up status.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    "recent-diagnosis-itr-cases.csv",
                    diagnosisItr.recent_diagnosis_itr_cases as any
                  )
                }
                className="csv-btn"
              >
                <Download size={15} />
                CSV
              </button>
            </div>

            <div className="diagnosis-table-wrap">
              <table className="diagnosis-table">
                <thead>
                  <tr>
                    <SortableTh label="Patient" sortKey="patient" sort={recentCasesTable.sort} onSort={recentCasesTable.toggle} />
                    <th>Age/Sex</th>
                    <SortableTh label="Barangay" sortKey="barangay" sort={recentCasesTable.sort} onSort={recentCasesTable.toggle} />
                    <SortableTh label="Diagnosis" sortKey="diagnosis" sort={recentCasesTable.sort} onSort={recentCasesTable.toggle} />
                    <SortableTh label="Consultation Date" sortKey="date" sort={recentCasesTable.sort} onSort={recentCasesTable.toggle} />
                    <SortableTh label="Follow-up Status" sortKey="follow_up" sort={recentCasesTable.sort} onSort={recentCasesTable.toggle} />
                  </tr>
                </thead>

                <tbody>
                  {recentCasesTable.sorted.map((row) => (
                    <tr key={row.consultation_id}>
                      <td>{row.patient_name || "Patient"}</td>
                      <td>{caseAgeSex(row)}</td>
                      <td>{normalizeBarangayName(row.barangay)}</td>
                      <td>{normalizeDiagnosisLabel(row.diagnosis)}</td>
                      <td>
                        {formatDate(
                          row.consultation_date ||
                            row.completed_at ||
                            undefined
                        )}
                      </td>
                      <td>{row.follow_up_status || "none"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {diagnosisItr.recent_diagnosis_itr_cases.length === 0 ? (
              <div className="empty-chart">No Diagnosis + ITR cases found.</div>
            ) : null}
          </section>

          <section className="action-card">
            <div className="section-header">
              <div>
                <h2>{c.actionTitle}</h2>
                <p>{c.actionSub}</p>
              </div>

              <FileText size={24} />
            </div>

            <div className="advice-grid">
              <AdviceCard
                title="AI Analytics Summary"
                body={`${actionSummaryText} This summary is generated from system data and should be validated by RHU staff.`}
              />

              <AdviceCard
                title={c.bhwTitle}
                body={
                  topRisk
                    ? `${topRisk.label} has the highest current signal. Check residents with ${
                        topRisk.helper || "health complaints"
                      }.`
                    : c.noRisk
                }
              />

              <AdviceCard
                title={c.programTitle}
                body={
                  topDisease
                    ? `Common signal is "${shortText(
                        topDisease.label,
                        70
                      )}". Prepare health advisory, medicines, or consultation slots if this increases.`
                    : c.noCluster
                }
              />

              <AdviceCard
                title={c.contentTitle}
                body={
                  topQuestion
                    ? `Residents are asking about "${shortText(
                        topQuestion.label,
                        70
                      )}". Post a simple announcement or FAQ for this concern.`
                    : c.noChatbot
                }
              />

              <AdviceCard
                title="What medicine or supply should be checked?"
                body={
                  topDisease
                    ? `Review ${selectedRhuLabel} supplies related to ${shortText(topDisease.label, 60)} cases. Use inventory records before procurement or public advice.`
                    : "No dominant diagnosis yet. Keep completing SOAP diagnosis fields so supply planning becomes more reliable."
                }
              />

              <AdviceCard
                title="What queue or service needs staff attention?"
                body={
                  queuePerformanceBars.length > 0
                    ? `Monitor ${selectedRhuLabel} queue workload. ${queuePerformanceBars[0].label} is currently the strongest available queue signal.`
                    : "No queue performance counters were returned for the selected filters."
                }
              />
            </div>
          </section>
          </Expandable>
          )}

          </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Progressive disclosure: secondary charts/tables live behind this toggle so
 * each tab shows ONE main chart by default.
 */
/** Compact gray interpretation strip — rendered INSIDE the chart card. */
function Insight({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 14,
        background: "#F3F4F6",
        border: "1px solid #E5E7EB",
        borderRadius: 14,
        padding: "12px 16px",
        fontSize: 13.5,
        lineHeight: 1.6,
        color: "#374151",
      }}
    >
      <strong style={{ color: "#0F766E" }}>Interpretation: </strong>
      {text}
    </div>
  );
}

function Expandable({ title, children }: { title: string; children: ReactNode }) {
  // Formerly an accordion - now an always-visible labeled group so every
  // chart is one glance away (no hidden content), matching the card-flow
  // layout of the main chart section.
  return (
    <section className="expandable-panel" style={{ display: "grid", gap: 14, background: "transparent", border: 0, boxShadow: "none" }}>
      <h3
        style={{
          margin: "8px 0 0",
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: "#0F766E",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  icon,
  helper,
  insight,
}: {
  label: string;
  value: any;
  icon: ReactNode;
  helper: string;
  /** Short professional guidance generated from live data (validated by staff). */
  insight?: string;
}) {
  const displayValue =
    typeof value === "string" && Number.isNaN(Number(value))
      ? value
      : compactNumber(value);

  return (
    <section className="metric-card">
      <div>
        <span>{label}</span>
        <strong title={String(displayValue)}>{displayValue}</strong>
        <small>{helper}</small>
        {insight ? <em className="metric-insight">✦ AI insight: {insight}</em> : null}
      </div>

      <div className="metric-icon">{icon}</div>
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  data,
  exportName,
  rawRows,
  emptyText,
  showLevel,
  csvLabel,
  chartType = "horizontal",
  showPercent,
  insight,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  data: BarItem[];
  exportName: string;
  rawRows: Array<Record<string, any>>;
  emptyText: string;
  showLevel?: boolean;
  csvLabel: string;
  chartType?: "horizontal" | "vertical";
  showPercent?: boolean;
  /** Integrated interpretation strip shown inside the card, under the chart. */
  insight?: string;
}) {
  return (
    <section className="chart-card">
      <div className="section-header">
        <div className="section-title-block">
          <h2>
            <span>{icon}</span>
            {title}
          </h2>

          <p>{subtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => downloadCsv(exportName, rawRows)}
          className="csv-btn"
        >
          <Download size={15} />
          {csvLabel}
        </button>
      </div>

      <AnalyticsBarChart
        data={data}
        emptyText={emptyText}
        showLevel={showLevel}
        chartType={chartType}
        showPercent={showPercent}
      />

      {insight ? <Insight text={insight} /> : null}
    </section>
  );
}

function AveragePatientsWeekCard({
  stats,
  data,
  rawRows,
  csvLabel,
  rhuLabel,
  rhuSlug,
}: {
  stats: AttendanceStats;
  data: BarItem[];
  rawRows: Array<Record<string, any>>;
  csvLabel: string;
  rhuLabel: string;
  rhuSlug: string;
}) {
  return (
    <section className="chart-card attendance-card">
      <div className="section-header">
        <div className="section-title-block">
          <h2>
            <span><CalendarDays size={18} /></span>
            Average Patients Throughout the Week
          </h2>
          <p>{rhuLabel} attendance by weekday, using completed visits first and safe fallback sources when needed.</p>
        </div>

        <button
          type="button"
          onClick={() => downloadCsv(`${rhuSlug}-average-patients-throughout-week.csv`, rawRows)}
          className="csv-btn"
        >
          <Download size={15} />
          {csvLabel}
        </button>
      </div>

      <div className="attendance-stat-grid">
        <div>
          <span>Total visits</span>
          <strong>{compactNumber(stats.totalVisits)}</strong>
        </div>
        <div>
          <span>Active days</span>
          <strong>{compactNumber(stats.activeDays)}</strong>
        </div>
        <div>
          <span>Average</span>
          <strong>{compactNumber(stats.averagePerDay)}/day</strong>
        </div>
        <div>
          <span>Peak day</span>
          <strong>{stats.peakDay}</strong>
          <small>{compactNumber(stats.peakTotal)} patients</small>
        </div>
        <div>
          <span>Lowest day</span>
          <strong>{stats.slowestDay}</strong>
          <small>{compactNumber(stats.slowestTotal)} patients</small>
        </div>
      </div>

      <AnalyticsBarChart
        data={data}
        emptyText="No weekly attendance data available"
        chartType="vertical"
      />

      <div className="rhu-action-line">
        RHU action: assign more staff on peak days and review barangay follow-up when attendance rises.
      </div>
    </section>
  );
}

const CHART_COLORS = ["#0F766E", "#14B8A6", "#2563EB", "#F59E0B", "#EF4444", "#8B5CF6", "#64748B"];

function chartFill(index: number, level?: string): string {
  const normalized = String(level || "").toLowerCase();

  if (["urgent", "critical", "high"].includes(normalized)) return "#EF4444";
  if (normalized === "moderate") return "#F59E0B";
  if (normalized === "low") return "#14B8A6";

  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Color legend under every chart. Where bars carry a risk `level`, color
 * MEANS severity; everywhere else each color simply identifies its
 * category — the legend maps swatch to label so nothing is guesswork.
 */
function ChartLegend({ data, showLevel }: { data: BarItem[]; showLevel?: boolean }) {
  if (data.length === 0) return null;

  const hasLevels = Boolean(showLevel) && data.some((item) => item.level);

  if (hasLevels) {
    return (
      <div className="chart-legend">
        <span className="legend-title">Bar color = risk level:</span>
        <span><i className="legend-dot" style={{ background: "#EF4444" }} /> High / Urgent</span>
        <span><i className="legend-dot" style={{ background: "#F59E0B" }} /> Moderate</span>
        <span><i className="legend-dot" style={{ background: "#14B8A6" }} /> Low</span>
      </div>
    );
  }

  const entries = data.slice(0, 8);

  return (
    <div className="chart-legend">
      <span className="legend-title">Color guide:</span>
      {entries.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          <i className="legend-dot" style={{ background: chartFill(index, item.level) }} />
          {shortText(item.label, 22)}
        </span>
      ))}
      {data.length > 8 ? <span>+{data.length - 8} more</span> : null}
    </div>
  );
}

function EmptyChartState({ text }: { text: string }) {
  return <div className="empty-chart">{text}</div>;
}

function AnalyticsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload ?? {};

  return (
    <div className="chart-tooltip">
      <strong>{label ?? row.label}</strong>
      <span>{compactNumber(row.value ?? row.total ?? row.count)} records</span>
      {row.helper ? <small>{row.helper}</small> : null}
    </div>
  );
}

function AnalyticsBarChart({
  data,
  emptyText,
  showLevel,
  chartType = "horizontal",
  showPercent,
}: {
  data: BarItem[];
  emptyText: string;
  showLevel?: boolean;
  chartType?: "horizontal" | "vertical";
  showPercent?: boolean;
}) {
  if (data.length === 0) {
    return <EmptyChartState text={emptyText} />;
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const chartData = data.map((item, index) => ({
    ...item,
    displayLabel: shortText(item.label, chartType === "horizontal" ? 28 : 12),
    fill: chartFill(index, item.level),
    percentLabel: showPercent ? formatPercent(item.value, total) : "",
  }));

  if (chartType === "vertical") {
    return (
      <>
      <div className="analytics-chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={chartData} margin={{ top: 12, right: 12, left: -12, bottom: 8 }}>
            <CartesianGrid stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="displayLabel" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12, fontWeight: 800 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12, fontWeight: 800 }} />
            <Tooltip content={<AnalyticsTooltip />} cursor={{ fill: "rgba(15,118,110,.08)" }} />
            <Bar dataKey="value" radius={[10, 10, 4, 4]} maxBarSize={52}>
              {chartData.map((entry, index) => (
                <Cell key={`${entry.label}-${index}`} fill={entry.fill} />
              ))}
              <LabelList dataKey="value" position="top" formatter={(value: any) => compactNumber(value)} fill="#0F172A" fontSize={12} fontWeight={900} />
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend data={data} showLevel={showLevel} />
      </>
    );
  }

  return (
    <>
      <div className="analytics-chart-box horizontal-chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: showPercent ? 58 : 32, left: 12, bottom: 8 }}
          >
            <CartesianGrid stroke="#E2E8F0" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12, fontWeight: 800 }} />
            <YAxis
              type="category"
              dataKey="displayLabel"
              width={132}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#334155", fontSize: 12, fontWeight: 900 }}
            />
            <Tooltip content={<AnalyticsTooltip />} cursor={{ fill: "rgba(15,118,110,.08)" }} />
            <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={22}>
              {chartData.map((entry, index) => (
                <Cell key={`${entry.label}-${index}`} fill={entry.fill} />
              ))}
              <LabelList
                dataKey={showPercent ? "percentLabel" : "value"}
                position="right"
                formatter={(value: any) => (showPercent ? value : compactNumber(value))}
                fill="#0F172A"
                fontSize={12}
                fontWeight={900}
              />
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend data={data} showLevel={showLevel} />

      {showLevel ? (
        <div className="chart-badge-row">
          {data.slice(0, 6).map((item) => (
            <span key={`${item.label}-${item.level}`} className="risk-pill" style={riskLevelStyle(item.level)}>
              {shortText(item.label, 20)} · {String(item.level || "low").toUpperCase()}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function TrendChart({
  data,
  emptyText = "No diagnosis trend data available",
}: {
  data: Array<{ label: string; value: number }>;
  emptyText?: string;
}) {
  if (data.length === 0) {
    return <EmptyChartState text={emptyText} />;
  }

  return (
    <div className="analytics-chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, left: -12, bottom: 8 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="label" tickFormatter={(value) => formatDate(String(value)).replace(", 202", "")} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 11, fontWeight: 800 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12, fontWeight: 800 }} />
          <Tooltip content={<AnalyticsTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0F766E"
            strokeWidth={3}
            dot={{ r: 4, fill: "#0F766E", strokeWidth: 2, stroke: "#FFFFFF" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DiagnosisByBarangayTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) {
    return <EmptyChartState text="No barangay diagnosis data available" />;
  }

  return (
    <div className="diagnosis-table-wrap compact-table-wrap">
      <table className="diagnosis-table compact-table">
        <thead>
          <tr>
            <th>Barangay</th>
            <th>Diagnosis</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.barangay}-${row.diagnosis}-${index}`}>
              <td>{row.barangay}</td>
              <td>{row.diagnosis}</td>
              <td>{compactNumber(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdviceCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <article className="advice-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

const pageStyles = `
.analytics-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(20, 184, 166, 0.12), transparent 30%),
    linear-gradient(180deg, #F8FAFC 0%, #EEF2F7 100%);
  min-height: 100%;
  color: #0F172A;
}

.analytics-hero {
  position: relative;
  overflow: hidden;
  border-radius: 26px;
  padding: 20px 24px;
  background:
    linear-gradient(135deg, rgba(15, 118, 110, 0.96), rgba(13, 148, 136, 0.92)),
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.24), transparent 34%);
  color: white;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  box-shadow: 0 24px 60px rgba(15, 118, 110, 0.22);
}

.analytics-hero::after {
  content: "";
  position: absolute;
  right: -120px;
  top: -120px;
  width: 280px;
  height: 280px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 820px;
}

.hero-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.17);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.analytics-hero h1 {
  margin: 8px 0 6px;
  font-size: clamp(22px, 3vw, 30px);
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.analytics-hero p {
  margin: 0;
  max-width: 720px;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1.7;
  font-size: 15px;
}

.hero-meta {
  margin-top: 18px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  font-size: 13px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.88);
}

.hero-actions {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.hero-white-btn {
  border: 0;
  border-radius: 999px;
  min-height: 42px;
  background: white;
  color: #0F766E;
  font-weight: 900;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.hero-white-btn:disabled {
  opacity: .65;
  cursor: not-allowed;
}

.filter-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(16px);
}

.filter-intro {
  flex: 1 1 100%;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 4px;
}

.filter-intro strong {
  color: #0F172A;
  font-size: 16px;
  font-weight: 900;
}

.filter-intro span {
  color: #64748B;
  font-size: 13px;
  font-weight: 700;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.filter-field span {
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #64748B;
}

.filter-field input,
.filter-field select,
.search-field input {
  width: 100%;
  border: 1px solid #CBD5E1;
  border-radius: 12px;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  outline: none;
  background: white;
}

.filter-field select {
  min-height: 42px;
}

.locked-filter {
  border: 1px solid #99F6E4;
  border-radius: 999px;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 900;
  color: #0F766E;
  background: #ECFDF5;
}

.search-field {
  height: 42px;
  border: 1px solid #CBD5E1;
  border-radius: 12px;
  background: white;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
}

.search-field input {
  border: 0;
  padding: 0;
}

.apply-btn,
.reset-btn,
.csv-btn {
  border: 0;
  cursor: pointer;
  font-weight: 900;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.apply-btn {
  height: 42px;
  padding: 0 16px;
  background: #0F766E;
  color: white;
}

.reset-btn {
  height: 42px;
  padding: 0 16px;
  background: #E2E8F0;
  color: #334155;
}

.csv-btn {
  min-height: 36px;
  padding: 9px 11px;
  background: #ECFDF5;
  color: #0F766E;
  border: 1px solid #99F6E4;
  white-space: nowrap;
}

.notice-message,
.error-message,
.safety-banner {
  border-radius: 18px;
  padding: 13px 16px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-weight: 800;
  font-size: 13px;
}

.notice-message {
  background: #ECFDF5;
  color: #047857;
  border: 1px solid #A7F3D0;
}

.error-message {
  background: #FEF2F2;
  color: #B91C1C;
  border: 1px solid #FECACA;
}

.safety-banner {
  background: #FFFDF3;
  border: 1px solid #FDE68A;
  color: #92400E;
}

.safety-banner p {
  margin: 3px 0 0;
  font-weight: 700;
  line-height: 1.5;
}

.loading-card,
.metric-card,
.chart-card,
.action-card {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 18px;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.06);
  transition: box-shadow 0.25s ease;
}

.chart-card:hover {
  box-shadow: 0 22px 50px rgba(15, 23, 42, 0.1);
}

.loading-card {
  min-height: 260px;
  display: grid;
  place-items: center;
  gap: 10px;
  color: #0F766E;
}

.overview-snapshot {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 18px;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.06);
  padding: 18px;
  display: grid;
  gap: 16px;
}

.snapshot-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  border-bottom: 1px solid #E2E8F0;
  padding-bottom: 14px;
}

.snapshot-header span {
  display: block;
  color: #0F766E;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.snapshot-header h2 {
  margin: 4px 0 0;
  color: #0F172A;
  font-size: 22px;
  line-height: 1.2;
}

.snapshot-header p {
  margin: 0;
  max-width: 460px;
  color: #64748B;
  font-size: 13px;
  line-height: 1.5;
  font-weight: 700;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 14px;
}

.overview-metrics {
  grid-template-columns: repeat(4, minmax(160px, 1fr));
}

.overview-metrics .metric-card:nth-child(n+5) {
  padding: 13px 14px;
  min-height: 0;
  align-items: center;
  box-shadow: none;
  background: #F8FAFC;
  border-color: #E2E8F0;
}

.overview-metrics .metric-card:nth-child(n+5) .metric-icon {
  display: none;
}

.overview-metrics .metric-card:nth-child(n+5) span {
  font-size: 11px;
  letter-spacing: .04em;
}

.overview-metrics .metric-card:nth-child(n+5) strong {
  font-size: 20px;
  margin-top: 5px;
  letter-spacing: 0;
}

.overview-metrics .metric-card:nth-child(n+5) small {
  display: none;
}

.diagnosis-metric-grid {
  margin-top: -8px;
}

.metric-card {
  padding: 18px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease, border-color 0.25s ease;
}

.metric-insight {
  display: block;
  margin-top: 9px;
  padding: 7px 9px;
  border-radius: 10px;
  background: #F0FDFA;
  border: 1px solid #CCFBF1;
  color: #0F766E;
  font-size: 11.5px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.5;
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.chart-legend .legend-title {
  font-weight: 900;
  color: #64748B;
  text-transform: uppercase;
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
  display: inline-block;
}

.metric-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 34px rgba(15, 118, 110, 0.12);
  border-color: #99F6E4;
}

.preset-row {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #CBD5E1;
  background: #FFFFFF;
  color: #334155;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-chip:hover {
  border-color: #0F766E;
  color: #0F766E;
}

.preset-chip.active {
  background: #0F766E;
  border-color: #0F766E;
  color: #FFFFFF;
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.22);
}

.metric-card span {
  display: block;
  color: #64748B;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.metric-card strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(22px, 3vw, 34px);
  line-height: 1;
  letter-spacing: -0.04em;
  color: #0F172A;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.metric-card small {
  display: block;
  margin-top: 8px;
  color: #64748B;
  font-weight: 700;
  line-height: 1.4;
}

.metric-icon {
  flex: 0 0 auto;
  width: 45px;
  height: 45px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: #0F766E;
  background: #CCFBF1;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(260px, 1fr));
  gap: 16px;
}

.command-grid {
  grid-template-columns: 1.15fr 1fr 1fr;
}

.two-column-grid {
  grid-template-columns: 1fr 1fr;
}

/* Single main chart per tab: one full-width track. */
.main-grid {
  grid-template-columns: 1fr;
}

/* Inside accordion panels, chart rows fill the available width evenly —
   no empty reserved tracks when a row has fewer than three charts. */
.expandable-panel .chart-grid {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

/* At-a-glance card lives in the narrow LEFT column now: header stacks
   (title above, helper text below, no clipping) and the two metric cards
   stack vertically per the 2-column spec. */
.overview-snapshot .snapshot-header {
  display: grid;
  gap: 6px;
}

.overview-snapshot .metric-grid,
.overview-snapshot.overview-metrics,
.overview-snapshot .overview-metrics {
  grid-template-columns: 1fr;
}

.chart-card,
.action-card {
  padding: 18px;
  min-width: 0;
}

.attendance-card {
  grid-column: span 1;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title-block {
  min-width: 0;
}

.section-title-block h2,
.action-card h2 {
  margin: 0;
  color: #0F172A;
  font-size: 17px;
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: 9px;
}

.section-title-block h2 span {
  color: #0F766E;
  display: inline-flex;
}

.section-title-block p,
.action-card > .section-header p {
  margin: 5px 0 0;
  color: #64748B;
  font-weight: 700;
  font-size: 13px;
  line-height: 1.5;
}

.analytics-chart-box {
  width: 100%;
  height: 260px;
}

.horizontal-chart-box {
  height: 285px;
}

.empty-chart {
  min-height: 220px;
  border-radius: 18px;
  background: #F8FAFC;
  border: 1px dashed #CBD5E1;
  color: #64748B;
  font-weight: 900;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 18px;
}

.chart-tooltip {
  background: white;
  border: 1px solid #CBD5E1;
  border-radius: 14px;
  padding: 10px 12px;
  box-shadow: 0 14px 30px rgba(15, 23, 42, .12);
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 260px;
}

.chart-tooltip strong {
  color: #0F172A;
}

.chart-tooltip span {
  color: #0F766E;
  font-weight: 900;
}

.chart-tooltip small {
  color: #64748B;
  font-weight: 700;
  line-height: 1.4;
}

.chart-badge-row {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.risk-pill {
  padding: 6px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
}

.attendance-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(90px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.attendance-stat-grid div {
  border-radius: 16px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  padding: 11px;
}

.attendance-stat-grid span,
.attendance-stat-grid small {
  display: block;
  color: #64748B;
  font-size: 11px;
  font-weight: 900;
}

.attendance-stat-grid strong {
  display: block;
  margin-top: 5px;
  color: #0F172A;
  font-size: 18px;
  letter-spacing: -0.03em;
}

.rhu-action-line {
  margin-top: 12px;
  border-radius: 16px;
  background: #ECFDF5;
  color: #0F766E;
  border: 1px solid #99F6E4;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.5;
}

.analytics-report-table {
  overflow: hidden;
}

.diagnosis-table-wrap {
  overflow-x: auto;
}

.diagnosis-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

.compact-table {
  min-width: 500px;
}

.diagnosis-table th {
  text-align: left;
  padding: 12px;
  background: #F8FAFC;
  border-bottom: 1px solid #E2E8F0;
  color: #475569;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.diagnosis-table td {
  padding: 12px;
  border-bottom: 1px solid #F1F5F9;
  color: #0F172A;
  font-size: 13px;
  font-weight: 700;
}

.advice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 14px;
}

.advice-card {
  border-radius: 20px;
  border: 1px solid #E2E8F0;
  background:
    linear-gradient(180deg, #FFFFFF, #F8FAFC);
  padding: 16px;
}

.advice-card h3 {
  margin: 0 0 8px;
  color: #0F766E;
  font-size: 15px;
}

.advice-card p {
  margin: 0;
  color: #334155;
  font-weight: 700;
  line-height: 1.6;
  font-size: 13px;
  word-break: break-word;
}

@media (max-width: 1280px) {
  .analytics-hero {
    flex-direction: column;
  }

  .hero-actions {
    width: 100%;
  }

  .hero-actions button {
    flex: 1;
  }

  .metric-grid,
  .diagnosis-metric-grid {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
  }

  .chart-grid,
  .advice-grid {
    grid-template-columns: 1fr;
  }

  .attendance-card {
    grid-column: span 1;
  }
}

@media (max-width: 860px) {
  .filter-panel {
    grid-template-columns: 1fr 1fr;
  }

  .search-field {
    grid-column: 1 / -1;
  }

  .apply-btn,
  .reset-btn {
    width: 100%;
  }

  .metric-grid,
  .diagnosis-metric-grid {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }

  .attendance-stat-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}

@media (max-width: 620px) {
  .analytics-hero {
    padding: 24px;
    border-radius: 22px;
  }

  .filter-panel,
  .metric-grid,
  .diagnosis-metric-grid,
  .attendance-stat-grid {
    grid-template-columns: 1fr;
  }

  .hero-actions button {
    width: 100%;
  }
}
`;
