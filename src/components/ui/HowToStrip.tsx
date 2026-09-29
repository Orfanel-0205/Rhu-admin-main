// src/components/ui/HowToStrip.tsx
//
// The "how this page works" strip, which can be put away.
//
// Appointments, Consultations and Telemedicine each open with three numbered
// cards explaining the workflow. They are genuinely useful on a staff member's
// first week and they are the first thing on the page forever after, pushing
// the counters and the board itself below the fold for someone who has used
// this software every day for a year.
//
// So it collapses to a single line, and it remembers. The choice is kept per
// page and per browser: a nurse who has put away the Appointments steps has
// not necessarily learned Telemedicine, and a shared RHU computer should not
// have one person's decision follow everyone else to another machine.
//
// It starts open. Someone who has never seen this page is the one who needs
// it, and the cost of being wrong in that direction is one click.
//
// Each page had its own copy of this component and its own styles, which is
// how the three of them drifted into three slightly different cards saying
// the same kind of thing.

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

export interface HowToStep {
  title: string;
  body: string;
}

const STORAGE_PREFIX = "ka_howto_collapsed:";

/**
 * Whether this strip was put away, from this browser's memory.
 *
 * Storage can throw in a private window or with site data blocked, and a
 * guidance strip is not worth an error, so a failure means "open".
 */
function readCollapsed(pageKey: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(STORAGE_PREFIX + pageKey) === "1";
  } catch {
    return false;
  }
}

export default function HowToStrip({
  pageKey,
  label = "How this page works",
  steps,
}: {
  /** Distinguishes one page's memory from another's. */
  pageKey: string;
  /** The summary shown when collapsed. */
  label?: string;
  steps: HowToStep[];
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readCollapsed(pageKey)
  );

  // A different page means a different memory, so re-read rather than
  // carrying the previous page's answer into this one.
  useEffect(() => {
    setCollapsed(readCollapsed(pageKey));
  }, [pageKey]);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;

      try {
        window.localStorage.setItem(STORAGE_PREFIX + pageKey, next ? "1" : "0");
      } catch {
        // Not being able to remember it is not worth an error.
      }

      return next;
    });
  }, [pageKey]);

  if (steps.length === 0) return null;

  return (
    <section style={wrapStyle}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={collapsed ? "Show the steps for this page" : "Hide the steps"}
        style={toggleStyle}
      >
        <span style={toggleLabelStyle}>
          <HelpCircle size={15} />
          {label}
        </span>

        <span style={toggleHintStyle}>
          {collapsed ? `Show ${steps.length} steps` : "Hide"}
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </span>
      </button>

      {!collapsed ? (
        <div style={gridStyle}>
          {steps.map((step, index) => (
            <article key={step.title} style={cardStyle}>
              <span style={numberStyle}>{index + 1}</span>

              <div style={{ minWidth: 0 }}>
                <h3 style={titleStyle}>{step.title}</h3>
                <p style={bodyStyle}>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const wrapStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 16,
};

const toggleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  width: "100%",
  padding: "9px 14px",
  borderRadius: 12,
  border: "1px solid #E2E8F0",
  background: "#F8FAFC",
  color: "#0F172A",
  font: "inherit",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};

const toggleLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const toggleHintStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const gridStyle: CSSProperties = {
  display: "grid",
  // Wraps to one column on a phone without a media query.
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 12,
};

const cardStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
};

const numberStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  width: 28,
  height: 28,
  borderRadius: 999,
  background: "#0F766E",
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 900,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14.5,
  fontWeight: 900,
  color: "#0F172A",
};

const bodyStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  lineHeight: 1.55,
  color: "#475569",
  fontWeight: 600,
};
