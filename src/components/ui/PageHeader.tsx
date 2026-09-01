// src/components/ui/PageHeader.tsx
// Consistent page title + subtitle + primary/secondary actions row.
// Sits at the top of a page's content area (inside DashboardShell).

import type { CSSProperties, ReactNode } from "react";
import { color, font, space } from "../../theme/tokens";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small icon shown left of the title. */
  icon?: ReactNode;
  /** Right-aligned actions (buttons, etc.). */
  actions?: ReactNode;
  /** Optional breadcrumb / eyebrow text above the title. */
  eyebrow?: ReactNode;
  style?: CSSProperties;
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  eyebrow,
  style,
}: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: space.lg,
        flexWrap: "wrap",
        marginBottom: space.xl,
        ...style,
      }}
    >
      <div style={{ display: "flex", gap: space.md, alignItems: "flex-start", minWidth: 0 }}>
        {icon ? (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: color.brandTintBg,
              border: `1px solid ${color.brandBorder}`,
              color: color.brandDark,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        ) : null}

        <div style={{ minWidth: 0 }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: color.brandDark,
                marginBottom: 4,
              }}
            >
              {eyebrow}
            </div>
          ) : null}

          <h1 style={{ ...font.pageTitle, margin: 0 }}>{title}</h1>

          {subtitle ? (
            <p style={{ ...font.muted, margin: "4px 0 0", maxWidth: 720, lineHeight: 1.5 }}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div style={{ display: "flex", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
