// src/components/MalasiquiHeatmapMap.tsx

import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";

import {
  getHeatmapDiagnosisItrSignals,
  type AnalyticsFilters,
  type HeatmapDiagnosisItrSignal,
} from "../services/analytics";
import type { HeatmapPoint } from "../services/heatmap";
import {
  hasCaseSignal,
  hasUsableCoordinates,
  numberOrZero,
} from "../services/heatmap";

type Props = {
  points: HeatmapPoint[];

  /**
   * Optional.
   * If the parent page already fetched diagnosis signals, pass them here.
   * If not passed, this component will fetch them automatically.
   */
  diagnosisSignals?: HeatmapDiagnosisItrSignal[];

  /**
   * Optional filters for the Diagnosis + ITR heatmap signal endpoint.
   */
  diagnosisFilters?: AnalyticsFilters;

  /**
   * Defaults to true.
   */
  showDiagnosisSignals?: boolean;

  /**
   * Plain mode: hides this component's own header and legend footer for use
   * inside a panel that already provides a title and one shared severity
   * legend (avoids the double-heading / duplicate-legend problem).
   */
  plain?: boolean;
};

type DisplayHeatmapPoint = HeatmapPoint;

const MAP_VERSION = "Malasiqui database-coordinate heatmap v2026-06-18";
const DEFAULT_CENTER: [number, number] = [15.9202, 120.4145];

// CARTO Positron — same muted, low-clutter basemap used by
// FacilityQueueHeatmapMap.tsx, kept identical so both operational maps read
// as one visual system rather than two different map styles side by side.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Scoped CSS for Leaflet's OWN chrome — kept byte-for-byte in sync with
// FacilityQueueHeatmapMap.tsx's copy. Scoped under .ka-leaflet-shell so it
// never leaks into any other map on the page.
const LEAFLET_CHROME_CSS = `
  .ka-leaflet-shell .leaflet-control-zoom {
    border: none !important;
    border-radius: 14px !important;
    overflow: hidden;
    box-shadow: 0 10px 24px rgba(15,23,42,.16) !important;
    margin: 12px !important;
  }
  .ka-leaflet-shell .leaflet-control-zoom a {
    width: 34px !important;
    height: 34px !important;
    line-height: 34px !important;
    background: #FFFFFF !important;
    color: #0F766E !important;
    font-weight: 800 !important;
    border: none !important;
  }
  .ka-leaflet-shell .leaflet-control-zoom a:hover {
    background: #F0FDFA !important;
  }
  .ka-leaflet-shell .leaflet-control-zoom-in {
    border-bottom: 1px solid #E2E8F0 !important;
  }
  .ka-leaflet-shell .leaflet-bar {
    border: none !important;
  }
  .ka-leaflet-shell .leaflet-tooltip {
    background: #0B4F4A !important;
    color: #FFFFFF !important;
    border: none !important;
    border-radius: 999px !important;
    padding: 6px 13px !important;
    font-weight: 800 !important;
    font-size: 12px !important;
    box-shadow: 0 10px 22px rgba(11,79,74,.28) !important;
  }
  .ka-leaflet-shell .leaflet-tooltip-top:before {
    border-top-color: #0B4F4A !important;
  }
  .ka-leaflet-shell .leaflet-popup-content-wrapper {
    border-radius: 18px !important;
    box-shadow: 0 20px 48px rgba(15,23,42,.2) !important;
  }
  .ka-leaflet-shell .leaflet-popup-content {
    margin: 16px !important;
  }
  .ka-leaflet-shell .leaflet-popup-tip {
    box-shadow: none !important;
  }
  .ka-leaflet-shell .leaflet-popup-close-button {
    color: #0F766E !important;
  }
  .ka-leaflet-shell .leaflet-control-attribution {
    background: rgba(255,255,255,.82) !important;
    border-radius: 999px !important;
    padding: 2px 9px !important;
    font-size: 10px !important;
  }
  .ka-leaflet-shell .leaflet-container {
    background: #EAF7F5 !important;
  }
  .ka-leaflet-shell .leaflet-tile-pane {
    filter: saturate(1.32) contrast(1.04) brightness(.99);
  }
  .ka-leaflet-shell:after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 420;
    pointer-events: none;
    background:
      radial-gradient(circle at 35% 42%, rgba(20,184,166,.16), transparent 28%),
      radial-gradient(circle at 72% 62%, rgba(245,158,11,.12), transparent 24%),
      linear-gradient(180deg, rgba(240,253,250,.18), rgba(255,255,255,0));
    mix-blend-mode: multiply;
  }
`;

function barangayKey(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function riskRank(level?: string): number {
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

function strongerRiskLevel(a?: string, b?: string): string {
  return riskRank(a) >= riskRank(b) ? String(a || "low") : String(b || "low");
}

function riskColor(level?: string) {
  switch (String(level || "").toLowerCase()) {
    case "critical":
      return { stroke: "#E5484D", fill: "#E5484D" };
    case "high":
      return { stroke: "#E07A2F", fill: "#E07A2F" };
    case "moderate":
      return { stroke: "#D6A400", fill: "#D6A400" };
    default:
      return { stroke: "#10B981", fill: "#10B981" };
  }
}

function riskPillStyle(level?: string): React.CSSProperties {
  switch (String(level || "").toLowerCase()) {
    case "critical":
      return {
        background: "#FEE2E2",
        color: "#991B1B",
        border: "1px solid #FECACA",
      };
    case "high":
      return {
        background: "#FFEDD5",
        color: "#9A3412",
        border: "1px solid #FED7AA",
      };
    case "moderate":
      return {
        background: "#FEF3C7",
        color: "#92400E",
        border: "1px solid #FDE68A",
      };
    default:
      return {
        background: "#DCFCE7",
        color: "#166534",
        border: "1px solid #BBF7D0",
      };
  }
}

function statusPillStyle(isFresh: boolean): React.CSSProperties {
  if (isFresh) {
    return {
      background: "#DCFCE7",
      color: "#166534",
      border: "1px solid #BBF7D0",
    };
  }

  return {
    background: "#F1F5F9",
    color: "#475569",
    border: "1px solid #CBD5E1",
  };
}

function mergeSourceBreakdown(
  a?: Record<string, number>,
  b?: Record<string, number>
): Record<string, number> {
  const merged: Record<string, number> = {};

  Object.entries(a || {}).forEach(([key, value]) => {
    merged[key] = (merged[key] || 0) + numberOrZero(value);
  });

  Object.entries(b || {}).forEach(([key, value]) => {
    merged[key] = (merged[key] || 0) + numberOrZero(value);
  });

  return merged;
}

function visualSize(point: HeatmapPoint, zoom: number) {
  const cases = numberOrZero(point.total_cases);
  const score = numberOrZero(point.risk_score ?? point.heatmap_intensity);

  const pinRadius =
    zoom <= 11
      ? clamp(5 + cases, 5, 10)
      : zoom >= 15
        ? clamp(12 + cases * 2, 12, 24)
        : clamp(8 + Math.sqrt(Math.max(1, cases)) * 2 + score / 18, 8, 18);

  const haloMeters =
    zoom <= 11
      ? clamp(35 + cases * 5, 35, 90)
      : zoom >= 15
        ? clamp(80 + cases * 20 + score, 80, 280)
        : clamp(55 + cases * 10 + score * 1.2, 55, 180);

  return { pinRadius, haloMeters };
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ageSex(signal: HeatmapDiagnosisItrSignal): string {
  const age =
    signal.age !== null && signal.age !== undefined ? String(signal.age) : "—";
  const sex = String(signal.sex_gender || "").trim();

  if (age !== "—" && sex) return `${age} / ${sex}`;
  if (age !== "—") return age;

  return sex || "—";
}

function shortText(value?: string | null, limit = 90): string {
  const text = String(value || "").trim();

  if (!text) return "—";
  if (text.length <= limit) return text;

  return `${text.slice(0, limit - 1)}…`;
}

function normalizeFilters(filters?: AnalyticsFilters): AnalyticsFilters {
  if (!filters) return {};

  return {
    from: filters.from || undefined,
    to: filters.to || undefined,
    date_from: filters.date_from || filters.from || undefined,
    date_to: filters.date_to || filters.to || undefined,
    disease: filters.disease || undefined,
    diagnosis: filters.diagnosis || filters.disease || undefined,
    rhu_id: filters.rhu_id || undefined,
    barangay_id: filters.barangay_id || undefined,
  };
}

function ZoomWatcher({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void;
}) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

function boundsSignature(points: DisplayHeatmapPoint[]): string {
  return points
    .map(
      (point) =>
        `${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`
    )
    .sort()
    .join("|");
}

/**
 * Fits the map to the current points WITHOUT the `_leaflet_pos` crash.
 *
 * Why the crash happened: the old version called map.fitBounds() on every
 * `points` change with the default zoom animation. When the parent re-fetched
 * data mid zoom-transition, Leaflet tried to read a map pane that was still
 * animating (undefined `_leaflet_pos`).
 *
 * Fixes here:
 *  - Only refit when the actual coordinate set changes (signature guard) — no
 *    repeated fitBounds loops.
 *  - `animate: false` so there is no zoom-transition to race against.
 *  - Defer to requestAnimationFrame + map.whenReady so the container is laid
 *    out and the map is initialized before we touch panes.
 *  - invalidateSize first (covers a map mounted inside a card/tab that only
 *    just became visible / had zero height).
 *  - Everything wrapped in try/catch so a transient state never crashes React.
 */
function FitBounds({ points }: { points: DisplayHeatmapPoint[] }) {
  const map = useMap();
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    const signature = boundsSignature(points);

    if (signature === lastSignatureRef.current) {
      return;
    }

    lastSignatureRef.current = signature;

    let cancelled = false;

    const run = () => {
      if (cancelled) return;

      try {
        map.invalidateSize({ animate: false });

        if (points.length === 0) {
          map.setView(DEFAULT_CENTER, 13, { animate: false });
          return;
        }

        const bounds = points.map((point) => [
          Number(point.latitude),
          Number(point.longitude),
        ]) as LatLngBoundsExpression;

        map.fitBounds(bounds, {
          padding: [36, 36],
          maxZoom: 15,
          animate: false,
        });
      } catch {
        // Map pane not ready / mid-transition — ignore; it refits on the next
        // real coordinate change.
      }
    };

    const frame = window.requestAnimationFrame(() => {
      map.whenReady(run);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [map, points]);

  return null;
}

/**
 * Keeps the map sized correctly when its container becomes visible or the
 * window resizes — the other common source of broken Leaflet layout. Safe and
 * self-cleaning.
 */
function ResizeInvalidator() {
  const map = useMap();

  useEffect(() => {
    const handle = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // ignore — map may be mid-teardown
      }
    };

    // Initial settle covers a map mounted inside a card/tab that just appeared.
    const timer = window.setTimeout(handle, 200);
    window.addEventListener("resize", handle);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", handle);
    };
  }, [map]);

  return null;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: "#334155",
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          background: color,
        }}
      />
      {label}
    </span>
  );
}

function InfoBox({ label, value }: { label: string; value: any }) {
  return (
    <div
      style={{
        background: "#F8FAFC",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding: 11,
      }}
    >
      <div style={{ color: "#64748B", fontSize: 11, fontWeight: 900 }}>
        {label}
      </div>
      <div style={{ color: "#0F172A", fontSize: 17, fontWeight: 950 }}>
        {String(value ?? "—")}
      </div>
    </div>
  );
}

function prepareDisplayPoints(points: HeatmapPoint[]): DisplayHeatmapPoint[] {
  const grouped = new Map<string, DisplayHeatmapPoint>();

  points.forEach((point) => {
    if (!hasCaseSignal(point) || !hasUsableCoordinates(point)) return;

    const groupKey = point.barangay_id
      ? `id:${point.barangay_id}`
      : `name:${barangayKey(point.barangay)}`;

    const existing = grouped.get(groupKey);

    const current: DisplayHeatmapPoint = {
      ...point,
      latitude: Number(Number(point.latitude).toFixed(6)),
      longitude: Number(Number(point.longitude).toFixed(6)),
      coordinate_source: point.coordinate_source || "database",
    };

    if (!existing) {
      grouped.set(groupKey, current);
      return;
    }

    grouped.set(groupKey, {
      ...existing,
      total_cases:
        numberOrZero(existing.total_cases) + numberOrZero(current.total_cases),
      queue_density:
        numberOrZero(existing.queue_density) +
        numberOrZero(current.queue_density),
      risk_score: Math.max(
        numberOrZero(existing.risk_score),
        numberOrZero(current.risk_score)
      ),
      heatmap_intensity: Math.max(
        numberOrZero(existing.heatmap_intensity),
        numberOrZero(current.heatmap_intensity)
      ),
      risk_level: strongerRiskLevel(existing.risk_level, current.risk_level),
      top_case_type:
        existing.top_case_type ||
        current.top_case_type ||
        existing.top_complaint ||
        current.top_complaint ||
        "Unspecified",
      top_complaint:
        existing.top_complaint ||
        current.top_complaint ||
        existing.top_case_type ||
        current.top_case_type ||
        "Unspecified",
      source_breakdown: mergeSourceBreakdown(
        existing.source_breakdown,
        current.source_breakdown
      ),
    });
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const riskDiff = riskRank(b.risk_level) - riskRank(a.risk_level);
    if (riskDiff !== 0) return riskDiff;

    const scoreDiff = numberOrZero(b.risk_score) - numberOrZero(a.risk_score);
    if (scoreDiff !== 0) return scoreDiff;

    return numberOrZero(b.total_cases) - numberOrZero(a.total_cases);
  });
}

function DiagnosisItrSignalsTable({
  signals,
  loading,
  error,
  onRefresh,
}: {
  signals: HeatmapDiagnosisItrSignal[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const freshCount = signals.filter((signal) => signal.is_fresh_signal).length;
  const historicalCount = signals.length - freshCount;

  return (
    <section
      style={{
        borderTop: "1px solid #E5E7EB",
        background: "#FFFFFF",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
          marginBottom: 14,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: "#064E3B",
              fontSize: 18,
              fontWeight: 950,
            }}
          >
            Diagnosis + ITR Heatmap Signals
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748B",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Completed consultations connected with patient ITR, diagnosis,
            barangay, 3-hour freshness, and historical heatmap status.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={summaryPillStyle}>{signals.length} signal(s)</span>
          <span style={freshSummaryPillStyle}>{freshCount} fresh</span>
          <span style={historicalSummaryPillStyle}>
            {historicalCount} historical
          </span>

          <button type="button" onClick={onRefresh} style={refreshButtonStyle}>
            Refresh Signals
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "#991B1B",
            borderRadius: 14,
            padding: 12,
            fontWeight: 900,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={emptyTableStyle}>Loading Diagnosis + ITR heatmap signals...</div>
      ) : null}

      {!loading && signals.length === 0 ? (
        <div style={emptyTableStyle}>
          No Diagnosis + ITR heatmap signals found. Complete a consultation with a
          diagnosis first, then refresh this page.
        </div>
      ) : null}

      {signals.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={signalsTableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Barangay</th>
                <th style={thStyle}>Risk</th>
                <th style={thStyle}>Diagnosis / Top Signal</th>
                <th style={thStyle}>Cases</th>
                <th style={thStyle}>Patient</th>
                <th style={thStyle}>Age/Sex</th>
                <th style={thStyle}>Consultation Date</th>
                <th style={thStyle}>Fresh Until</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>

            <tbody>
              {signals.map((signal) => (
                <tr key={`${signal.consultation_id}-${signal.barangay}`}>
                  <td style={tdStyle}>
                    <strong>{signal.barangay || "Unspecified"}</strong>
                    <div style={subCellStyle}>
                      {signal.rhu_id ? `RHU ${signal.rhu_id}` : "RHU —"}
                    </div>
                  </td>

                  <td style={tdStyle}>
                    <span
                      style={{
                        ...pillBaseStyle,
                        ...riskPillStyle(signal.risk),
                      }}
                    >
                      {String(signal.risk || "low").toUpperCase()}
                    </span>
                  </td>

                  <td style={tdStyle}>
                    {shortText(signal.diagnosis_or_signal, 120)}
                  </td>

                  <td style={tdStyle}>
                    <strong>{signal.case_count ?? 1}</strong>
                  </td>

                  <td style={tdStyle}>
                    <strong>{signal.patient_name || "Patient"}</strong>
                    <div style={subCellStyle}>#{signal.consultation_id}</div>
                  </td>

                  <td style={tdStyle}>{ageSex(signal)}</td>

                  <td style={tdStyle}>
                    {formatDateTime(signal.consultation_date || signal.completed_at)}
                  </td>

                  <td style={tdStyle}>{formatDateTime(signal.fresh_until)}</td>

                  <td style={tdStyle}>
                    <span
                      style={{
                        ...pillBaseStyle,
                        ...statusPillStyle(Boolean(signal.is_fresh_signal)),
                      }}
                    >
                      {signal.is_fresh_signal
                        ? "Fresh within 3 hours"
                        : "Historical expired signal"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default function MalasiquiHeatmapMap({
  points,
  diagnosisSignals,
  diagnosisFilters,
  showDiagnosisSignals = true,
  plain = false,
}: Props) {
  const [zoom, setZoom] = useState(13);
  const [localSignals, setLocalSignals] = useState<HeatmapDiagnosisItrSignal[]>(
    []
  );
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState("");

  const displayPoints = useMemo(() => prepareDisplayPoints(points), [points]);

  const skippedCount = useMemo(() => {
    return points.filter((point) => hasCaseSignal(point)).length - displayPoints.length;
  }, [points, displayPoints.length]);

  const center = useMemo<[number, number]>(() => {
    if (displayPoints.length === 0) return DEFAULT_CENTER;

    const lat =
      displayPoints.reduce((sum, point) => sum + Number(point.latitude), 0) /
      displayPoints.length;
    const lng =
      displayPoints.reduce((sum, point) => sum + Number(point.longitude), 0) /
      displayPoints.length;

    return [lat, lng];
  }, [displayPoints]);

  const filterKey = useMemo(() => {
    return JSON.stringify(normalizeFilters(diagnosisFilters));
  }, [diagnosisFilters]);

  const fetchSignals = useCallback(async () => {
    if (!showDiagnosisSignals || diagnosisSignals) return;

    setSignalsLoading(true);
    setSignalsError("");

    try {
      const rows = await getHeatmapDiagnosisItrSignals(
        normalizeFilters(diagnosisFilters)
      );

      setLocalSignals(rows);
    } catch (error: any) {
      setSignalsError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to load Diagnosis + ITR heatmap signals."
      );
    } finally {
      setSignalsLoading(false);
    }
  }, [showDiagnosisSignals, diagnosisSignals, filterKey]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const finalSignals = diagnosisSignals ?? localSignals;

  return (
    <div
      style={{
        border: "1px solid #CCFBF1",
        borderRadius: 20,
        overflow: "hidden",
        background: "#FFFFFF",
        boxShadow: "0 14px 30px rgba(15,23,42,.06)",
      }}
    >
      <style>{LEAFLET_CHROME_CSS}</style>

      {!plain && (
        <div
          style={{
            padding: 14,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            background: "#FFFFFF",
            borderBottom: "1px solid #E5E7EB",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong style={{ color: "#064E3B", fontSize: 16 }}>
              Malasiqui Barangay Case Heatmap
            </strong>
            <div style={{ color: "#64748B", fontSize: 13, marginTop: 3 }}>
              {MAP_VERSION}. Pins use validated API/database latitude and
              longitude only.
            </div>
          </div>

          <div style={{ color: "#0F766E", fontWeight: 900, fontSize: 13 }}>
            Zoom {zoom} · {displayPoints.length} active barangay
            {displayPoints.length === 1 ? "" : "s"}
            {skippedCount > 0 ? ` · ${skippedCount} invalid/skipped` : ""}
          </div>
        </div>
      )}

      <div
        className="ka-leaflet-shell"
        style={{
          height: plain ? "clamp(470px, 58vh, 720px)" : "clamp(390px, 56vh, 640px)",
          width: "100%",
          position: "relative",
        }}
      >
        <MapContainer
          center={center}
          zoom={13}
          minZoom={10}
          maxZoom={19}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <ZoomWatcher onZoomChange={setZoom} />
          <ResizeInvalidator />
          <FitBounds points={displayPoints} />

          <TileLayer
            attribution={TILE_ATTRIBUTION}
            url={TILE_URL}
            subdomains="abcd"
            maxZoom={19}
          />

          {displayPoints.map((point) => {
            const color = riskColor(point.risk_level);
            const size = visualSize(point, zoom);
            const position: [number, number] = [
              Number(point.latitude),
              Number(point.longitude),
            ];
            const googleMapsUrl = `https://www.google.com/maps?q=${point.latitude},${point.longitude}`;
            const osmUrl = `https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=18/${point.latitude}/${point.longitude}`;

            return (
              <div key={`${point.barangay_id}-${point.barangay}`}>
                <Circle
                  center={position}
                  radius={size.haloMeters}
                  pathOptions={{
                    color: color.stroke,
                    fillColor: color.fill,
                    fillOpacity: 0.16,
                    opacity: 0.34,
                    weight: 2,
                  }}
                />

                <Circle
                  center={position}
                  radius={size.haloMeters * 0.58}
                  pathOptions={{
                    color: color.stroke,
                    fillColor: color.fill,
                    fillOpacity: 0.22,
                    opacity: 0.3,
                    weight: 1,
                  }}
                />

                <CircleMarker
                  center={position}
                  radius={size.pinRadius + 10}
                  pathOptions={{
                    color: color.stroke,
                    fillColor: color.fill,
                    fillOpacity: 0.2,
                    opacity: 0.28,
                    weight: 2,
                  }}
                />

                <CircleMarker
                  center={position}
                  radius={size.pinRadius + 1}
                  pathOptions={{
                    color: "#FFFFFF",
                    fillColor: color.fill,
                    fillOpacity: 0.96,
                    opacity: 1,
                    weight: 4,
                  }}
                >
                  {riskRank(point.risk_level) >= 3 ? (
                    <Tooltip permanent direction="top" offset={[0, -12]}>
                      <strong>{point.barangay}</strong>
                    </Tooltip>
                  ) : null}

                  <Popup maxWidth={310}>
                    <div style={{ minWidth: 250 }}>
                      <div
                        style={{
                          color: "#064E3B",
                          fontWeight: 950,
                          fontSize: 18,
                        }}
                      >
                        {point.barangay}
                      </div>

                      <div
                        style={{
                          color: "#64748B",
                          fontSize: 12,
                          marginTop: 3,
                        }}
                      >
                        {Number(point.latitude).toFixed(6)},{" "}
                        {Number(point.longitude).toFixed(6)}
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <InfoBox label="Cases" value={point.total_cases} />
                        <InfoBox label="Queue" value={point.queue_density} />
                        <InfoBox
                          label="Risk"
                          value={String(point.risk_level).toUpperCase()}
                        />
                        <InfoBox
                          label="Score"
                          value={`${Number(point.risk_score ?? 0).toFixed(0)}%`}
                        />
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          color: "#334155",
                          fontSize: 13,
                        }}
                      >
                        <strong>Top signal:</strong>{" "}
                        {point.top_case_type ||
                          point.top_complaint ||
                          "Unspecified"}
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          color: "#475569",
                          fontSize: 12,
                        }}
                      >
                        <strong>Coordinate source:</strong>{" "}
                        {point.coordinate_source || "database"}
                      </div>

                    <div
  style={{
    marginTop: 12,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  }}
>
  <a
    href={googleMapsUrl}
    target="_blank"
    rel="noreferrer"
    style={linkStyle}
  >
    Open Google Maps
  </a>

  <a
    href={osmUrl}
    target="_blank"
    rel="noreferrer"
    style={linkStyle}
  >
    Open OSM
  </a>
</div>
                    </div>
                  </Popup>
                </CircleMarker>
              </div>
            );
          })}
        </MapContainer>

        {displayPoints.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.94)",
                border: "1px solid #E2E8F0",
                borderRadius: 16,
                padding: "16px 18px",
                color: "#475569",
                fontWeight: 800,
                maxWidth: 360,
                textAlign: "center",
                boxShadow: "0 14px 34px rgba(15,23,42,.10)",
              }}
            >
              <div style={{ color: "#0F172A", marginBottom: 4 }}>
                No matching barangay case pins yet.
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45, fontWeight: 700 }}>
                Try All RHUs, clear the complaint search, or refresh after a new
                appointment is submitted.
              </div>
            </div>
          </div>
        )}
      </div>

      {!plain && (
        <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 14px",
          borderTop: "1px solid #E5E7EB",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
        }}
        >
          <Legend color="#10B981" label="Low" />
          <Legend color="#D6A400" label="Moderate" />
          <Legend color="#E07A2F" label="High" />
          <Legend color="#E5484D" label="Critical" />
        </div>
      )}

      {showDiagnosisSignals ? (
        <DiagnosisItrSignalsTable
          signals={finalSignals}
          loading={signalsLoading}
          error={signalsError}
          onRefresh={fetchSignals}
        />
      ) : null}
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "#047857",
  fontWeight: 900,
  textDecoration: "none",
  border: "1px solid #99F6E4",
  borderRadius: 12,
  padding: "8px 11px",
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
};

const summaryPillStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "8px 11px",
  background: "#ECFDF5",
  color: "#047857",
  border: "1px solid #A7F3D0",
  fontSize: 12,
  fontWeight: 950,
};

const freshSummaryPillStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "8px 11px",
  background: "#DCFCE7",
  color: "#166534",
  border: "1px solid #BBF7D0",
  fontSize: 12,
  fontWeight: 950,
};

const historicalSummaryPillStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "8px 11px",
  background: "#F1F5F9",
  color: "#475569",
  border: "1px solid #CBD5E1",
  fontSize: 12,
  fontWeight: 950,
};

const refreshButtonStyle: React.CSSProperties = {
  border: 0,
  background: "#0F766E",
  color: "#FFFFFF",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 950,
  cursor: "pointer",
};

const emptyTableStyle: React.CSSProperties = {
  border: "1px dashed #CBD5E1",
  borderRadius: 16,
  padding: 18,
  textAlign: "center",
  color: "#64748B",
  background: "#F8FAFC",
  fontWeight: 850,
};

const signalsTableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 1120,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  color: "#64748B",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  padding: "12px 10px",
  borderBottom: "1px solid #E5E7EB",
};

const tdStyle: React.CSSProperties = {
  padding: "13px 10px",
  borderBottom: "1px solid #F1F5F9",
  color: "#334155",
  verticalAlign: "top",
  fontSize: 13,
};

const subCellStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#94A3B8",
  fontSize: 12,
  fontWeight: 800,
};

const pillBaseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 950,
  whiteSpace: "nowrap",
};
