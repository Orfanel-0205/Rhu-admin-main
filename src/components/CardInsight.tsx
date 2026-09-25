// src/components/CardInsight.tsx
//
// "What does THIS chart say?"
//
// AnalyticsBriefing sits at the top of a page and comments on the page as a
// whole. This is its counterpart under a single card: it sends only that
// card's own figures, so the answer is about the chart the person is looking
// at rather than about the screen it happens to be on.
//
// Deliberately small. A page carries a dozen of these, and a panel the size of
// the page-level one under every chart would bury the charts. Collapsed it is
// one line; it only takes space once somebody asks.
//
// Same endpoint and the same rules as the page-level briefing: aggregates
// only, nothing that identifies a patient, and a caveat stating what the
// answer has and has not seen.

import { useState } from "react";
import type { CSSProperties } from "react";
import { Sparkles, X } from "lucide-react";

import apiClient from "../lib/apiClient";

export interface CardFigure {
  label: string;
  value: string;
}

export default function CardInsight({
  cardTitle,
  scope,
  figures,
  notes,
}: {
  /** The chart's own heading, so the model knows what it is reading. */
  cardTitle: string;
  scope: string;
  figures: CardFigure[];
  notes?: string[];
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // A chart with nothing plotted has nothing to explain.
  if (figures.length === 0) return null;

  async function ask() {
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.post("/analytics/insight", {
        title: cardTitle,
        scope,
        figures,
        notes: notes?.slice(0, 12) ?? [],
      });

      setText(String(response.data?.insight ?? ""));
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not reach the assistant."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <div style={rowStyle}>
        <button
          type="button"
          onClick={ask}
          disabled={loading}
          style={linkStyle}
        >
          <Sparkles size={14} />
          {loading
            ? "Reading this chart..."
            : text
              ? "Ask again"
              : "Ask the assistant about this chart"}
        </button>

        {text ? (
          <button
            type="button"
            onClick={() => setText("")}
            style={dismissStyle}
            aria-label="Hide this answer"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {error ? <p style={errorStyle}>{error}</p> : null}

      {text ? (
        <div style={answerStyle}>
          {text.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} style={paragraphStyle}>
              {paragraph.trim()}
            </p>
          ))}

          <p style={caveatStyle}>
            From the figures in this chart only. It has not seen patient
            records.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const wrapStyle: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gap: 8,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const linkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: 0,
  border: "none",
  background: "none",
  color: "#0F766E",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};

const dismissStyle: CSSProperties = {
  display: "inline-flex",
  padding: 4,
  border: "none",
  background: "none",
  color: "#94A3B8",
  cursor: "pointer",
};

const answerStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #CCFBF1",
  background: "#F0FDFA",
};

const paragraphStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: "#1F2937",
};

const caveatStyle: CSSProperties = {
  margin: 0,
  paddingTop: 8,
  borderTop: "1px solid #CCFBF1",
  fontSize: 11.5,
  color: "#64748B",
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  fontWeight: 600,
  color: "#B91C1C",
};
