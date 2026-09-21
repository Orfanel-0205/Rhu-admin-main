// src/hooks/useScreenSnapshot.ts
//
// Publishes what this page is showing, so the assistant can answer about the
// figures in front of the person rather than in general terms.
//
// Call it with whatever the page has already worked out. It clears itself when
// the page unmounts, so the assistant never describes a screen that has been
// navigated away from.

import { useEffect } from "react";

import { setScreenSnapshot, clearScreenSnapshot, type ScreenSnapshot } from "../lib/screenContext";

export function useScreenSnapshot(snapshot: ScreenSnapshot | null): void {
  // Serialised so a page can build the object inline without re-publishing on
  // every render; the content is what matters, not the object's identity.
  const key = snapshot ? JSON.stringify(snapshot) : "";

  useEffect(() => {
    setScreenSnapshot(key ? (JSON.parse(key) as ScreenSnapshot) : null);

    return clearScreenSnapshot;
  }, [key]);
}
