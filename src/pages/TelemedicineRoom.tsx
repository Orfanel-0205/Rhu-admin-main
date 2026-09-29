// src/pages/TelemedicineRoom.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Save,
  Stethoscope,
  User,
  UserCheck,
  XCircle,
} from "lucide-react";

import {
  endTelemedicineSessionWithSoap,
  getJitsiConfig,
  getTelemedicineSession,
  saveTelemedicineSessionNotes,
  startTelemedicineSessionNow,
  summarizeTelemedicineSession,
  type TelemedicineAiSummary,
  type TelemedicineSession,
} from "../services/telemedicine";
import { useWebSpeechRecognition } from "../hooks/useWebSpeechRecognition";
import JitsiRoom, { type JitsiRoomHandle } from "../components/JitsiRoom";

type SoapFields = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosis: string;
  treatment: string;
  additionalNotes: string;
};

/*
 * Dictation languages offered to the clinician.
 *
 * This was hard-wired to en-US, which is why dictation came back as the
 * wrong words: a consultation in Malasiqui is Taglish, and an American
 * English recogniser transcribes Tagalog as whatever English it sounds
 * nearest to. The recogniser cannot be told to expect a mix, so the
 * clinician picks whichever language the consultation is mostly in.
 *
 * THESE ARE THE ONLY PHILIPPINE OPTIONS THAT EXIST.
 *
 * Speech recognition in the browser is Google's, and its list offers
 * exactly two tags for this country: "en-PH" and "fil-PH". A "tl-PH" was
 * offered here briefly and is not a real tag -- selecting it could only
 * ever fail and fall back to English, which looked like Tagalog dictation
 * being broken rather than absent. Filipino is the Tagalog option; it is
 * labelled so nobody goes looking for a separate one.
 *
 * Pangasinense is not in that list and is not offered by any browser or
 * major cloud recogniser. There is no setting that will transcribe it and
 * no fallback worth pretending about, so the panel says so plainly and
 * the clinician types those consultations instead.
 */
const DICTATION_LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-PH", label: "English (PH)" },
  { value: "fil-PH", label: "Filipino / Tagalog" },
] as const;

const NO_DICTATION_NOTE =
  "Pangasinense is not available for dictation in any browser — type those consultations, or dictate in Filipino or English.";

const DICTATION_LANGUAGE_KEY = "ka_telemedicine_dictation_lang";

/*
 * Filipino, not English.
 *
 * The picker defaulted to en-US, so dictation started every consultation
 * expecting American English. Malasiqui consultations are not in American
 * English, and an en-US recogniser does not fail on Tagalog -- it returns
 * confident nonsense. One consultation came back as "Gustavo Como estoppo
 * Annapolis", which is what the recogniser heard when Tagalog was the only
 * thing it could not consider.
 *
 * The choice is also remembered per browser, because a default nobody
 * changes is the one that matters and a clinician should not have to
 * reset it at the top of every call.
 *
 * Accuracy on genuinely mixed Taglish stays limited whichever tag is
 * chosen: the API accepts one language per session and has no mode for
 * code-switching. Filipino is the better wrong answer of the two.
 */
function initialDictationLang(): string {
  const fallback = "fil-PH";

  if (typeof window === "undefined") return fallback;

  try {
    const saved = window.localStorage.getItem(DICTATION_LANGUAGE_KEY);

    if (saved && DICTATION_LANGUAGES.some((item) => item.value === saved)) {
      return saved;
    }
  } catch {
    // Private browsing or blocked storage — the default is still correct.
  }

  return fallback;
}

const emptySoap: SoapFields = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  diagnosis: "",
  treatment: "",
  additionalNotes: "",
};

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function joinClean(parts: Array<string | null | undefined>): string {
  return parts
    .map((item) => asText(item))
    .filter(Boolean)
    .join("\n");
}

function symptomsToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => asText(item)).filter(Boolean).join(", ");
  }

  return asText(value);
}

function getPatientNameFromSession(session?: TelemedicineSession | null): string {
  const request = session?.request;

  const resident =
    request?.resident ||
    request?.resident_profile ||
    request?.residentProfile ||
    null;

  const user =
    resident?.user ||
    request?.user ||
    request?.patient ||
    null;

  const directName =
    resident?.name ||
    resident?.full_name ||
    user?.name ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    [resident?.first_name, resident?.last_name].filter(Boolean).join(" ");

  return asText(directName) || `Patient Session #${session?.id || ""}`;
}

function getStaffNameFromSession(session?: TelemedicineSession | null): string {
  const doctor =
    session?.assigned_doctor ||
    session?.request?.assigned_doctor ||
    session?.request?.screening?.screened_by ||
    null;

  const directName =
    doctor?.name ||
    doctor?.full_name ||
    [doctor?.first_name, doctor?.last_name].filter(Boolean).join(" ");

  return asText(directName) || "RHU Staff";
}

function buildDefaultSubjective(session?: TelemedicineSession | null): string {
  const request = session?.request || {};

  const chiefComplaint =
    request?.chief_complaint ||
    request?.reason ||
    request?.purpose ||
    request?.appointment?.reason ||
    request?.appointment?.purpose ||
    "";

  const symptoms =
    symptomsToText(request?.symptoms) ||
    symptomsToText(request?.appointment?.symptoms) ||
    "";

  const additionalNotes =
    request?.additional_notes ||
    request?.notes ||
    request?.appointment?.notes ||
    "";

  const result = joinClean([
    chiefComplaint ? `Chief complaint: ${chiefComplaint}` : null,
    symptoms ? `Symptoms: ${symptoms}` : null,
    additionalNotes ? `Additional notes: ${additionalNotes}` : null,
  ]);

  return result || "Patient chief complaint and symptoms were not recorded.";
}

function buildDefaultObjective(): string {
  return "No objective vital signs or physical findings were directly measured during the online consultation.";
}

function buildDefaultAssessment(session?: TelemedicineSession | null): string {
  const subjective = buildDefaultSubjective(session).toLowerCase();

  if (
    subjective.includes("hirap huminga") ||
    subjective.includes("difficulty breathing") ||
    subjective.includes("shortness of breath")
  ) {
    return "Possible respiratory distress or acute respiratory complaint. Urgent in-person RHU/ER assessment may be needed.";
  }

  if (
    subjective.includes("fever") ||
    subjective.includes("lagnat") ||
    subjective.includes("ubo") ||
    subjective.includes("cough") ||
    subjective.includes("sipon")
  ) {
    return "Possible acute upper respiratory symptoms. Clinician validation required.";
  }

  return "Telemedicine assessment pending clinician validation.";
}

function buildDefaultPlan(): string {
  return "Advise rest, hydration, symptom monitoring, and RHU follow-up if symptoms persist or worsen.";
}

export default function TelemedicineRoom() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const numericSessionId = Number(sessionId);

  const [session, setSession] = useState<TelemedicineSession | null>(null);
  const [transcript, setTranscript] = useState("");
  const [soap, setSoap] = useState<SoapFields>(emptySoap);
  const [rhuStaffName, setRhuStaffName] = useState("");
  const [dictationLang, setDictationLang] = useState<string>(
    initialDictationLang
  );

  /*
   * The last phrase dictation appended, so a misheard one can be swapped
   * for one of the recogniser's other readings without the clinician
   * hunting for it in the transcript.
   */
  const lastChunkRef = useRef("");

  /** The live conference, so End Session can close it for both sides. */
  const jitsiRef = useRef<JitsiRoomHandle | null>(null);

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Browser-native speech-to-text (Web Speech API). Appends each finalized
  // chunk into the Transcript field.
  //
  // maxAlternatives asks the recogniser for its runners-up as well as its
  // best guess, which is what makes the correction chips below possible.
  const stt = useWebSpeechRecognition({
    lang: dictationLang,
    interimResults: true,
    continuous: true,
    maxAlternatives: 3,
    onResult: (finalText) => {
      lastChunkRef.current = finalText;

      setTranscript((current) =>
        [current, finalText].filter(Boolean).join(" ")
      );
    },
  });
  const listening = stt.isListening;

  const patientName = useMemo(() => {
    return getPatientNameFromSession(session);
  }, [session]);

  const videoConfig = useMemo(() => {
    if (!session) return null;
    return getJitsiConfig(session);
  }, [session]);

  const jitsiUrl = videoConfig?.url || "";

  const isSessionFinished = useMemo(() => {
    return ["ended", "cancelled", "no_show"].includes(
      String(session?.status || "")
    );
  }, [session]);

  /*
   * Whether SOAP notes can still be written.
   *
   * This is NOT the opposite of isSessionFinished, and treating it as one
   * was the bug behind 'Save SOAP does nothing'. Every control in the
   * documentation panel was disabled the moment the session reached
   * 'ended' -- which every session reaches, because ending it is how a
   * consultation finishes. The page even told the clinician to 'continue
   * documenting from the panel' directly above a Save button it had
   * greyed out.
   *
   * The backend has always allowed notes for active, paused and ended
   * sessions and refuses only cancelled and no_show ones. This now matches
   * it, so the call being over stops the call and nothing else.
   */
  const canDocument = useMemo(() => {
    return ["active", "paused", "ended"].includes(
      String(session?.status || "")
    );
  }, [session]);

  const load = useCallback(async () => {
    if (!Number.isFinite(numericSessionId) || numericSessionId <= 0) {
      setError("Invalid telemedicine session ID.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      let loaded = await getTelemedicineSession(numericSessionId);

      if (
        !["active", "paused", "ended", "cancelled", "no_show"].includes(
          loaded.status
        )
      ) {
        setStarting(true);
        loaded = await startTelemedicineSessionNow(loaded.id);
      }

      setSession(loaded);
      setRhuStaffName(getStaffNameFromSession(loaded));

      const note = loaded.notes;
      const defaultSubjective = buildDefaultSubjective(loaded);

      setSoap({
        subjective: note?.subjective || defaultSubjective,
        objective: note?.objective || "",
        assessment: note?.assessment || "",
        plan: note?.plan || "",
        diagnosis: note?.primary_diagnosis_label || "",
        treatment: note?.plan || "",
        additionalNotes: "",
      });
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not open telemedicine room."
      );
    } finally {
      setStarting(false);
      setLoading(false);
    }
  }, [numericSessionId]);

  useEffect(() => {
    load();

    return () => {
      stt.stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Surface speech-recognition support/permission errors into the page banner.
  useEffect(() => {
    if (stt.error) {
      setError(stt.error);
    }
  }, [stt.error]);

  /*
   * Replace the last dictated phrase with one of the recogniser's other
   * readings. Only the tail is touched, so anything typed by hand or
   * dictated earlier is left exactly as it is.
   */
  function useAlternative(choice: string) {
    const previous = lastChunkRef.current;

    setTranscript((current) => {
      if (!previous || !current.endsWith(previous)) {
        return [current, choice].filter(Boolean).join(" ");
      }

      return current.slice(0, current.length - previous.length) + choice;
    });

    lastChunkRef.current = choice;
    stt.clearAlternatives();
  }

  // Show the live (interim) words while the staff is still speaking.
  useEffect(() => {
    if (stt.interimTranscript) {
      setMessage(`Listening: ${stt.interimTranscript}`);
    }
  }, [stt.interimTranscript]);

  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  }

  function updateSoap(key: keyof SoapFields, value: string) {
    setSoap((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function startStt() {
    if (!stt.isSupported) {
      setError(
        "Speech recognition is not supported in this browser. Please use Google Chrome."
      );
      return;
    }

    setError("");
    stt.startListening();
    flash("Speech-to-text started.");
  }

  function stopStt() {
    stt.stopListening();
    flash("Speech-to-text stopped.");
  }

  async function runAiSummarize() {
    if (!session?.id) return;

    const source = transcript.trim();

    if (!source) {
      setError("Transcript is empty. Start STT or type the transcript first.");
      return;
    }

    setSummarizing(true);
    setError("");

    try {
      let summary: TelemedicineAiSummary | null = null;

      try {
        summary = await summarizeTelemedicineSession(session.id, source);
      } catch {
        summary = localSoapSummary(source);
      }

      /*
       * The transcript does not belong in Subjective.
       *
       * Subjective is what the patient reported. A speech recogniser's
       * best guess is not that, and when it is wrong it is not even
       * language: one consultation was filed as "Transcript: Gustavo Como
       * estoppo Annapolis" and the Appointment Board, which reads
       * Subjective when the appointment has no symptoms of its own, then
       * showed that to staff as the patient's reported symptoms.
       *
       * It has had its own column since the session notes started storing
       * one, and that is where it goes. Pasting it here as well made a
       * clinical field unreadable and told nobody anything the transcript
       * box was not already showing.
       */
      const subjective =
        summary?.subjective || buildDefaultSubjective(session);

      const objective =
        summary?.objective ||
        "No objective vital signs or physical findings were clearly stated during the online consultation.";

      const assessment =
        summary?.assessment || buildDefaultAssessment(session);

      const plan = summary?.plan || buildDefaultPlan();

      setSoap((current) => ({
        ...current,
        subjective,
        objective,
        assessment,
        plan,
        diagnosis: summary?.diagnosis || assessment,
        treatment: summary?.treatment || plan,
      }));

      flash("AI SOAP summary generated.");
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not summarize telemedicine transcript."
      );
    } finally {
      setSummarizing(false);
    }
  }

  function localSoapSummary(text: string): TelemedicineAiSummary {
    const lower = text.toLowerCase();

    const hasFever =
      lower.includes("fever") ||
      lower.includes("lagnat") ||
      lower.includes("nilalagnat");

    const hasCough =
      lower.includes("cough") ||
      lower.includes("ubo") ||
      lower.includes("sipon");

    const hasHeadache =
      lower.includes("headache") ||
      lower.includes("sakit ng ulo") ||
      lower.includes("migraine");

    const hasBreathing =
      lower.includes("hirap huminga") ||
      lower.includes("difficulty breathing") ||
      lower.includes("shortness of breath");

    const complaints: string[] = [];

    if (hasFever) complaints.push("fever");
    if (hasCough) complaints.push("cough/colds symptoms");
    if (hasHeadache) complaints.push("headache or migraine");
    if (hasBreathing) complaints.push("breathing difficulty");

    const complaintText =
      complaints.length > 0 ? complaints.join(", ") : "reported symptoms";

    const urgentWarning = hasBreathing
      ? " Breathing difficulty requires urgent in-person RHU/ER assessment."
      : "";

    return {
      // Same reasoning as above: the transcript is stored, not pasted.
      subjective: buildDefaultSubjective(session),
      objective:
        "No objective vital signs or physical examination findings were directly measured in the online consultation.",
      assessment: hasBreathing
        ? "Possible respiratory distress or acute respiratory condition; urgent in-person assessment advised."
        : `Possible acute illness related to ${complaintText}; clinician review required.`,
      plan:
        `Advise rest, hydration, temperature monitoring, and follow-up if symptoms persist or worsen.${urgentWarning}`.trim(),
      diagnosis: hasBreathing
        ? "Respiratory complaint for urgent evaluation"
        : hasFever || hasCough
        ? "Acute upper respiratory symptoms"
        : "Telemedicine assessment pending final clinician diagnosis",
      treatment:
        "Supportive care and RHU follow-up. Medication or referral only after clinician validation.",
    };
  }

  function getSoapForSaving(finalize: boolean) {
    const subjective =
      soap.subjective.trim() || buildDefaultSubjective(session);

    const objective =
      soap.objective.trim() || (finalize ? buildDefaultObjective() : "");

    const assessment =
      soap.assessment.trim() || (finalize ? buildDefaultAssessment(session) : "");

    const plan = soap.plan.trim() || (finalize ? buildDefaultPlan() : "");

    const diagnosis =
      soap.diagnosis.trim() ||
      assessment ||
      "Telemedicine consultation";

    const treatment = soap.treatment.trim() || plan;

    /*
     * The transcript is sent on its own field and stored in its own
     * column, so appending it here too wrote the same text into the
     * consultation notes on every save -- growing the note each time
     * somebody pressed Save SOAP.
     */
    const finalAdditionalNotes = joinClean([
      soap.additionalNotes ? `Additional RHU notes: ${soap.additionalNotes}` : null,
      rhuStaffName ? `RHU staff/doctor: ${rhuStaffName}` : null,
    ]);

    return {
      subjective,
      objective,
      assessment,
      plan,
      diagnosis,
      treatment,
      finalAdditionalNotes,
    };
  }

  async function saveSoap(finalize: boolean) {
    if (!session?.id) return;

    setSaving(true);
    setError("");

    try {
      const prepared = getSoapForSaving(finalize);

      setSoap((current) => ({
        ...current,
        subjective: prepared.subjective,
        objective: prepared.objective,
        assessment: prepared.assessment,
        plan: prepared.plan,
        diagnosis: prepared.diagnosis,
        treatment: prepared.treatment,
      }));

      await saveTelemedicineSessionNotes(session.id, {
        subjective: prepared.subjective,
        objective: prepared.objective,
        assessment: prepared.assessment,
        plan: prepared.plan,
        primary_diagnosis_label: prepared.diagnosis,
        medications: [],
        finalize,
        additional_notes: prepared.finalAdditionalNotes,
        rhu_staff_name: rhuStaffName,
        // telemedicine_session_notes has had a transcript column all along
        // and nothing ever wrote to it. The dictated conversation was
        // folded into a notes blob instead, where nothing can search it.
        transcript,
      } as any);

      const refreshed = await getTelemedicineSession(session.id);
      setSession(refreshed);

      flash(
        finalize
          ? "Full SOAP finalized."
          : "SOAP notes saved."
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not save SOAP notes."
      );
    } finally {
      setSaving(false);
    }
  }

  function openEndModal() {
    if (!session?.id) return;
    setError("");
    setShowEndModal(true);
  }

  async function runEndSession(finalize: boolean) {
    if (!session?.id) return;

    setEnding(true);
    setError("");

    try {
      stt.stopListening();

      // For a draft we keep whatever the staff typed; for finalize we auto-fill
      // any missing SOAP fields so the record is complete.
      const prepared = getSoapForSaving(finalize);

      setSoap((current) => ({
        ...current,
        subjective: prepared.subjective,
        objective: prepared.objective,
        assessment: prepared.assessment,
        plan: prepared.plan,
        diagnosis: prepared.diagnosis,
        treatment: prepared.treatment,
      }));

      const result = await endTelemedicineSessionWithSoap(session.id, finalize, {
        subjective: prepared.subjective,
        objective: prepared.objective,
        assessment: prepared.assessment,
        plan: prepared.plan,
        diagnosis: prepared.diagnosis,
        treatment: prepared.treatment,
        notes: prepared.finalAdditionalNotes,
        transcript,
      });

      /*
       * Close the room for the patient BEFORE the status change unmounts
       * this component's conference.
       *
       * The patient joined from the mobile app, which hands the meeting to
       * their browser and stops being involved. Tearing down our own embed
       * only removes the clinician; the patient sat in an empty room until
       * they worked out the consultation was over. endConference closes it
       * on the bridge, for everyone, which is the only thing that reaches
       * a participant we no longer control.
       */
      await jitsiRef.current?.endForEveryone();

      if (result.telemedicine_session) {
        setSession(result.telemedicine_session);
      }

      const consultationId =
        result.consultation_id ||
        result.telemedicine_session?.consultation_id ||
        session?.consultation_id ||
        session?.consultation?.id ||
        null;

      setShowEndModal(false);

      flash(
        finalize
          ? "Telemedicine consultation completed."
          : "Session ended. Continue SOAP documentation."
      );

      window.setTimeout(() => {
        if (consultationId) {
          navigate(`/consultations/${consultationId}`);
        } else {
          navigate("/consultations");
        }
      }, 700);
    } catch (err: any) {
      const raw = String(
        err?.response?.data?.message || err?.message || ""
      );

      setError(
        /SQLSTATE|syntax|exception|constraint|stack trace/i.test(raw)
          ? "Unable to complete session. Please try again."
          : raw || "Unable to complete session. Please try again."
      );
    } finally {
      setEnding(false);
    }
  }

  if (loading) {
    return (
      <div style={loadingStyle}>
        <Loader2 size={28} />
        <strong>
          {starting
            ? "Starting online consultation..."
            : "Opening telemedicine room..."}
        </strong>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div style={errorPageStyle}>
        <XCircle size={34} />
        <h1>Telemedicine room unavailable</h1>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => navigate("/telemedicine")}
          style={primaryButtonStyle}
        >
          Back to Telemedicine
        </button>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <header style={topBarStyle}>
        <div>
          <strong style={brandStyle}>Ka-Agapay</strong>
          <span style={mutedTopTextStyle}>RHU Telemedicine</span>
        </div>

        <div style={topActionsStyle}>
          {isSessionFinished ? (
            <span style={endedBadgeStyle}>Session Finished</span>
          ) : null}

          <button
            type="button"
            onClick={() => setMinimized((value) => !value)}
            style={topButtonStyle}
          >
            {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            {minimized ? "Show Panel" : "Minimize"}
          </button>

          {/* Once a session is finished there is nothing left to end — hide the
              control entirely rather than showing a dead, disabled button. */}
          {!isSessionFinished ? (
            <button
              type="button"
              onClick={openEndModal}
              disabled={ending}
              style={{
                ...dangerTopButtonStyle,
                opacity: ending ? 0.65 : 1,
                cursor: ending ? "not-allowed" : "pointer",
              }}
            >
              {ending ? "Ending..." : "End Session"}
            </button>
          ) : null}
        </div>
      </header>

      <main style={roomStyle}>
        {isSessionFinished ? (
          // Session already ended — never mount the call iframe (no camera/mic,
          // no black video area). The SOAP panel below stays available.
          <div style={videoUnavailableStyle}>
            <CheckCircle2 size={32} />
            <h2 style={{ margin: "10px 0 4px", fontWeight: 900 }}>
              This session has ended
            </h2>
            <p style={{ maxWidth: 460, lineHeight: 1.6 }}>
              The video call is finished. Continue documenting or finalizing the
              SOAP notes from the panel — there is no active call to rejoin.
            </p>
          </div>
        ) : videoConfig && !videoConfig.configured ? (
          <div style={videoUnavailableStyle}>
            <XCircle size={32} />
            <h2 style={{ margin: "10px 0 4px", fontWeight: 900 }}>
              Video provider is not configured
            </h2>
            <p style={{ maxWidth: 460, lineHeight: 1.6 }}>
              The telemedicine video provider has not been set up. Please contact
              the system administrator.
            </p>
          </div>
        ) : (
          <JitsiRoom
            ref={jitsiRef}
            domain={videoConfig?.domain || ""}
            roomName={videoConfig?.roomName || ""}
            jwt={videoConfig?.jwt}
            fallbackUrl={jitsiUrl}
            onEnded={load}
            style={iframeStyle}
          />
        )}

        {!isSessionFinished && videoConfig?.isDemo ? (
          <div style={demoWarningStyle}>
            {videoConfig.demoWarning ||
              "Demo video provider: meetings may disconnect after 5 minutes."}
          </div>
        ) : null}

        {!minimized ? (
          <aside style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div>
                <small style={eyebrowStyle}>Floating Consultation</small>
                <h2 style={patientTitleStyle}>{patientName}</h2>
              </div>

              <button
                type="button"
                onClick={() => setMinimized(true)}
                style={hideButtonStyle}
              >
                Hide
              </button>
            </div>

            {message ? (
              <div style={successStyle}>
                <CheckCircle2 size={16} />
                {message}
              </div>
            ) : null}

            {error ? (
              <div style={errorStyle}>
                <XCircle size={16} />
                {error}
              </div>
            ) : null}

            <section style={miniInfoGridStyle}>
              <label style={miniFieldStyle}>
                <span>
                  <User size={13} />
                  Patient
                </span>
                <input
                  value={patientName}
                  readOnly
                  style={miniInputStyle}
                />
              </label>

              <label style={miniFieldStyle}>
                <span>
                  <UserCheck size={13} />
                  RHU Staff / Doctor
                </span>
                <input
                  value={rhuStaffName}
                  onChange={(event) => setRhuStaffName(event.target.value)}
                  placeholder="Enter RHU staff name..."
                  style={miniInputStyle}
                />
              </label>
            </section>

            <label style={labelStyle}>
              <span style={transcriptHeadingStyle}>
                Transcript / Speech-to-text

                <select
                  value={dictationLang}
                  onChange={(event) => {
                    const next = event.target.value;

                    setDictationLang(next);

                    try {
                      window.localStorage.setItem(DICTATION_LANGUAGE_KEY, next);
                    } catch {
                      // Not being able to remember it is not worth an error.
                    }
                  }}
                  disabled={listening}
                  title={
                    listening
                      ? "Stop dictation before changing the language"
                      : "Language the consultation is mostly spoken in"
                  }
                  style={langSelectStyle}
                >
                  {DICTATION_LANGUAGES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </span>

              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                placeholder="Start STT or type patient conversation here..."
                style={transcriptStyle}
              />
            </label>

            {/* Stated once, where the choice is made, rather than leaving
                the clinician to work out from silence that a language they
                use every day simply is not on the list. */}
            <p style={dictationNoteStyle}>{NO_DICTATION_NOTE}</p>

            {/* The recogniser's runners-up. A name it mishears the same way
                every time is usually right in one of these, and a tap is
                faster than retyping the phrase. */}
            {stt.alternatives.length > 0 ? (
              <div style={alternativesRowStyle}>
                <span style={alternativesLabelStyle}>Also heard:</span>

                {stt.alternatives.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => useAlternative(choice)}
                    title="Use this reading instead"
                    style={alternativeChipStyle}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : null}

            <div style={buttonRowStyle}>
              <button
                type="button"
                onClick={listening ? stopStt : startStt}
                disabled={!canDocument}
                title={
                  listening
                    ? "Listening... (click to stop voice input)"
                    : "Start voice input"
                }
                style={listening ? warningButtonStyle : secondaryButtonStyle}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
                {listening ? "Stop STT" : "Start STT"}
              </button>

              <button
                type="button"
                onClick={runAiSummarize}
                disabled={summarizing || !canDocument}
                style={primaryButtonStyle}
              >
                <Bot size={16} />
                {summarizing ? "Summarizing..." : "AI Summarize"}
              </button>
            </div>

            <section style={soapGridStyle}>
              <SoapBox
                label="Subjective"
                value={soap.subjective}
                onChange={(value) => updateSoap("subjective", value)}
              />
              <SoapBox
                label="Objective"
                value={soap.objective}
                onChange={(value) => updateSoap("objective", value)}
              />
              <SoapBox
                label="Assessment"
                value={soap.assessment}
                onChange={(value) => updateSoap("assessment", value)}
              />
              <SoapBox
                label="Plan"
                value={soap.plan}
                onChange={(value) => updateSoap("plan", value)}
              />
              <SoapBox
                label="Diagnosis"
                value={soap.diagnosis}
                onChange={(value) => updateSoap("diagnosis", value)}
              />
              <SoapBox
                label="Treatment"
                value={soap.treatment}
                onChange={(value) => updateSoap("treatment", value)}
              />
            </section>

            <label style={labelStyle}>
              <span>Additional Notes</span>
              <textarea
                value={soap.additionalNotes}
                onChange={(event) =>
                  updateSoap("additionalNotes", event.target.value)
                }
                placeholder="Optional RHU notes..."
                style={notesStyle}
              />
            </label>

            <div style={buttonRowStyle}>
              <button
                type="button"
                onClick={() => saveSoap(false)}
                disabled={saving || !canDocument}
                style={primaryButtonStyle}
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save SOAP"}
              </button>

              <button
                type="button"
                onClick={() => saveSoap(true)}
                disabled={saving || !canDocument}
                style={secondaryButtonStyle}
              >
                <ClipboardList size={16} />
                Full SOAP
              </button>

              {!isSessionFinished ? (
                <button
                  type="button"
                  onClick={openEndModal}
                  disabled={ending}
                  style={finishButtonStyle}
                >
                  <Stethoscope size={16} />
                  {ending ? "Ending..." : "End Session"}
                </button>
              ) : null}
            </div>
          </aside>
        ) : null}
      </main>

      {showEndModal ? (
        <div style={endOverlayStyle}>
          <div style={endModalStyle}>
            <h2 style={endTitleStyle}>End Telemedicine Session?</h2>
            <p style={endBodyStyle}>
              This will end the video call and save the current SOAP notes. You
              can continue editing SOAP before finalizing.
            </p>

            {/* When external_api.js could not load we are back to a bare
                iframe, which can remove this side of the call and nothing
                else. Better to say so than to let the clinician believe the
                patient was dropped when they were not. */}
            <p style={endBodyStyle}>
              {jitsiRef.current?.isControllable() === false
                ? "The video embed is running in limited mode, so the patient may stay in the room after you leave. Ask them to close it."
                : "The patient is removed from the room when you end the session."}
            </p>

            <div style={endActionsStyle}>
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                disabled={ending}
                style={endCancelStyle}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => runEndSession(false)}
                disabled={ending}
                style={endDraftStyle}
              >
                <Save size={16} />
                {ending ? "Saving..." : "Save Draft & Go to SOAP"}
              </button>

              <button
                type="button"
                onClick={() => runEndSession(true)}
                disabled={ending}
                style={endFinalizeStyle}
              >
                <CheckCircle2 size={16} />
                {ending ? "Finalizing..." : "Finalize SOAP & Complete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SoapBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={soapBoxStyle}>
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Enter ${label.toLowerCase()}...`}
        style={soapTextareaStyle}
      />
    </label>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#052E2B",
  color: "#FFFFFF",
  display: "grid",
  gridTemplateRows: "56px 1fr",
};

const topBarStyle: CSSProperties = {
  height: 56,
  padding: "0 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "#047857",
  borderBottom: "1px solid rgba(255,255,255,.15)",
};

const brandStyle: CSSProperties = {
  display: "block",
  fontSize: 18,
  fontWeight: 900,
};

const mutedTopTextStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#CCFBF1",
};

const topActionsStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
};

const topButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,.55)",
  background: "rgba(255,255,255,.08)",
  color: "#FFFFFF",
  borderRadius: 10,
  padding: "9px 14px",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const dangerTopButtonStyle: CSSProperties = {
  border: "none",
  background: "#DC2626",
  color: "#FFFFFF",
  borderRadius: 10,
  padding: "10px 16px",
  fontWeight: 900,
  cursor: "pointer",
};

const endedBadgeStyle: CSSProperties = {
  background: "#DCFCE7",
  color: "#166534",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 900,
};

const roomStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  minHeight: "calc(100vh - 56px)",
};

const iframeStyle: CSSProperties = {
  width: "100%",
  height: "calc(100vh - 56px)",
  border: 0,
  background: "#111827",
};

const panelStyle: CSSProperties = {
  position: "absolute",
  top: 24,
  right: 24,
  width: 520,
  maxWidth: "calc(100vw - 48px)",
  maxHeight: "calc(100vh - 104px)",
  overflowY: "auto",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 24px 80px rgba(15,23,42,.35)",
  display: "grid",
  gap: 14,
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
};

const eyebrowStyle: CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "#64748B",
  fontSize: 12,
  fontWeight: 900,
};

const patientTitleStyle: CSSProperties = {
  margin: "3px 0 0",
  fontSize: 18,
  fontWeight: 900,
};

const hideButtonStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 10,
  padding: "8px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const successStyle: CSSProperties = {
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#047857",
  borderRadius: 12,
  padding: 10,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 800,
  fontSize: 13,
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
  borderRadius: 12,
  padding: 10,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 800,
  fontSize: 13,
};

const miniInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const miniFieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 11,
  color: "#334155",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const miniInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 38,
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  padding: "0 10px",
  outline: "none",
  color: "#0F172A",
  background: "#F8FAFC",
  fontSize: 13,
  fontWeight: 800,
  textTransform: "none",
  letterSpacing: 0,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  fontSize: 12,
  color: "#334155",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const dictationNoteStyle: CSSProperties = {
  margin: 0,
  marginTop: -2,
  fontSize: 11,
  lineHeight: 1.5,
  color: "#64748B",
  fontWeight: 600,
};

const transcriptHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const langSelectStyle: CSSProperties = {
  padding: "3px 6px",
  borderRadius: 8,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

const alternativesRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  marginTop: -4,
  marginBottom: 4,
};

const alternativesLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const alternativeChipStyle: CSSProperties = {
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px solid #5EEAD4",
  background: "#F0FDFA",
  color: "#0F172A",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
};

const transcriptStyle: CSSProperties = {
  minHeight: 92,
  resize: "vertical",
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: 12,
  fontSize: 14,
  color: "#0F172A",
  outline: "none",
  lineHeight: 1.45,
  textTransform: "none",
  letterSpacing: 0,
  fontWeight: 600,
};

const notesStyle: CSSProperties = {
  minHeight: 72,
  resize: "vertical",
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: 12,
  fontSize: 14,
  color: "#0F172A",
  outline: "none",
  lineHeight: 1.45,
  textTransform: "none",
  letterSpacing: 0,
  fontWeight: 600,
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#047857",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #0F766E",
  background: "#FFFFFF",
  color: "#0F766E",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const warningButtonStyle: CSSProperties = {
  border: "1px solid #F59E0B",
  background: "#FFFBEB",
  color: "#B45309",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const finishButtonStyle: CSSProperties = {
  border: "none",
  background: "#DC2626",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const videoUnavailableStyle: CSSProperties = {
  width: "100%",
  height: "calc(100vh - 56px)",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 6,
  textAlign: "center",
  padding: 24,
  color: "#FCA5A5",
  background: "#111827",
};

const demoWarningStyle: CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  zIndex: 5,
  maxWidth: 360,
  background: "#FEF3C7",
  color: "#92400E",
  border: "1px solid #FCD34D",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 800,
  boxShadow: "0 10px 30px rgba(0,0,0,.25)",
};

const endOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(2,6,23,.62)",
  backdropFilter: "blur(4px)",
  zIndex: 80,
};

const endModalStyle: CSSProperties = {
  width: "min(520px, 100%)",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 20,
  padding: 24,
  boxShadow: "0 24px 80px rgba(2,6,23,.45)",
};

const endTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 22,
  fontWeight: 900,
};

const endBodyStyle: CSSProperties = {
  margin: "0 0 20px",
  color: "#334155",
  fontSize: 15,
  lineHeight: 1.6,
  fontWeight: 600,
};

const endActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: 10,
};

const endCancelStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 12,
  padding: "10px 16px",
  fontWeight: 900,
  cursor: "pointer",
};

const endDraftStyle: CSSProperties = {
  border: "1px solid #0F766E",
  background: "#FFFFFF",
  color: "#0F766E",
  borderRadius: 12,
  padding: "10px 16px",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const endFinalizeStyle: CSSProperties = {
  border: "none",
  background: "#047857",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "10px 16px",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const soapGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const soapBoxStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "#334155",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const soapTextareaStyle: CSSProperties = {
  minHeight: 72,
  resize: "vertical",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: 10,
  fontSize: 13,
  color: "#0F172A",
  outline: "none",
  lineHeight: 1.45,
  textTransform: "none",
  letterSpacing: 0,
  fontWeight: 600,
  background: "#F8FAFC",
};

const loadingStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  gap: 12,
  color: "#047857",
  background: "#F8FAFC",
};

const errorPageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 12,
  padding: 24,
  textAlign: "center",
  color: "#B91C1C",
  background: "#FEF2F2",
};