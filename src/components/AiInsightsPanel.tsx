// src/components/AiInsightsPanel.tsx
//
// Presentational panel for the proactive AI insights produced by
// src/lib/aiInsights.ts. It renders ONE card with a compact, ranked list of
// insights (instead of many separate cards) so the dashboard reads as a single
// "assistant" zone. Each row explains what the live data shows, the recommended
// next step, and an optional deep-link action.

import type { CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  PackageX,
  Sparkles,
  Stethoscope,
  Video,
  type LucideIcon,
} from "lucide-react";

import type { AiInsight, InsightCategory, InsightSeverity } from "../lib/aiInsights";

const SEVERITY_STYLES: Record<
  InsightSeverity,
  { bg: string; border: string; color: string; dot: string; chip: string }
> = {
  critical: { bg: "#FEF2F2", border: "#FECACA", color: "#B91C1C", dot: "#EF4444", chip: "Urgent" },
  warning: { bg: "#FFF7ED", border: "#FED7AA", color: "#C2410C", dot: "#F59E0B", chip: "Attention" },
  info: { bg: "#EFF6FF", border: "#BFDBFE", color: "#1D4ED8", dot: "#3B82F6", chip: "Monitor" },
  success: { bg: "#ECFDF5", border: "#A7F3D0", color: "#047857", dot: "#22C55E", chip: "Clear" },
};

const CATEGORY_ICON: Record<InsightCategory, LucideIcon> = {
  inventory: PackageX,
  queue: Clock,
  health: MapPin,
  followup: Stethoscope,
  telemedicine: Video,
  workload: Activity,
  general: CheckCircle2,
};

export default function AiInsightsPanel({
  insights,
  onAction,
  updatedLabel,
}: {
  insights: AiInsight[];
  onAction?: (url: string) => void;
  updatedLabel?: string;
}) {
  const urgentCount = insights.filter((i) => i.severity === "critical").length;

  return (
    <section style={cardStyle}>
      <div style={headerStyle}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <div style={iconBadgeStyle}>
            <Sparkles size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={titleStyle}>Ka-Agapay AI Insights</h2>
            <p style={subtitleStyle}>
              Automatic analysis of today&apos;s live data — no numbers are invented.
              {updatedLabel ? ` Updated ${updatedLabel}.` : ""}
            </p>
          </div>
        </div>

        {urgentCount > 0 && (
          <span style={urgentBadgeStyle}>
            <AlertTriangle size={14} />
            {urgentCount} urgent
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {insights.map((insight) => {
          const tone = SEVERITY_STYLES[insight.severity];
          const Icon = CATEGORY_ICON[insight.category] ?? Sparkles;

          return (
            <div key={insight.id} style={{ ...rowStyle, background: tone.bg, borderColor: tone.border }}>
              <div style={{ ...rowIconStyle, color: tone.color, borderColor: tone.border }}>
                <Icon size={20} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ color: "#0F172A", fontSize: 15, fontWeight: 900, overflowWrap: "anywhere" }}>
                    {insight.title}
                  </strong>
                  <span style={{ ...chipStyle, color: tone.color, borderColor: tone.border, background: "#FFFFFF" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: tone.dot }} />
                    {tone.chip}
                  </span>
                </div>

                <div style={detailStyle}>{insight.detail}</div>

                <div style={recommendationStyle}>
                  <span style={{ color: tone.color, fontWeight: 900 }}>Recommended: </span>
                  {insight.recommendation}
                </div>

                {insight.actionUrl && insight.actionLabel && (
                  <button
                    type="button"
                    onClick={() => onAction?.(insight.actionUrl as string)}
                    style={actionButtonStyle}
                  >
                    {insight.actionLabel}
                    <ChevronRight size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── styles ────────────────────────────────────────────────────────────────
const cardStyle: CSSProperties = {
  background: "linear-gradient(135deg, #F0FDFA 0%, #F8FAFC 55%, #EFF6FF 100%)",
  border: "1px solid #CCFBF1",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  minWidth: 0,
  display: "grid",
  gap: 14,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const iconBadgeStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  background: "#0F766E",
  color: "#FFFFFF",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  boxShadow: "0 8px 18px rgba(15,118,110,0.28)",
};

const titleStyle: CSSProperties = { margin: 0, color: "#0F172A", fontSize: 20, fontWeight: 950 };

const subtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748B",
  fontSize: 13.5,
  lineHeight: 1.5,
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const urgentBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#FEF2F2",
  color: "#B91C1C",
  border: "1px solid #FECACA",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 13,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const rowStyle: CSSProperties = {
  border: "1px solid",
  borderRadius: 14,
  padding: 14,
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  minWidth: 0,
};

const rowIconStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: "#FFFFFF",
  border: "1px solid",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const detailStyle: CSSProperties = {
  color: "#334155",
  marginTop: 5,
  fontSize: 14,
  lineHeight: 1.55,
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const recommendationStyle: CSSProperties = {
  color: "#475569",
  marginTop: 5,
  fontSize: 14,
  lineHeight: 1.55,
  overflowWrap: "anywhere",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid",
  borderRadius: 999,
  padding: "3px 9px",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const actionButtonStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "9px 13px",
  minHeight: 40,
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};
