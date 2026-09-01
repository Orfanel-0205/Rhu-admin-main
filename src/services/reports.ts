// src/services/reports.ts

import apiClient from "../lib/apiClient";
import {
  getAnalyticsOverview,
  getBarangayRisk,
  getChatbotUsage,
  getDiseaseClusters,
  getQueueHeatmap,
  getTelemedicineSummary,
  type AnalyticsFilters,
  type HeatmapItem,
} from "./analytics";

export type ReportKey =
  | "overview"
  | "heatmap"
  | "risk"
  | "clusters"
  | "chatbot"
  | "telemedicine";

export interface ReportsBundle {
  generated_at: string;
  filters: AnalyticsFilters;

  overview: any;
  heatmap: HeatmapItem[];
  risk: HeatmapItem[];
  clusters: any[];
  chatbot: any;
  telemedicine: any;

  errors: Partial<Record<ReportKey, string>>;
}

export interface DiagnosisItrFilters {
  date_from?: string;
  date_to?: string;
  from?: string;
  to?: string;
  rhu_id?: number | string;
  barangay_id?: number | string;
  diagnosis?: string;
  disease?: string;
}

export interface DiagnosisItrRow {
  consultation_id: number;
  consultation_date?: string | null;
  completed_at?: string | null;
  first_attended_at?: string | null;
  status?: string | null;
  rhu_id?: number | null;
  queue_number?: string | null;
  queue_source?: string | null;
  appointment_type?: string | null;
  patient_name?: string | null;
  age?: number | null;
  sex_gender?: string | null;
  birthdate?: string | null;
  barangay?: string | null;
  address?: string | null;
  mobile_number?: string | null;
  guardian_name?: string | null;
  guardian_contact?: string | null;
  philhealth_id?: string | null;
  appointment_reason?: string | null;
  chief_complaint?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
  follow_up_needed?: boolean;
  follow_up_date_time?: string | null;
  follow_up_instructions?: string | null;
  follow_up_status?: string | null;
  attending_staff?: string | null;
}

export interface DiagnosisItrRowsResponse {
  generated_at: string;
  filters: DiagnosisItrFilters;
  summary: {
    total_completed_consultations: number;
    total_diagnosed_consultations: number;
    followups_scheduled: number;
  };
  data: DiagnosisItrRow[];
}

type SettledReport<T> = {
  key: ReportKey;
  value: T | null;
  error?: string;
};

function extractError(error: any): string {
  const validationErrors = error?.response?.data?.errors;

  if (validationErrors) {
    return Object.values(validationErrors).flat().join("\n");
  }

  return (
    error?.response?.data?.message ||
    error?.message ||
    "Report source failed to load."
  );
}

async function safeReport<T>(
  key: ReportKey,
  promise: Promise<T>
): Promise<SettledReport<T>> {
  try {
    const value = await promise;

    return {
      key,
      value,
    };
  } catch (error: any) {
    console.error(`[ReportsService] ${key} failed`, {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });

    return {
      key,
      value: null,
      error: extractError(error),
    };
  }
}

function asArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  return [];
}

function valueOf<T>(
  results: SettledReport<any>[],
  key: ReportKey,
  fallback: T
): T {
  const found = results.find((item) => item.key === key);

  if (!found || found.value === null || found.value === undefined) {
    return fallback;
  }

  return found.value as T;
}

function cleanParams(filters: DiagnosisItrFilters = {}): Record<string, any> {
  const params: Record<string, any> = {};

  const dateFrom = filters.date_from || filters.from;
  const dateTo = filters.date_to || filters.to;
  const diagnosis = filters.diagnosis || filters.disease;

  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  if (filters.rhu_id && filters.rhu_id !== "all") params.rhu_id = filters.rhu_id;
  if (filters.barangay_id && filters.barangay_id !== "all") {
    params.barangay_id = filters.barangay_id;
  }
  if (diagnosis && diagnosis.trim()) params.diagnosis = diagnosis.trim();

  return params;
}

export async function getReportsBundle(
  filters: AnalyticsFilters = {}
): Promise<ReportsBundle> {
  const results = await Promise.all([
    safeReport("overview", getAnalyticsOverview(filters)),
    safeReport("heatmap", getQueueHeatmap(filters)),
    safeReport("risk", getBarangayRisk(filters)),
    safeReport("clusters", getDiseaseClusters(filters)),
    safeReport("chatbot", getChatbotUsage(filters)),
    safeReport("telemedicine", getTelemedicineSummary(filters)),
  ]);

  const errors: Partial<Record<ReportKey, string>> = {};

  results.forEach((result) => {
    if (result.error) {
      errors[result.key] = result.error;
    }
  });

  const overview = valueOf<any>(results, "overview", {});
  const heatmap = asArray<HeatmapItem>(valueOf<any>(results, "heatmap", []));
  const risk = asArray<HeatmapItem>(valueOf<any>(results, "risk", []));
  const clusters = asArray<any>(valueOf<any>(results, "clusters", []));
  const chatbot = valueOf<any>(results, "chatbot", {
    total_messages: 0,
    by_day: [],
    top_prompts: [],
  });
  const telemedicine = valueOf<any>(results, "telemedicine", {
    requests: [],
    sessions: [],
    completion_rate: 0,
  });

  return {
    generated_at: new Date().toISOString(),
    filters,
    overview,
    heatmap,
    risk,
    clusters,
    chatbot,
    telemedicine,
    errors,
  };
}

export function flattenReportRow(
  row: Record<string, any>,
  prefix = ""
): Record<string, any> {
  const flat: Record<string, any> = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    const nextKey = prefix ? `${prefix}_${key}` : key;

    if (value === null || value === undefined) {
      flat[nextKey] = "";
      return;
    }

    if (Array.isArray(value)) {
      flat[nextKey] = value
        .map((item) =>
          typeof item === "object" ? JSON.stringify(item) : String(item)
        )
        .join("; ");
      return;
    }

    if (typeof value === "object") {
      Object.assign(flat, flattenReportRow(value, nextKey));
      return;
    }

    flat[nextKey] = value;
  });

  return flat;
}

export async function getDiagnosisItrRows(
  filters: DiagnosisItrFilters = {}
): Promise<DiagnosisItrRowsResponse> {
  const res = await apiClient.get("/reports/consultations/diagnosis-itr", {
    params: cleanParams(filters),
  });

  const root = res.data ?? {};

  return {
    generated_at: root.generated_at ?? new Date().toISOString(),
    filters: root.filters ?? filters,
    summary: {
      total_completed_consultations: Number(
        root.summary?.total_completed_consultations ?? 0
      ),
      total_diagnosed_consultations: Number(
        root.summary?.total_diagnosed_consultations ?? 0
      ),
      followups_scheduled: Number(root.summary?.followups_scheduled ?? 0),
    },
    data: asArray<DiagnosisItrRow>(root.data ?? root),
  };
}

/**
 * Downloads the combined Diagnosis + ITR CSV from the backend.
 * RHU scoping is enforced server-side; staff only ever get their own RHU.
 */
export async function exportDiagnosisItrCsv(
  filters: DiagnosisItrFilters = {}
): Promise<void> {
  const res = await apiClient.get("/reports/consultations/export", {
    params: cleanParams(filters),
    responseType: "blob",
  });

  const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `diagnosis_itr_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Backward-compatible name used by the current Reports page.
export const downloadConsultationsCsv = exportDiagnosisItrCsv;

export function getReportErrorMessages(
  errors: Partial<Record<ReportKey, string>>
): string[] {
  return Object.entries(errors).map(([key, message]) => {
    return `${key}: ${message}`;
  });
}
