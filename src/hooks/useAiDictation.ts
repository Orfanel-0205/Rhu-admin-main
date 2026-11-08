// src/hooks/useAiDictation.ts
//
// Dictation in Pangasinan, Ilocano, Tagalog, English and any mix of them
// (Nov 2026).
//
// The browser's own speech recognition (useWebSpeechRecognition) knows only
// Filipino and English, one per session, and no browser offers Pangasinan.
// This records instead (useVoiceRecorder), converts the recording to WAV
// (lib/wav) and has the AI transcribe it word for word (POST /ai/transcribe),
// then hands the text to the box it was dictated into -- to be read and
// corrected before anything is saved. Speak, press Stop, and the text
// appears a few seconds later. The recording goes to Google's Gemini service
// and is not kept by the system.

import { useCallback, useRef, useState } from "react";

import apiClient from "../lib/apiClient";
import { toWav16k } from "../lib/wav";
import { useVoiceRecorder } from "./useVoiceRecorder";

export type DictationHint = "auto" | "tl" | "pag" | "ilo" | "en";
export type DictationContext = "soap" | "chat" | "telemedicine";

/** The choice offered next to Filipino and English in each dictation picker. */
export const AI_DICTATION_OPTION = { value: "ai", label: "Pangasinan / Ilocano / mixed (AI)" } as const;

export const AI_DICTATION_NOTE =
  "For Pangasinan, Ilocano or mixed speech choose “Pangasinan / Ilocano / mixed (AI)”: speak, press Stop, and the words appear here a few seconds later. Read them before saving. The recording is sent to Google's Gemini AI to be transcribed and is not kept.";

export async function transcribeRecording(
  recording: Blob,
  hint: DictationHint,
  context: DictationContext
): Promise<{ transcript: string; languages: string[] }> {
  const wav = await toWav16k(recording);
  const form = new FormData();
  form.append("audio", wav, "dictation.wav");
  form.append("hint", hint);
  form.append("context", context);

  const res = await apiClient.post("/ai/transcribe", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
    suppressErrorToast: true,
  } as any);
  return res.data;
}

export function useAiDictation(options: {
  context: DictationContext;
  hint?: DictationHint;
  onText: (text: string) => void;
}) {
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");

  const latest = useRef(options);
  latest.current = options;

  const onFinished = useCallback(async (file: File) => {
    setTranscribing(true);
    setError("");
    try {
      const { transcript } = await transcribeRecording(file, latest.current.hint ?? "auto", latest.current.context);
      if (transcript) latest.current.onText(transcript);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not transcribe the recording. Type it instead, or try again.");
    } finally {
      setTranscribing(false);
    }
  }, []);

  const recorder = useVoiceRecorder(onFinished);

  return { ...recorder, transcribing, error: error || recorder.error };
}
