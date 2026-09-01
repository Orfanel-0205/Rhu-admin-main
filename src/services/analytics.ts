// src/services/analytics.ts

import apiClient from "../lib/apiClient";
import { sanitizeCsvValue } from "../utils/rhuAnalyticsHelpers";

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  disease?: string;
  diagnosis?: string;
  date_from?: string;
  date_to?: string;
  rhu_id?: number | string;
  barangay_id?: number | string;
}

export interface HeatmapItem {
  barangay_id?: number;
  barangay: string;
  latitude?: number;
  longitude?: number;
  total_cases: number;
  queue_density: number;
  top_complaint?: string;
  top_case_type?: string;
  heatmap_intensity?: number;
  risk_score?: number;
  risk_level?: "low" | "moderate" | "high" | "critical" | string;
  source_breakdown?: Record<string, number>;
}

export interface DiagnosisItrCase {
  consultation_id: number;
  patient_name?: string | null;
  age?: number | null;
  sex_gender?: string | null;
  barangay?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  consultation_date?: string | null;
  completed_at?: string | null;
  follow_up_status?: string | null;
  attending_staff?: string | null;
}

export interface DiagnosisItrSummary {
  total_completed_consultations: number;
  total_diagnosed_consultations: number;
  top_diagnosis: string | null;
  barangays_with_diagnosed_cases: number;
  followups_scheduled: number;
  diagnosis_counts: Array<{ diagnosis: string; total: number }>;
  barangay_diagnosis_counts: Array<{
    barangay: string;
    diagnosis: string;
    total: number;
  }>;
  age_sex_breakdown: Array<{
    age_group: string;
    sex_gender: string;
    total: number;
  }>;
  recent_diagnosis_itr_cases: DiagnosisItrCase[];
}

export interface HeatmapDiagnosisItrSignal {
  consultation_id: number;
  barangay?: string | null;
  rhu_id?: number | null;
  risk: string;
  diagnosis_or_signal?: string | null;
  case_count: number;
  patient_name?: string | null;
  age?: number | null;
  sex_gender?: string | null;
  consultation_date?: string | null;
  completed_at?: string | null;
  heatmap_posted_at?: string | null;
  heatmap_signal_expires_at?: string | null;
  is_fresh_signal: boolean;
  fresh_until?: string | null;
  historical_status: string;
}

export interface ChartDatum {
  label: string;
  count: number;
  total: number;
  value: number;
  status?: string;
  triage_level?: string;
  percentage?: number;
  risk?: string;
  helper?: string;
  [key: string]: any;
}

export interface RealtimeAnalyticsResponse {
  generated_at: string;
  filters: AnalyticsFilters;
  overview: Record<string, any>;
  heatmap: HeatmapItem[];
  risk: HeatmapItem[];
  clusters: any[];
  chatbot: any;
}

function normalizeArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  return [];
}

function numberValue(value: any): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function readCount(row: any): number {
  return numberValue(
    row?.count ??
      row?.total ??
      row?.value ??
      row?.cases ??
      row?.attendees ??
      row?.registrations ??
      row?.messages ??
      row?.uses
  );
}

function readLabel(row: any): string {
  return String(
    row?.label ??
      row?.name ??
      row?.event_title ??
      row?.title ??
      row?.program ??
      row?.event ??
      row?.status ??
      row?.triage_level ??
      row?.category ??
      row?.day ??
      row?.date ??
      "Unspecified"
  );
}

export function normalizeChartRows(value: any): ChartDatum[] {
  return normalizeArray<any>(value).map((row) => {
    const count = readCount(row);

    return {
      ...row,
      label: readLabel(row),
      count,
      total: count,
      value: count,
    };
  });
}

function firstArray(source: any, keys: string[]): any[] {
  for (const key of keys) {
    const value = source?.[key];
    const rows = normalizeArray(value);
    if (rows.length > 0) return rows;
  }

  return [];
}

function attachChartAliases(
  target: Record<string, any>,
  keys: string[],
  rows: ChartDatum[]
) {
  if (rows.length === 0) return;

  keys.forEach((key) => {
    target[key] = rows;
  });
}

export function normalizeOverview(source: any): Record<string, any> {
  const overview: Record<string, any> = {
    ...(source && typeof source === "object" ? source : {}),
  };

  const queueByHour = normalizeChartRows(
    firstArray(overview, ["queue_by_hour", "queueByHour"])
  );
  attachChartAliases(overview, ["queue_by_hour", "queueByHour"], queueByHour);

  const queuePerformance = normalizeChartRows(
    firstArray(overview, [
      "queue_performance",
      "queuePerformance",
      "queue_by_status",
      "queueByStatus",
    ])
  );
  attachChartAliases(
    overview,
    ["queue_performance", "queuePerformance", "queue_by_status", "queueByStatus"],
    queuePerformance
  );

  const priorityBreakdown = normalizeChartRows(
    firstArray(overview, [
      "priority_breakdown",
      "priority_patient_breakdown",
      "priorityPatientBreakdown",
    ])
  );
  attachChartAliases(
    overview,
    ["priority_breakdown", "priority_patient_breakdown", "priorityPatientBreakdown"],
    priorityBreakdown
  );

  const aiTriage = normalizeChartRows(
    firstArray(overview, ["ai_triage_distribution", "aiTriageDistribution"])
  );
  attachChartAliases(
    overview,
    ["ai_triage_distribution", "aiTriageDistribution"],
    aiTriage
  );

  const appointmentStatus = normalizeChartRows(
    firstArray(overview, [
      "appointment_status_distribution",
      "appointmentStatusDistribution",
      "appointments_by_status",
      "appointmentsByStatus",
    ])
  );
  attachChartAliases(
    overview,
    [
      "appointment_status_distribution",
      "appointmentStatusDistribution",
      "appointments_by_status",
      "appointmentsByStatus",
    ],
    appointmentStatus
  );

  const telemedicineStatus = normalizeChartRows(
    firstArray(overview, [
      "telemedicine_status_distribution",
      "telemedicineStatusDistribution",
      "telemedicine_by_status",
      "telemedicineByStatus",
    ])
  );
  attachChartAliases(
    overview,
    [
      "telemedicine_status_distribution",
      "telemedicineStatusDistribution",
      "telemedicine_by_status",
      "telemedicineByStatus",
    ],
    telemedicineStatus
  );

  const programParticipation = normalizeChartRows(
    firstArray(overview, [
      "program_participation",
      "programParticipation",
      "program_participation_by_event",
      "programParticipationByEvent",
      "program_participation_by_barangay",
      "programParticipationByBarangay",
      "event_participation_by_barangay",
      "eventParticipationByBarangay",
      "programs",
    ])
  );
  attachChartAliases(
    overview,
    [
      "program_participation",
      "programParticipation",
      "program_participation_by_event",
      "programParticipationByEvent",
      "program_participation_by_barangay",
      "programParticipationByBarangay",
      "event_participation_by_barangay",
      "eventParticipationByBarangay",
      "programs",
    ],
    programParticipation
  );

  return overview;
}

function cleanParams(params?: AnalyticsFilters): Record<string, any> | undefined {
  if (!params) return undefined;

  const cleaned: Record<string, any> = {};

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "all") {
      return;
    }

    const cleanValue = typeof value === "string" ? value.trim() : value;

    // RHU isolation: forward any real facility id (RHU 1 or 2) so the backend
    // can scope to it. Only "all"/blank/invalid ids are dropped (handled above +
    // here) — this used to hard-lock every analytics call to RHU 1.
    if (key === "rhu_id" && !["1", "2"].includes(String(cleanValue))) return;

    cleaned[key] = cleanValue;
  });

  return cleaned;
}

export async function getRealtimeAnalytics(
  params?: AnalyticsFilters
): Promise<RealtimeAnalyticsResponse> {
  const res = await apiClient.get("/analytics/realtime", {
    params: cleanParams(params),
  });

  const root = res.data ?? {};
  const data = root.data ?? {};

  return {
    generated_at: root.generated_at ?? new Date().toISOString(),
    filters: root.filters ?? params ?? {},
    overview: normalizeOverview(data.overview ?? {}),
    heatmap: normalizeArray<HeatmapItem>(data.heatmap),
    risk: normalizeArray<HeatmapItem>(data.risk),
    clusters: normalizeArray(data.clusters),
    chatbot: data.chatbot ?? {
      total_messages: 0,
      by_day: [],
      top_prompts: [],
    },
  };
}

export async function getAnalyticsOverview(params?: AnalyticsFilters) {
  const res = await apiClient.get("/analytics/overview", {
    params: cleanParams(params),
  });

  return normalizeOverview(res.data?.data ?? res.data ?? {});
}

export async function getQueueHeatmap(
  params?: AnalyticsFilters
): Promise<HeatmapItem[]> {
  const res = await apiClient.get("/analytics/queue-heatmap", {
    params: cleanParams(params),
  });
  return normalizeArray<HeatmapItem>(res.data?.data ?? res.data);
}

export async function getBarangayRisk(
  params?: AnalyticsFilters
): Promise<HeatmapItem[]> {
  const res = await apiClient.get("/analytics/barangay-risk", {
    params: cleanParams(params),
  });
  return normalizeArray<HeatmapItem>(res.data?.data ?? res.data);
}

export async function getDiseaseClusters(params?: AnalyticsFilters) {
  const res = await apiClient.get("/analytics/disease-clusters", {
    params: cleanParams(params),
  });
  return normalizeArray(res.data?.data ?? res.data);
}

export async function getChatbotUsage(params?: AnalyticsFilters) {
  const res = await apiClient.get("/analytics/chatbot-usage", {
    params: cleanParams(params),
  });
  return res.data?.data ?? res.data;
}

export async function getTelemedicineSummary(params?: AnalyticsFilters) {
  const res = await apiClient.get("/analytics/telemedicine-summary", {
    params: cleanParams(params),
  });

  return res.data?.data ?? res.data;
}

export async function getDiagnosisItrSummary(
  params?: AnalyticsFilters
): Promise<DiagnosisItrSummary> {
  const res = await apiClient.get("/analytics/diagnosis-itr-summary", {
    params: cleanParams(params),
  });

  const data = res.data?.data ?? res.data ?? {};

  return {
    total_completed_consultations: Number(data.total_completed_consultations ?? 0),
    total_diagnosed_consultations: Number(data.total_diagnosed_consultations ?? 0),
    top_diagnosis: data.top_diagnosis ?? null,
    barangays_with_diagnosed_cases: Number(data.barangays_with_diagnosed_cases ?? 0),
    followups_scheduled: Number(data.followups_scheduled ?? 0),
    diagnosis_counts: normalizeArray(data.diagnosis_counts),
    barangay_diagnosis_counts: normalizeArray(data.barangay_diagnosis_counts),
    age_sex_breakdown: normalizeArray(data.age_sex_breakdown),
    recent_diagnosis_itr_cases: normalizeArray<DiagnosisItrCase>(
      data.recent_diagnosis_itr_cases
    ),
  };
}

export async function getHeatmapDiagnosisItrSignals(
  params?: AnalyticsFilters
): Promise<HeatmapDiagnosisItrSignal[]> {
  const res = await apiClient.get("/analytics/heatmap/diagnosis-itr-signals", {
    params: cleanParams(params),
  });

  return normalizeArray<HeatmapDiagnosisItrSignal>(res.data?.data ?? res.data);
}

export interface CsvColumn {
  /** Row key to read. */
  key: string;
  /** Human-readable header shown in the CSV file. */
  label: string;
  /** Optional custom formatter; returns the final cell string. */
  format?: (value: any, row: Record<string, any>) => string;
}

// snake_case / camelCase key -> readable header
// ("follow_up_status" -> "Follow Up Status").
function humanizeCsvKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

const CSV_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CSV_ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

// One consistent, spreadsheet-friendly representation across every export:
// dates as YYYY-MM-DD, datetimes as YYYY-MM-DD HH:mm, booleans as Yes/No,
// null/undefined as a blank cell.
function normalizeCsvValue(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  const str = String(value);

  if (CSV_ISO_DATE.test(str)) return str;

  if (CSV_ISO_DATETIME.test(str)) {
    const date = new Date(str);
    if (!Number.isNaN(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
      )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
  }

  return str;
}

/**
 * Download an array of records as a clean CSV.
 *
 * GRAIN is the caller's responsibility: pass rows already at ONE consistent
 * grain (one row per record — per consultation, per patient, or per day — never
 * mixed). Headers are human-readable, dates are normalized, blank cells stay
 * blank, and no synthetic `generated_at` column is injected.
 *
 * Pass `columns` for full control of which columns appear, their order and
 * labels. Without it, columns are the UNION of keys across ALL rows (so
 * varying-shape rows never misalign) with auto-humanized headers.
 */
export function downloadCsv(
  filename: string,
  rows: Array<Record<string, any>>,
  columns?: CsvColumn[]
) {
  const dataRows = Array.isArray(rows) ? rows : [];

  const cols: CsvColumn[] =
    columns && columns.length > 0
      ? columns
      : (() => {
          const ordered: string[] = [];
          const seen = new Set<string>();
          dataRows.forEach((row) =>
            Object.keys(row).forEach((key) => {
              if (key === "generated_at" || seen.has(key)) return;
              seen.add(key);
              ordered.push(key);
            })
          );
          return ordered.map((key) => ({ key, label: humanizeCsvKey(key) }));
        })();

  const safeFilename =
    filename
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "ka-agapay-export.csv";

  const lines: string[] = [];

  if (cols.length > 0) {
    lines.push(cols.map((col) => sanitizeCsvValue(col.label)).join(","));

    dataRows.forEach((row) => {
      lines.push(
        cols
          .map((col) => {
            const cell = col.format
              ? col.format(row[col.key], row)
              : normalizeCsvValue(row[col.key]);
            return sanitizeCsvValue(cell);
          })
          .join(",")
      );
    });
  } else {
    lines.push("No data");
  }

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = safeFilename;
  link.click();

  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Privacy-masked CSV export (Sir Ayco, Part 2 — format corrected per the
// follow-up panelist clarification: partial MASK, e.g. "S********", not a
// SHA-256 hash as the July 12 round first implemented).
//
// OPT-IN variant for audit/evidence exports: person-identifying cells keep
// only their first character (mobile numbers keep the "09" prefix) followed
// by a FIXED run of asterisks, so the value is recognizable in kind but not
// readable — and the mask length leaks nothing about the original length.
// The regular plaintext exports RHU staff work from every day are untouched.
// ---------------------------------------------------------------------------

/** Column keys treated as person-identifying when masking is requested. */
export const SENSITIVE_CSV_KEYS = /(patient|full_?name|first_?name|last_?name|attending_staff|staff_name|mobile|phone|contact_number)/i;

const MASK_RUN = "********"; // fixed 8 asterisks regardless of original length

/**
 * "Maria Santos" -> "M********"; "09171234567" -> "09*********" (PH-mobile
 * columns keep the universal 09 prefix for recognizability — every PH mobile
 * starts with 09, so those two digits reveal nothing personal).
 */
export function maskSensitiveValue(value: string, key = ""): string {
  const text = value.trim();
  if (text === "") return text;

  const isMobileLike =
    /(mobile|phone|contact_number)/i.test(key) || /^(\+?63|0)9\d{6,}$/.test(text.replace(/\D/g, ""));

  if (isMobileLike) {
    const digits = text.replace(/\D/g, "");
    const prefix = digits.startsWith("09")
      ? "09"
      : digits.startsWith("639")
      ? "09" // normalize the display prefix; digits themselves are masked anyway
      : text.slice(0, 1);
    return `${prefix}${"*".repeat(9)}`;
  }

  return `${text.slice(0, 1)}${MASK_RUN}`;
}

/**
 * Same contract as downloadCsv(), but every cell whose key matches
 * SENSITIVE_CSV_KEYS (or the explicit `sensitiveKeys` list) is exported as a
 * partial mask (first character + asterisks) instead of its real value.
 */
export function downloadCsvMasked(
  filename: string,
  rows: Array<Record<string, any>>,
  columns?: CsvColumn[],
  sensitiveKeys?: string[]
): void {
  const explicit = new Set((sensitiveKeys ?? []).map((k) => k.toLowerCase()));

  const isSensitive = (key: string) =>
    explicit.has(key.toLowerCase()) || SENSITIVE_CSV_KEYS.test(key);

  const maskedRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const out: Record<string, any> = { ...row };

    for (const key of Object.keys(out)) {
      const value = out[key];
      if (!isSensitive(key) || value === null || value === undefined) continue;

      const text = String(value);
      if (text.trim() === "") continue;

      out[key] = maskSensitiveValue(text, key);
    }

    return out;
  });

  const maskedName = filename.replace(/\.csv$/i, "") + "-masked.csv";

  // Column format() callbacks would re-derive plaintext from the row — strip
  // them and export the already-masked cell values as-is.
  const safeColumns = columns?.map(({ key, label }) => ({ key, label }));

  downloadCsv(maskedName, maskedRows, safeColumns);
}