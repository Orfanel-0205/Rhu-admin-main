// src/lib/assistantVoice.ts
//
// Reading the assistant's replies out loud, for staff who would rather listen
// than read, and for anyone not comfortable with a screen full of text.
//
// Uses the browser's own speech, so nothing extra is installed and it works
// offline once the page is open.
//
// LANGUAGE SUPPORT, honestly:
//   English    — every device has a voice.
//   Tagalog    — Filipino voices ship on most phones and on Chrome; on a laptop
//                without one, we fall back to English.
//   Pangasinan — no browser anywhere has a Pangasinan voice. The words are read
//                with the Filipino voice, whose vowels and consonants are close
//                enough that Pangasinan text is usually understandable. This is
//                a fallback, not real support: say so in the interface.

import type { Lang } from "../store/langStore";

const STORAGE_KEY = "ka_agapay_admin_assistant_voice";

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

let enabled = readStoredPreference();

export function isVoiceOutputEnabled(): boolean {
  return enabled;
}

export function setVoiceOutputEnabled(value: boolean): void {
  enabled = value;

  if (!value) {
    stopSpeaking();
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // The choice still applies for this session.
  }
}

export function isSpeechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** BCP-47 tags to try, best first, for each dashboard language. */
const VOICE_PREFERENCES: Record<Lang, string[]> = {
  en: ["en-PH", "en-US", "en-GB", "en"],
  tag: ["fil-PH", "tl-PH", "fil", "tl", "en-PH", "en-US"],
  // Pangasinan: no voice exists, so the Filipino one reads it.
  pag: ["fil-PH", "tl-PH", "fil", "tl", "en-PH", "en-US"],
};

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();

  if (!voices.length) return null; // Not loaded yet; speak with the default.

  for (const tag of VOICE_PREFERENCES[lang]) {
    const match = voices.find((voice) =>
      voice.lang.toLowerCase().replace("_", "-").startsWith(tag.toLowerCase())
    );

    if (match) return match;
  }

  return null;
}

/** True when the device can actually speak this language rather than fall back to English. */
export function hasNativeVoice(lang: Lang): boolean {
  if (!isSpeechOutputSupported()) return false;

  const voice = pickVoice(lang);

  if (!voice) return false;

  const tag = voice.lang.toLowerCase();

  if (lang === "en") return tag.startsWith("en");

  return tag.startsWith("fil") || tag.startsWith("tl");
}

/**
 * Strip the bits that sound wrong when spoken: markdown marks, bullets, emoji
 * and long URLs. Also caps the length, because a three-minute monologue helps
 * nobody and cannot be interrupted easily on a phone.
 */
function toSpokenText(text: string): string {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, "the link on screen")
    .replace(/[*_`#>]+/g, " ")
    .replace(/^\s*[-•]\s*/gm, ", ")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned.length > 700 ? `${cleaned.slice(0, 700)}…` : cleaned;
}

export function stopSpeaking(): void {
  if (!isSpeechOutputSupported()) return;

  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing was speaking.
  }
}

/**
 * Speak one reply, cancelling whatever was being said before, so the assistant
 * never talks over itself.
 *
 * `onEnd` fires when the sentence finishes, is interrupted, or cannot be
 * spoken at all. Hands-free mode uses it to start listening again, so it must
 * run on every path — a missed callback would leave the conversation stuck
 * waiting for a reply that already finished.
 */
export function speak(text: string, lang: Lang, onEnd?: () => void): void {
  const finish = () => {
    if (onEnd) onEnd();
  };

  if (!enabled || !isSpeechOutputSupported()) {
    finish();
    return;
  }

  const spoken = toSpokenText(text);

  if (!spoken) {
    finish();
    return;
  }

  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(spoken);
  const voice = pickVoice(lang);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = VOICE_PREFERENCES[lang][0];
  }

  // A little slower than default: this is being read to someone following along.
  utterance.rate = 0.95;
  utterance.pitch = 1;

  let finished = false;
  const settle = () => {
    if (finished) return;
    finished = true;
    finish();
  };

  utterance.onend = settle;
  utterance.onerror = settle;

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech unavailable on this device; the text is on screen anyway.
    settle();
  }
}

/**
 * Voices load asynchronously in Chrome, so the first reply can arrive before
 * the list exists. Calling this early warms it up.
 */
export function primeVoices(): void {
  if (!isSpeechOutputSupported()) return;

  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", () => {
      window.speechSynthesis.getVoices();
    });
  } catch {
    // Not fatal.
  }
}

/** What the microphone should listen for, per dashboard language. */
export function recognitionLanguage(lang: Lang): string {
  // No Pangasinan recogniser exists either; Filipino gets closest.
  return lang === "en" ? "en-US" : "fil-PH";
}
