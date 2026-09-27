// src/hooks/useCoachVoice.ts
//
// Reads a tutorial step aloud.
//
// WHY
// ---
// Staff being shown this system are usually looking at the screen, not at a
// panel of text beside it. A spoken step lets someone follow the pointer with
// their eyes while the explanation arrives in their ears, which is how a
// person standing next to you would teach it.
//
// It is off until asked for. Sound that starts by itself in a clinic is an
// intrusion, and browsers refuse unprompted speech anyway.
//
// WHAT IT SPEAKS
// --------------
// The module, then the sentence describing it, then the numbered steps. Not
// the "watch out" line: cautions are worth reading slowly rather than hearing
// once in passing.

import { useCallback, useEffect, useRef, useState } from "react";

export interface CoachVoice {
  supported: boolean;
  speaking: boolean;
  /** Read this step now, cancelling anything already in progress. */
  speak: (parts: string[]) => void;
  stop: () => void;
}

export function useCoachVoice(): CoachVoice {
  const [speaking, setSpeaking] = useState(false);

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Held so that unmounting mid-sentence does not leave the browser talking
  // to an empty room.
  const activeRef = useRef(false);

  const stop = useCallback(() => {
    if (!supported) return;

    activeRef.current = false;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (parts: string[]) => {
      if (!supported) return;

      window.speechSynthesis.cancel();

      const text = parts
        .map((part) => part.trim())
        .filter(Boolean)
        .join(". ")
        .replace(/\.\.+/g, ".");

      if (!text) return;

      const utterance = new SpeechSynthesisUtterance(text);

      // Slightly under natural pace: this is instruction, and the listener is
      // looking at an unfamiliar screen while it plays.
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      utterance.lang = "en-PH";

      utterance.onend = () => {
        activeRef.current = false;
        setSpeaking(false);
      };

      utterance.onerror = () => {
        activeRef.current = false;
        setSpeaking(false);
      };

      activeRef.current = true;
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [supported]
  );

  useEffect(() => {
    return () => {
      if (activeRef.current && supported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [supported]);

  return { supported, speaking, speak, stop };
}
