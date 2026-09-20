// src/lib/urlFilters.ts
//
// Reading a list page's filter from the address bar, so the assistant can open
// a page already showing what was asked for ("show pending appointments").
//
// Anything unrecognised falls back to the page's own default. A misheard word
// therefore shows the normal list instead of an empty screen or a crash, which
// matters because these values can come from speech.

export function readFilterParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = (params.get(key) ?? "").trim().toLowerCase();

  if (!raw) return fallback;

  const match = allowed.find((value) => value.toLowerCase() === raw);

  return match ?? fallback;
}
