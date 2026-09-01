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

type SoapFields = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosis: string;
  treatment: string;
  additionalNotes: string;
};

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
  // chunk into the Transcript field. en-US is used because Chrome rejects
  // many regional tags (e.g. fil-PH) with language-not-supported.
  const stt = useWebSpeechRecognition({
    lang: "en-US",
    interimResults: true,
    continuous: true,
    onResult: (finalText) =>
      setTranscript((current) =>
        [current, finalText].filter(Boolean).join(" ")
      ),
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

      const subjective =
        summary?.subjective ||
        `${buildDefaultSubjective(session)}\nTranscript: ${source.slice(
          0,
          800
        )}`;

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
      subjective: joinClean([
        buildDefaultSubjective(session),
        `Transcript: ${text}`,
      ]),
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

    const finalAdditionalNotes = joinClean([
      soap.additionalNotes ? `Additional RHU notes: ${soap.additionalNotes}` : null,
      rhuStaffName ? `RHU staff/doctor: ${rhuStaffName}` : null,
      transcript ? `Transcript: ${transcript}` : null,
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
      });

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
          <iframe
            title="Ka-Agapay Telemedicine Video"
            src={jitsiUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
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
              <span>Transcript / Speech-to-text</span>
              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                placeholder="Start STT or type patient conversation here..."
                style={transcriptStyle}
              />
            </label>

            <div style={buttonRowStyle}>
              <button
                type="button"
                onClick={listening ? stopStt : startStt}
                disabled={isSessionFinished}
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
                disabled={summarizing || isSessionFinished}
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
                disabled={saving || isSessionFinished}
                style={primaryButtonStyle}
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save SOAP"}
              </button>

              <button
                type="button"
                onClick={() => saveSoap(true)}
                disabled={saving || isSessionFinished}
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