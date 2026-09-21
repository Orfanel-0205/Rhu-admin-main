// src/utils/formDraftHandoff.ts
//
// Carries a draft from the assistant into a form the staff member is filling.
//
// The Events draft (cmsDraftHandoff.ts) goes through sessionStorage, because
// the assistant hands it off from any route and the Events page then opens
// fresh and reads it. That does not work for a form that is ALREADY open:
// scheduling a follow-up happens on the consultation page the staff member is
// looking at, and there is no navigation to read a stash on.
//
// So this delivers both ways. A page that is open right now is told directly;
// a page that has to be opened first finds the draft waiting for it.
//
// WHAT A DRAFT MAY CONTAIN
//   Administrative fields only: when, how often, how urgent, whether to text
//   the patient, and a short plain-language reason. Never a diagnosis, a
//   medicine, a dose or care instructions. Those belong to the clinician, and
//   an AI-written value sitting in a clinical field is one distracted click
//   from reaching a patient. The assistant is instructed not to produce them;
//   this file refuses to carry them regardless, because an instruction the
//   model could drift from is not a safeguard.

export type FormDraftName = "follow_up";

export interface FormDraft {
  form: FormDraftName;
  fields: Record<string, string>;
}

const STORAGE_KEY = "ka_form_draft_handoff";

const EVENT_NAME = "ka-agapay:form-draft";

/**
 * The fields each form will accept from the assistant. Anything not listed is
 * dropped without comment, so widening what the assistant may fill is a
 * deliberate edit here rather than a change of wording in a prompt.
 */
const ALLOWED_FIELDS: Record<FormDraftName, string[]> = {
  follow_up: [
    "follow_up_type",
    "follow_up_date",
    "follow_up_start_date",
    "follow_up_end_date",
    "follow_up_time",
    "reason",
    "urgency",
    "sms_enabled",
  ],
};

/** Strips anything the form has not agreed to accept. */
export function sanitiseDraft(draft: FormDraft | null | undefined): FormDraft | null {
  if (!draft || typeof draft !== "object") return null;

  const allowed = ALLOWED_FIELDS[draft.form];

  if (!allowed) return null;

  const fields: Record<string, string> = {};

  Object.entries(draft.fields ?? {}).forEach(([key, value]) => {
    if (allowed.includes(key) && typeof value === "string" && value.trim() !== "") {
      fields[key] = value.trim();
    }
  });

  return Object.keys(fields).length > 0 ? { form: draft.form, fields } : null;
}

/**
 * Offer the draft to whichever page is listening.
 *
 * Returns true when a page took it. When nothing is listening the draft is
 * stashed instead, so the page can pick it up once it opens.
 */
export function deliverFormDraft(draft: FormDraft): boolean {
  const clean = sanitiseDraft(draft);

  if (!clean) return false;

  let taken = false;

  const event = new CustomEvent(EVENT_NAME, {
    detail: {
      draft: clean,
      accept: () => {
        taken = true;
      },
    },
  });

  window.dispatchEvent(event);

  if (!taken) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Private mode: the draft text is still readable in the chat.
    }
  }

  return taken;
}

/**
 * Listen for drafts meant for this form while it is on screen.
 *
 * The handler calls accept() so the assistant knows the draft landed and does
 * not also stash it for next time — a draft applied twice is confusing.
 */
export function onFormDraft(
  form: FormDraftName,
  handler: (fields: Record<string, string>) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail as {
      draft: FormDraft;
      accept: () => void;
    };

    if (!detail?.draft || detail.draft.form !== form) return;

    handler(detail.draft.fields);
    detail.accept();
  };

  window.addEventListener(EVENT_NAME, listener);

  return () => window.removeEventListener(EVENT_NAME, listener);
}

/** Reads and clears a draft stashed for a form that was not open yet. */
export function takeStashedFormDraft(form: FormDraftName): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const parsed = sanitiseDraft(JSON.parse(raw) as FormDraft);

    if (!parsed || parsed.form !== form) return null;

    sessionStorage.removeItem(STORAGE_KEY);

    return parsed.fields;
  } catch {
    return null;
  }
}
