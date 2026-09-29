// src/utils/clinicalText.ts
//
// Reading a Subjective note without repeating a machine's mistakes.
//
// Subjective is what the patient reported. Two kinds of noise end up stored in
// it, and one of them is a patient-safety problem rather than an untidiness.
//
// A leading "Chief complaint:" is the field's own label written into the
// field, which every board then prints under a heading that already says so.
//
// A "Transcript:" section is the speech recogniser's guess at the
// consultation, which the telemedicine room used to paste in beside the note.
// When dictation misfires the result is not merely wrong, it is not language:
// one consultation is stored as "Transcript: Gustavo Como estoppo Annapolis".
// Any screen that falls back to Subjective -- the Appointment Board under
// SYMPTOMS, the Consultation Records board under Chief complaint -- then shows
// that to staff as something a patient said.
//
// The room no longer writes them. Three consultations already contain one, so
// every reader strips them, and this lives in one place because the first fix
// only covered the first board that showed the problem.

/** A transcript line, however it was introduced. */
const TRANSCRIPT_LINE = /^\s*transcript\s*:/i;

/** The field's own name, written into the field. */
const REDUNDANT_HEADING = /^\s*chief complaint\s*:\s*/i;

/**
 * The clinical part of a Subjective note.
 *
 * Returns an empty string when the note was only a transcript, so callers can
 * fall through to their own "nothing recorded" wording rather than printing
 * nonsense under a clinical heading. A truthful blank beats a confident one.
 */
export function clinicalSubjective(
  subjective: string | null | undefined
): string {
  const text = String(subjective ?? "").trim();

  if (!text) return "";

  const kept = text
    .split(/\n+/)
    .filter((line) => !TRANSCRIPT_LINE.test(line))
    .join(" ")
    .trim();

  // A single-line note that begins with the transcript marker leaves nothing.
  if (!kept || TRANSCRIPT_LINE.test(kept)) return "";

  return kept.replace(REDUNDANT_HEADING, "").trim();
}

/** Whether a stored note carries a transcript section. */
export function containsTranscript(
  subjective: string | null | undefined
): boolean {
  return String(subjective ?? "")
    .split(/\n+/)
    .some((line) => TRANSCRIPT_LINE.test(line));
}
