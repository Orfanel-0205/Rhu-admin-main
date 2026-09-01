// src/theme/tokens.ts
// Ka-Agapay RHU Admin — shared design tokens.
//
// Single source of truth for the green/teal branding, spacing, typography,
// table styling and status colors. Pages and the src/components/ui/* kit pull
// from here so we stop re-declaring inline "card" styles on every page.

import type { CSSProperties } from "react";

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export const color = {
  // Brand (teal/green)
  brand: "#0D9488",
  brandDark: "#0F766E",
  brandDarker: "#047857",
  brandLight: "#14B8A6",
  brandTintBg: "#ECFDF5",
  brandTint: "#CCFBF1",
  brandBorder: "#A7F3D0",

  // Neutrals
  ink: "#0F172A", // headings
  text: "#1F2937", // body
  textMuted: "#64748B", // secondary
  textFaint: "#94A3B8", // tertiary / placeholders
  line: "#E2E8F0", // borders
  lineSoft: "#EEF2F6",
  surface: "#FFFFFF",
  surfaceAlt: "#F8FAFC",
  surfaceSunken: "#F1F5F9",
  pageBg: "#F6F8FA",

  // Semantic
  successBg: "#ECFDF5",
  successBorder: "#A7F3D0",
  successFg: "#047857",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  warnFg: "#B45309",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",
  dangerFg: "#B91C1C",
  infoBg: "#EFF6FF",
  infoBorder: "#BFDBFE",
  infoFg: "#1D4ED8",
  slateBg: "#F1F5F9",
  slateBorder: "#CBD5E1",
  slateFg: "#475569",
  violetBg: "#F5F3FF",
  violetBorder: "#DDD6FE",
  violetFg: "#6D28D9",
} as const;

/* ------------------------------------------------------------------ */
/* Scale                                                              */
/* ------------------------------------------------------------------ */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const shadow = {
  sm: "0 1px 2px rgba(15,23,42,0.04)",
  card: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
  pop: "0 12px 28px rgba(15,23,42,0.14)",
  drawer: "-16px 0 40px rgba(15,23,42,0.18)",
} as const;

export const font = {
  family:
    "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  pageTitle: { fontSize: 22, fontWeight: 800, color: color.ink } as CSSProperties,
  sectionTitle: { fontSize: 16, fontWeight: 800, color: color.ink } as CSSProperties,
  label: { fontSize: 12, fontWeight: 700, color: color.textMuted } as CSSProperties,
  body: { fontSize: 14, color: color.text } as CSSProperties,
  muted: { fontSize: 13, color: color.textMuted } as CSSProperties,
} as const;

/* ------------------------------------------------------------------ */
/* Reusable surface / control styles                                  */
/* ------------------------------------------------------------------ */

export const surfaceStyle: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.line}`,
  borderRadius: radius.xl,
  boxShadow: shadow.card,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  height: 38,
  border: `1px solid ${color.slateBorder}`,
  borderRadius: radius.md,
  padding: "0 12px",
  fontSize: 14,
  color: color.text,
  background: color.surface,
  outline: "none",
  boxSizing: "border-box",
};

export const primaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 38,
  padding: "0 16px",
  border: 0,
  borderRadius: radius.md,
  background: color.brand,
  color: "#FFFFFF",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};

export const secondaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 38,
  padding: "0 14px",
  border: `1px solid ${color.brand}`,
  borderRadius: radius.md,
  background: color.brandTintBg,
  color: color.brandDark,
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};

export const ghostButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 38,
  padding: "0 12px",
  border: `1px solid ${color.line}`,
  borderRadius: radius.md,
  background: color.surface,
  color: color.slateFg,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

export const dangerButton: CSSProperties = {
  ...ghostButton,
  border: `1px solid ${color.dangerBorder}`,
  background: color.dangerBg,
  color: color.dangerFg,
};

/* ------------------------------------------------------------------ */
/* Status tones — one map for every module's statuses                 */
/* ------------------------------------------------------------------ */

export type Tone = "success" | "warning" | "danger" | "info" | "slate" | "brand" | "violet";

export interface ToneStyle {
  bg: string;
  border: string;
  fg: string;
}

export const TONE_STYLES: Record<Tone, ToneStyle> = {
  success: { bg: color.successBg, border: color.successBorder, fg: color.successFg },
  warning: { bg: color.warnBg, border: color.warnBorder, fg: color.warnFg },
  danger: { bg: color.dangerBg, border: color.dangerBorder, fg: color.dangerFg },
  info: { bg: color.infoBg, border: color.infoBorder, fg: color.infoFg },
  slate: { bg: color.slateBg, border: color.slateBorder, fg: color.slateFg },
  brand: { bg: color.brandTintBg, border: color.brandBorder, fg: color.brandDark },
  violet: { bg: color.violetBg, border: color.violetBorder, fg: color.violetFg },
};

// Normalize any status string ("No-show", "in_service", "NEAR EXPIRY") to a key.
export function normalizeStatus(status?: string | null): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

// Status → tone, covering every module (queue, appointments, consultations,
// prescriptions, inventory, follow-up, content, sms).
const STATUS_TONE: Record<string, Tone> = {
  // Generic / content
  active: "success",
  available: "success",
  published: "success",
  approved: "success",
  scheduled: "info",
  upcoming: "info",
  ongoing: "info",
  in_service: "info",
  called: "info",
  waiting: "warning",
  pending: "warning",
  pending_review: "warning",
  draft: "slate",
  new: "info",
  needs_follow_up: "warning",
  contacted: "info",
  resolved: "success",
  escalated: "danger",
  // Completion
  completed: "success",
  released: "success",
  dispensed: "success",
  restocked: "success",
  sent: "success",
  // Negative / closed
  rejected: "danger",
  cancelled: "danger",
  void: "danger",
  failed: "danger",
  no_show: "danger",
  expired: "danger",
  out_of_stock: "danger",
  // Caution
  skipped: "slate",
  missed: "slate",
  removed: "slate",
  adjusted: "slate",
  past: "slate",
  archived: "slate",
  low_stock: "warning",
  near_expiry: "warning",
};

export function statusTone(status?: string | null): ToneStyle {
  return TONE_STYLES[STATUS_TONE[normalizeStatus(status)] ?? "slate"];
}

// Human label from a status key: "no_show" -> "No-show", "in_service" -> "In service".
export function statusLabel(status?: string | null): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "—";
  const spaced = raw.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
