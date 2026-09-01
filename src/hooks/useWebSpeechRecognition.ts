// src/hooks/useWebSpeechRecognition.ts
//
// Reusable wrapper around the browser-native Web Speech API
// (window.SpeechRecognition / window.webkitSpeechRecognition).
//
// Web Admin runs in the browser, so we deliberately use the built-in API and
// NO React Native voice libraries. The hook detects support, manages the
// listening lifecycle, exposes the recognized transcript, and cleans up all
// event handlers on unmount.

import { useCallback, useEffect, useRef, useState } from "react";

const NOT_SUPPORTED_MESSAGE =
  "Speech recognition is not supported in this browser. Please use Google Chrome.";
const PERMISSION_MESSAGE =
  "Microphone permission is required to use speech-to-text.";
const NO_SPEECH_MESSAGE = "No speech detected. Please try again.";
const GENERIC_ERROR_MESSAGE = "Speech recognition error. Please try again.";

function getSpeechRecognitionCtor(): SpeechRecognitionStatic | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export interface UseWebSpeechRecognitionOptions {
  /** BCP-47 language tag. Defaults to "en-US" (reliably supported in Chrome). */
  lang?: string;
  /** Emit partial results while the user is still speaking. Defaults to true. */
  interimResults?: boolean;
  /** Keep listening until stopped (dictation). Defaults to false. */
  continuous?: boolean;
  /** Called with each finalized chunk of recognized text. */
  onResult?: (finalText: string) => void;
}

export interface UseWebSpeechRecognition {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useWebSpeechRecognition(
  options: UseWebSpeechRecognitionOptions = {}
): UseWebSpeechRecognition {
  const {
    lang = "en-US",
    interimResults = true,
    continuous = false,
    onResult,
  } = options;

  const [isSupported] = useState<boolean>(
    () => getSpeechRecognitionCtor() !== null
  );
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Keep the latest onResult callback without re-creating the recognition
  // instance every render.
  const onResultRef = useRef<UseWebSpeechRecognitionOptions["onResult"]>(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Detach handlers and stop any active recognition. Used on unmount.
  const detachRecognition = useCallback(() => {
    const recognition = recognitionRef.current;

    if (!recognition) {
      return;
    }

    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      recognition.stop();
    } catch {
      // ignore — recognition may already be stopped
    }

    recognitionRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore — already stopped
      }
    }

    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();

    if (!Ctor) {
      setError(NOT_SUPPORTED_MESSAGE);
      return;
    }

    // Already running — ignore a double start so we never throw.
    if (recognitionRef.current) {
      return;
    }

    setError("");
    setInterimTranscript("");

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = interimResults;
    recognition.continuous = continuous;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";

        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      setInterimTranscript(interimText.trim());

      const clean = finalText.trim();

      if (clean) {
        setTranscript((current) => [current, clean].filter(Boolean).join(" "));
        setInterimTranscript("");
        onResultRef.current?.(clean);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = event?.error ?? "";
      console.warn("[WebSpeech] error", code);

      if (code === "not-allowed" || code === "service-not-allowed") {
        setError(PERMISSION_MESSAGE);
      } else if (code === "no-speech") {
        setError(NO_SPEECH_MESSAGE);
      } else if (code !== "aborted") {
        // "aborted" happens on a normal user-initiated stop — not worth surfacing.
        setError(GENERIC_ERROR_MESSAGE);
      }

      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      // start() throws if called while already started — recover gracefully.
      console.warn("[WebSpeech] start failed", err);
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [lang, interimResults, continuous]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  // Cleanup on unmount: stop recognition and remove all event handlers.
  useEffect(() => {
    return () => {
      detachRecognition();
    };
  }, [detachRecognition]);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}

export default useWebSpeechRecognition;
