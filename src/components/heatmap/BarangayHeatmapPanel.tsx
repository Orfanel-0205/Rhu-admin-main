// src/components/heatmap/BarangayHeatmapPanel.tsx
//
// Part 3 redesign — replaces the old "giant stacked cards" (a lone map card +
// a separate full-width risk table) with ONE cohesive unit:
//
//   ┌───────────────────────────── legend in header ─────────────────────────┐
//   │  [ Interactive Malasiqui map ]      │  [ Barangay disease ranking ]      │
//   ├─────────────────────────────────────────────────────────────────────────┤
//   │  [ Daily case-signal trend graph (real dates) ]                          │
//   └─────────────────────────────────────────────────────────────────────────┘
//
// All figures are derived from data already fetched by HeatmapAnalytics — the
// trend is bucketed from real consultation dates, never fabricated.

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { Download, MapPin, TrendingUp } from "lucide-react";

import MalasiquiHeatmapMap from "../MalasiquiHeatmapMap";
import type { HeatmapPoint } from "../../services/heatmap";
import type { HeatmapDiagnosisItrSignal } from "../../services/analytics";

type RiskKey = "low" | "moderate" | "high" | "critical";

const RISK_COLORS: Record<RiskKey, { fill: string; bg: string; text: string }> = {
  critical: { fill: "#E5484D", bg: "#FFE4E6", text: "#9F1239" },
  high: { fill: "#E07A2F", bg: "#FFEDD5", text: "#9A3412" },
  moderate: { fill: "#D6A400", bg: "#FEF9C3", text: "#854D0E" },
  low: { fill: "#10B981", bg: "#D1FAE5", text: "#065F46" },
};

const RISK_ORDER: RiskKey[] = ["critical", "high", "moderate", "low"];

function riskKey(level?: string): RiskKey {
  const r = String(level || "").toLowerCase();
  if (r === "critical") return "critical";
  if (r === "high") return "high";
  if (r === "moderate") return "moderate";
  return "low";
}

function riskStatus(level: RiskKey): string {
  switch (level) {
    case "critical":
      return "Immediate review";
    case "high":
      return "Needs follow-up";
    case "moderate":
      return "Monitor";
    default:
      return "Stable";
  }
}

function num(value: any): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dayKey(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

interface TrendPoint {
  key: string;
  label: string;
  value: number;
}

/** Build one bucket per day across the range, summing real case signals. */
function buildTrend(
  signals: HeatmapDiagnosisItrSignal[],
  range: "week" | "month"
): TrendPoint[] {
  const days = range === "month" ? 30 : 7;
  const buckets: TrendPoint[] = [];
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
    const key = dayKey(signal.consultation_date ?? signal.completed_at);
    if (!key) continue;
    const at = index.get(key);
    if (at === undefined) continue;
    buckets[at].value += Math.max(1, num(signal.case_count));
  }

  return buckets;
}

export default function BarangayHeatmapPanel({
  mapPoints,
  ranking,
  signals,
  range,
  onExport,
  maxRanking = 0,
  showLegend = true,
}: {
  mapPoints: HeatmapPoint[];
  ranking: HeatmapPoint[];
  signals: HeatmapDiagnosisItrSignal[];
  range: "week" | "month";
  onExport?: () => void;
  /** Show only the top N ranking rows with a "View full ranking" toggle (0 = all). */
  maxRanking?: number;
  /** Hide the internal legend when the page renders one legend for everything. */
  showLegend?: boolean;
}) {
  const trend = useMemo(() => buildTrend(signals, range), [signals, range]);
  const trendTotal = useMemo(() => trend.reduce((s, p) => s + p.value, 0), [trend]);

  // Progressive disclosure: quick top-N alerts by default, full list on demand.
  const [showAllRanks, setShowAllRanks] = useState(false);
  const limited = maxRanking > 0 && !showAllRanks;
  const visibleRanking = limited ? ranking.slice(0, maxRanking) : ranking;

  return (
    <section style={cardStyle}>
      {/* Header + legend */}
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <h2 style={titleStyle}>
            <MapPin size={20} style={{ marginRight: 8, verticalAlign: "-3px", color: "#0F766E" }} />
            Barangay Disease &amp; Case Heatmap
          </h2>
          <p style={mutedStyle}>
            Map and ranking update together. Bigger, redder barangays have the
            stronger case signal — {range === "month" ? "last 30 days" : "last 7 days"}.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {showLegend && (
            <div style={legendStyle}>
              {RISK_ORDER.map((key) => (
                <span key={key} style={legendItemStyle}>
                  <span style={{ ...legendDotStyle, background: RISK_COLORS[key].fill }} />
                  {key}
                </span>
              ))}
            </div>
          )}

          {onExport && (
            <button type="button" onClick={onExport} style={exportButtonStyle}>
              <Download size={15} />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Map (left) + ranking (right) */}
      <div style={splitStyle}>
        <div style={mapSlotStyle}>
          {/* plain: the panel provides the title + one severity legend, so the
              map's own header/legend would be the second and third copies. */}
          <MalasiquiHeatmapMap points={mapPoints} showDiagnosisSignals={false} plain />
        </div>

        <div style={rankingSlotStyle}>
          <div style={rankingHeaderStyle}>
            Barangay ranking
            <span style={rankingCountStyle}>{ranking.length}</span>
          </div>

          <div style={rankingListStyle}>
            {ranking.length === 0 ? (
              <div style={emptyStyle}>No barangay has case signals for this range.</div>
            ) : (
              visibleRanking.map((row, i) => {
                const rk = riskKey(row.risk_level);
                const colors = RISK_COLORS[rk];
                const topSignal = row.top_case_type || row.top_complaint || "No signal";

                return (
                  <div
                    key={row.barangay_id || `${row.barangay}-${i}`}
                    style={{
                      ...rankingRowStyle,
                      borderColor: colors.bg,
                      borderLeft: `4px solid ${colors.fill}`,
                    }}
                  >
                    <div style={{ ...rankBadgeStyle, background: colors.bg, color: colors.text }}>
                      {i + 1}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={rankTopRowStyle}>
                        <strong style={rankNameStyle} title={row.barangay}>
                          {row.barangay}
                        </strong>
                        <span style={{ ...riskPillStyle, background: colors.bg, color: colors.text }}>
                          {rk}
                        </span>
                      </div>

                      <div style={rankMetaStyle}>
                        <span>{num(row.total_cases)} cases</span>
                        <span>·</span>
                        <span>{num(row.queue_density)} queue</span>
                        <span>·</span>
                        <span style={rankScoreStyle}>{num(row.risk_score).toFixed(0)}%</span>
                      </div>

                      <div style={rankStatusRowStyle}>
                        <span style={{ ...rankStatusPillStyle, color: colors.text, background: colors.bg }}>
                          {riskStatus(rk)}
                        </span>
                      </div>

                      <div style={rankSignalStyle} title={topSignal}>
                        {topSignal}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {maxRanking > 0 && ranking.length > maxRanking && (
            <button
              type="button"
              onClick={() => setShowAllRanks((previous) => !previous)}
              style={viewAllButtonStyle}
            >
              {showAllRanks
                ? `Show top ${maxRanking} only`
                : `View full ranking (${ranking.length} barangays)`}
            </button>
          )}
        </div>
      </div>

      {/* Trend (below) */}
      <div style={trendWrapStyle}>
        <div style={trendHeaderStyle}>
          <div>
            <h3 style={trendTitleStyle}>
              <TrendingUp size={17} style={{ marginRight: 7, verticalAlign: "-3px", color: "#0F766E" }} />
              Case-signal trend
            </h3>
            <p style={mutedStyle}>
              Daily completed case signals across all barangays — {trendTotal} in the {range === "month" ? "last 30 days" : "last 7 days"}.
            </p>
          </div>
        </div>

        <TrendChart data={trend} />
      </div>
    </section>
  );
}

// ── Dependency-free SVG area/line chart ────────────────────────────────────
function TrendChart({ data }: { data: TrendPoint[] }) {
  const W = 760;
  // Kept intentionally small — this is a sparkline for quick trend reading,
  // not an analytical chart.
  const H = 150;
  const padX = 34;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;

  if (n === 0 || max === 0) {
    return <div style={emptyStyle}>No case-signal history for this range yet.</div>;
  }

  const x = (i: number) => padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padY + innerH - (v / max) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${(padY + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;

  // Show at most ~7 x-axis labels so a 30-day range stays readable.
  const labelEvery = Math.ceil(n / 7);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} ${H + 22}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Daily case-signal trend"
        style={{ minWidth: 520, display: "block" }}
      >
        <defs>
          <linearGradient id="ka-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F766E" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0F766E" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines + y labels (0, half, max) */}
        {[0, 0.5, 1].map((frac) => {
          const gy = padY + innerH - frac * innerH;
          return (
            <g key={frac}>
              <line x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="#E2E8F0" strokeWidth={1} />
              <text x={padX - 8} y={gy + 4} textAnchor="end" fontSize={11} fill="#94A3B8" fontWeight={700}>
                {Math.round(frac * max)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#ka-trend-fill)" stroke="none" />
        <path d={linePath} fill="none" stroke="#0F766E" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <g key={d.key}>
            <circle cx={x(i)} cy={y(d.value)} r={d.value > 0 ? 3.2 : 2} fill="#0F766E" />
            {i % labelEvery === 0 || i === n - 1 ? (
              <text x={x(i)} y={H + 4} textAnchor="middle" fontSize={11} fill="#64748B" fontWeight={700}>
                {d.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────
const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 20,
  padding: 18,
  boxShadow: "0 16px 34px rgba(15,23,42,.06)",
  display: "grid",
  gap: 18,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = { margin: 0, color: "#0F172A", fontSize: 19, fontWeight: 950 };

const mutedStyle: CSSProperties = { margin: "5px 0 0", color: "#64748B", fontSize: 13.5, lineHeight: 1.55 };

const legendStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 999,
  padding: "7px 12px",
};

const legendItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  textTransform: "capitalize",
};

const legendDotStyle: CSSProperties = { width: 11, height: 11, borderRadius: 999, flexShrink: 0 };

const exportButtonStyle: CSSProperties = {
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
  color: "#0F766E",
  borderRadius: 12,
  padding: "9px 13px",
  fontFamily: "inherit",
  fontWeight: 900,
  fontSize: 13.5,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
};

const splitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 16,
  alignItems: "start",
};

const mapSlotStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  borderRadius: 20,
};

const rankingSlotStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
};

const rankingHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: "#0F172A",
  fontSize: 14,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const rankingCountStyle: CSSProperties = {
  background: "#ECFDF5",
  color: "#047857",
  border: "1px solid #A7F3D0",
  borderRadius: 999,
  padding: "2px 9px",
  fontSize: 12,
  fontWeight: 900,
};

const viewAllButtonStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F766E",
  borderRadius: 10,
  padding: "9px 12px",
  fontFamily: "inherit",
  fontWeight: 900,
  fontSize: 13,
  cursor: "pointer",
};

const rankingListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  maxHeight: 360,
  overflowY: "auto",
  paddingRight: 2,
};

const rankingRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  border: "1px solid #EEF2F6",
  borderRadius: 14,
  padding: 12,
  background: "#FFFFFF",
  boxShadow: "0 8px 18px rgba(15,23,42,.04)",
};

const rankBadgeStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 950,
  flexShrink: 0,
};

const rankTopRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "space-between",
};

const rankNameStyle: CSSProperties = {
  color: "#0F172A",
  fontSize: 14,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
};

const riskPillStyle: CSSProperties = {
  borderRadius: 999,
  padding: "3px 9px",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "capitalize",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const rankMetaStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  color: "#64748B",
  fontSize: 12.5,
  fontWeight: 700,
  marginTop: 3,
  flexWrap: "wrap",
};

const rankScoreStyle: CSSProperties = { color: "#0F766E", fontWeight: 900 };

const rankStatusRowStyle: CSSProperties = {
  marginTop: 6,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const rankStatusPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  borderRadius: 999,
  padding: "0 9px",
  fontSize: 11.5,
  fontWeight: 950,
};

const rankSignalStyle: CSSProperties = {
  color: "#475569",
  fontSize: 12.5,
  marginTop: 3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const trendWrapStyle: CSSProperties = {
  display: "none",
};

const trendHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };

const trendTitleStyle: CSSProperties = { margin: 0, color: "#0F172A", fontSize: 16, fontWeight: 950 };

const emptyStyle: CSSProperties = {
  border: "1px dashed #CBD5E1",
  borderRadius: 14,
  padding: 18,
  textAlign: "center",
  color: "#64748B",
  fontWeight: 800,
  fontSize: 13.5,
};
