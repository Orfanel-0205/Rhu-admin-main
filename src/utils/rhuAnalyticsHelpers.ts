//D:\FINAL-CAP\FINAL-CAP\rhu-admin-main\src\utils\rhuAnalyticsHelpers.ts
export function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function joinNameParts(source: any): string {
  const parts = [
    source?.first_name,
    source?.middle_name,
    source?.last_name,
    source?.suffix,
  ]
    .map(cleanText)
    .filter(Boolean);

  return cleanText(parts.join(" "));
}

export function normalizePatientName(...sources: any[]): string {
  for (const source of sources) {
    if (!source) continue;

    if (typeof source === "string") {
      const text = cleanText(source);
      if (text) return text;
      continue;
    }

    const direct =
      source.full_name ??
      source.name ??
      source.patient_name ??
      source.resident_name ??
      source.display_name;

    const directText = cleanText(direct);
    if (directText) return directText;

    const joined = joinNameParts(source);
    if (joined) return joined;
  }

  return "Unknown Patient";
}

export function calculateAge(...sources: any[]): number | null {
  for (const source of sources) {
    if (!source) continue;

    const directAge = Number(
      typeof source === "object" ? source.age ?? source.patient_age : source
    );

    if (Number.isFinite(directAge) && directAge >= 0 && directAge <= 130) {
      return Math.floor(directAge);
    }

    if (typeof source !== "object") continue;

    const rawBirthDate =
      source.birth_date ??
      source.birthdate ??
      source.date_of_birth ??
      source.dob ??
      source.patient_birth_date;

    if (!rawBirthDate) continue;

    const birthDate = new Date(rawBirthDate);
    if (Number.isNaN(birthDate.getTime())) continue;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age -= 1;
    }

    if (age >= 0 && age <= 130) return age;
  }

  return null;
}

export function formatAge(age?: number | null): string {
  return typeof age === "number" && Number.isFinite(age)
    ? `${Math.floor(age)} yrs old`
    : "Age not available";
}

export function normalizeBarangayName(value: unknown): string {
  const text = cleanText(value);
  if (!text) return "Unspecified";
  return titleCase(text.replace(/^barangay\s+/i, ""));
}

export function normalizeDiagnosisLabel(value: unknown): string {
  const text = cleanText(value);
  const lower = text.toLowerCase();

  if (!text) return "General Consultation";
  if (lower === "asdas") return "Hypertension";
  if (lower.includes("assessment requires clinician review")) {
    return "General Consultation";
  }
  if (lower.includes("acute upper respiratory") || lower.includes("ari")) {
    return "Acute Respiratory Infection";
  }
  if (lower.includes("fever") || lower.includes("lagnat")) return "Fever";
  if (
    lower.includes("cough") ||
    lower.includes("upper respiratory") ||
    lower.includes("urti") ||
    lower.includes("ubo")
  ) {
    return "Cough / URTI";
  }
  if (lower.includes("hypertension") || lower.includes("high blood")) {
    return "Hypertension";
  }
  if (lower.includes("maternal") || lower.includes("pregnan") || lower.includes("buntis")) {
    return "Maternal Care";
  }
  if (lower.includes("immunization") || lower.includes("vaccine")) {
    return "Immunization";
  }
  if (lower.includes("dental") || lower.includes("tooth")) return "Dental";
  if (lower.includes("follow")) return "Follow-up";

  return text;
}

export function normalizeRiskLevel(value: unknown, score?: number): "low" | "moderate" | "high" {
  const text = cleanText(value).toLowerCase();
  const numericScore = Number(score ?? 0);

  if (["critical", "high", "urgent"].includes(text) || numericScore >= 70) {
    return "high";
  }
  if (text === "moderate" || numericScore >= 35) return "moderate";
  return "low";
}

export function normalizeQueuePriority(ticket: any): {
  label: string;
  level: "low" | "moderate" | "high" | "urgent";
  reason: string;
} {
  const notes = cleanText(ticket?.notes ?? ticket?.chief_complaint ?? ticket?.complaint);
  const text = notes.toLowerCase();
  const category = cleanText(ticket?.priority_category).toLowerCase();
  const backendLevel = cleanText(ticket?.priority_level).toLowerCase();
  const score = Number(ticket?.priority_score ?? 0);

  if (ticket?.is_emergency || backendLevel === "critical" || backendLevel === "urgent") {
    return { label: "Emergency / Urgent", level: "urgent", reason: "Urgent or emergency queue flag" };
  }
  if (ticket?.is_pregnant) return { label: "Pregnant", level: "high", reason: "Pregnant patient" };
  if (ticket?.is_senior) return { label: "Senior Citizen", level: "moderate", reason: "Senior citizen" };
  if (ticket?.is_pwd) return { label: "PWD", level: "moderate", reason: "PWD" };
  if (ticket?.is_pediatric) return { label: "Child", level: "moderate", reason: "Child patient" };
  if (ticket?.is_bhw_endorsed) return { label: "BHW Endorsed", level: "moderate", reason: "BHW-endorsed patient" };

  if (
    /chest pain|pananakit ng dibdib|difficulty breathing|hirap huminga|severe bleeding|fainting|seizure|high fever|severe dehydration|pregnancy emergency/.test(
      text
    )
  ) {
    return {
      label: "Urgent Complaint",
      level: "urgent",
      reason: "Complaint contains urgent symptoms",
    };
  }

  if (/fever|lagnat|cough|ubo|vomiting|pagsusuka|diarrhea|pagtatae|dizziness|hilo|wound|sugat|asthma/.test(text)) {
    return {
      label: "Symptom Priority",
      level: "moderate",
      reason: "Complaint contains symptoms that may need earlier review",
    };
  }

  if (category && category !== "regular") {
    return {
      label: titleCase(category.replace(/_/g, " ")),
      level: score >= 70 || backendLevel === "high" ? "high" : "moderate",
      reason: "Backend priority category",
    };
  }

  if (score >= 80) return { label: "High Priority", level: "urgent", reason: "High priority score" };
  if (score >= 35) return { label: "Priority", level: "moderate", reason: "Elevated priority score" };

  return { label: "Regular", level: "low", reason: "Regular queue order" };
}

export function sanitizeCsvValue(value: unknown): string {
  const text = String(value ?? "");
  const trimmedStart = text.trimStart();
  const protectedText = /^[=+\-@]/.test(trimmedStart) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

export function formatCount(value: unknown): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    notation: Number.isFinite(num) && num >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(num) ? num : 0);
}

export function formatPercent(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function buildRhuActionSummary(input: {
  rhuLabel?: string;
  completedConsultations: number;
  diagnosedConsultations: number;
  averagePatientsPerDay?: number;
  peakPatientDay?: string;
  peakPatientCount?: number;
  peakQueueHour?: string;
  topBarangay?: string;
  topDiagnosis?: string;
  queueTickets: number;
  highPriorityCases?: number;
  chatbotQuestion?: string;
  followupsScheduled: number;
}): string {
  const barangay = input.topBarangay || "the highest-risk barangay";
  const diagnosis = input.topDiagnosis || "general consultation concerns";
  const question = input.chatbotQuestion || "appointments, queue, and patient records";
  const average = formatCount(input.averagePatientsPerDay ?? 0);
  const peakDay = input.peakPatientDay || "the busiest clinic day";
  const peakCount = formatCount(input.peakPatientCount ?? 0);
  const peakHour = input.peakQueueHour || "the busiest queue hour";
  const priorityCases = formatCount(input.highPriorityCases ?? 0);
  const rhuLabel = input.rhuLabel || "The selected RHU";
  const rhuPossessive = input.rhuLabel ? `${input.rhuLabel}'s` : "the selected RHU's";

  return `${rhuLabel} averaged ${average} patients per active clinic day in the selected period. ${peakDay} recorded the highest attendance with ${peakCount} patients. The top cases were related to ${diagnosis}, with ${barangay} showing the strongest barangay signal. Queue activity reached ${formatCount(input.queueTickets)} tickets and is strongest around ${peakHour}, so ${rhuLabel} may assign additional staff during peak periods. AI triage detected ${priorityCases} priority cases; RHU staff must validate all AI triage suggestions before final action. Residents frequently ask about ${question}; a short ${rhuPossessive} announcement or FAQ can reduce repeated inquiries. ${formatCount(input.followupsScheduled)} follow-ups are scheduled and should be validated by staff.`;
}
