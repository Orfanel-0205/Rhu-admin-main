// src/utils/cmsDraftHandoff.ts
//
// Carries an AI-assistant CMS draft from the chat assistant (which floats over
// every page via DashboardShell) into the Events page's Create form.
//
// sessionStorage is used rather than router state because the assistant can
// hand off from ANY route, and a full reload mid-navigation must not resurrect
// a stale draft — the payload is read exactly once and cleared immediately.

import { TARGET_AUDIENCE_OPTIONS } from "../constants/targetAudiences";
import { ALL_RHU_SERVICES } from "../constants/rhuServices";

const STORAGE_KEY = "ka_cms_draft_handoff";

/** Shape returned by the backend CmsDraftParser. */
export interface CmsDraft {
  event_type?: string;
  category?: string;
  title?: string;
  description?: string;
  event_date?: string;
  ends_at?: string;
  location?: string;
  target_audience?: string[];
  barangay_target?: string;
  max_slots?: string;
  services?: string[];
  priority?: string;
  visibility?: string;
  tags?: string[];
  sms_summary?: string;
}

/**
 * The assistant offers several spellings for each list value (the whole
 * string, the group label, and each member). Keep only the ones that are real
 * options, so the form never holds a value its own dropdown cannot show.
 */
function matchCanonical(candidates: string[] | undefined, canonical: string[]): string[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const byLower = new Map(canonical.map((option) => [option.toLowerCase(), option]));
  const matched: string[] = [];

  for (const candidate of candidates) {
    const hit = byLower.get(String(candidate).trim().toLowerCase());

    if (hit && !matched.includes(hit)) {
      matched.push(hit);
    }
  }

  return matched;
}

export interface PreparedCmsDraft {
  title: string;
  description: string;
  event_type: string;
  category: string;
  event_date: string;
  ends_at: string;
  location: string;
  target_audience: string;
  barangay_target: string;
  max_slots: string;
  tags: string;
  services: string[];
  sms_summary: string;
  priority: string;
  visibility: string;
  /** Values the assistant proposed that are NOT selectable options. */
  unmatched: string[];
}

export function prepareCmsDraft(draft: CmsDraft): PreparedCmsDraft {
  const audiences = matchCanonical(draft.target_audience, TARGET_AUDIENCE_OPTIONS);
  const services = matchCanonical(draft.services, ALL_RHU_SERVICES);

  // Only worth flagging when the assistant proposed something for a list and
  // none of its spellings were selectable.
  const unmatched: string[] = [];

  if ((draft.target_audience?.length ?? 0) > 0 && audiences.length === 0) {
    unmatched.push("Target Audience");
  }

  if ((draft.services?.length ?? 0) > 0 && services.length === 0) {
    unmatched.push("RHU Service Offered");
  }

  return {
    title: draft.title ?? "",
    description: draft.description ?? "",
    event_type: draft.event_type ?? "event",
    category: draft.category ?? "",
    event_date: draft.event_date ?? "",
    ends_at: draft.ends_at ?? "",
    location: draft.location ?? "",
    target_audience: audiences.join(", "),
    barangay_target: draft.barangay_target || "all",
    max_slots: draft.max_slots ?? "",
    tags: Array.isArray(draft.tags) ? draft.tags.join(", ") : "",
    services,
    sms_summary: draft.sms_summary ?? "",
    priority: draft.priority ?? "normal",
    visibility: draft.visibility ?? "public",
    unmatched,
  };
}

export function stashCmsDraft(draft: CmsDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Private mode / storage disabled — the draft text stays in the chat.
  }
}

/** Reads and clears the pending draft. Returns null when there is none. */
export function takeCmsDraft(): PreparedCmsDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    sessionStorage.removeItem(STORAGE_KEY);

    const parsed = JSON.parse(raw) as CmsDraft;

    if (!parsed || typeof parsed !== "object" || !parsed.title) return null;

    return prepareCmsDraft(parsed);
  } catch {
    return null;
  }
}
