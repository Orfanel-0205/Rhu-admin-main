// src/utils/complaintGrouping.ts
//
// What the patient actually came in for, in two or three words.
//
// A reason is free text typed by whoever was at the desk, so it arrives as
// "I have been experiencing a persistent cough for three days now" and a board
// can only show the first few words of that before running out of room. The
// first few words of a sentence are the least useful part of it: the reader
// sees "I have been experiencing a..." and learns nothing.
//
// This mirrors App\Support\ComplaintGrouping in the backend, which already
// does exactly this grouping so that outbreak detection can count "Ubo",
// "Cough" and "inuubo" as one condition. The vocabulary belongs there -- it is
// the thing the heatmap counts -- and this is a copy so the admin can label a
// card without asking the server what a sentence is about.
//
// A parity test holds the two lists identical. If they drift, a board and the
// outbreak map start disagreeing about what a patient said, which is worse
// than either being wrong on its own.
//
// WHAT THIS IS NOT
//
// Not triage and not a diagnosis. It recognises the words people use for
// common complaints so a card can show the complaint instead of the opening
// clause of a sentence. Anything it does not recognise keeps its own wording.

/** Canonical condition => the words that mean it. Tagalog first. */
export const COMPLAINT_GROUPS: Record<string, string[]> = {
  Fever: ["lagnat", "nilalagnat", "fever", "febrile", "init ng katawan"],
  Cough: ["ubo", "inuubo", "cough", "coughing"],
  Colds: ["sipon", "may sipon", "colds", "cold", "runny nose", "baradong ilong"],
  "Influenza-like illness": [
    "trangkaso",
    "flu",
    "influenza",
    "ubo at lagnat",
    "lagnat at ubo",
  ],
  Headache: [
    "sakit ng ulo",
    "masakit ang ulo",
    "headache",
    "migraine",
    "migraina",
  ],
  "Diarrhoea": [
    "pagtatae",
    "nagtatae",
    "diarrhea",
    "diarrhoea",
    "loose bowel",
    "lbm",
  ],
  Vomiting: ["nagsusuka", "pagsusuka", "vomiting", "vomit"],
  "Abdominal pain": [
    "sakit ng tiyan",
    "masakit ang tiyan",
    "stomach ache",
    "abdominal pain",
    "tummy pain",
  ],
  "Skin rash": ["pantal", "rash", "skin rash", "butlig", "makati ang balat"],
  "Sore throat": [
    "masakit ang lalamunan",
    "sore throat",
    "namamagang lalamunan",
  ],
  "Difficulty breathing": [
    "hirap huminga",
    "difficulty breathing",
    "shortness of breath",
    "hika",
    "asthma",
  ],
  Dengue: ["dengue", "dengue fever", "hemorrhagic"],
  Measles: ["tigdas", "measles", "rubella"],
  Cholera: ["cholera", "kolera"],
  Typhoid: ["typhoid", "tipus", "typhoid fever"],
  Chickenpox: ["bulutong", "chickenpox", "varicella"],
  Tuberculosis: ["tb", "tuberculosis", "ptb"],
  "Animal bite": [
    "kagat ng aso",
    "dog bite",
    "animal bite",
    "kagat ng pusa",
    "cat bite",
  ],
  Hypertension: ["high blood", "hypertension", "altapresyon"],
  Wound: ["sugat", "wound", "laceration", "hiwa"],
};

/**
 * Conditions where two linked cases already warrant a look.
 *
 * Notifiable under the Philippine Integrated Disease Surveillance and
 * Response system. Carried here so a board can mark them, not to duplicate
 * the backend's alerting.
 */
export const NOTIFIABLE_CONDITIONS = [
  "Dengue",
  "Measles",
  "Cholera",
  "Typhoid",
  "Chickenpox",
];

/**
 * Lowercase, strip punctuation, collapse whitespace, pad with spaces.
 *
 * The padding lets whole-word matching use plain string search: " ubo " will
 * not match inside "ubos".
 */
function simplify(complaint: string | null | undefined): string {
  const text = String(complaint ?? "")
    .trim()
    .toLowerCase();

  if (!text) return "";

  const stripped = text
    // Unicode letter/number classes, to keep accented and ñ spellings whole.
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return stripped ? ` ${stripped} ` : "";
}

/**
 * Every term paired with its condition, longest first.
 *
 * Longest wins, so "dengue fever" is Dengue rather than Fever and "lagnat at
 * ubo" is the influenza-like phrase it actually is rather than Fever. Sorting
 * by length also means a new term can be added anywhere in the table without
 * anyone reasoning about where it sits relative to the others.
 */
const TERMS_BY_LENGTH: Array<[string, string]> = Object.entries(
  COMPLAINT_GROUPS
)
  .flatMap(([condition, terms]) =>
    terms.map((term) => [term, condition] as [string, string])
  )
  .sort((a, b) => b[0].length - a[0].length);

/**
 * The condition a free-text complaint is about.
 *
 * Returns null when nothing is recognised, so the caller can decide whether to
 * show the raw wording rather than being handed a truncated sentence dressed
 * up as a condition.
 */
export function complaintCondition(
  complaint: string | null | undefined
): string | null {
  const text = simplify(complaint);

  if (!text) return null;

  for (const [term, condition] of TERMS_BY_LENGTH) {
    if (text.includes(` ${term} `)) {
      return condition;
    }
  }

  return null;
}

/** Whether two linked cases of this condition already warrant a look. */
export function isNotifiable(condition: string): boolean {
  return NOTIFIABLE_CONDITIONS.includes(condition);
}

export interface ComplaintSummary {
  /** Two or three words to show on a card. */
  label: string;
  /** True when it came from the vocabulary rather than the raw text. */
  recognised: boolean;
  /** True when this is a condition worth noticing early. */
  notifiable: boolean;
  /** The original wording, for a tooltip or a details view. */
  full: string;
}

/**
 * What to put on a card for a free-text reason.
 *
 * A recognised complaint becomes its condition. An unrecognised one keeps its
 * own words, shortened at a word boundary rather than mid-word, because a
 * complaint cut to "I have been experiencing a persistent cou" reads as
 * broken software rather than as a long sentence.
 */
export function summariseComplaint(
  complaint: string | null | undefined,
  maxLength = 46
): ComplaintSummary {
  const full = String(complaint ?? "").trim();
  const condition = complaintCondition(full);

  if (condition) {
    return {
      label: condition,
      recognised: true,
      notifiable: isNotifiable(condition),
      full,
    };
  }

  if (!full) {
    return { label: "—", recognised: false, notifiable: false, full: "" };
  }

  if (full.length <= maxLength) {
    return { label: full, recognised: false, notifiable: false, full };
  }

  const cut = full.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");

  return {
    label: `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`,
    recognised: false,
    notifiable: false,
    full,
  };
}
