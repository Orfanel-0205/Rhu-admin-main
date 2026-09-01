// src/services/heatmap.ts

import apiClient from "../lib/apiClient";

export type HeatmapRiskLevel = "low" | "moderate" | "high" | "critical" | string;

export interface HeatmapPoint {
  barangay_id: number;
  barangay: string;
  rhu_id?: number | null;
  rhu_label?: string | null;
  home_rhu_id?: number | null;
  home_rhu_label?: string | null;
  latitude: number;
  longitude: number;
  coordinate_source?: "database" | "default" | string;

  population?: number;
  total_cases: number;
  queue_density: number;
  incidence_rate?: number;

  heatmap_intensity: number;
  risk_score: number;
  risk_level: HeatmapRiskLevel;

  top_case_type?: string | null;
  top_complaint?: string | null;

  source_breakdown?: Record<string, number>;
}

export interface HeatmapResponse {
  status?: string;
  generated_at: string;
  filters?: {
    disease?: string | null;
    range?: "week" | "month" | string;
    active_only?: boolean;
    rhu_id?: number | null;
  };
  data: HeatmapPoint[];
}

export interface HeatmapParams {
  disease?: string;
  range?: "week" | "month";
  active_only?: boolean;
  rhu_id?: number | string;
}

const MALASIQUI_BOUNDS = {
  minLat: 15.83,
  maxLat: 15.99,
  minLng: 120.35,
  maxLng: 120.53,
};

function barangayKey(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function numberOrZero(value: any): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function hasCaseSignal(point: Pick<HeatmapPoint, "total_cases">): boolean {
  return numberOrZero(point.total_cases) > 0;
}

export function hasUsableCoordinates(
  point: Pick<HeatmapPoint, "latitude" | "longitude" | "coordinate_source">
): boolean {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  const source = String(point.coordinate_source ?? "").toLowerCase();

  if (source === "default") return false;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    latitude === 0 ||
    longitude === 0
  ) {
    return false;
  }

  return (
    latitude >= MALASIQUI_BOUNDS.minLat &&
    latitude <= MALASIQUI_BOUNDS.maxLat &&
    longitude >= MALASIQUI_BOUNDS.minLng &&
    longitude <= MALASIQUI_BOUNDS.maxLng
  );
}

export function filterCasePoints(points: HeatmapPoint[]): HeatmapPoint[] {
  const seen = new Set<string>();

  return points
    .filter((point) => hasCaseSignal(point) && hasUsableCoordinates(point))
    .filter((point) => {
      const key = point.barangay_id
        ? `id:${point.barangay_id}`
        : `name:${barangayKey(point.barangay)}`;

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const scoreDiff = numberOrZero(b.risk_score) - numberOrZero(a.risk_score);
      if (scoreDiff !== 0) return scoreDiff;
      return numberOrZero(b.total_cases) - numberOrZero(a.total_cases);
    });
}

function riskLevelFromScore(score: number): HeatmapRiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "moderate";
  return "low";
}

function parseCoordinate(value: any, decimals = 6): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(decimals));
}

function normalizePoint(raw: any): HeatmapPoint {
  const barangay = String(raw.barangay ?? raw.name ?? "Unknown barangay").trim();
  const totalCases = numberOrZero(raw.total_cases ?? raw.active_cases ?? raw.cases);
  const queueDensity = numberOrZero(raw.queue_density ?? raw.queue_count);
  const intensity = numberOrZero(raw.heatmap_intensity ?? raw.intensity ?? totalCases);
  const riskScore = numberOrZero(
    raw.risk_score ?? Math.min(100, intensity * 10 + queueDensity * 2)
  );

  const rhuIdRaw = Number(raw.rhu_id);
  const rhuId = rhuIdRaw === 1 || rhuIdRaw === 2 ? rhuIdRaw : null;
  const homeRhuIdRaw = Number(raw.home_rhu_id);
  const homeRhuId = homeRhuIdRaw === 1 || homeRhuIdRaw === 2 ? homeRhuIdRaw : null;

  return {
    barangay_id: numberOrZero(raw.barangay_id ?? raw.id),
    barangay,
    rhu_id: rhuId,
    rhu_label: raw.rhu_label ?? (rhuId ? `RHU ${rhuId}` : null),
    home_rhu_id: homeRhuId,
    home_rhu_label: raw.home_rhu_label ?? (homeRhuId ? `RHU ${homeRhuId}` : null),

    // Critical fix: trust the backend/database coordinate only.
    // Do NOT override here with a frontend barangay coordinate table.
    latitude: parseCoordinate(raw.latitude),
    longitude: parseCoordinate(raw.longitude),
    coordinate_source: raw.coordinate_source ?? "database",

    population: numberOrZero(raw.population),
    total_cases: totalCases,
    queue_density: totalCases > 0 ? queueDensity : 0,

    incidence_rate: numberOrZero(raw.incidence_rate),
    heatmap_intensity: intensity,
    risk_score: riskScore,
    risk_level: String(raw.risk_level ?? riskLevelFromScore(riskScore)),

    top_case_type: raw.top_case_type ?? raw.top_complaint ?? null,
    top_complaint: raw.top_complaint ?? raw.top_case_type ?? null,

    source_breakdown:
      raw.source_breakdown && typeof raw.source_breakdown === "object"
        ? raw.source_breakdown
        : {},
  };
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function normalizeResponse(payload: any, params?: HeatmapParams): HeatmapResponse {
  const allPoints = extractArray(payload).map(normalizePoint);
  const activeOnly = params?.active_only ?? true;

  return {
    status: payload?.status,
    generated_at: payload?.generated_at ?? new Date().toISOString(),
    filters: payload?.filters ?? params,
    data: activeOnly ? filterCasePoints(allPoints) : allPoints,
  };
}

export async function fetchHeatmapAnalytics(
  params?: HeatmapParams
): Promise<HeatmapResponse> {
  const activeOnly = params?.active_only ?? true;

  const response = await apiClient.get("/analytics/heatmap", {
    params: {
      disease: params?.disease || undefined,
      range: params?.range || "week",
      active_only: activeOnly ? 1 : 0,
      rhu_id: params?.rhu_id || undefined,
      _t: Date.now(),
    },
  });

  return normalizeResponse(response.data, {
    ...params,
    active_only: activeOnly,
  });
}

export async function fetchQueueHeatmap(
  params?: HeatmapParams
): Promise<HeatmapResponse> {
  const activeOnly = params?.active_only ?? true;

  const response = await apiClient.get("/analytics/queue-heatmap", {
    params: {
      disease: params?.disease || undefined,
      range: params?.range || "week",
      active_only: activeOnly ? 1 : 0,
      rhu_id: params?.rhu_id || undefined,
      _t: Date.now(),
    },
  });

  return normalizeResponse(response.data, {
    ...params,
    active_only: activeOnly,
  });
}
