// src/lib/notificationSound.ts
//
// The alert sound for new notifications, on a laptop, PC or phone browser.
//
// The tones are generated in the browser with the Web Audio API rather than
// loaded from sound files: nothing extra to host, nothing to download on a slow
// barangay connection, and it cannot break because a file moved.
//
// Two tones, so staff can tell them apart without looking:
//   "normal" — a soft two-note chime for ordinary notifications
//   "urgent" — three brighter, louder pulses for a telemedicine call, a queue
//              alert, or medicine about to run out
//
// Browsers refuse to play sound until the person has interacted with the page,
// so prime() is called on the first click or key press and unlocks the audio.

export type AlertTone = "normal" | "urgent";

const STORAGE_KEY = "ka_agapay_admin_notification_sound";

let context: AudioContext | null = null;
let primed = false;

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // Private windows and blocked site data: default to sound on.
    return true;
  }
}

let enabled = readStoredPreference();

export function isNotificationSoundEnabled(): boolean {
  return enabled;
}

export function setNotificationSoundEnabled(value: boolean): void {
  enabled = value;

  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // The choice still applies for this session.
  }
}

function getContext(): AudioContext | null {
  if (context) return context;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctor) return null; // Very old browser: stay silent rather than throw.

  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

/**
 * Unlock audio. Browsers only allow sound after a real interaction, so this
 * runs on the first click or key press and then removes its own listeners.
 */
export function primeNotificationSound(): void {
  if (primed) return;

  const unlock = () => {
    primed = true;
    getContext()?.resume().catch(() => {
      // Still blocked; the next interaction will try again.
      primed = false;
    });

    if (primed) {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
  };

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

/** One note. Short fade in and out, so it sounds like a chime and not a click. */
function playNote(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  peak: number
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

/**
 * Play the alert. Does nothing when the staff member has turned sound off, or
 * while the browser still refuses to play audio. Never throws: a notification
 * must arrive even if its sound cannot.
 */
export function playNotificationSound(tone: AlertTone = "normal"): void {
  if (!enabled) return;

  const ctx = getContext();

  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => undefined);
  }

  try {
    const now = ctx.currentTime;

    if (tone === "urgent") {
      // Three insistent pulses, loud enough to carry across a room.
      [0, 0.22, 0.44].forEach((offset) => {
        playNote(ctx, 988, now + offset, 0.14, 0.33);
        playNote(ctx, 1319, now + offset + 0.07, 0.12, 0.28);
      });
      return;
    }

    // A soft rising two-note chime.
    playNote(ctx, 880, now, 0.16, 0.16);
    playNote(ctx, 1175, now + 0.13, 0.2, 0.14);
  } catch {
    // Audio hardware busy or blocked: stay silent.
  }
}

/**
 * Which notifications deserve the louder tone: someone is waiting, or stock is
 * about to run out. Matched on the notification type the server sends.
 */
export function isUrgentNotification(type: string | null | undefined): boolean {
  return /telemedicine|call|queue|emergency|urgent|critical|sos|low_stock|out_of_stock|expir/i.test(
    String(type ?? "")
  );
}
