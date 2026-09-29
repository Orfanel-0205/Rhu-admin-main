// src/hooks/useWebSpeechRecognition.ts
//
// Reusable wrapper around the browser-native Web Speech API
// (window.SpeechRecognition / window.webkitSpeechRecognition).
//
// Web Admin runs in the browser, so we deliberately use the built-in API and
// NO React Native voice libraries. The hook detects support, manages the
// listening lifecycle, exposes the recognized transcript, and cleans up all
// event handlers on unmount.
//
// THE THING THIS HOOK EXISTS TO SURVIVE
//
// `continuous = true` does not mean "listen until stopped". Chrome ends the
// recognition session on its own after a few seconds of silence, on a network
// blip, and after most errors: `onend` fires and the microphone stops. A
// consultation is mostly silence from the clinician's microphone while the
// patient is talking, so dictation died within seconds of being switched on
// and never came back. The button still read "Stop STT", so it looked like
// the recogniser simply could not hear anything.
//
// So a stop is now either something the caller asked for or something we
// restart from. `shouldListen` records the caller's intent, and `onend`
// reopens the session while that intent stands. Errors that will never fix
// themselves -- no permission, no microphone -- clear the intent so we do not
// spin against a dead device.

import { useCallback, useEffect, useRef, useState } from "react";

const NOT_SUPPORTED_MESSAGE =
  "Speech recognition is not supported in this browser. Please use Google Chrome.";
const PERMISSION_MESSAGE =
  "Microphone permission is required to use speech-to-text.";
const NO_MICROPHONE_MESSAGE =
  "No microphone was found. Check that one is connected and enabled.";
const GENERIC_ERROR_MESSAGE = "Speech recognition error. Please try again.";
const GAVE_UP_MESSAGE =
  "Speech-to-text kept stopping and has been switched off. Check the microphone and try again.";

/** The tag every browser that supports the API accepts. */
const SAFE_FALLBACK_LANG = "en-US";

/**
 * How many times we reopen a session that ended without the caller asking,
 * before concluding something is actually wrong.
 *
 * The counter resets on every recognized phrase, so an hour of consultation
 * with ordinary pauses never approaches it. It only accumulates when restarts
 * produce no speech at all, which is the signature of a dead microphone.
 */
const MAX_BLANK_RESTARTS = 40;

/** Errors no amount of restarting will fix. */
const FATAL_ERRORS = ["not-allowed", "service-not-allowed", "audio-capture"];

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
  /**
   * How many readings of the same speech to ask for. Above 1, the runners-up
   * come back in `alternatives`, which is how a misheard name can be offered
   * as a correction instead of silently standing. Defaults to 3.
   *
   * This used to default to 1, which left `alternatives` permanently empty and
   * made the whole correction path dead code.
   */
  maxAlternatives?: number;
  /** Called with each finalized chunk of recognized text. */
  onResult?: (finalText: string) => void;
}

export interface UseWebSpeechRecognition {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string;
  /** Other readings of the last phrase, best first, excluding the one used. */
  alternatives: string[];
  /** How sure the recogniser was of the last phrase, 0 to 1. 0 when unknown. */
  confidence: number;
  /** The tag actually in use, which differs from `lang` after a fallback. */
  activeLang: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  clearAlternatives: () => void;
}

export function useWebSpeechRecognition(
  options: UseWebSpeechRecognitionOptions = {}
): UseWebSpeechRecognition {
  const {
    lang = SAFE_FALLBACK_LANG,
    interimResults = true,
    continuous = false,
    maxAlternatives = 3,
    onResult,
  } = options;

  const [isSupported] = useState<boolean>(
    () => getSpeechRecognitionCtor() !== null
  );
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [activeLang, setActiveLang] = useState(lang);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  /** Does the caller still want to be listening? This drives the restart. */
  const shouldListenRef = useRef(false);

  /** Restarts since the last recognized phrase. */
  const blankRestartsRef = useRef(0);

  /** Set by an error that restarting cannot help. */
  const fatalRef = useRef(false);

  /** The tag we are currently asking for, after any fallback. */
  const activeLangRef = useRef(lang);

  /** Pending restart timer, so unmount can cancel it. */
  const restartTimerRef = useRef<number | null>(null);

  // Keep the latest onResult callback without re-creating the recognition
  // instance every render.
  const onResultRef = useRef<UseWebSpeechRecognitionOptions["onResult"]>(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // A language change from the caller takes effect on the next session, and
  // clears any fallback applied to the previous choice.
  useEffect(() => {
    activeLangRef.current = lang;
    setActiveLang(lang);
  }, [lang]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  /**
   * Opening a session is held in a ref so `onend` can reach the current
   * version without the callbacks forming a dependency cycle.
   */
  const openSessionRef = useRef<() => void>(() => {});

  const openSession = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();

    if (!Ctor) {
      setError(NOT_SUPPORTED_MESSAGE);
      shouldListenRef.current = false;
      setIsListening(false);
      return;
    }

    // Already running — ignore a double start so we never throw.
    if (recognitionRef.current) {
      return;
    }

    const recognition = new Ctor();
    recognition.lang = activeLangRef.current;
    recognition.interimResults = interimResults;
    recognition.continuous = continuous;
    recognition.maxAlternatives = maxAlternatives;

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

          // Keep the runners-up so a misheard word can be offered as a
          // correction: "Clifford" is routinely heard as "Cliff for".
          const others: string[] = [];

          for (let choice = 1; choice < result.length; choice += 1) {
            const other = result[choice]?.transcript?.trim();

            if (other && other !== text.trim()) {
              others.push(other);
            }
          }

          setAlternatives(others);
          setConfidence(result[0]?.confidence ?? 0);
        } else {
          interimText += text;
        }
      }

      setInterimTranscript(interimText.trim());

      const clean = finalText.trim();

      if (clean) {
        // Speech arrived, so whatever restarts led here were doing their job.
        blankRestartsRef.current = 0;

        setTranscript((current) => [current, clean].filter(Boolean).join(" "));
        setInterimTranscript("");
        onResultRef.current?.(clean);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = event?.error ?? "";
      console.warn("[WebSpeech] error", code);

      if (FATAL_ERRORS.includes(code)) {
        fatalRef.current = true;
        shouldListenRef.current = false;
        setError(
          code === "audio-capture" ? NO_MICROPHONE_MESSAGE : PERMISSION_MESSAGE
        );
        return;
      }

      if (code === "language-not-supported") {
        /*
         * Not every Chrome build offers every regional tag. Rather than
         * leaving the clinician with dictation that refuses to start, drop to
         * the tag every build accepts and say so plainly.
         */
        if (activeLangRef.current !== SAFE_FALLBACK_LANG) {
          const rejected = activeLangRef.current;

          activeLangRef.current = SAFE_FALLBACK_LANG;
          setActiveLang(SAFE_FALLBACK_LANG);
          setError(
            `This browser does not offer ${rejected} for dictation. Switched to ${SAFE_FALLBACK_LANG}.`
          );
          return;
        }

        setError(GENERIC_ERROR_MESSAGE);
        return;
      }

      /*
       * "no-speech" is the normal state of a clinician's microphone while the
       * patient is talking, and "aborted" is what a deliberate stop looks
       * like. Neither deserves a red banner; the restart below handles them.
       */
      if (code !== "aborted" && code !== "no-speech") {
        setError(GENERIC_ERROR_MESSAGE);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setInterimTranscript("");

      if (!shouldListenRef.current || fatalRef.current) {
        setIsListening(false);
        return;
      }

      blankRestartsRef.current += 1;

      if (blankRestartsRef.current > MAX_BLANK_RESTARTS) {
        shouldListenRef.current = false;
        setIsListening(false);
        setError(GAVE_UP_MESSAGE);
        return;
      }

      /*
       * Chrome refuses a start() issued from inside onend, so yield first.
       *
       * isListening deliberately stays true across the gap. The caller asked
       * to be listening and still is; flickering the button every few seconds
       * would be a lie about a state that lasts a quarter of a second.
       */
      clearRestartTimer();

      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;

        if (shouldListenRef.current && !fatalRef.current) {
          openSessionRef.current();
        }
      }, 250);
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
  }, [interimResults, continuous, maxAlternatives, clearRestartTimer]);

  useEffect(() => {
    openSessionRef.current = openSession;
  }, [openSession]);

  const startListening = useCallback(() => {
    if (!getSpeechRecognitionCtor()) {
      setError(NOT_SUPPORTED_MESSAGE);
      return;
    }

    setError("");
    setInterimTranscript("");
    setAlternatives([]);
    setConfidence(0);

    shouldListenRef.current = true;
    fatalRef.current = false;
    blankRestartsRef.current = 0;

    openSession();
  }, [openSession]);

  const stopListening = useCallback(() => {
    // Clear the intent BEFORE stopping, or onend restarts what we just ended.
    shouldListenRef.current = false;
    clearRestartTimer();

    const recognition = recognitionRef.current;

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore — already stopped
      }
    }

    setIsListening(false);
  }, [clearRestartTimer]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setAlternatives([]);
    setConfidence(0);
  }, []);

  const clearAlternatives = useCallback(() => {
    setAlternatives([]);
  }, []);

  // Cleanup on unmount: stop recognition and remove all event handlers.
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;

      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }

      const recognition = recognitionRef.current;

      if (recognition) {
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
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    alternatives,
    confidence,
    activeLang,
    startListening,
    stopListening,
    resetTranscript,
    clearAlternatives,
  };
}

export default useWebSpeechRecognition;
