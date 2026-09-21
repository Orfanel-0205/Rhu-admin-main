// src/lib/notificationSound.ts
//
// The sounds the dashboard makes, on a laptop, PC or phone browser.
//
// There are three:
//   "normal" — an ordinary notification arrived
//   "urgent" — a telemedicine call, a queue alert, medicine about to run out
//   ringtone — someone is calling in Team Chat, repeating until answered
//
// These are recorded files chosen by the RHU rather than tones generated in
// the browser. The generated tones are kept as a fallback, because a sound
// file can fail to load on a bad barangay connection and a notification that
// arrives silently is worse than one that arrives with a plain beep.
//
// Browsers refuse to play audio until the person has interacted with the page,
// so prime() runs on the first click or key press and unlocks all three.

export type AlertTone = "normal" | "urgent";

const STORAGE_KEY = "ka_agapay_admin_notification_sound";

const FILES = {
  normal: "sounds/notification.mp3",
  urgent: "sounds/alert.mp3",
  ringtone: "sounds/calling.mp3",
} as const;

// How loud each one is relative to the others. The urgent alert has to carry
// across a room; an ordinary notification should not make anyone jump.
const VOLUMES = {
  normal: 0.55,
  urgent: 0.9,
  ringtone: 0.7,
} as const;

type SoundName = keyof typeof FILES;

let context: AudioContext | null = null;
let primed = false;

const players = new Map<SoundName, HTMLAudioElement>();

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

  if (!value) stopCallRingtone();

  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // The choice still applies for this session.
  }
}

/**
 * The audio element for one sound, made once and reused.
 *
 * The file is only fetched the first time it is needed, which matters for the
 * ringtone: it is twenty-three seconds long and by far the largest of the
 * three, and most staff will never have it play at all.
 */
function playerFor(name: SoundName): HTMLAudioElement | null {
  const existing = players.get(name);

  if (existing) return existing;

  try {
    const base = import.meta.env.BASE_URL ?? "/";
    const audio = new Audio(`${base}${FILES[name]}`);

    audio.preload = "none";
    audio.volume = VOLUMES[name];

    if (name === "ringtone") audio.loop = true;

    players.set(name, audio);

    return audio;
  } catch {
    return null;
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
 *
 * Each file is started and stopped immediately while that interaction is still
 * being handled. Without it, the very first notification of the session — often
 * the one that matters — would be silent.
 */
export function primeNotificationSound(): void {
  if (primed) return;

  const unlock = () => {
    primed = true;

    getContext()
      ?.resume()
      .catch(() => {
        // Still blocked; the next interaction will try again.
        primed = false;
      });

    (Object.keys(FILES) as SoundName[]).forEach((name) => {
      const audio = playerFor(name);

      if (!audio) return;

      audio.preload = "auto";

      const wasMuted = audio.muted;
      audio.muted = true;

      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = wasMuted;
        })
        .catch(() => {
          audio.muted = wasMuted;
        });
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
 * The generated tones, used only when the recorded file will not play.
 *
 * Keeping these costs almost nothing and means a missing or corrupted sound
 * file downgrades the alert rather than silencing it.
 */
function playFallbackTone(tone: AlertTone): void {
  const ctx = getContext();

  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => undefined);
  }

  try {
    const now = ctx.currentTime;

    if (tone === "urgent") {
      [0, 0.22, 0.44].forEach((offset) => {
        playNote(ctx, 988, now + offset, 0.14, 0.33);
        playNote(ctx, 1319, now + offset + 0.07, 0.12, 0.28);
      });
      return;
    }

    playNote(ctx, 880, now, 0.16, 0.16);
    playNote(ctx, 1175, now + 0.13, 0.2, 0.14);
  } catch {
    // Audio hardware busy or blocked: stay silent.
  }
}

/**
 * Play the alert. Does nothing when the staff member has turned sound off.
 * Never throws: a notification must arrive even if its sound cannot.
 */
export function playNotificationSound(tone: AlertTone = "normal"): void {
  if (!enabled) return;

  const audio = playerFor(tone);

  if (!audio) {
    playFallbackTone(tone);
    return;
  }

  try {
    // Restart rather than overlap: several notifications arriving together
    // should sound like one alert, not a pile-up.
    audio.currentTime = 0;

    void audio.play().catch(() => playFallbackTone(tone));
  } catch {
    playFallbackTone(tone);
  }
}

/**
 * Ring until answered. Used while an incoming Team Chat call is showing, and
 * stopped whichever way the call ends — answered, declined, or the caller
 * giving up. A ringtone left playing after a call is over is the kind of thing
 * that makes people turn sound off altogether.
 */
export function startCallRingtone(): void {
  if (!enabled) return;

  const audio = playerFor("ringtone");

  if (!audio) return;

  try {
    if (!audio.paused) return; // Already ringing.

    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // No ringtone; the call still shows on screen.
  }
}

export function stopCallRingtone(): void {
  const audio = players.get("ringtone");

  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Nothing to stop.
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
