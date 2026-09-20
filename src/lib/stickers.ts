// src/lib/stickers.ts
//
// The Ka-Agapay duck stickers: the same mascot that fronts the assistant, so
// Team Chat feels like this system and not a generic chat box.
//
// A sticker travels as a short token (":duck-like:") in the message body or in
// a reaction, never as an uploaded file. That means:
//   - sending one costs a few bytes rather than an upload on a barangay
//     connection;
//   - reactions can use them too, since the reaction column holds text;
//   - the pictures are part of the web admin build and are cached by the
//     browser after the first view.
//
// The images are served from /stickers/<name>.webp, resized to 192px and about
// 12 KB each — the full set is 256 KB, down from the 7 MB of originals.

export interface Sticker {
  /** What is stored in a message or reaction. */
  token: string;
  /** Shown as the image's alt text and the button's label. */
  label: string;
  url: string;
}

const NAMES: Array<[name: string, label: string]> = [
  ["like", "Like"],
  ["approved", "Approved"],
  ["clap", "Clap"],
  ["hooray", "Hooray"],
  ["heart", "Heart"],
  ["praying", "Thank you"],
  ["wave", "Hello"],
  ["wink", "Wink"],
  ["pleasing", "Please"],
  ["thinking", "Thinking"],
  ["idea", "Idea"],
  ["listing", "Checklist"],
  ["listening", "Listening"],
  ["alerting", "Heads up"],
  ["wow", "Wow"],
  ["muscle", "We can do it"],
  ["medal", "Well done"],
  ["star", "Star"],
  ["sick", "Not feeling well"],
  ["sleeping", "Off duty"],
];

export const STICKERS: Sticker[] = NAMES.map(([name, label]) => ({
  token: `:duck-${name}:`,
  label,
  url: `/stickers/${name}.webp`,
}));

const BY_TOKEN = new Map(STICKERS.map((sticker) => [sticker.token, sticker]));

export function stickerFor(token: string | null | undefined): Sticker | null {
  return token ? BY_TOKEN.get(token.trim()) ?? null : null;
}

/**
 * A message that is nothing but one sticker, which is drawn large and without
 * a bubble. A sticker sent alongside words stays inline instead.
 */
export function soleSticker(body: string | null | undefined): Sticker | null {
  const trimmed = (body ?? "").trim();

  return trimmed.startsWith(":duck-") ? stickerFor(trimmed) : null;
}

/** The four offered on hover, chosen to cover the everyday replies. */
export const QUICK_STICKERS = STICKERS.filter((sticker) =>
  [":duck-like:", ":duck-approved:", ":duck-praying:", ":duck-heart:"].includes(sticker.token)
);
