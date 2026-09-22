// src/hooks/useVoiceRecorder.ts
//
// Recording a spoken message from the browser's microphone.
//
// The case this exists for is someone who can talk but cannot type: a midwife
// holding a phone mid-delivery, a BHW walking between houses, anyone reporting
// something urgent with one hand full.
//
// FORMAT
//   MediaRecorder produces whatever the browser prefers — webm/opus in Chrome
//   and Firefox, mp4/aac in Safari. Rather than force one and fail silently on
//   the others, the first supported type is picked and the file is named to
//   match, because the server decides what a file is from its extension.
//
// The microphone is released the moment recording stops. A tab holding the
// microphone open shows a recording indicator on the whole device, which is
// alarming on a machine shared by a clinic.

import { useCallback, useEffect, useRef, useState } from "react";

const CANDIDATES: Array<{ mime: string; extension: string }> = [
  { mime: "audio/webm;codecs=opus", extension: "webm" },
  { mime: "audio/webm", extension: "webm" },
  { mime: "audio/mp4", extension: "m4a" },
  { mime: "audio/ogg;codecs=opus", extension: "ogg" },
];

function pickFormat(): { mime: string; extension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;

  return CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? null;
}

export function useVoiceRecorder(onFinished: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const supported = typeof MediaRecorder !== "undefined" && pickFormat() !== null;

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // A tab that is closed or navigated away from mid-recording must not leave
  // the microphone running.
  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    const format = pickFormat();

    if (!format) {
      setError("This browser cannot record audio.");
      return;
    }

    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: format.mime });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: format.mime });

        release();
        setRecording(false);
        setSeconds(0);

        // Under a second is a mis-tap, not a message.
        if (blob.size > 1000) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

          onFinished(new File([blob], `voice-${stamp}.${format.extension}`, { type: format.mime }));
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);

      timerRef.current = window.setInterval(() => {
        setSeconds((value) => {
          // Two minutes is already a long voice note, and the upload has a
          // ceiling. Stopping here beats being refused after recording.
          if (value >= 119) recorderRef.current?.stop();

          return value + 1;
        });
      }, 1000);
    } catch (err: any) {
      release();
      setRecording(false);

      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser address bar."
          : "No microphone was found on this computer."
      );
    }
  }, [onFinished, release]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    chunksRef.current = [];

    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        release();
        setRecording(false);
        setSeconds(0);
      };

      recorder.stop();
    } else {
      release();
      setRecording(false);
      setSeconds(0);
    }
  }, [release]);

  return { supported, recording, seconds, error, start, stop, cancel };
}
