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
// in an empty room waiting for a doctor who had already finished.
//
// Nothing about that is fixable from the backend. The meeting lives on the
// 8x8 bridge; ending it is a command sent from inside the conference, and only
// a participant can send it. The External API is what makes the page a
// participant instead of a spectator.
//
// WHY ENDING KICKS BEFORE IT ENDS
//
// The first attempt sent `endConference` alone. That is a real command in
// 8x8's external_api.js -- it maps to "end-conference" -- and the bridge
// accepted it without closing the patient's room, so they still had to shut
// the tab by hand. The command depends on moderator rights being recognised
// for this participant at that moment, and there is no way to confirm from
// here whether they were.
//
// So we no longer rely on one command being honoured. Every remote
// participant is removed by id first, which is the instruction the bridge
// will act on per-person, and only then is the conference ended and this side
// hung up. Each step is harmless if the one before it already worked.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";

interface JitsiParticipant {
  participantId?: string;
  displayName?: string;
}

interface JitsiExternalApi {
  executeCommand: (command: string, ...args: unknown[]) => void;
  addListener: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
  getParticipantsInfo?: () => JitsiParticipant[];
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
  /**
   * Whether this embed can actually issue commands.
   *
   * False once we have fallen back to an iframe, where ending the session
   * removes the clinician and leaves the patient sitting in the room. The
   * caller shows that rather than implying an outcome it cannot deliver.
   */
  isControllable: () => boolean;
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
  /** Fired when the conference closes on its own, or the far side ends it. */
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

    const element = document.createElement("script");

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

    document.head.appendChild(element);
  });

  pending.catch(() => scriptLoads.delete(src));
  scriptLoads.set(src, pending);

  return pending;
}

const wait = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const JitsiRoom = forwardRef<JitsiRoomHandle, JitsiRoomProps>(function JitsiRoom(
  { domain, roomName, jwt, fallbackUrl, onEnded, style },
  ref
) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  /** This browser's participant id, so we kick everyone except ourselves. */
  const myIdRef = useRef<string | null>(null);

  /** Set while we are deliberately ending, to ignore our own leave events. */
  const endingRef = useRef(false);

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

        // This build of external_api.js has no getMyUserId, so the only way
        // to know which participant is us is to note it on the way in.
        api.addListener("videoConferenceJoined", ((event: { id?: string }) => {
          myIdRef.current = event?.id ?? null;
        }) as never);

        /*
         * The far side ending the call, or this side leaving through Jitsi's
         * own hangup button, both reach the page here -- but so does our own
         * teardown, and reloading the session mid-teardown races the save
         * that started it.
         */
        const handleClosed = () => {
          if (endingRef.current) {
            return;
          }

          onEndedRef.current?.();
        };

        api.addListener("readyToClose", handleClosed as never);
        api.addListener("videoConferenceLeft", handleClosed as never);
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
      myIdRef.current = null;
    };
  }, [domain, roomName, jwt]);

  useImperativeHandle(
    ref,
    () => ({
      isControllable() {
        return !useFallback && apiRef.current !== null;
      },

      async endForEveryone() {
        const api = apiRef.current;

        if (!api) {
          return;
        }

        endingRef.current = true;

        /*
         * Remove the others by id first.
         *
         * endConference on its own was accepted and changed nothing for the
         * patient, who still had to close the room by hand. A kick names the
         * participant, so the bridge has no room to decide the instruction
         * does not apply.
         */
        try {
          const everyone = api.getParticipantsInfo?.() ?? [];

          for (const participant of everyone) {
            const id = participant?.participantId;

            if (id && id !== myIdRef.current) {
              api.executeCommand("kickParticipant", id);
            }
          }
        } catch (err) {
          console.warn("[JitsiRoom] could not remove participants", err);
        }

        await wait(300);

        // Then close the room itself, so a participant who joins late or
        // reconnects does not find it still open.
        try {
          api.executeCommand("endConference");
        } catch (err) {
          console.warn("[JitsiRoom] endConference refused", err);
        }

        await wait(400);

        try {
          api.executeCommand("hangup");
        } catch {
          // ignore — the room has usually already closed
        }

        await wait(150);

        try {
          api.dispose();
        } catch {
          // ignore
        }

        apiRef.current = null;
      },
    }),
    [useFallback]
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
