// src/utils/passwordPolicy.ts
//
// Web mirror of the backend PasswordPolicyService::standard() rule so the admin
// UI gives real-time feedback that matches what the server will actually accept:
//   • at least 8 characters
//   • uppercase + lowercase + number + special character (all four classes)
// The blocklist / personal-info checks are advisory warnings only (the backend
// `standard()` rule enforces length + classes; it does not reject on those), so
// they guide the user without ever disagreeing with the server.

export interface PasswordRuleResult {
  key: string;
  label: string;
  met: boolean;
}

export interface PasswordStrengthResult {
  rules: PasswordRuleResult[];
  classCount: number; // classes satisfied among upper/lower/number/symbol (0–4)
  allMet: boolean; // length + all four classes — mirrors backend standard()
  score: number; // 0–4, for the strength bar
  label: "" | "Weak" | "Fair" | "Good" | "Strong";
  warnings: string[]; // advisory only (common password / personal info)
}

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "pass@123",
  "12345678", "123456789", "1234567890", "qwerty123", "iloveyou",
  "welcome1", "admin123", "letmein1", "sunshine1", "monkey123",
  "kaagapay@1234",
]);

export function checkPasswordStrength(
  password: string,
  personal?: { firstName?: string | null; lastName?: string | null; mobile?: string | null }
): PasswordStrengthResult {
  const p = password ?? "";

  const rules: PasswordRuleResult[] = [
    { key: "length", label: "At least 8 characters", met: p.length >= 8 },
    { key: "upper", label: "An uppercase letter (A–Z)", met: /[A-Z]/.test(p) },
    { key: "lower", label: "A lowercase letter (a–z)", met: /[a-z]/.test(p) },
    { key: "number", label: "A number (0–9)", met: /[0-9]/.test(p) },
    { key: "symbol", label: "A special character (@, !, #…)", met: /[\W_]/.test(p) },
  ];

  const lengthOk = rules[0].met;
  const classCount = rules.filter((r) => r.key !== "length" && r.met).length;
  const allMet = lengthOk && classCount === 4;

  const warnings: string[] = [];
  if (p && COMMON_PASSWORDS.has(p.toLowerCase())) {
    warnings.push("This password is too common — choose something more unique.");
  }
  const infos = [personal?.firstName, personal?.lastName, personal?.mobile]
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length >= 3);
  for (const info of infos) {
    if (p.toLowerCase().includes(info.toLowerCase())) {
      warnings.push("Avoid using your name or mobile number in the password.");
      break;
    }
  }

  // Strength score (0–4) for the bar.
  let score = (lengthOk ? 1 : 0) + classCount; // 0–5
  if (warnings.length > 0) score = Math.max(0, score - 2);
  score = Math.min(4, score);

  const label = !p
    ? ""
    : score <= 1
    ? "Weak"
    : score === 2
    ? "Fair"
    : score === 3
    ? "Good"
    : "Strong";

  return { rules, classCount, allMet, score, label, warnings };
}
