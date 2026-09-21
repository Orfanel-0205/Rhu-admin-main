// src/hooks/usePrivateImage.ts
//
// Loads a picture that the browser is not allowed to fetch on its own.
//
// Team Chat pictures moved off the public disk, so they are served by a route
// that checks the viewer belongs in that conversation. A plain <img src> can
// never satisfy that: it sends no session token. The picture is fetched like
// any other API call and handed to the browser as a blob instead.
//
// Both kinds of source go through here. An ordinary absolute URL — a staff
// member's profile picture, say — is passed straight back untouched, so
// callers do not have to know which kind they were given. That mattered when
// the group avatars moved: every call site kept working without being changed.
//
// The object URL is released when the caller unmounts. Without that, scrolling
// through a busy thread quietly holds every picture ever opened in memory.

import { useEffect, useState } from "react";

import apiClient from "../lib/apiClient";

/** Paths beginning with a slash are ours to fetch; anything else is a real URL. */
function needsFetching(source?: string | null): boolean {
  return !!source && source.startsWith("/");
}

export function usePrivateImage(source?: string | null): {
  url: string;
  loading: boolean;
  failed: boolean;
} {
  const [url, setUrl] = useState<string>(needsFetching(source) ? "" : source || "");
  const [loading, setLoading] = useState<boolean>(needsFetching(source));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!needsFetching(source)) {
      setUrl(source || "");
      setLoading(false);
      setFailed(false);

      return;
    }

    let objectUrl = "";
    let cancelled = false;

    setLoading(true);
    setFailed(false);

    (async () => {
      try {
        const response = await apiClient.get(source as string, { responseType: "blob" });

        if (cancelled) return;

        objectUrl = URL.createObjectURL(response.data as Blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return { url, loading, failed };
}
