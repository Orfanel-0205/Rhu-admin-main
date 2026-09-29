// src/components/JitsiRoom.tsx
//
// The telemedicine call, embedded through the Jitsi External API.
//
// WHY THIS IS NOT AN IFRAME ANY MORE
//
// The room used to be a plain <iframe src={joinUrl}>. That renders the call
// perfectly and gives the page no way to speak to it. So when the clinician
// pressed End Session, the app saved the notes and navigated away, the iframe
// unmounted, and the clinician left the room -- while the patient, who opened
// the same meeting from the mobile app through Linking.openURL and is sitting
// in their own browser or the Jitsi app, was never told anything. They stayed
// in an empty room waiting for a doctor who had already finished and written
// their notes.
//
// Nothing about that is fixable from the backend. The meeting lives on the
// 8x8 bridge; ending it is a command sent from inside the conference, and only
// a participant can send it. The External API is what makes the page a
// participant instead of a spectator.
//
// endForEveryone() issues `endConference`, which closes the room for all
// participants and requires moderator rights -- every Ka-Agapay token grants
// them, so the clinician always has them. `hangup` follows as a fallback for
// the case where the bridge refuses the first command, so the clinician leaves
// even if the room somehow survives.
//
// If external_api.js cannot be loaded at all (blocked, offline, 8x8 down) the
// component falls back to the old iframe. A call that works and strands the
// patient at the end is still better than no call.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";

interface JitsiExternalApi {
  executeCommand: (command: string, ...args: unknown[]) => void;
  addListener: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  dispose: () => void;
}

type JitsiExternalApiCtor = new (
  domain: string,
  options: Record<string, unknown>
) => JitsiExternalApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiExternalApiCtor;
  }
}

export interface JitsiRoomHandle {
  /**
   * Close the meeting for every participant, then tear down this embed.
   *
   * Safe to call when the call never mounted or has already ended; it resolves
   * without doing anything rather than throwing into the caller's save path.
   */
  endForEveryone: () => Promise<void>;
}

interface JitsiRoomProps {
  /** e.g. "8x8.vc" for JaaS, or the self-hosted host. */
  domain: string;
  /** Fully qualified room, tenant prefix included for JaaS. */
  roomName: string;
  /** JaaS JWT. Omitted for an anonymous/self-hosted deployment. */
  jwt?: string | null;
  /** Used only if external_api.js cannot be loaded. */
  fallbackUrl?: string;
  /** Fired when the conference closes, including when the far side ends it. */
  onEnded?: () => void;
  style?: CSSProperties;
}

/**
 * One in-flight load per domain, shared across mounts.
 *
 * Strict mode mounts twice and a re-render must not append a second copy of
 * the script; a rejected entry is dropped so a later mount can retry.
 */
const scriptLoads = new Map<string, Promise<void>>();

function loadExternalApi(domain: string): Promise<void> {
  const src = `https://${domain}/external_api.js`;
  const existing = scriptLoads.get(src);

  if (existing) {
    return existing;
  }

  const pending = new Promise<void>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }

    const previous = document.querySelector<HTMLScriptElement>(
      `script[data-jitsi-external-api="${domain}"]`
    );

    const element = previous ?? document.createElement("script");

    element.src = src;
    element.async = true;
    element.dataset.jitsiExternalApi = domain;

    element.addEventListener("load", () => {
      if (window.JitsiMeetExternalAPI) {
        resolve();
      } else {
        reject(new Error(`${src} loaded without defining JitsiMeetExternalAPI`));
      }
    });

    element.addEventListener("error", () => {
      reject(new Error(`Could not load ${src}`));
    });

    if (!previous) {
      document.head.appendChild(element);
    }
  });

  pending.catch(() => scriptLoads.delete(src));
  scriptLoads.set(src, pending);

  return pending;
}

const JitsiRoom = forwardRef<JitsiRoomHandle, JitsiRoomProps>(function JitsiRoom(
  { domain, roomName, jwt, fallbackUrl, onEnded, style },
  ref
) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  // Kept in a ref so a changing callback never re-creates the conference.
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!domain || !roomName) {
      return;
    }

    let cancelled = false;

    loadExternalApi(domain)
      .then(() => {
        if (cancelled || !holderRef.current || !window.JitsiMeetExternalAPI) {
          return;
        }

        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName,
          jwt: jwt || undefined,
          parentNode: holderRef.current,
          width: "100%",
          height: "100%",
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
          },
        });

        apiRef.current = api;

        // The far side ending the call, or this side leaving through Jitsi's
        // own hangup button, both reach the page here.
        const handleClosed = () => onEndedRef.current?.();

        api.addListener("readyToClose", handleClosed);
        api.addListener("videoConferenceLeft", handleClosed);
      })
      .catch((err) => {
        console.warn("[JitsiRoom] falling back to iframe", err);

        if (!cancelled) {
          setUseFallback(true);
        }
      });

    return () => {
      cancelled = true;

      try {
        apiRef.current?.dispose();
      } catch {
        // ignore — the conference may already be gone
      }

      apiRef.current = null;
    };
  }, [domain, roomName, jwt]);

  useImperativeHandle(
    ref,
    () => ({
      async endForEveryone() {
        const api = apiRef.current;

        if (!api) {
          return;
        }

        try {
          api.executeCommand("endConference");
        } catch (err) {
          console.warn("[JitsiRoom] endConference refused", err);
        }

        // Let the command reach the bridge before we tear the embed down.
        // Disposing first would close our own channel and the patient would
        // stay exactly where the old iframe left them.
        await new Promise((resolve) => window.setTimeout(resolve, 400));

        try {
          api.executeCommand("hangup");
        } catch {
          // ignore — endConference has usually already closed the room
        }

        await new Promise((resolve) => window.setTimeout(resolve, 150));

        try {
          api.dispose();
        } catch {
          // ignore
        }

        apiRef.current = null;
      },
    }),
    []
  );

  if (useFallback) {
    return (
      <iframe
        title="Ka-Agapay Telemedicine Video"
        src={fallbackUrl}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        style={style}
      />
    );
  }

  return <div ref={holderRef} style={style} />;
});

export default JitsiRoom;
