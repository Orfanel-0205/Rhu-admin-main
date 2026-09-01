// src/pages/Reports.tsx

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  downloadCsv,
  downloadCsvMasked,
  getRealtimeAnalytics,
  type AnalyticsFilters,
} from "../services/analytics";
import {
  exportDiagnosisItrCsv,
  getDiagnosisItrRows,
  type DiagnosisItrRow,
} from "../services/reports";
import {
  normalizeBarangayName,
  normalizeDiagnosisLabel,
} from "../utils/rhuAnalyticsHelpers";
import ModuleTabs from "../components/ui/ModuleTabs";
import SortableTh from "../components/ui/SortableTh";
import { useSortableRows } from "../hooks/useSortableRows";
import InventoryReport from "../components/reports/InventoryReport";
import QueueReport from "../components/reports/QueueReport";
import AppointmentsReport from "../components/reports/AppointmentsReport";
import TelemedicineReport from "../components/reports/TelemedicineReport";
import { getCurrentUserRhuId, isGlobalRhuRole } from "../services/queue";

// Malasiqui operates two facilities. Global staff (super_admin / MHO) may switch
// between them; facility-scoped staff are locked to their own RHU (the backend
// enforces the same scope, so this is a display lock, not the security boundary).
const RHU_OPTIONS = [
  { id: "1", label: "RHU 1" },
  { id: "2", label: "RHU 2" },
];

function defaultRhuId(): string {
  const own = getCurrentUserRhuId();
  if (!isGlobalRhuRole() && own > 0) return String(own);
  return "1";
}

type FilterState = {
  from: string;
  to: string;
  disease: string;
  rhuId: string;
  barangay: string;
};

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

type StatusBadge = {
  label: string;
  tone: BadgeTone;
};

type DiseaseSummary = {
  topDiagnosis: string;
  caseCount: number;
  affectedBarangays: number;
  recommendedAction: string;
};

type BarangayWatchRow = {
  barangay: string;
  cases: number;
  riskScore: number;
  riskLevel: "Low" | "Moderate" | "High";
  queueDensity: number;
  followUps: number;
  topDiagnosis: string;
  suggestedAction: string;
};

type FollowUpReport = {
  total: number;
  open: number;
  overdue: number;
  dueToday: number;
  nextSevenDays: number;
  reviewRows: DiagnosisItrRow[];
};

type CompletenessReport = {
  total: number;
  complete: number;
  completePercent: number;
  missingDiagnosis: number;
  missingTreatment: number;
  missingBarangay: number;
  missingContact: number;
  missingFollowUpDate: number;
};

type StaffWorkloadRow = {
  staff: string;
  completed: number;
  diagnosed: number;
  followUps: number;
};

type BarRow = {
  label: string;
  value: number;
  helper?: string;
};

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

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortText(value?: string | null, limit = 80): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!text) return "—";
  if (text.length <= limit) return text;

  return `${text.slice(0, limit - 1)}…`;
}

function hasText(value: any): boolean {
  const text = String(value ?? "").trim();

  return text !== "" && text !== "-" && text.toLowerCase() !== "null";
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daysFromToday(date: Date): number {
  const today = startOfDay(new Date());
  const target = startOfDay(date);

  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function cleanAnalyticsFilters(filters: FilterState): AnalyticsFilters {
  return {
    from: filters.from || undefined,
    to: filters.to || undefined,
    disease: filters.disease.trim() || undefined,
    diagnosis: filters.disease.trim() || undefined,
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
    rhu_id: filters.rhuId || "1",
  };
}

function cleanDiagnosisItrFilters(filters: FilterState) {
  return {
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    diagnosis: filters.disease.trim() || undefined,
    disease: filters.disease.trim() || undefined,
    rhu_id: filters.rhuId || "1",
  };
}

function reportFilename(name: string, filters: FilterState): string {
  const from = filters.from || "start";
  const to = filters.to || "end";

  return `rhu${filters.rhuId || "1"}-${name}-${from}-to-${to}.csv`
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function patientName(row: DiagnosisItrRow): string {
  return shortText(row.patient_name || "Patient", 70);
}

function ageSex(row: DiagnosisItrRow): string {
  const age = row.age !== null && row.age !== undefined ? String(row.age) : "";
  const sex = String(row.sex_gender || "").trim();

  if (age && sex) return `${age} / ${sex}`;
  if (age) return age;
  if (sex) return sex;

  return "—";
}

function visitDate(row: DiagnosisItrRow): string {
  return formatDate(
    row.consultation_date ||
      row.completed_at ||
      row.first_attended_at ||
      null
  );
}

function rawDiagnosis(row: DiagnosisItrRow): string {
  return String(
    row.diagnosis ||
      row.assessment ||
      row.chief_complaint ||
      row.appointment_reason ||
      ""
  ).trim();
}

function diagnosisLabel(row: DiagnosisItrRow): string {
  return normalizeDiagnosisLabel(rawDiagnosis(row));
}

function treatmentLabel(row: DiagnosisItrRow): string {
  return shortText(row.treatment || row.plan || "");
}

function barangayLabel(row: DiagnosisItrRow): string {
  return normalizeBarangayName(row.barangay || "");
}

function contactAvailable(row: DiagnosisItrRow): boolean {
  return hasText(row.mobile_number) || hasText(row.guardian_contact);
}

function followUpDate(row: DiagnosisItrRow): Date | null {
  return parseDate(row.follow_up_date_time);
}

function followUpStatus(row: DiagnosisItrRow): string {
  return String(row.follow_up_status || "scheduled").toLowerCase();
}

function isOpenFollowUp(row: DiagnosisItrRow): boolean {
  if (!row.follow_up_needed) return false;

  return !["completed", "done", "cancelled", "canceled", "missed"].includes(
    followUpStatus(row)
  );
}

function isOverdueFollowUp(row: DiagnosisItrRow): boolean {
  if (!isOpenFollowUp(row)) return false;

  const date = followUpDate(row);

  return date ? daysFromToday(date) < 0 : false;
}

function followUpLabel(row: DiagnosisItrRow): string {
  if (!row.follow_up_needed) return "None";

  const status = followUpStatus(row)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  const date = row.follow_up_date_time
    ? ` · ${formatDate(row.follow_up_date_time)}`
    : "";

  return `${status}${date}`;
}

function dataStatusBadges(row: DiagnosisItrRow): StatusBadge[] {
  const badges: StatusBadge[] = [];

  if (!hasText(row.diagnosis)) {
    badges.push({ label: "Missing Diagnosis", tone: "danger" });
  }

  if (!hasText(row.treatment) && !hasText(row.plan)) {
    badges.push({ label: "Missing Treatment", tone: "warning" });
  }

  if (!hasText(row.barangay)) {
    badges.push({ label: "Missing Barangay", tone: "warning" });
  }

  if (!contactAvailable(row)) {
    badges.push({ label: "Missing Contact", tone: "warning" });
  }

  if (row.follow_up_needed && !row.follow_up_date_time) {
    badges.push({ label: "Needs Follow-up", tone: "info" });
  }

  if (isOverdueFollowUp(row)) {
    badges.push({ label: "Overdue Follow-up", tone: "danger" });
  }

  if (badges.length === 0) {
    badges.push({ label: "Complete", tone: "success" });
  }

  return badges;
}

function primaryDataStatus(row: DiagnosisItrRow): string {
  return dataStatusBadges(row).map((badge) => badge.label).join("; ");
}

function isCompleteRow(row: DiagnosisItrRow): boolean {
  return (
    hasText(row.diagnosis) &&
    (hasText(row.treatment) || hasText(row.plan)) &&
    hasText(row.barangay) &&
    contactAvailable(row) &&
    (!row.follow_up_needed || hasText(row.follow_up_date_time))
  );
}

function percent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;

  return Math.round((part / total) * 100);
}

function riskLevelFromScore(score: number): "Low" | "Moderate" | "High" {
  if (score >= 70) return "High";
  if (score >= 35) return "Moderate";
  return "Low";
}

function careGroup(row: DiagnosisItrRow): string {
  const age = Number(row.age);
  const anyRow = row as any;

  if (anyRow.is_pwd) return "PWD";
  if (anyRow.is_pregnant) return "Pregnant";
  if (Number.isFinite(age) && age >= 60) return "Senior";
  if (Number.isFinite(age) && age <= 12) return "Child";
  if (Number.isFinite(age)) return "General adult/youth";

  return "Unknown";
}

function ageGroup(row: DiagnosisItrRow): string {
  const age = Number(row.age);

  if (!Number.isFinite(age)) return "Unknown";
  if (age <= 12) return "Children";
  if (age <= 59) return "Adults";
  return "Seniors";
}

function countRows(values: string[], limit = 8): BarRow[] {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const label = value.trim() || "Unspecified";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function uniqueBarangays(rows: DiagnosisItrRow[]): number {
  return new Set(
    rows.map((row) => String(row.barangay || "").trim()).filter(Boolean)
  ).size;
}

function errorMessage(error: any): string {
  const message =
    error?.response?.data?.message ||
    error?.message ||
    "Failed to load reports.";

  if (
    /sql|select|insert|update|delete|exception|stack|trace|syntax/i.test(
      String(message)
    )
  ) {
    return "Reports could not be loaded. Please check the selected filters or try again.";
  }

  return String(message);
}

export default function Reports() {
  const isGlobal = isGlobalRhuRole();
  const [filters, setFilters] = useState<FilterState>(() => defaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() =>
    defaultFilters()
  );

  const [overview, setOverview] = useState<Record<string, any>>({});
  const [risk, setRisk] = useState<any[]>([]);
  const [diagnosisRows, setDiagnosisRows] = useState<DiagnosisItrRow[]>([]);
  const [diagnosisSummary, setDiagnosisSummary] = useState({
    total_completed_consultations: 0,
    total_diagnosed_consultations: 0,
    followups_scheduled: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [tab, setTab] = useState<
    | "consultations"
    | "followup"
    | "inventory"
    | "queue"
    | "appointments"
    | "telemedicine"
  >("consultations");

  // Template-first Reports IA: Pre-built Reports (default) / Detailed Data /
  // Export History. The detailed module tabs above stay fully intact.
  const [reportsView, setReportsView] = useState<"templates" | "data" | "history">("templates");
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>(readExportHistory);

  const logExportHistory = useCallback((name: string, format: string) => {
    setExportHistory((current) =>
      persistHistory(
        [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            format,
            generated_at: new Date().toISOString(),
          },
          ...current,
        ].slice(0, 10)
      )
    );
  }, []);

  const loadReports = useCallback(
    async (overrideFilters?: FilterState) => {
      const activeFilters = overrideFilters ?? appliedFilters;

      setLoading(true);
      setRefreshing(true);
      setError("");
      setExportError("");

      try {
        const [analyticsResult, diagnosisResult] = await Promise.all([
          getRealtimeAnalytics(cleanAnalyticsFilters(activeFilters)),
          getDiagnosisItrRows(cleanDiagnosisItrFilters(activeFilters)),
        ]);

        setOverview(analyticsResult.overview ?? {});
        setRisk(Array.isArray(analyticsResult.risk) ? analyticsResult.risk : []);
        setDiagnosisRows(Array.isArray(diagnosisResult.data) ? diagnosisResult.data : []);
        setDiagnosisSummary(
          diagnosisResult.summary ?? {
            total_completed_consultations: 0,
            total_diagnosed_consultations: 0,
            followups_scheduled: 0,
          }
        );
        setLastUpdated(
          diagnosisResult.generated_at ||
            analyticsResult.generated_at ||
            new Date().toISOString()
        );
      } catch (err: any) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const visibleRows = useMemo(() => {
    const barangayKeyword = appliedFilters.barangay.trim().toLowerCase();

    if (!barangayKeyword) return diagnosisRows;

    return diagnosisRows.filter((row) =>
      String(row.barangay || row.address || "")
        .toLowerCase()
        .includes(barangayKeyword)
    );
  }, [appliedFilters.barangay, diagnosisRows]);

  const completedConsultations = Math.max(
    numberValue(diagnosisSummary.total_completed_consultations),
    visibleRows.length
  );

  const diagnosedConsultations = Math.max(
    numberValue(diagnosisSummary.total_diagnosed_consultations),
    visibleRows.filter((row) => hasText(row.diagnosis)).length
  );

  const completenessReport = useMemo<CompletenessReport>(() => {
    const total = visibleRows.length;
    const missingDiagnosis = visibleRows.filter((row) => !hasText(row.diagnosis)).length;
    const missingTreatment = visibleRows.filter(
      (row) => !hasText(row.treatment) && !hasText(row.plan)
    ).length;
    const missingBarangay = visibleRows.filter((row) => !hasText(row.barangay)).length;
    const missingContact = visibleRows.filter((row) => !contactAvailable(row)).length;
    const missingFollowUpDate = visibleRows.filter(
      (row) => row.follow_up_needed && !hasText(row.follow_up_date_time)
    ).length;
    const complete = visibleRows.filter(isCompleteRow).length;

    return {
      total,
      complete,
      completePercent: percent(complete, total),
      missingDiagnosis,
      missingTreatment,
      missingBarangay,
      missingContact,
      missingFollowUpDate,
    };
  }, [visibleRows]);

  const diseaseSummary = useMemo<DiseaseSummary>(() => {
    const counts = new Map<string, number>();

    visibleRows.forEach((row) => {
      const label = diagnosisLabel(row);
      if (!hasText(label)) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    const top = Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))[0];

    const topDiagnosis = top?.label || "No diagnosis data";
    const caseCount = top?.value ?? 0;
    const affectedBarangays = uniqueBarangays(
      visibleRows.filter((row) => diagnosisLabel(row) === topDiagnosis)
    );

    const recommendedAction =
      caseCount > 0
        ? `Validate ${topDiagnosis} cases, check medicine/supply availability, and coordinate BHW follow-up for affected barangays.`
        : "Complete diagnosis fields in consultation records to generate disease surveillance output.";

    return {
      topDiagnosis,
      caseCount,
      affectedBarangays,
      recommendedAction,
    };
  }, [visibleRows]);

  const barangayWatchlist = useMemo<BarangayWatchRow[]>(() => {
    const riskByBarangay = new Map<string, any>();

    risk.forEach((item) => {
      const label = normalizeBarangayName(
        item.barangay || item.barangay_name || item.name || ""
      ).toLowerCase();

      if (label) riskByBarangay.set(label, item);
    });

    const grouped = new Map<
      string,
      {
        cases: number;
        followUps: number;
        diagnoses: Map<string, number>;
      }
    >();

    visibleRows.forEach((row) => {
      const barangay = barangayLabel(row);
      const current =
        grouped.get(barangay) ??
        {
          cases: 0,
          followUps: 0,
          diagnoses: new Map<string, number>(),
        };

      current.cases += 1;
      if (row.follow_up_needed) current.followUps += 1;

      const diagnosis = diagnosisLabel(row);
      if (hasText(diagnosis)) {
        current.diagnoses.set(diagnosis, (current.diagnoses.get(diagnosis) ?? 0) + 1);
      }

      grouped.set(barangay, current);
    });

    return Array.from(grouped.entries())
      .map(([barangay, value]) => {
        const riskItem = riskByBarangay.get(barangay.toLowerCase());
        const queueDensity = numberValue(
          riskItem?.queue_density ?? riskItem?.queueDensity ?? 0
        );
        const backendScore = numberValue(
          riskItem?.risk_score ?? riskItem?.heatmap_intensity
        );
        const computedScore = Math.min(
          100,
          backendScore || value.cases * 10 + value.followUps * 4 + queueDensity * 3
        );
        const topDiagnosis =
          Array.from(value.diagnoses.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0]
            ?.label || "General Consultation";

        const riskLevel = riskLevelFromScore(computedScore);

        return {
          barangay,
          cases: value.cases,
          riskScore: computedScore,
          riskLevel,
          queueDensity,
          followUps: value.followUps,
          topDiagnosis,
          suggestedAction:
            riskLevel === "High"
              ? "Prioritize BHW validation and prepare RHU advisory."
              : riskLevel === "Moderate"
              ? "Monitor cases and check follow-up continuity."
              : "Continue routine monitoring.",
        };
      })
      .sort(
        (a, b) =>
          b.riskScore - a.riskScore ||
          b.cases - a.cases ||
          a.barangay.localeCompare(b.barangay)
      )
      .slice(0, 10);
  }, [risk, visibleRows]);

  const followUpReport = useMemo<FollowUpReport>(() => {
    const followUpRows = visibleRows.filter((row) => row.follow_up_needed);
    const openRows = followUpRows.filter(isOpenFollowUp);

    const reviewRows = openRows
      .filter((row) => {
        const date = followUpDate(row);
        if (!date) return true;

        const days = daysFromToday(date);
        return days <= 7;
      })
      .sort((a, b) => {
        const aDate = followUpDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDate = followUpDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      })
      .slice(0, 8);

    return {
      total: followUpRows.length,
      open: openRows.length,
      overdue: openRows.filter(isOverdueFollowUp).length,
      dueToday: openRows.filter((row) => {
        const date = followUpDate(row);
        return date ? daysFromToday(date) === 0 : false;
      }).length,
      nextSevenDays: openRows.filter((row) => {
        const date = followUpDate(row);
        if (!date) return false;

        const days = daysFromToday(date);
        return days >= 0 && days <= 7;
      }).length,
      reviewRows,
    };
  }, [visibleRows]);

  const staffWorkloadRows = useMemo<StaffWorkloadRow[]>(() => {
    const grouped = new Map<string, StaffWorkloadRow>();

    visibleRows.forEach((row) => {
      const staff = String(row.attending_staff || "Unassigned Staff").trim();
      const current =
        grouped.get(staff) ??
        {
          staff,
          completed: 0,
          diagnosed: 0,
          followUps: 0,
        };

      current.completed += 1;
      if (hasText(row.diagnosis)) current.diagnosed += 1;
      if (row.follow_up_needed) current.followUps += 1;

      grouped.set(staff, current);
    });

    return Array.from(grouped.values())
      .sort(
        (a, b) =>
          b.completed - a.completed ||
          b.diagnosed - a.diagnosed ||
          a.staff.localeCompare(b.staff)
      )
      .slice(0, 10);
  }, [visibleRows]);

  const ageGroupRows = useMemo(() => {
    return countRows(visibleRows.map(ageGroup), 8);
  }, [visibleRows]);

  const priorityCareRows = useMemo(() => {
    return countRows(visibleRows.map(careGroup), 8);
  }, [visibleRows]);

  const diseaseRows = useMemo(() => {
    return countRows(
      visibleRows.map((row) => diagnosisLabel(row)).filter(hasText),
      10
    );
  }, [visibleRows]);

  const serviceLoadRows = useMemo<BarRow[]>(() => {
    return [
      {
        label: "Completed consultations",
        value: completedConsultations,
        helper: "Formal Diagnosis + ITR rows",
      },
      {
        label: "Diagnosed consultations",
        value: diagnosedConsultations,
        helper: "Records with diagnosis",
      },
      {
        label: "Follow-ups scheduled",
        value: followUpReport.total,
        helper: "Continuity tracking",
      },
      {
        label: "Queue tickets",
        value: numberValue(overview?.total_queue_tickets),
        helper: "Service load signal",
      },
    ].filter((row) => row.value > 0);
  }, [
    completedConsultations,
    diagnosedConsultations,
    followUpReport.total,
    overview?.total_queue_tickets,
  ]);

  const summaryExportRows = useMemo(
    () => [
      {
        facility_scope: `RHU ${appliedFilters.rhuId}`,
        date_from: appliedFilters.from,
        date_to: appliedFilters.to,
        generated_at: lastUpdated || new Date().toISOString(),
        patients: numberValue(overview?.total_patients),
        completed_consultations: completedConsultations,
        diagnosed_consultations: diagnosedConsultations,
        total_report_records: visibleRows.length,
        itr_complete_percent: completenessReport.completePercent,
        missing_diagnosis: completenessReport.missingDiagnosis,
        missing_treatment: completenessReport.missingTreatment,
        missing_barangay: completenessReport.missingBarangay,
        missing_contact: completenessReport.missingContact,
        followups_scheduled: followUpReport.total,
        overdue_followups: followUpReport.overdue,
        queue_tickets: numberValue(overview?.total_queue_tickets),
        top_diagnosis: diseaseSummary.topDiagnosis,
        top_diagnosis_cases: diseaseSummary.caseCount,
      },
    ],
    [
      appliedFilters,
      lastUpdated,
      overview,
      completedConsultations,
      diagnosedConsultations,
      visibleRows.length,
      completenessReport,
      followUpReport,
      diseaseSummary,
    ]
  );

  // One shared row-shape for BOTH the plaintext and the privacy-masked
  // follow-up exports (Sir Ayco Part 2), so the two variants can never drift.
  function followUpExportRows() {
    return visibleRows
      .filter((row) => row.follow_up_needed)
      .map((row) => ({
        consultation_id: row.consultation_id,
        patient: row.patient_name,
        barangay: barangayLabel(row),
        diagnosis: diagnosisLabel(row),
        follow_up_status: row.follow_up_status,
        follow_up_date_time: row.follow_up_date_time,
        overdue: isOverdueFollowUp(row) ? "Yes" : "No",
        attending_staff: row.attending_staff,
      }));
  }

  async function handleBackendDiagnosisExport() {
    setExporting(true);
    setExportError("");

    try {
      await exportDiagnosisItrCsv(cleanDiagnosisItrFilters(appliedFilters));
    } catch (err: any) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  function applyFilters() {
    const next = {
      from: filters.from,
      to: filters.to,
      disease: filters.disease.trim(),
      rhuId: "1",
      barangay: filters.barangay.trim(),
    };

    setAppliedFilters(next);
    loadReports(next);
  }

  function resetFilters() {
    const next = defaultFilters();

    setFilters(next);
    setAppliedFilters(next);
    loadReports(next);
  }

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={heroKickerStyle}>
            <FileText size={16} />
            Ka-Agapay RHU {appliedFilters.rhuId} Reporting Center
          </div>

          <h1 style={heroTitleStyle}>RHU {appliedFilters.rhuId} Reports</h1>

          <p style={heroTextStyle}>
            Formal Diagnosis + ITR consultation records, follow-up tracking,
            data completeness, staff workload, barangay watchlist, and CSV
            exports for RHU {appliedFilters.rhuId} reporting.
          </p>

          <div style={heroMetaStyle}>
            <CalendarDays size={15} />
            {formatDate(appliedFilters.from)} – {formatDate(appliedFilters.to)}
            <span>•</span>
            Last updated: {formatDate(lastUpdated)} {formatTime(lastUpdated)}
            {refreshing ? " • Refreshing..." : ""}
          </div>
        </div>

        <div style={heroActionStyle}>
          <button
            type="button"
            style={heroButtonStyle}
            onClick={() => loadReports()}
            disabled={refreshing}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            type="button"
            style={heroButtonStyle}
            onClick={() =>
              downloadCsv(
                reportFilename("summary-report", appliedFilters),
                summaryExportRows
              )
            }
          >
            <Download size={16} />
            Export Summary
          </button>

          <button
            type="button"
            style={heroButtonStyle}
            onClick={handleBackendDiagnosisExport}
            disabled={exporting}
          >
            <Download size={16} />
            Export Diagnosis + ITR CSV
          </button>
        </div>
      </section>

      <section style={filterPanelStyle}>
        <label style={filterFieldStyle}>
          <span style={filterLabelStyle}>Start date</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
            style={inputStyle}
          />
        </label>

        <label style={filterFieldStyle}>
          <span style={filterLabelStyle}>End date</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
            style={inputStyle}
          />
        </label>

        <label style={filterFieldStyle}>
          <span style={filterLabelStyle}>Facility</span>
          {isGlobal ? (
            <select
              value={filters.rhuId}
              onChange={(event) => {
                // Switching RHU re-queries every tab, not just relabels the view.
                const next = { ...filters, rhuId: event.target.value };
                setFilters(next);
                setAppliedFilters(next);
                loadReports(next);
              }}
              style={inputStyle}
            >
              {RHU_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <div style={lockedFilterStyle}>RHU {filters.rhuId} only</div>
          )}
        </label>

        <label style={filterFieldStyle}>
          <span style={filterLabelStyle}>Barangay, optional</span>
          <input
            value={filters.barangay}
            onChange={(event) =>
              setFilters({ ...filters, barangay: event.target.value })
            }
            placeholder="Type barangay name"
            style={inputStyle}
          />
        </label>

        <div style={searchBoxStyle}>
          <Search size={17} />
          <input
            value={filters.disease}
            onChange={(event) =>
              setFilters({ ...filters, disease: event.target.value })
            }
            placeholder="Diagnosis or complaint, optional"
            onKeyDown={(event) => {
              if (event.key === "Enter") applyFilters();
            }}
            style={searchInputStyle}
          />
        </div>

        <button
          type="button"
          style={applyButtonStyle}
          onClick={applyFilters}
          disabled={refreshing}
        >
          <Filter size={16} />
          Apply
        </button>

        <button type="button" style={resetButtonStyle} onClick={resetFilters}>
          <RotateCcw size={16} />
          Reset
        </button>
      </section>

      {error ? (
        <div style={errorStyle}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {exportError ? (
        <div style={errorStyle}>
          <AlertTriangle size={18} />
          {exportError}
        </div>
      ) : null}

      <section style={safetyStyle}>
        <ShieldAlert size={18} />
        <div>
          <strong>Formal report validation reminder</strong>
          <p>
            Reports are based on available RHU {appliedFilters.rhuId} system records. Staff must
            validate incomplete diagnosis, treatment, barangay, contact, and
            follow-up fields before official submission.
          </p>
        </div>
      </section>

      {loading ? (
        <section style={loadingStyle}>
          <RefreshCw size={28} />
          <strong>Loading RHU {appliedFilters.rhuId} reports...</strong>
        </section>
      ) : (
        <>
          {/* Reports IA (matches the Analytics-page pattern): a template-first
              layer on top of the detailed data. Pre-built Reports = 6 cards →
              preview → download; Detailed Data = the full existing module
              tabs, Export Center, and ITR table (nothing removed); Export
              History = the last 10 downloads from this browser. */}
          <ModuleTabs
            tabs={[
              { key: "templates", label: "Pre-built Reports" },
              { key: "data", label: "Detailed Data & Exports" },
              { key: "history", label: "Export History" },
            ]}
            active={reportsView}
            onChange={(key) => setReportsView(key as typeof reportsView)}
          />

          {reportsView === "templates" ? (
            <ReportTemplatesTab
              appliedFilters={appliedFilters}
              summaryRow={summaryExportRows[0] ?? {}}
              diseaseRows={diseaseRows}
              ageGroupRows={ageGroupRows}
              priorityCareRows={priorityCareRows}
              barangayWatchlist={barangayWatchlist}
              staffWorkloadRows={staffWorkloadRows}
              completenessReport={completenessReport}
              followUpReport={followUpReport}
              visibleRows={visibleRows}
              overview={overview}
              onLogExport={logExportHistory}
            />
          ) : null}

          {reportsView === "history" ? (
            <ExportHistoryTab
              entries={exportHistory}
              onDelete={(id) => setExportHistory((current) => persistHistory(current.filter((entry) => entry.id !== id)))}
              onClear={() => setExportHistory(persistHistory([]))}
            />
          ) : null}

          {reportsView === "data" ? (
          <>
          <ModuleTabs
            tabs={[
              {
                key: "consultations",
                label: "Consultations",
                badge: visibleRows.length || undefined,
              },
              { key: "followup", label: "Follow-up" },
              { key: "inventory", label: "Inventory" },
              { key: "queue", label: "Queue" },
              { key: "appointments", label: "Appointments" },
              { key: "telemedicine", label: "Telemedicine" },
            ]}
            active={tab}
            onChange={(key) => setTab(key as typeof tab)}
          />

          {tab === "consultations" && (
          <section style={formalGridStyle}>
            <ReportCard
              title="Disease Surveillance Summary"
              subtitle="Top diagnosis signal from completed Diagnosis + ITR records."
              icon={<Stethoscope size={19} />}
              defaultOpen
              action={
                <button
                  type="button"
                  style={smallExportButtonStyle}
                  onClick={() =>
                    downloadCsv(
                      reportFilename("disease-surveillance-summary", appliedFilters),
                      [
                        {
                          top_diagnosis: diseaseSummary.topDiagnosis,
                          case_count: diseaseSummary.caseCount,
                          affected_barangays: diseaseSummary.affectedBarangays,
                          recommended_action: diseaseSummary.recommendedAction,
                        },
                      ]
                    )
                  }
                >
                  <Download size={14} />
                  CSV
                </button>
              }
            >
              <DiseaseSummaryPanel summary={diseaseSummary} />
            </ReportCard>

            <ReportCard
              title="ITR Data Completeness"
              subtitle="Completeness of required fields for formal RHU reporting."
              icon={<CheckCircle size={19} />}
              defaultOpen
              action={
                <button
                  type="button"
                  style={smallExportButtonStyle}
                  onClick={() =>
                    downloadCsv(
                      reportFilename("data-completeness", appliedFilters),
                      [
                        {
                          total_records: completenessReport.total,
                          complete_records: completenessReport.complete,
                          complete_percent: completenessReport.completePercent,
                          missing_diagnosis: completenessReport.missingDiagnosis,
                          missing_treatment: completenessReport.missingTreatment,
                          missing_barangay: completenessReport.missingBarangay,
                          missing_contact: completenessReport.missingContact,
                          missing_follow_up_date:
                            completenessReport.missingFollowUpDate,
                        },
                      ]
                    )
                  }
                >
                  <Download size={14} />
                  CSV
                </button>
              }
            >
              <CompletenessPanel report={completenessReport} />
            </ReportCard>
          </section>
          )}

          {tab === "followup" && (
          <section style={formalGridStyle}>
            <ReportCard
              title="Follow-up Continuity Report"
              subtitle="Open, overdue, due today, and upcoming follow-ups."
              icon={<Clock size={19} />}
              action={
                <button
                  type="button"
                  style={smallExportButtonStyle}
                  onClick={() =>
                    downloadCsv(
                      reportFilename("followup-report", appliedFilters),
                      visibleRows
                        .filter((row) => row.follow_up_needed)
                        .map((row) => ({
                          consultation_id: row.consultation_id,
                          patient: row.patient_name,
                          barangay: barangayLabel(row),
                          diagnosis: diagnosisLabel(row),
                          follow_up_status: row.follow_up_status,
                          follow_up_date_time: row.follow_up_date_time,
                          overdue: isOverdueFollowUp(row) ? "Yes" : "No",
                          attending_staff: row.attending_staff,
                        }))
                    )
                  }
                >
                  <Download size={14} />
                  CSV
                </button>
              }
            >
              <FollowUpPanel report={followUpReport} />
            </ReportCard>
          </section>
          )}

          {tab === "consultations" && (
          <section style={formalGridStyle}>
            <ReportCard
              title="Barangay Priority Watchlist"
              subtitle="Barangays with notable case count, risk, queue, or follow-up signals."
              icon={<BarChart3 size={19} />}
              action={
                <button
                  type="button"
                  style={smallExportButtonStyle}
                  onClick={() =>
                    downloadCsv(
                      reportFilename("barangay-watchlist", appliedFilters),
                      barangayWatchlist
                    )
                  }
                >
                  <Download size={14} />
                  CSV
                </button>
              }
            >
              <BarangayWatchlist rows={barangayWatchlist} />
            </ReportCard>
          </section>
          )}

          {tab === "consultations" && (
          <section style={formalGridStyle}>
            <ReportCard
              title="Attending Staff Workload"
              subtitle="Completed records handled, diagnosed cases, and follow-ups created."
              icon={<Users size={19} />}
              action={
                <button
                  type="button"
                  style={smallExportButtonStyle}
                  onClick={() =>
                    downloadCsv(
                      reportFilename("staff-workload", appliedFilters),
                      staffWorkloadRows
                    )
                  }
                >
                  <Download size={14} />
                  CSV
                </button>
              }
            >
              <StaffWorkloadTable rows={staffWorkloadRows} />
            </ReportCard>

            <ReportCard
              title="Service Load Signal"
              subtitle="Formal reporting counts with queue ticket load when available."
              icon={<Activity size={19} />}
            >
              <BarList rows={serviceLoadRows} empty="No service load data available." />
            </ReportCard>
          </section>
          )}

          {tab === "consultations" && (
          <section style={formalGridStyle}>
            <ReportCard
              title="Priority Care Groups"
              subtitle="Senior, PWD, pregnant, child, general adult/youth, and unknown groups."
              icon={<ShieldAlert size={19} />}
            >
              <BarList rows={priorityCareRows} empty="No priority care group data available." />
            </ReportCard>

            <ReportCard
              title="Age Group Caseload"
              subtitle="Children, adults, seniors, and unknown age group records."
              icon={<Users size={19} />}
            >
              <BarList rows={ageGroupRows} empty="No age group data available." />
            </ReportCard>
          </section>
          )}

          {tab === "consultations" && (
          <section style={formalGridStyle}>
            <ReportCard
              title="Common Diagnosis List"
              subtitle="Cleaned display labels for formal report review only."
              icon={<FileText size={19} />}
            >
              <BarList rows={diseaseRows} empty="No diagnosis data available." />
            </ReportCard>

            <ReportCard
              title="Export Center"
              subtitle={`CSV-safe exports using the selected RHU ${appliedFilters.rhuId} filters.`}
              icon={<Download size={19} />}
            >
              <ExportCenter
                exporting={exporting}
                onDiagnosisExport={handleBackendDiagnosisExport}
                onSummaryExport={() =>
                  downloadCsv(
                    reportFilename("summary-report", appliedFilters),
                    summaryExportRows
                  )
                }
                onFollowUpExport={() =>
                  downloadCsv(
                    reportFilename("followup-report", appliedFilters),
                    followUpExportRows()
                  )
                }
                onFollowUpExportMasked={() =>
                  downloadCsvMasked(
                    reportFilename("followup-report", appliedFilters),
                    followUpExportRows()
                  )
                }
                onWatchlistExport={() =>
                  downloadCsv(
                    reportFilename("barangay-watchlist", appliedFilters),
                    barangayWatchlist
                  )
                }
                onStaffExport={() =>
                  downloadCsv(
                    reportFilename("staff-workload", appliedFilters),
                    staffWorkloadRows
                  )
                }
                onStaffExportMasked={() =>
                  downloadCsvMasked(
                    reportFilename("staff-workload", appliedFilters),
                    staffWorkloadRows
                  )
                }
                onCompletenessExport={() =>
                  downloadCsv(
                    reportFilename("data-completeness", appliedFilters),
                    [
                      {
                        total_records: completenessReport.total,
                        complete_records: completenessReport.complete,
                        complete_percent: completenessReport.completePercent,
                        missing_diagnosis: completenessReport.missingDiagnosis,
                        missing_treatment: completenessReport.missingTreatment,
                        missing_barangay: completenessReport.missingBarangay,
                        missing_contact: completenessReport.missingContact,
                        missing_follow_up_date:
                          completenessReport.missingFollowUpDate,
                      },
                    ]
                  )
                }
              />
            </ReportCard>
          </section>
          )}

          {tab === "consultations" && (
          <DiagnosisItrTable rows={visibleRows} />
          )}

          {tab === "inventory" && <InventoryReport rhuId={Number(appliedFilters.rhuId) || 1} />}
          {tab === "queue" && <QueueReport rhuId={Number(appliedFilters.rhuId) || 1} />}
          {tab === "appointments" && <AppointmentsReport rhuId={Number(appliedFilters.rhuId) || 1} />}
          {tab === "telemedicine" && <TelemedicineReport rhuId={Number(appliedFilters.rhuId) || 1} />}
          </>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── Export history (local to this browser — metadata only, no report data) ──

type ExportHistoryEntry = {
  id: string;
  name: string;
  format: string;
  generated_at: string;
};

const EXPORT_HISTORY_KEY = "ka_reports_export_history_v1";

function readExportHistory(): ExportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function persistHistory(entries: ExportHistoryEntry[]): ExportHistoryEntry[] {
  try {
    localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Private browsing — history is simply session-only.
  }
  return entries;
}

// ── Pre-built report templates: card → preview → download ──────────────────

type ReportTemplateKey =
  | "daily_summary"
  | "trend_analytics"
  | "demographics"
  | "quality_metrics"
  | "telemedicine_usage"
  | "operational_performance";

const REPORT_TEMPLATES: {
  key: ReportTemplateKey;
  icon: ReactNode;
  title: string;
  description: string;
}[] = [
  {
    key: "daily_summary",
    icon: <FileText size={22} />,
    title: "Daily Summary",
    description: "Quick overview of operations for the selected date range — totals, completeness, top complaint.",
  },
  {
    key: "trend_analytics",
    icon: <BarChart3 size={22} />,
    title: "Weekly Analytics",
    description: "Consultations per day across the range, with the leading diagnosis signal.",
  },
  {
    key: "demographics",
    icon: <Users size={22} />,
    title: "Patient Demographics",
    description: "Age groups, priority care groups, and top barangays for the selected records.",
  },
  {
    key: "quality_metrics",
    icon: <CheckCircle size={22} />,
    title: "Quality Metrics",
    description: "Staff workload and ITR record completeness for performance review.",
  },
  {
    key: "telemedicine_usage",
    icon: <Activity size={22} />,
    title: "Telemedicine Usage",
    description: "Remote consultation volume within the selected filters.",
  },
  {
    key: "operational_performance",
    icon: <Clock size={22} />,
    title: "Operational Performance",
    description: "Queue load, follow-up continuity, and record-quality KPIs in one page.",
  },
];

function metricRows(pairs: [string, unknown][]): { label: string; value: string }[] {
  return pairs.map(([label, value]) => ({ label, value: String(value ?? "—") }));
}

function barListTop(rows: any[], limit = 5): { label: string; value: number }[] {
  return (rows ?? []).slice(0, limit).map((row) => ({
    label: String(row.label ?? row.name ?? "Unspecified"),
    value: Number(row.count ?? row.total ?? row.value ?? 0),
  }));
}

function ReportTemplatesTab({
  appliedFilters,
  summaryRow,
  diseaseRows,
  ageGroupRows,
  priorityCareRows,
  barangayWatchlist,
  staffWorkloadRows,
  completenessReport,
  followUpReport,
  visibleRows,
  overview,
  onLogExport,
}: {
  appliedFilters: FilterState;
  summaryRow: Record<string, any>;
  diseaseRows: any[];
  ageGroupRows: any[];
  priorityCareRows: any[];
  barangayWatchlist: any[];
  staffWorkloadRows: any[];
  completenessReport: any;
  followUpReport: any;
  visibleRows: DiagnosisItrRow[];
  overview: any;
  onLogExport: (name: string, format: string) => void;
}) {
  const [active, setActive] = useState<ReportTemplateKey | null>(null);

  // Consultations per day (for the trend template).
  const perDay = useMemo(() => {
    const counts = new Map<string, number>();
    visibleRows.forEach((row) => {
      const date = String(row.consultation_date ?? row.completed_at ?? "").slice(0, 10);
      if (date) counts.set(date, (counts.get(date) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ label: date, value: total }));
  }, [visibleRows]);

  const template = REPORT_TEMPLATES.find((item) => item.key === active) ?? null;

  // Preview content per template — metrics + list, all from the SAME data
  // the detailed tabs already show for the applied filters.
  const preview = useMemo(() => {
    if (!active) return null;

    switch (active) {
      case "daily_summary":
        return {
          metrics: metricRows([
            ["Total report records", summaryRow.total_report_records],
            ["Completed consultations", summaryRow.completed_consultations],
            ["Diagnosed consultations", summaryRow.diagnosed_consultations],
            ["ITR complete %", `${summaryRow.itr_complete_percent ?? 0}%`],
          ]),
          listTitle: "Top complaints",
          list: barListTop(diseaseRows),
          csvRows: [summaryRow],
        };
      case "trend_analytics":
        return {
          metrics: metricRows([
            ["Days with records", perDay.length],
            ["Total consultations", visibleRows.length],
            ["Top diagnosis", summaryRow.top_diagnosis],
            ["Top diagnosis cases", summaryRow.top_diagnosis_cases],
          ]),
          listTitle: "Consultations per day",
          list: perDay,
          csvRows: perDay.map((row) => ({ date: row.label, consultations: row.value })),
        };
      case "demographics": {
        const list = [
          ...barListTop(ageGroupRows, 4).map((row) => ({ ...row, label: `Age — ${row.label}` })),
          ...barListTop(priorityCareRows, 4).map((row) => ({ ...row, label: `Priority — ${row.label}` })),
        ];
        return {
          metrics: metricRows([
            ["Records analyzed", visibleRows.length],
            ["Barangays represented", (barangayWatchlist ?? []).length],
            ["Priority groups", (priorityCareRows ?? []).length],
            ["Age groups", (ageGroupRows ?? []).length],
          ]),
          listTitle: "Age & priority groups",
          list,
          csvRows: list.map((row) => ({ group: row.label, records: row.value })),
        };
      }
      case "quality_metrics":
        return {
          metrics: metricRows([
            ["ITR complete %", `${completenessReport?.completePercent ?? 0}%`],
            ["Missing diagnosis", completenessReport?.missingDiagnosis],
            ["Missing treatment", completenessReport?.missingTreatment],
            ["Active staff", (staffWorkloadRows ?? []).length],
          ]),
          listTitle: "Consultations handled per staff",
          list: (staffWorkloadRows ?? []).slice(0, 6).map((row: any) => ({
            label: String(row.attending_staff ?? row.staff ?? row.label ?? "Staff"),
            value: Number(row.completed ?? row.total ?? row.count ?? row.value ?? 0),
          })),
          csvRows: staffWorkloadRows,
        };
      case "telemedicine_usage":
        return {
          metrics: metricRows([
            ["Telemedicine requests", overview?.total_telemedicine_requests],
            ["Total consultations", visibleRows.length],
            ["Queue tickets", overview?.total_queue_tickets],
            ["Date range", `${appliedFilters.from} → ${appliedFilters.to}`],
          ]),
          listTitle: "Where to drill down",
          list: [],
          note: "Open Detailed Data → Telemedicine for the full request board, statuses, and per-session records.",
          csvRows: [
            {
              date_from: appliedFilters.from,
              date_to: appliedFilters.to,
              telemedicine_requests: overview?.total_telemedicine_requests ?? 0,
              total_consultations: visibleRows.length,
            },
          ],
        };
      case "operational_performance":
        return {
          metrics: metricRows([
            ["Queue tickets", overview?.total_queue_tickets],
            ["Follow-ups scheduled", followUpReport?.total],
            ["Follow-ups overdue", followUpReport?.overdue],
            ["ITR complete %", `${completenessReport?.completePercent ?? 0}%`],
          ]),
          listTitle: "Top complaints",
          list: barListTop(diseaseRows),
          csvRows: [
            {
              date_from: appliedFilters.from,
              date_to: appliedFilters.to,
              queue_tickets: overview?.total_queue_tickets ?? 0,
              followups_scheduled: followUpReport?.total ?? 0,
              followups_overdue: followUpReport?.overdue ?? 0,
              itr_complete_percent: completenessReport?.completePercent ?? 0,
            },
          ],
        };
      default:
        return null;
    }
  }, [
    active,
    summaryRow,
    diseaseRows,
    perDay,
    visibleRows.length,
    ageGroupRows,
    priorityCareRows,
    barangayWatchlist,
    staffWorkloadRows,
    completenessReport,
    followUpReport,
    overview,
    appliedFilters,
  ]);

  function downloadTemplateCsv() {
    if (!template || !preview) return;
    downloadCsv(
      reportFilename(template.key.replace(/_/g, "-"), appliedFilters),
      preview.csvRows as any[]
    );
    onLogExport(template.title, "CSV");
  }

  function printTemplate() {
    if (!template) return;
    onLogExport(template.title, "PDF (print)");
    window.print();
  }

  if (template && preview) {
    return (
      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "#0F172A" }}>
              Preview: {template.title}
            </h2>
            <p style={mutedStyle}>
              RHU {appliedFilters.rhuId} · {appliedFilters.from} → {appliedFilters.to} — uses the filters applied above.
            </p>
          </div>
          <button type="button" style={smallExportButtonStyle} onClick={() => setActive(null)}>
            ← Back to templates
          </button>
        </div>

        <div id="report-print-area" style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <div style={templateMetricsGridStyle}>
            {preview.metrics.map((metric) => (
              <div key={metric.label} style={templateMetricStyle}>
                <span style={templateMetricLabelStyle}>{metric.label}</span>
                <strong style={templateMetricValueStyle}>{metric.value}</strong>
              </div>
            ))}
          </div>

          {preview.list.length > 0 ? (
            <div>
              <h3 style={templateListTitleStyle}>{preview.listTitle}</h3>
              <ol style={templateListStyle}>
                {preview.list.map((row) => (
                  <li key={row.label} style={templateListItemStyle}>
                    <span className="ka-wrap">{row.label}</span>
                    <strong>{row.value}</strong>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {"note" in preview && preview.note ? (
            <p style={{ ...mutedStyle, margin: 0 }}>{preview.note}</p>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <button type="button" style={primaryButton2Style} onClick={downloadTemplateCsv}>
            <Download size={15} />
            Download CSV (Excel)
          </button>
          <button type="button" style={smallExportButtonStyle} onClick={printTemplate}>
            <FileText size={15} />
            Save as PDF (Print)
          </button>
        </div>

        {/* Print only the report body when the user saves as PDF. */}
        <style>{`@media print { body * { visibility: hidden; } #report-print-area, #report-print-area * { visibility: visible; } #report-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; } }`}</style>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#0F172A" }}>
          Choose a report to generate
        </h2>
        <p style={mutedStyle}>
          Each report uses the filters applied above, previews instantly, and
          downloads as CSV (opens in Excel) or prints to PDF.
        </p>
      </div>

      <div style={templateGridStyle}>
        {REPORT_TEMPLATES.map((item) => (
          <div key={item.key} style={templateCardStyle}>
            <div style={templateIconStyle}>{item.icon}</div>
            <strong style={{ fontSize: 15.5, color: "#0F172A" }}>{item.title}</strong>
            <p style={{ ...mutedStyle, margin: 0, flex: 1 }}>{item.description}</p>
            <button type="button" style={primaryButton2Style} onClick={() => setActive(item.key)}>
              Generate
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExportHistoryTab({
  entries,
  onDelete,
  onClear,
}: {
  entries: ExportHistoryEntry[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#0F172A" }}>
            Your recent reports (last 10)
          </h2>
          <p style={mutedStyle}>
            Download log for this browser only — file names and times, never
            report contents.
          </p>
        </div>
        {entries.length > 0 ? (
          <button type="button" style={smallExportButtonStyle} onClick={onClear}>
            Clear History
          </button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p style={{ ...mutedStyle, marginTop: 14 }}>
          No reports generated yet — open Pre-built Reports and press Generate.
        </p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                <th style={thStyle}>Report</th>
                <th style={thStyle}>Generated</th>
                <th style={thStyle}>Format</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={tdStyle}>{entry.name}</td>
                  <td style={tdStyle}>{new Date(entry.generated_at).toLocaleString()}</td>
                  <td style={tdStyle}>{entry.format}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      style={{ ...smallExportButtonStyle, color: "#B91C1C", borderColor: "#FECACA", background: "#FEF2F2" }}
                      onClick={() => onDelete(entry.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportCard({
  title,
  subtitle,
  icon,
  action,
  children,
  collapsible = true,
  defaultOpen = true,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  // Collapsible by default so the Reports page opens as a compact, scannable
  // list of sections instead of 20+ always-expanded cards. Summary cards pass
  // defaultOpen so the key figures stay visible.
  const [open, setOpen] = useState<boolean>(collapsible ? defaultOpen : true);
  const toggle = () => {
    if (collapsible) setOpen((prev) => !prev);
  };

  const shown = !collapsible || open;

  return (
    <section style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div
          onClick={toggle}
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible ? 0 : undefined}
          aria-expanded={collapsible ? open : undefined}
          onKeyDown={(event) => {
            if (collapsible && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              toggle();
            }
          }}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            flex: 1,
            minWidth: 0,
            cursor: collapsible ? "pointer" : "default",
          }}
        >
          {collapsible ? (
            <ChevronDown
              size={18}
              style={{
                marginTop: 4,
                flexShrink: 0,
                color: "#0F766E",
                transition: "transform .18s ease",
                transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              }}
            />
          ) : null}

          <div style={{ minWidth: 0 }}>
            <h2 style={cardTitleStyle}>
              <span style={cardIconStyle}>{icon}</span>
              {title}
            </h2>
            <p style={cardSubtitleStyle}>{subtitle}</p>
          </div>
        </div>

        {shown ? action : null}
      </div>

      {shown ? children : null}
    </section>
  );
}

function DiseaseSummaryPanel({ summary }: { summary: DiseaseSummary }) {
  return (
    <div style={panelStackStyle}>
      <div style={bigReportValueStyle}>{summary.topDiagnosis}</div>

      <div style={miniGridStyle}>
        <MiniMetric label="Case Count" value={summary.caseCount} />
        <MiniMetric label="Affected Barangays" value={summary.affectedBarangays} />
      </div>

      <div style={actionBoxStyle}>
        <strong>Recommended RHU action</strong>
        <p>{summary.recommendedAction}</p>
      </div>
    </div>
  );
}

function CompletenessPanel({ report }: { report: CompletenessReport }) {
  return (
    <div style={panelStackStyle}>
      <div style={progressHeaderStyle}>
        <strong>{report.completePercent}% complete</strong>
        <span>
          {report.complete} of {report.total} record(s)
        </span>
      </div>

      <div style={progressTrackStyle}>
        <div
          style={{
            ...progressFillStyle,
            width: `${Math.max(0, Math.min(100, report.completePercent))}%`,
            background: report.completePercent >= 80 ? "#0F766E" : "#F59E0B",
          }}
        />
      </div>

      <div style={miniGridStyle}>
        <MiniMetric
          label="Missing Diagnosis"
          value={report.missingDiagnosis}
          tone={report.missingDiagnosis > 0 ? "danger" : "normal"}
        />
        <MiniMetric
          label="Missing Treatment"
          value={report.missingTreatment}
          tone={report.missingTreatment > 0 ? "warning" : "normal"}
        />
        <MiniMetric
          label="Missing Barangay"
          value={report.missingBarangay}
          tone={report.missingBarangay > 0 ? "warning" : "normal"}
        />
        <MiniMetric
          label="Missing Contact"
          value={report.missingContact}
          tone={report.missingContact > 0 ? "warning" : "normal"}
        />
      </div>

      <div style={miniNoticeStyle}>
        Follow-up date missing: {compactNumber(report.missingFollowUpDate)}
      </div>
    </div>
  );
}

function FollowUpPanel({ report }: { report: FollowUpReport }) {
  return (
    <div style={panelStackStyle}>
      <div style={miniGridStyle}>
        <MiniMetric label="Open" value={report.open} />
        <MiniMetric
          label="Overdue"
          value={report.overdue}
          tone={report.overdue > 0 ? "danger" : "normal"}
        />
        <MiniMetric label="Due Today" value={report.dueToday} />
        <MiniMetric label="Next 7 Days" value={report.nextSevenDays} />
      </div>

      <div>
        <h3 style={subheadStyle}>Patients to Review</h3>

        {report.reviewRows.length === 0 ? (
          <EmptyState text="No due or overdue follow-ups in this report window." />
        ) : (
          <div style={followUpListStyle}>
            {report.reviewRows.map((row) => {
              const date = followUpDate(row);
              const days = date ? daysFromToday(date) : null;
              const timing =
                days === null
                  ? "No date"
                  : days < 0
                  ? `${Math.abs(days)} day(s) overdue`
                  : days === 0
                  ? "Due today"
                  : `Due in ${days} day(s)`;

              return (
                <div key={row.consultation_id} style={followUpRowStyle}>
                  <div>
                    <strong>{patientName(row)}</strong>
                    <span>{shortText(diagnosisLabel(row), 54)}</span>
                  </div>

                  <Badge
                    label={timing}
                    tone={
                      days === null
                        ? "warning"
                        : days < 0
                        ? "danger"
                        : days === 0
                        ? "info"
                        : "neutral"
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BarangayWatchlist({ rows }: { rows: BarangayWatchRow[] }) {
  const { sorted, sort, toggle } = useSortableRows(rows, {
    barangay: (r) => r.barangay,
    cases: (r) => r.cases,
    risk: (r) => r.riskScore,
    queue: (r) => r.queueDensity,
    followUps: (r) => r.followUps,
    topDiagnosis: (r) => r.topDiagnosis,
  });

  if (rows.length === 0) {
    return <EmptyState text="No barangay watchlist data yet." />;
  }

  return (
    <div style={tableWrapStyle}>
      <table style={compactTableStyle}>
        <thead>
          <tr>
            <SortableTh label="Barangay" sortKey="barangay" sort={sort} onSort={toggle} style={compactThStyle} />
            <SortableTh label="Cases" sortKey="cases" sort={sort} onSort={toggle} style={compactThStyle} />
            <SortableTh label="Risk" sortKey="risk" sort={sort} onSort={toggle} style={compactThStyle} />
            <SortableTh label="Queue" sortKey="queue" sort={sort} onSort={toggle} style={compactThStyle} />
            <SortableTh label="Follow-ups" sortKey="followUps" sort={sort} onSort={toggle} style={compactThStyle} />
            <SortableTh label="Top Diagnosis" sortKey="topDiagnosis" sort={sort} onSort={toggle} style={compactThStyle} />
            <th style={compactThStyle}>Suggested Action</th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => (
            <tr key={row.barangay}>
              <td style={compactTdStyle}>
                <strong>{row.barangay}</strong>
              </td>
              <td style={compactTdStyle}>{compactNumber(row.cases)}</td>
              <td style={compactTdStyle}>
                <Badge
                  label={`${row.riskLevel} · ${Math.round(row.riskScore)}`}
                  tone={
                    row.riskLevel === "High"
                      ? "danger"
                      : row.riskLevel === "Moderate"
                      ? "warning"
                      : "success"
                  }
                />
              </td>
              <td style={compactTdStyle}>{compactNumber(row.queueDensity)}</td>
              <td style={compactTdStyle}>{compactNumber(row.followUps)}</td>
              <td style={compactTdStyle}>{shortText(row.topDiagnosis, 50)}</td>
              <td style={compactTdStyle}>{shortText(row.suggestedAction, 70)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffWorkloadTable({ rows }: { rows: StaffWorkloadRow[] }) {
  const { sorted, sort, toggle } = useSortableRows(rows, {
    staff: (r) => r.staff,
    completed: (r) => r.completed,
    diagnosed: (r) => r.diagnosed,
    followUps: (r) => r.followUps,
  });

  if (rows.length === 0) {
    return <EmptyState text="No attending staff workload data available." />;
  }

  return (
    <div style={tableWrapStyle}>
      <table style={compactTableStyle}>
        <thead>
          <tr>
            <SortableTh label="Staff" sortKey="staff" sort={sort} onSort={toggle} style={compactThStyle} />
            <SortableTh label="Completed" sortKey="completed" sort={sort} onSort={toggle} style={compactThStyle} />
            <SortableTh label="Diagnosed" sortKey="diagnosed" sort={sort} onSort={toggle} style={compactThStyle} />
            <SortableTh label="Follow-ups" sortKey="followUps" sort={sort} onSort={toggle} style={compactThStyle} />
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => (
            <tr key={row.staff}>
              <td style={compactTdStyle}>
                <strong>{row.staff}</strong>
              </td>
              <td style={compactTdStyle}>{compactNumber(row.completed)}</td>
              <td style={compactTdStyle}>{compactNumber(row.diagnosed)}</td>
              <td style={compactTdStyle}>{compactNumber(row.followUps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (rows.length === 0) {
    return <EmptyState text={empty} />;
  }

  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div style={barListStyle}>
      {rows.map((row) => (
        <div key={row.label} style={barItemStyle}>
          <div style={barTopStyle}>
            <strong>{shortText(row.label, 52)}</strong>
            <span>{compactNumber(row.value)}</span>
          </div>

          <div style={barTrackStyle}>
            <div
              style={{
                ...barFillStyle,
                width: `${Math.max(4, Math.round((row.value / max) * 100))}%`,
              }}
            />
          </div>

          {row.helper ? <small style={barHelperStyle}>{row.helper}</small> : null}
        </div>
      ))}
    </div>
  );
}

function ExportCenter({
  exporting,
  onDiagnosisExport,
  onSummaryExport,
  onFollowUpExport,
  onFollowUpExportMasked,
  onWatchlistExport,
  onStaffExport,
  onStaffExportMasked,
  onCompletenessExport,
}: {
  exporting: boolean;
  onDiagnosisExport: () => void;
  onSummaryExport: () => void;
  onFollowUpExport: () => void;
  onFollowUpExportMasked: () => void;
  onWatchlistExport: () => void;
  onStaffExport: () => void;
  onStaffExportMasked: () => void;
  onCompletenessExport: () => void;
}) {
  // Sir Ayco (Part 2, format corrected in the follow-up round) — OPT-IN
  // privacy mode. When ON, exports that contain person-identifying columns
  // (patient names, staff names) download with those cells partially MASKED
  // ("S********" / "09*********"). Default OFF: the plaintext exports staff
  // work from daily are unchanged.
  const [privacy, setPrivacy] = useState(false);

  const exports = [
    {
      label: "Export Diagnosis + ITR CSV",
      helper: "Backend formal ITR + SOAP export (authorized plaintext)",
      onClick: onDiagnosisExport,
      privacyClick: null as null | (() => void),
    },
    {
      label: "Export Follow-up CSV",
      helper: "Open, due, and overdue follow-up rows",
      onClick: onFollowUpExport,
      privacyClick: onFollowUpExportMasked,
    },
    {
      label: "Export Barangay Watchlist CSV",
      helper: "Barangay case, risk, queue, and follow-up signals",
      onClick: onWatchlistExport,
      privacyClick: null,
    },
    {
      label: "Export Staff Workload CSV",
      helper: "Completed and diagnosed records by attending staff",
      onClick: onStaffExport,
      privacyClick: onStaffExportMasked,
    },
    {
      label: "Export Data Completeness CSV",
      helper: "Missing diagnosis, treatment, barangay, and contact summary",
      onClick: onCompletenessExport,
      privacyClick: null,
    },
    {
      label: "Export Summary",
      helper: "Facility report summary",
      onClick: onSummaryExport,
      privacyClick: null,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={privacyToggleStyle}>
        <input
          type="checkbox"
          checked={privacy}
          onChange={(event) => setPrivacy(event.target.checked)}
          style={{ width: 17, height: 17, accentColor: "#047857", flexShrink: 0 }}
        />
        <span>
          <strong>Privacy mode — mask personal data (S********)</strong>
          <small>
            Patient and staff names export with only their first letter visible
            (mobiles keep the 09 prefix) for audit/evidence copies. Aggregate
            exports are unaffected.
          </small>
        </span>
      </label>

      <div style={exportGridStyle}>
        {exports.map((item) => {
          const masked = privacy && !!item.privacyClick;

          return (
            <button
              key={item.label}
              type="button"
              style={masked ? exportButtonMaskedStyle : exportButtonStyle}
              onClick={masked ? item.privacyClick! : item.onClick}
              disabled={exporting}
            >
              {masked ? <ShieldAlert size={17} /> : <Download size={17} />}
              <span>
                <strong>
                  {item.label}
                  {masked ? " (masked)" : ""}
                </strong>
                <small>{masked ? "Names masked (first letter + asterisks)" : item.helper}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DiagnosisItrTable({ rows }: { rows: DiagnosisItrRow[] }) {
  const [open, setOpen] = useState<boolean>(true);
  // Part 3b — full record opens in a modal; the inline row stays scannable.
  const [detailsRow, setDetailsRow] = useState<DiagnosisItrRow | null>(null);
  const { sorted, sort, toggle } = useSortableRows(rows, {
    patient: (r) => patientName(r),
    age: (r) => r.age ?? null,
    barangay: (r) => barangayLabel(r),
    visit: (r) => r.consultation_date || r.completed_at || r.first_attended_at || "",
    diagnosis: (r) => diagnosisLabel(r),
    staff: (r) => r.attending_staff ?? "",
    status: (r) => primaryDataStatus(r),
  });

  return (
    <section style={tableCardStyle}>
      <div
        style={{ ...tableHeaderStyle, cursor: "pointer" }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
          <ChevronDown
            size={18}
            style={{
              marginTop: 4,
              flexShrink: 0,
              color: "#0F766E",
              transition: "transform .18s ease",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <h2 style={tableTitleStyle}>Diagnosis + ITR Consultation Report Table</h2>
            <p style={mutedStyle}>
              Formal consultation records for validation, review, and export.
              Sensitive notes are not displayed here unless required in the
              authorized backend CSV export.
            </p>
          </div>
        </div>

        <span style={countPillStyle}>{compactNumber(rows.length)} record(s)</span>
      </div>

      {open ? (
        <>
          <div style={tableWrapStyle}>
        <table style={mainTableStyle}>
          {/* Part 3b — inline row slimmed to the scan-at-a-glance essentials;
              Age/Sex, Barangay, Treatment, RHU, Attending Staff and the full
              clinical record moved (not removed) into the View Details modal. */}
          <thead>
            <tr>
              <SortableTh label="Patient" sortKey="patient" sort={sort} onSort={toggle} style={thStyle} />
              <SortableTh label="Visit Date" sortKey="visit" sort={sort} onSort={toggle} style={thStyle} />
              <SortableTh label="Diagnosis" sortKey="diagnosis" sort={sort} onSort={toggle} style={thStyle} />
              <th style={thStyle}>Follow-up</th>
              <SortableTh label="Data Status" sortKey="status" sort={sort} onSort={toggle} style={thStyle} />
              <th style={thStyle}>Details</th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((row) => (
              <tr key={row.consultation_id}>
                <td style={tdStyle}>
                  <strong>{patientName(row)}</strong>
                  <div style={cellSubStyle}>#{row.consultation_id}</div>
                </td>
                <td style={tdStyle}>{visitDate(row)}</td>
                <td style={tdStyle}>{shortText(diagnosisLabel(row), 72)}</td>
                <td style={tdStyle}>{followUpLabel(row)}</td>
                <td style={tdStyle}>
                  <div style={badgeWrapStyle}>
                    {dataStatusBadges(row).map((badge) => (
                      <Badge
                        key={`${row.consultation_id}-${badge.label}`}
                        label={badge.label}
                        tone={badge.tone}
                      />
                    ))}
                  </div>
                </td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    style={viewDetailsButtonStyle}
                    onClick={() => setDetailsRow(row)}
                  >
                    <FileText size={13} />
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>

          {rows.length === 0 ? (
            <EmptyState text="No Diagnosis + ITR consultation rows found for the selected filters." />
          ) : null}
        </>
      ) : null}

      {detailsRow ? (
        <ConsultationDetailsModal
          row={detailsRow}
          onClose={() => setDetailsRow(null)}
        />
      ) : null}
    </section>
  );
}

/**
 * Part 3b — full Diagnosis + ITR record in a modal. Every field that used to
 * be squeezed (or truncated with "…") into the table row lives here in full,
 * grouped the way RHU staff read a chart: patient → visit → clinical → follow-up.
 */
function ConsultationDetailsModal({
  row,
  onClose,
}: {
  row: DiagnosisItrRow;
  onClose: () => void;
}) {
  const field = (value: unknown): string => {
    const text = String(value ?? "").trim();
    return text !== "" ? text : "—";
  };

  return (
    <div
      style={detailsOverlayStyle}
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div style={detailsModalStyle}>
        <div style={detailsHeaderStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#0F172A" }}>
              Consultation #{row.consultation_id} — {patientName(row)}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B", fontWeight: 600 }}>
              {visitDate(row)} · {row.rhu_id ? `RHU ${row.rhu_id}` : "RHU —"} ·{" "}
              {field(row.status)}
            </p>
          </div>
          <button type="button" onClick={onClose} style={detailsCloseStyle} aria-label="Close details">
            <X size={17} />
          </button>
        </div>

        <div style={detailsBodyStyle}>
          <DetailsGroup title="Patient">
            <DetailsItem label="Name" value={patientName(row)} />
            <DetailsItem label="Age / Sex" value={ageSex(row)} />
            <DetailsItem label="Birthdate" value={field(row.birthdate)} />
            <DetailsItem label="Barangay" value={hasText(row.barangay) ? barangayLabel(row) : "—"} />
            <DetailsItem label="Address" value={field(row.address)} />
            <DetailsItem label="Mobile" value={field(row.mobile_number)} />
            <DetailsItem label="Guardian" value={field(row.guardian_name)} />
            <DetailsItem label="Guardian Contact" value={field(row.guardian_contact)} />
            <DetailsItem label="PhilHealth ID" value={field(row.philhealth_id)} />
          </DetailsGroup>

          <DetailsGroup title="Visit">
            <DetailsItem label="Consultation Date" value={field(row.consultation_date)} />
            <DetailsItem label="First Attended" value={field(row.first_attended_at)} />
            <DetailsItem label="Completed At" value={field(row.completed_at)} />
            <DetailsItem label="Queue Number" value={field(row.queue_number)} />
            <DetailsItem label="Queue Source" value={field(row.queue_source)} />
            <DetailsItem label="Appointment Type" value={field(row.appointment_type)} />
            <DetailsItem label="Reason for Visit" value={field(row.appointment_reason)} wide />
          </DetailsGroup>

          <DetailsGroup title="Clinical Record (SOAP)">
            <DetailsItem label="Chief Complaint" value={field(row.chief_complaint)} wide />
            <DetailsItem label="Subjective" value={field(row.subjective)} wide />
            <DetailsItem label="Objective" value={field(row.objective)} wide />
            <DetailsItem label="Assessment" value={field(row.assessment)} wide />
            <DetailsItem label="Plan" value={field(row.plan)} wide />
            <DetailsItem label="Diagnosis" value={diagnosisLabel(row)} wide />
            <DetailsItem label="Treatment" value={field(row.treatment)} wide />
            <DetailsItem label="Notes" value={field(row.notes)} wide />
          </DetailsGroup>

          <DetailsGroup title="Follow-up & Staff">
            <DetailsItem label="Follow-up Needed" value={row.follow_up_needed ? "Yes" : "No"} />
            <DetailsItem label="Follow-up Schedule" value={field(row.follow_up_date_time)} />
            <DetailsItem label="Follow-up Status" value={field(row.follow_up_status)} />
            <DetailsItem label="Instructions" value={field(row.follow_up_instructions)} wide />
            <DetailsItem label="Attending Staff" value={field(row.attending_staff)} />
          </DetailsGroup>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {dataStatusBadges(row).map((badge) => (
              <Badge key={`details-${badge.label}`} label={badge.label} tone={badge.tone} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <h4 style={detailsGroupTitleStyle}>{title}</h4>
      <div style={detailsGridStyle}>{children}</div>
    </section>
  );
}

function DetailsItem({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div style={{ ...detailsItemStyle, ...(wide ? { gridColumn: "1 / -1" } : null) }}>
      <span style={detailsItemLabelStyle}>{label}</span>
      <span style={detailsItemValueStyle}>{value}</span>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: any;
  tone?: "normal" | "warning" | "danger";
}) {
  return (
    <div
      style={{
        ...miniMetricStyle,
        background:
          tone === "danger"
            ? "#FEF2F2"
            : tone === "warning"
            ? "#FFFBEB"
            : "#F8FAFC",
        borderColor:
          tone === "danger"
            ? "#FECACA"
            : tone === "warning"
            ? "#FDE68A"
            : "#E2E8F0",
      }}
    >
      <span>{label}</span>
      <strong>{compactNumber(value)}</strong>
    </div>
  );
}

function Badge({ label, tone }: StatusBadge) {
  const style =
    tone === "danger"
      ? badgeDangerStyle
      : tone === "warning"
      ? badgeWarningStyle
      : tone === "success"
      ? badgeSuccessStyle
      : tone === "info"
      ? badgeInfoStyle
      : badgeNeutralStyle;

  return <span style={{ ...badgeBaseStyle, ...style }}>{label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div style={emptyStateStyle}>{text}</div>;
}

// ── Pre-built report templates ──────────────────────────────────────────
const templateGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const templateCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 9,
  padding: 18,
  borderRadius: 20,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  boxShadow: "0 12px 30px rgba(15,23,42,.05)",
};

const templateIconStyle: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 14,
  background: "#F0FDFA",
  color: "#0F766E",
  display: "grid",
  placeItems: "center",
};

const primaryButton2Style: CSSProperties = {
  minHeight: 42,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 12,
  padding: "0 16px",
  background: "#0F766E",
  color: "#FFFFFF",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  alignSelf: "flex-start",
};

const templateMetricsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const templateMetricStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "13px 15px",
  borderRadius: 14,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
};

const templateMetricLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 900,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "#64748B",
};

const templateMetricValueStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 950,
  color: "#0F172A",
  overflowWrap: "anywhere",
};

const templateListTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: "#0F766E",
};

const templateListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 6,
};

const templateListItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "9px 13px",
  borderRadius: 11,
  border: "1px solid #EEF2F7",
  background: "#FFFFFF",
  fontSize: 13.5,
  fontWeight: 700,
  color: "#0F172A",
};

const groupHeadingStyle: CSSProperties = {
  margin: "6px 0 -4px",
  color: "#0F172A",
  fontSize: 15,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const pageStyle: CSSProperties = {
  minHeight: "100%",
  padding: 24,
  background:
    "radial-gradient(circle at top left, rgba(20,184,166,.12), transparent 30%), linear-gradient(180deg, #F8FAFC 0%, #EEF2F7 100%)",
  display: "flex",
  flexDirection: "column",
  gap: 22,
  color: "#0F172A",
};

const heroStyle: CSSProperties = {
  borderRadius: 30,
  padding: 30,
  background:
    "linear-gradient(135deg, rgba(15,118,110,.97), rgba(13,148,136,.92))",
  color: "#FFFFFF",
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  boxShadow: "0 24px 60px rgba(15,118,110,.22)",
};

const heroKickerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 11px",
  borderRadius: 999,
  background: "rgba(255,255,255,.17)",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const heroTitleStyle: CSSProperties = {
  margin: "14px 0 8px",
  fontSize: 44,
  lineHeight: 1,
  letterSpacing: "-.05em",
};

const heroTextStyle: CSSProperties = {
  margin: 0,
  maxWidth: 760,
  color: "rgba(255,255,255,.88)",
  lineHeight: 1.7,
  fontSize: 15,
};

const heroMetaStyle: CSSProperties = {
  marginTop: 18,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 9,
  fontSize: 13,
  fontWeight: 800,
  color: "rgba(255,255,255,.9)",
};

const heroActionStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignContent: "flex-start",
};

const heroButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 16,
  background: "#FFFFFF",
  color: "#0F766E",
  fontWeight: 900,
  padding: "12px 15px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  boxShadow: "0 12px 24px rgba(15,23,42,.12)",
};

const filterPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(4, minmax(145px, 1fr)) minmax(220px, 1.4fr) auto auto",
  alignItems: "end",
  gap: 12,
  padding: 16,
  borderRadius: 24,
  background: "rgba(255,255,255,.94)",
  border: "1px solid #E2E8F0",
  boxShadow: "0 18px 42px rgba(15,23,42,.06)",
};

const filterFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const filterLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "#64748B",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #CBD5E1",
  borderRadius: 14,
  padding: "11px 12px",
  fontSize: 13,
  fontWeight: 700,
  color: "#0F172A",
  outline: "none",
  background: "#FFFFFF",
};

const lockedFilterStyle: CSSProperties = {
  border: "1px solid #99F6E4",
  borderRadius: 14,
  padding: "11px 12px",
  fontSize: 13,
  fontWeight: 900,
  color: "#0F766E",
  background: "#ECFDF5",
};

const searchBoxStyle: CSSProperties = {
  height: 42,
  border: "1px solid #CBD5E1",
  borderRadius: 14,
  background: "#FFFFFF",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 12px",
};

const searchInputStyle: CSSProperties = {
  border: 0,
  outline: "none",
  width: "100%",
  fontWeight: 700,
  color: "#0F172A",
};

const applyButtonStyle: CSSProperties = {
  height: 42,
  border: 0,
  borderRadius: 14,
  padding: "0 16px",
  background: "#0F766E",
  color: "#FFFFFF",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
};

const resetButtonStyle: CSSProperties = {
  height: 42,
  border: 0,
  borderRadius: 14,
  padding: "0 16px",
  background: "#E2E8F0",
  color: "#334155",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  borderRadius: 18,
  padding: "13px 16px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 800,
  color: "#B91C1C",
  background: "#FEF2F2",
  border: "1px solid #FECACA",
};

const safetyStyle: CSSProperties = {
  borderRadius: 18,
  padding: "13px 16px",
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  color: "#92400E",
};

const loadingStyle: CSSProperties = {
  minHeight: 260,
  borderRadius: 24,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  boxShadow: "0 18px 42px rgba(15,23,42,.06)",
  display: "grid",
  placeItems: "center",
  color: "#0F766E",
};

const formalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(280px, 1fr))",
  gap: 16,
};

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 24,
  padding: 18,
  boxShadow: "0 18px 42px rgba(15,23,42,.06)",
  minWidth: 0,
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 9,
  fontSize: 17,
  color: "#0F172A",
};

const cardIconStyle: CSSProperties = {
  color: "#0F766E",
  display: "inline-flex",
};

const cardSubtitleStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748B",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.5,
};

const smallExportButtonStyle: CSSProperties = {
  minHeight: 34,
  border: "1px solid #99F6E4",
  borderRadius: 13,
  background: "#ECFDF5",
  color: "#0F766E",
  padding: "8px 10px",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
};

const panelStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const bigReportValueStyle: CSSProperties = {
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  padding: 16,
  fontWeight: 950,
  color: "#0F172A",
  fontSize: 24,
  letterSpacing: "-.03em",
};

const miniGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
  gap: 10,
};

const miniMetricStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 16,
  padding: 12,
};

const actionBoxStyle: CSSProperties = {
  border: "1px solid #99F6E4",
  borderRadius: 18,
  background: "#ECFDF5",
  color: "#0F766E",
  padding: 13,
  lineHeight: 1.5,
};

const progressHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#0F172A",
  fontWeight: 900,
};

const progressTrackStyle: CSSProperties = {
  height: 12,
  borderRadius: 999,
  background: "#E2E8F0",
  overflow: "hidden",
};

const progressFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
};

const miniNoticeStyle: CSSProperties = {
  borderRadius: 14,
  padding: 11,
  background: "#F8FAFC",
  color: "#475569",
  fontWeight: 800,
};

const subheadStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 14,
  color: "#0F172A",
};

const followUpListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const followUpRowStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 16,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
};

const compactTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 720,
};

const compactThStyle: CSSProperties = {
  textAlign: "left",
  padding: 11,
  background: "#F8FAFC",
  borderBottom: "1px solid #E2E8F0",
  color: "#475569",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const compactTdStyle: CSSProperties = {
  padding: 11,
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  fontSize: 13,
  fontWeight: 700,
  verticalAlign: "top",
};

const barListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const barItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const barTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "#0F172A",
  fontSize: 13,
};

const barTrackStyle: CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: "#E2E8F0",
  overflow: "hidden",
};

const barFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "#0F766E",
};

const barHelperStyle: CSSProperties = {
  color: "#64748B",
  fontWeight: 700,
};

const exportGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
  gap: 12,
};

// Part 3d — Export Center buttons promoted from muted gray to clear green
// call-to-action tiles so the six exports read as first-class actions.
const exportButtonStyle: CSSProperties = {
  border: "1px solid #A7F3D0",
  borderRadius: 16,
  background: "#ECFDF5",
  padding: "15px 14px",
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  textAlign: "left",
  cursor: "pointer",
  color: "#065F46",
  boxShadow: "0 6px 16px rgba(4,120,87,.08)",
};

// Privacy-masked variant of an export tile (Part 2) — amber so the user can
// see at a glance this download will contain masked values, not names.
const exportButtonMaskedStyle: CSSProperties = {
  ...exportButtonStyle,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#92400E",
  boxShadow: "0 6px 16px rgba(180,83,9,.08)",
};

const privacyToggleStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "11px 13px",
  borderRadius: 14,
  border: "1px dashed #FCD34D",
  background: "#FFFBEB",
  cursor: "pointer",
  color: "#78350F",
};

// Part 3b — View Details modal styles.
const viewDetailsButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 11px",
  borderRadius: 10,
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
  color: "#0F766E",
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const detailsOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  display: "grid",
  placeItems: "center",
  padding: 20,
  zIndex: 80,
};

const detailsModalStyle: CSSProperties = {
  width: "100%",
  maxWidth: 780,
  maxHeight: "88vh",
  overflowY: "auto",
  background: "#FFFFFF",
  borderRadius: 22,
  border: "1px solid #E2E8F0",
  boxShadow: "0 30px 80px rgba(15,23,42,.25)",
};

const detailsHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "18px 22px",
  borderBottom: "1px solid #E2E8F0",
  position: "sticky",
  top: 0,
  background: "#FFFFFF",
  zIndex: 1,
};

const detailsCloseStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 11,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  color: "#475569",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const detailsBodyStyle: CSSProperties = {
  padding: 22,
  display: "grid",
  gap: 20,
};

const detailsGroupTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  fontWeight: 900,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "#0F766E",
};

const detailsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
};

const detailsItemStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  padding: "9px 12px",
  borderRadius: 12,
  background: "#F8FAFC",
  border: "1px solid #EEF2F7",
};

const detailsItemLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "#94A3B8",
};

const detailsItemValueStyle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: "#0F172A",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const tableCardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 24,
  padding: 18,
  boxShadow: "0 18px 42px rgba(15,23,42,.06)",
};

const tableHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  marginBottom: 14,
};

const tableTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 20,
};

const mutedStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#64748B",
  fontWeight: 700,
  lineHeight: 1.5,
};

const countPillStyle: CSSProperties = {
  alignSelf: "flex-start",
  padding: "8px 11px",
  borderRadius: 999,
  background: "#ECFDF5",
  color: "#0F766E",
  border: "1px solid #99F6E4",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const mainTableStyle: CSSProperties = {
  width: "100%",
  minWidth: 1120,
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: 12,
  background: "#F8FAFC",
  borderBottom: "1px solid #E2E8F0",
  color: "#475569",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const tdStyle: CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  fontSize: 13,
  fontWeight: 700,
  verticalAlign: "top",
};

const cellSubStyle: CSSProperties = {
  marginTop: 4,
  color: "#64748B",
  fontSize: 12,
  fontWeight: 700,
};

const badgeWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const badgeSuccessStyle: CSSProperties = {
  background: "#DCFCE7",
  color: "#166534",
  border: "1px solid #BBF7D0",
};

const badgeWarningStyle: CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  border: "1px solid #FDE68A",
};

const badgeDangerStyle: CSSProperties = {
  background: "#FEE2E2",
  color: "#991B1B",
  border: "1px solid #FECACA",
};

const badgeInfoStyle: CSSProperties = {
  background: "#DBEAFE",
  color: "#1D4ED8",
  border: "1px solid #BFDBFE",
};

const badgeNeutralStyle: CSSProperties = {
  background: "#F1F5F9",
  color: "#334155",
  border: "1px solid #CBD5E1",
};

const emptyStateStyle: CSSProperties = {
  minHeight: 120,
  borderRadius: 18,
  background: "#F8FAFC",
  border: "1px dashed #CBD5E1",
  color: "#64748B",
  fontWeight: 900,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  padding: 18,
};
