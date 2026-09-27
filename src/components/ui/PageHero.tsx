// src/components/ui/PageHero.tsx
//
// The band at the top of a page.
//
// WHAT IT REPLACES
// ----------------
// Twenty pages each built their own gradient hero. They disagreed on every
// measurement — corner radii ran from 18 to 30, padding from 22 to 28, titles
// up to 38px — and they were enormous. Queue's opened at roughly 440px, which
// on a laptop pushed "Call Next Patient", the most-used control in the
// building, below the fold. A nurse had to scroll to do the thing the page
// exists for.
//
// This is the same brand, a quarter of the height: about 96px on a desktop.
// The room it gives back goes to patient data, which is what staff came for.
//
// WHAT GOES IN IT
// ---------------
// A name, a line saying what the page is for, and the facts that identify
// what you are looking at (which RHU, when it last updated). Controls belong
// underneath in the page's own toolbar, not inside the band — burying a
// facility selector in the banner is what made those heroes so tall.
//
// RESPONSIVE
// ----------
// Actions sit beside the title on a desktop and drop beneath it under 720px.
// The subtitle is hidden on very narrow screens, where the title and the
// controls matter and a sentence of explanation does not.

import type { CSSProperties, ReactNode } from "react";

export default function PageHero({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
}: {
  /** Small caps line above the title, e.g. "KA-AGAPAY RHU QUEUE". */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One sentence on what this page is for. */
  subtitle?: ReactNode;
  /** Short facts: facility, last updated, refresh state. */
  meta?: ReactNode[];
  /** Buttons that belong with the title rather than with the table. */
  actions?: ReactNode;
}) {
  return (
    <section className="ka-page-hero">
      <div className="ka-page-hero-text">
        {eyebrow ? <div className="ka-page-hero-eyebrow">{eyebrow}</div> : null}

        <h1 className="ka-page-hero-title">{title}</h1>

        {subtitle ? <p className="ka-page-hero-sub">{subtitle}</p> : null}

        {meta && meta.length > 0 ? (
          <div className="ka-page-hero-meta">
            {meta.filter(Boolean).map((item, index) => (
              <span key={index} style={metaItemStyle}>
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {actions ? <div className="ka-page-hero-actions">{actions}</div> : null}
    </section>
  );
}

const metaItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};
