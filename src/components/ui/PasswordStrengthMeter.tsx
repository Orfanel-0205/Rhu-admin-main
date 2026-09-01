// src/components/ui/PasswordStrengthMeter.tsx
//
// Real-time password requirement checklist + strength bar for the admin UI.
// Reused by staff registration, admin-created accounts, and any password field.
// Mirrors the backend PasswordPolicyService::standard() rule (see
// utils/passwordPolicy.ts) so the client never disagrees with the server.

import type { CSSProperties } from "react";
import { Check, X } from "lucide-react";
import { checkPasswordStrength } from "../../utils/passwordPolicy";

const BAR_COLORS = ["#EF4444", "#EF4444", "#F59E0B", "#EAB308", "#22C55E"];
const LABEL_COLORS: Record<string, string> = {
  Weak: "#B91C1C",
  Fair: "#B45309",
  Good: "#A16207",
  Strong: "#15803D",
};

export default function PasswordStrengthMeter({
  password,
  firstName,
  lastName,
  mobile,
  style,
}: {
  password: string;
  firstName?: string | null;
  lastName?: string | null;
  mobile?: string | null;
  style?: CSSProperties;
}) {
  if (!password) return null;

  const s = checkPasswordStrength(password, { firstName, lastName, mobile });
  const barColor = BAR_COLORS[s.score] ?? BAR_COLORS[0];
  const fillPct = Math.max(8, (s.score / 4) * 100);

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={trackStyle}>
          <div
            style={{
              height: "100%",
              width: `${fillPct}%`,
              background: barColor,
              borderRadius: 999,
              transition: "width .2s ease, background .2s ease",
            }}
          />
        </div>
        {s.label ? (
          <span style={{ fontSize: 12.5, fontWeight: 900, color: LABEL_COLORS[s.label] ?? "#64748B", whiteSpace: "nowrap" }}>
            {s.label}
          </span>
        ) : null}
      </div>

      <ul style={listStyle}>
        {s.rules.map((rule) => (
          <li key={rule.key} style={{ ...itemStyle, color: rule.met ? "#15803D" : "#64748B" }}>
            {rule.met ? <Check size={14} /> : <X size={14} style={{ color: "#CBD5E1" }} />}
            {rule.label}
          </li>
        ))}
      </ul>

      {s.warnings.map((w) => (
        <div key={w} style={warningStyle}>
          {w}
        </div>
      ))}
    </div>
  );
}

const trackStyle: CSSProperties = {
  flex: 1,
  height: 7,
  borderRadius: 999,
  background: "#E2E8F0",
  overflow: "hidden",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
  gap: "3px 12px",
};

const itemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 700,
};

const warningStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "#B45309",
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  borderRadius: 8,
  padding: "6px 10px",
};
