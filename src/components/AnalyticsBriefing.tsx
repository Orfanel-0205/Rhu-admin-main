// src/components/AnalyticsBriefing.tsx
//
// The one part of Analytics that genuinely asks a model.
//
// The metric cards on this page carry short explanations that are computed --
// thresholds and templates -- and they are now labelled as such. This panel is
// the opposite: it sends the figures currently drawn on screen to Gemini and
// prints what comes back. It says different things on different days because
// it is reading different numbers.
//
// It is a button rather than something that runs on load. Analytics is opened
// a dozen times a day to read one number, and spending a model call on each of
// those would be waste the RHU pays for.
//
// Only aggregates leave the browser: the labelled totals already on the page,
// the period, the facility, the barangay risk ranking. Never a patient or a
// record -- the same rule src/lib/screenContext.ts follows.

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";

import apiClient from "../lib/apiClient";
import type { ScreenFigure } from "../lib/screenContext";

interface Props {
  /** Which tab these figures belong to: Overview, Clinical, Queue, Telemedicine. */
  tabLabel: string;
  scope: string;
  figures: ScreenFigure[];
  notes?: string[];
}

export default function AnalyticsBriefing({
  tabLabel,
  scope,
  figures,
  notes,
}: Props) {
  const [text, setText] = useState("");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasFigures = figures.length > 0;

  /*
   * A briefing belongs to the tab it was generated on.
   *
   * Leaving it up after a tab change would show commentary about queue
   * waiting times above a screen of telemedicine figures, which reads as a
   * statement about what is on screen. Clearing is the honest default.
   */
  useEffect(() => {
    setText("");
    setGeneratedAt(null);
    setError("");
  }, [tabLabel, scope]);

  async function generate() {
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.post("/analytics/insight", {
        title: `Analytics — ${tabLabel}`,
        scope,
        figures: figures.map((figure) => ({
          label: figure.label,
          value: figure.value,
        })),
        notes: notes?.slice(0, 12) ?? [],
      });

      setText(String(response.data?.insight ?? ""));
      setGeneratedAt(String(response.data?.generated_at ?? ""));
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not reach the assistant. Try again shortly."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={wrapStyle}>
      <div style={headStyle}>
        <div>
          <h3 style={titleStyle}>
            <Sparkles size={17} />
            Ask the assistant about these {tabLabel.toLowerCase()} numbers
          </h3>

          <p style={subtitleStyle}>
            Sends the totals on this page — no patient records — and returns a
            short briefing on what they show and what to do next.
          </p>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={loading || !hasFigures}
          style={buttonStyle(loading || !hasFigures)}
        >
          <RefreshCw size={16} />
          {loading
            ? "Reading the figures..."
            : text
              ? "Generate again"
              : "Generate briefing"}
        </button>
      </div>

      {!hasFigures ? (
        <p style={emptyStyle}>
          There are no figures on screen yet. Choose a period and load the
          analytics first.
        </p>
      ) : null}

      {error ? (
        <div style={errorStyle}>
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      {text ? (
        <div style={bodyStyle}>
          {text.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} style={paragraphStyle}>
              {paragraph.trim()}
            </p>
          ))}

          {/*
              Said plainly, every time. A briefing that reads like a decision
              already made is the one thing this should not become: it has seen
              totals, not patients, and it does not know what happened in the
              clinic that week.
          */}
          <p style={caveatStyle}>
            Written by the assistant from the totals above, at{" "}
            {generatedAt
              ? new Date(generatedAt).toLocaleString("en-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "just now"}
            . It has not seen patient records, and it does not know what
            happened at the RHU that week. Check it against what you know before
            acting on it.
          </p>
        </div>
      ) : null}
    </section>
  );
}

const wrapStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 18,
  borderRadius: 18,
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
};

const headStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  margin: 0,
  fontSize: 16,
  fontWeight: 900,
  color: "#0F172A",
};

const subtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  maxWidth: 560,
  fontSize: 13,
  lineHeight: 1.55,
  color: "#475569",
};

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 18px",
    borderRadius: 999,
    border: "none",
    background: disabled ? "#99F6E4" : "#0F766E",
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: 800,
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
}

const bodyStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
  borderRadius: 14,
  background: "#FFFFFF",
  border: "1px solid #CCFBF1",
};

const paragraphStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.65,
  color: "#1F2937",
};

const caveatStyle: CSSProperties = {
  margin: 0,
  paddingTop: 10,
  borderTop: "1px solid #E2E8F0",
  fontSize: 12,
  lineHeight: 1.55,
  color: "#64748B",
};

const emptyStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#64748B",
};

const errorStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #FCA5A5",
  background: "#FEF2F2",
  color: "#B91C1C",
  fontSize: 13,
  fontWeight: 600,
};
