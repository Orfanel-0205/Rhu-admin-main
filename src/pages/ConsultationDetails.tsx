// src/pages/ConsultationDetails.tsx

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  Camera,
  CheckCircle2,
  Clock3,
  FileText,
  Send,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import {
  completeConsultation,
  formatDateTime,
  getConsultation,
  getConsultationMapping,
  getConsultationNextStep,
  getConsultationStage,
  getDoctorName,
  getDraftExpiry,
  getItrSnapshot,
  getPatientName,
  saveSoap,
  summarizeConsultation,
  type ConsultationIndicator,
  type Consultation,
  type ItrSnapshotView,
} from "../services/consultations";

import {
  getFollowUps,
  getFollowUpSmsLabel,
  resendFollowUpSms,
  saveFollowUp,
  type FollowUpReminder,
  type FollowUpType,
  type FollowUpUrgency,
} from "../services/followups";

import {
  scanPrescriptionForConsultation,
  type PrescriptionOcrResult,
} from "../services/prescriptions";

import { useLangStore } from "../store/langStore";
import { useAuthStore } from "../store/authStore";
import { printItrForm } from "../utils/printItr";

// ITR snapshot fields default to "Not provided"; on the printed form we want a
// blank line there instead so staff can hand-write it.
function pv(value?: string | null): string {
  const s = String(value ?? "").trim();
  return s === "" || s.toLowerCase() === "not provided" ? "" : s;
}

// Only Doctor, MHO, and Super Admin may create/issue prescriptions.
function canPrescribeFromConsultation(user: any): boolean {
  const role = String(user?.role ?? user?.role_name ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ["doctor", "mho", "mho_admin", "super_admin", "superadmin"].includes(
    role
  );
}
import { t } from "../i18n/translations";
import StatusBadge from "../components/ui/StatusBadge";
import { useToast } from "../contexts/ToastContext";

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function safeText(value: unknown): string {
  return String(value ?? "").trim();
}

function positiveId(value: unknown): number | null {
  const id = Number(value);

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  return id;
}

function getAiField(summary: any, keys: string[], fallback = "—"): string {
  if (!summary) return fallback;

  for (const key of keys) {
    const value = summary?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (Array.isArray(value) && value.length > 0) {
      return value.map((item) => safeText(item)).filter(Boolean).join(", ");
    }
  }

  if (summary?.soap && typeof summary.soap === "object") {
    for (const key of keys) {
      const value = summary.soap?.[key];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return fallback;
}

function getChiefComplaintValue(consultation: Consultation | null): string {
  if (!consultation) return "—";

  return (
    (consultation as any).chief_complaint ||
    (consultation as any).appointment?.reason ||
    (consultation as any).appointment?.symptoms ||
    "—"
  );
}

function buildAiSummaryText(summary: any, consultation: Consultation | null) {
  if (!summary) return "";

  if (summary.summary) {
    return summary.summary;
  }

  const chiefComplaint = getAiField(
    summary,
    ["chief_complaint", "complaint"],
    getChiefComplaintValue(consultation)
  );

  const subjective = getAiField(summary, ["subjective", "S"], "");
  const objective = getAiField(summary, ["objective", "O"], "");
  const assessment = getAiField(summary, ["assessment", "A"], "");
  const plan = getAiField(summary, ["plan", "P"], "");
  const diagnosis = getAiField(summary, ["diagnosis"], "");
  const treatment = getAiField(summary, ["treatment"], "");

  return [
    chiefComplaint ? `Chief Complaint: ${chiefComplaint}` : null,
    subjective ? `Subjective: ${subjective}` : null,
    objective ? `Objective: ${objective}` : null,
    assessment ? `Assessment: ${assessment}` : null,
    plan ? `Plan: ${plan}` : null,
    diagnosis ? `Diagnosis: ${diagnosis}` : null,
    treatment ? `Treatment: ${treatment}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function getConsultationResidentProfileId(consultation: any): number | null {
  return (
    positiveId(consultation?.resident_profile_id) ||
    positiveId(consultation?.resident?.id) ||
    positiveId(consultation?.resident_profile?.id) ||
    positiveId(consultation?.residentProfile?.id) ||
    positiveId(consultation?.patient?.resident_profile_id) ||
    positiveId(consultation?.appointment?.resident_profile_id) ||
    positiveId(consultation?.appointment?.resident?.id) ||
    positiveId(consultation?.user?.resident_profile?.id) ||
    null
  );
}

function getConsultationPatientId(consultation: any): string {
  const patientId =
    consultation?.patient_id ||
    consultation?.resident?.patient_id ||
    consultation?.resident_profile?.patient_id ||
    consultation?.residentProfile?.patient_id ||
    consultation?.patient?.patient_id ||
    consultation?.appointment?.patient_id;

  if (safeText(patientId)) {
    return safeText(patientId);
  }

  const residentProfileId = getConsultationResidentProfileId(consultation);

  return residentProfileId
    ? `PAT-${String(residentProfileId).padStart(5, "0")}`
    : "";
}

function getConsultationMobile(consultation: any): string {
  return safeText(
    consultation?.mobile_number ||
      consultation?.patient_mobile ||
      consultation?.resident?.mobile_number ||
      consultation?.resident_profile?.mobile_number ||
      consultation?.residentProfile?.mobile_number ||
      consultation?.patient?.mobile_number ||
      consultation?.appointment?.mobile_number ||
      consultation?.appointment?.resident?.mobile_number
  );
}

function getConsultationBarangay(consultation: any): string {
  return safeText(
    consultation?.barangay ||
      consultation?.resident?.barangay?.name ||
      consultation?.resident?.barangay ||
      consultation?.resident_profile?.barangay?.name ||
      consultation?.residentProfile?.barangay?.name ||
      consultation?.patient?.barangay?.name ||
      consultation?.appointment?.barangay?.name
  );
}

function getConsultationDiagnosisForRx(consultation: any): string {
  return safeText(
    consultation?.diagnosis ||
      consultation?.assessment ||
      consultation?.ai_summary_payload?.diagnosis ||
      consultation?.ai_summary_payload?.assessment ||
      ""
  );
}

type ClinicalState = {
  vital_signs: string;
  weight: string;
  bmi: string;
  temperature_celsius: string;
  blood_pressure: string;
  spo2: string;
  heart_rate: string;
  visual_acuity: string;
  visual_acuity_left: string;
  visual_acuity_right: string;
  pediatric_client: boolean;
  length_cm: string;
  head_circumference_cm: string;
  skinfold_thickness_cm: string;
  waist_cm: string;
  hip_cm: string;
  limbs_cm: string;
  muac_cm: string;
  general_survey: string;
  awake_and_alert: boolean;
  altered_sensorium: boolean;
  prescribed_drugs: string;
};

function emptyClinical(): ClinicalState {
  return {
    vital_signs: "",
    weight: "",
    bmi: "",
    temperature_celsius: "",
    blood_pressure: "",
    spo2: "",
    heart_rate: "",
    visual_acuity: "",
    visual_acuity_left: "",
    visual_acuity_right: "",
    pediatric_client: false,
    length_cm: "",
    head_circumference_cm: "",
    skinfold_thickness_cm: "",
    waist_cm: "",
    hip_cm: "",
    limbs_cm: "",
    muac_cm: "",
    general_survey: "",
    awake_and_alert: false,
    altered_sensorium: false,
    prescribed_drugs: "",
  };
}

function clinicalFromConsultation(data: any): ClinicalState {
  const s = (v: unknown) => String(v ?? "");
  return {
    vital_signs: s(data.vital_signs),
    weight: s(data.weight),
    bmi: s(data.bmi),
    temperature_celsius: s(data.temperature_celsius),
    blood_pressure: s(data.blood_pressure),
    spo2: s(data.spo2),
    heart_rate: s(data.heart_rate),
    visual_acuity: s(data.visual_acuity),
    visual_acuity_left: s(data.visual_acuity_left),
    visual_acuity_right: s(data.visual_acuity_right),
    pediatric_client: Boolean(data.pediatric_client),
    length_cm: s(data.length_cm),
    head_circumference_cm: s(data.head_circumference_cm),
    skinfold_thickness_cm: s(data.skinfold_thickness_cm),
    waist_cm: s(data.waist_cm),
    hip_cm: s(data.hip_cm),
    limbs_cm: s(data.limbs_cm),
    muac_cm: s(data.muac_cm),
    general_survey: s(data.general_survey),
    awake_and_alert: Boolean(data.awake_and_alert),
    altered_sensorium: Boolean(data.altered_sensorium),
    prescribed_drugs: s(data.prescribed_drugs),
  };
}

export default function ConsultationDetails() {
  const toast = useToast();
  const canPrescribe = canPrescribeFromConsultation(
    useAuthStore((state) => state.user)
  );
  const { id } = useParams();
  const navigate = useNavigate();
  const lang = useLangStore((state) => state.lang);

  const [consultation, setConsultation] = useState<Consultation | null>(null);

  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");

  // RHU staff-filled clinical fields (vitals, pediatric, general survey, drugs).
  const [clinical, setClinical] = useState<ClinicalState>(emptyClinical());

  const setClinicalField = (key: keyof ClinicalState, value: string | boolean) =>
    setClinical((prev) => ({ ...prev, [key]: value }));

  const [aiSummary, setAiSummary] = useState<any>(null);
  const [prescriptionResult, setPrescriptionResult] =
    useState<PrescriptionOcrResult | null>(null);
  const [selectedRxFile, setSelectedRxFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);

  // Follow-up reminder (saved from the SOAP page; optional SMS to patient).
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [followUpType, setFollowUpType] = useState<FollowUpType>("single");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpStartDate, setFollowUpStartDate] = useState("");
  const [followUpEndDate, setFollowUpEndDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("09:00");
  const [followUpReason, setFollowUpReason] = useState("");
  const [followUpInstructions, setFollowUpInstructions] = useState("");
  const [followUpUrgency, setFollowUpUrgency] =
    useState<FollowUpUrgency>("routine");
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [followUpMobile, setFollowUpMobile] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [resendingFollowUp, setResendingFollowUp] = useState(false);
  const [followUpResult, setFollowUpResult] = useState<FollowUpReminder | null>(
    null
  );

  const recognitionRef = useRef<any>(null);

  function applyFollowUpReminder(reminder: FollowUpReminder | null) {
    setFollowUpResult(reminder);

    if (!reminder) return;

    setNeedsFollowUp(
      !["cancelled", "completed"].includes(String(reminder.status || "").toLowerCase())
    );
    const reminderType =
      String(reminder.follow_up_type || "").toLowerCase() === "range"
        ? "range"
        : "single";
    const startDate = String(
      reminder.follow_up_start_date || reminder.follow_up_date || ""
    ).slice(0, 10);
    const endDate = String(reminder.follow_up_end_date || "").slice(0, 10);

    setFollowUpType(reminderType);
    setFollowUpDate(String(reminder.follow_up_date || startDate || "").slice(0, 10));
    setFollowUpStartDate(startDate);
    setFollowUpEndDate(endDate);
    setFollowUpTime(String(reminder.follow_up_time || "09:00").slice(0, 5));
    setFollowUpReason(String(reminder.reason || ""));
    setFollowUpInstructions(String(reminder.instructions || ""));
    setFollowUpUrgency((reminder.urgency as FollowUpUrgency) || "routine");
    setSmsEnabled(reminder.sms_enabled !== false);
    setFollowUpMobile(String(reminder.mobile_number || ""));
  }

  async function load() {
    if (!id) return;

    setLoading(true);

    try {
      const data = await getConsultation(id);

      setConsultation(data);

      setSubjective(
        (data as any).subjective ||
          (data as any).chief_complaint ||
          (data as any).appointment?.symptoms ||
          (data as any).appointment?.reason ||
          ""
      );

      setObjective((data as any).objective || "");
      setAssessment((data as any).assessment || (data as any).diagnosis || "");
      setPlan(
        (data as any).plan ||
          (data as any).treatment_plan ||
          (data as any).treatment ||
          ""
      );
      setDiagnosis((data as any).diagnosis || "");
      setTreatment(
        (data as any).treatment || (data as any).treatment_plan || ""
      );
      setNotes((data as any).notes || "");
      setTranscript((data as any).transcript || "");
      setClinical(clinicalFromConsultation(data as any));

      // Prefill the follow-up mobile from the patient ITR (editable by staff).
      const snapContact = getItrSnapshot(data).contact;
      setFollowUpMobile(
        snapContact && snapContact !== "Not provided" ? snapContact : ""
      );

      setAiSummary(
        (data as any).ai_summary_payload ||
          ((data as any).ai_summary ? { summary: (data as any).ai_summary } : null)
      );

      try {
        const reminders = await getFollowUps({ per_page: 100 });
        const existingReminder =
          reminders.find((item) => Number(item.consultation_id) === Number(data.id)) ??
          null;

        applyFollowUpReminder(existingReminder);
      } catch {
        setFollowUpResult(null);
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("cd_alert_load_fail", useLangStore.getState().lang)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    return () => {
      recognitionRef.current?.stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(nextStatus?: string) {
    if (!id) return null;

    const updated = await saveSoap(id, {
      subjective,
      objective,
      assessment,
      plan,
      diagnosis,
      treatment,
      treatment_plan: treatment,
      notes,
      ...clinical,
      status: nextStatus || (consultation as any)?.status || "ongoing",
    });

    setConsultation(updated);

    return updated;
  }

  async function onSave() {
    setSaving(true);

    try {
      await handleSave();
      toast.success(t("cd_alert_saved", lang));
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("cd_alert_save_fail", lang)
      );
    } finally {
      setSaving(false);
    }
  }

  async function onComplete() {
    if (!id) return;

    if (!window.confirm(t("cd_confirm_complete", lang))) return;

    setSaving(true);

    try {
      await handleSave("completed");

      const completed = await completeConsultation(id);

      setConsultation(completed);
      toast.success(t("cd_alert_completed", lang));
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("cd_alert_complete_fail", lang)
      );
    } finally {
      setSaving(false);
    }
  }

  // Auto-fill EMPTY SOAP fields from the Patient ITR snapshot. Never overwrites
  // anything the staff already typed.
  function autoFillFromItr() {
    if (!consultation) return;

    const snap = getItrSnapshot(consultation);
    const has = (v?: string) => Boolean(v && v !== "Not provided");

    const subjectiveLines: string[] = [];
    if (has(snap.appointmentReason))
      subjectiveLines.push(`Reason for visit: ${snap.appointmentReason}`);
    if (has(snap.allergies))
      subjectiveLines.push(`Allergies: ${snap.allergies}`);
    if (has(snap.pastMedicalHistory))
      subjectiveLines.push(`Past medical history: ${snap.pastMedicalHistory}`);
    if (has(snap.maintenanceMedications))
      subjectiveLines.push(
        `Maintenance medications: ${snap.maintenanceMedications}`
      );
    if (has(snap.familyHistory))
      subjectiveLines.push(`Family history: ${snap.familyHistory}`);
    if (has(snap.personalSocialHistory))
      subjectiveLines.push(
        `Personal/social history: ${snap.personalSocialHistory}`
      );

    let filled = 0;

    if (!subjective.trim() && subjectiveLines.length > 0) {
      setSubjective(subjectiveLines.join("\n"));
      filled += 1;
    }

    if (!objective.trim()) {
      const objLines: string[] = [];
      if (has(snap.age)) objLines.push(`Age: ${snap.age}`);
      if (has(snap.sex)) objLines.push(`Sex: ${snap.sex}`);
      if (objLines.length > 0) {
        setObjective(objLines.join(" · "));
        filled += 1;
      }
    }

    if (filled > 0) {
      toast.warning(
        "Auto-filled " +
          filled +
          " empty SOAP field(s) from the patient ITR. Existing entries were kept."
      );
    } else {
      toast.warning(
        "Nothing to auto-fill — SOAP fields already contain staff entries, or the ITR has no extra data."
      );
    }
  }

  function showSaveFollowUpMessage(result: FollowUpReminder | null) {
    const status = String(result?.sms_status || "").toLowerCase();
    const hasMobile = Boolean(safeText(result?.mobile_number));

    if (status === "pending") {
      toast.success("Follow-up saved. SMS pending.");
    } else if (status === "sent") {
      toast.success("Follow-up saved. SMS sent.");
    } else if (status === "failed") {
      toast.error("Follow-up saved, but SMS failed.");
    } else if (status === "not_sent" || !hasMobile) {
      toast.success(
        "Follow-up saved, but SMS was not sent because the patient has no valid mobile number."
      );
    } else {
      toast.success("Follow-up reminder saved.");
    }
  }

  function showResendFollowUpMessage(result: FollowUpReminder | null) {
    const status = String(result?.sms_status || "").toLowerCase();

    if (status === "pending") {
      toast.success("SMS resent. Status: pending.");
    } else if (status === "sent") {
      toast.success("SMS resent. Status: sent.");
    } else {
      toast.error("SMS resend failed.");
    }
  }

  async function submitFollowUp() {
    if (!consultation) return;

    if (needsFollowUp && followUpType === "single" && !followUpDate.trim()) {
      toast.warning("Please choose a follow-up date.");
      return;
    }

    if (needsFollowUp && followUpType === "range") {
      if (!followUpStartDate.trim() || !followUpEndDate.trim()) {
        toast.warning("Please choose the follow-up start and end dates.");
      }

      if (new Date(followUpEndDate) < new Date(followUpStartDate)) {
        toast.warning("Follow-up end date must be the same day as or after the start date.");
      }
    }

    const resolvedFollowUpDate =
      followUpType === "range" ? followUpStartDate : followUpDate;

    setSavingFollowUp(true);

    try {
      const result = await saveFollowUp({
        consultation_id: consultation.id,
        appointment_id:
          (consultation as any).appointment_id ??
          (consultation as any).appointment?.id ??
          null,
        needs_follow_up: needsFollowUp,
        follow_up_type: followUpType,
        follow_up_date: needsFollowUp ? resolvedFollowUpDate || null : null,
        follow_up_start_date: needsFollowUp
          ? followUpType === "range"
            ? followUpStartDate || null
            : followUpDate || null
          : null,
        follow_up_end_date:
          needsFollowUp && followUpType === "range"
            ? followUpEndDate || null
            : null,
        follow_up_time: needsFollowUp ? followUpTime || null : null,
        reason: followUpReason || null,
        instructions: followUpInstructions || null,
        urgency: followUpUrgency,
        sms_enabled: smsEnabled,
        mobile_number: followUpMobile.trim() || null,
      });

      applyFollowUpReminder(result);

      if (!needsFollowUp) {
        toast.success("Saved: no follow-up required. Any pending reminder was cancelled.");
      } else if (result) {
        showSaveFollowUpMessage(result);
        return;
        // Report the REAL outcome of the latest send attempt — never claim
        // "sent" when Semaphore returned pending or the attempt failed.
        const status = String(result?.sms_status || "").toLowerCase();
        const base = "Follow-up saved";

        if (!smsEnabled) {
          toast.warning(`${base}. SMS was not enabled.`);
        } else if (status === "sent") {
          toast.success(`${base} — SMS sent.`);
        } else if (status === "pending") {
          toast.warning(`${base} — SMS pending (queued at Semaphore).`);
        } else if (status === "failed") {
          toast.error(
            `${base}, but SMS failed: ${result?.sms_error || "unknown error"}.`
          );
        } else if (status === "not_sent") {
          toast.warning(`${base}, but no valid mobile number is on file.`);
        } else {
          toast.warning(`${base}.`);
        }
      } else {
        toast.success("Follow-up reminder saved.");
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save the follow-up reminder."
      );
    } finally {
      setSavingFollowUp(false);
    }
  }

  function onSaveFollowUp() {
    return submitFollowUp();
  }

  async function onResendFollowUpSms() {
    const reminderId = Number(followUpResult?.id);

    if (!reminderId) return;

    setResendingFollowUp(true);

    try {
      const result = await resendFollowUpSms(reminderId);
      applyFollowUpReminder(result);
      showResendFollowUpMessage(result);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "SMS resend failed."
      );
    } finally {
      setResendingFollowUp(false);
    }
  }

  function startSpeechToText() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.warning(t("cd_speech_unsupported", lang));
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-PH";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];

        if (result.isFinal) {
          finalText += result[0].transcript + " ";
        }
      }

      if (finalText.trim()) {
        setTranscript((prev) =>
          `${prev} ${finalText}`.replace(/\s+/g, " ").trim()
        );
      }
    };

    recognition.onerror = () => {
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  function stopSpeechToText() {
    recognitionRef.current?.stop?.();
    setRecording(false);
  }

  async function onAiSummarize() {
    if (!id) return;

    if (!transcript.trim()) {
      toast.warning(
        t("cd_transcript_required", lang) ||
          "Paste or record a transcript first."
      );
      return;
    }

    setSaving(true);

    try {
      const result = await summarizeConsultation(id, {
        transcript,
        save_to_soap: true,
      });

      const summary = result.data;

      setAiSummary(summary);

      if (summary.subjective) setSubjective(summary.subjective);
      if (summary.objective) setObjective(summary.objective);
      if (summary.assessment) setAssessment(summary.assessment);
      if (summary.plan) setPlan(summary.plan);
      if (summary.diagnosis) setDiagnosis(summary.diagnosis);
      if (summary.treatment) setTreatment(summary.treatment);
      else if (summary.plan) setTreatment(summary.plan);

      setConsultation(result.consultation);

      toast.success(t("cd_alert_ai_done", lang));
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("cd_alert_ai_fail", lang)
      );
    } finally {
      setSaving(false);
    }
  }

  async function onUploadPrescription() {
    if (!id || !selectedRxFile) {
      toast.warning(
        t("cd_choose_rx_first", lang) || "Please choose a prescription file first."
      );
      return;
    }

    setSaving(true);

    try {
      const result = await scanPrescriptionForConsultation(id, selectedRxFile, {
        diagnosis,
        notes,
      });

      setPrescriptionResult(result);

      toast.success(
        result?.prescription_number
          ? `E-Prescription created: ${result.prescription_number}`
          : t("cd_alert_rx_done", lang)
      );

      await load();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("cd_alert_rx_fail", lang)
      );
    } finally {
      setSaving(false);
    }
  }

  function goToEprescriptionRelease() {
    if (!consultation) {
      navigate("/prescriptions?new=1");
      return;
    }

    const residentProfileId = getConsultationResidentProfileId(consultation);
    const patientName = getPatientName(consultation);
    const diagnosisForRx =
      diagnosis || getConsultationDiagnosisForRx(consultation);

    const params = new URLSearchParams();

    params.set("new", "1");

    if (id) {
      params.set("consultation_id", id);
    }

    if (residentProfileId) {
      params.set("resident_profile_id", String(residentProfileId));
    }

    if (patientName) {
      params.set("patient_name", patientName);
    }

    const patientId = getConsultationPatientId(consultation);

    if (patientId) {
      params.set("patient_id", patientId);
    }

    const mobile = getConsultationMobile(consultation);

    if (mobile) {
      params.set("mobile", mobile);
    }

    const barangay = getConsultationBarangay(consultation);

    if (barangay) {
      params.set("barangay", barangay);
    }

    if (diagnosisForRx) {
      params.set("diagnosis", diagnosisForRx);
    }

    const prescribedForRx =
      clinical.prescribed_drugs ||
      treatment ||
      plan ||
      getAiField(aiSummary, ["prescribed_drugs", "treatment"], "");

    if (safeText(prescribedForRx)) {
      params.set("prescribed_drugs", prescribedForRx);
    }

    navigate(`/prescriptions?${params.toString()}`);
  }

  const aiChiefComplaint = getAiField(
    aiSummary,
    ["chief_complaint", "complaint"],
    getChiefComplaintValue(consultation)
  );

  const aiSubjective = getAiField(aiSummary, ["subjective", "S"], subjective);
  const aiObjective = getAiField(aiSummary, ["objective", "O"], objective);
  const aiAssessment = getAiField(aiSummary, ["assessment", "A"], assessment);
  const aiPlan = getAiField(aiSummary, ["plan", "P"], plan);
  const aiDiagnosis = getAiField(aiSummary, ["diagnosis"], diagnosis);
  const aiTreatment = getAiField(aiSummary, ["treatment"], treatment || plan);

  if (loading) {
    return <div style={cardStyle}>{t("cd_loading", lang)}</div>;
  }

  if (!consultation) {
    return <div style={cardStyle}>{t("cd_not_found", lang)}</div>;
  }

  const rawConsultationStatus = String((consultation as any).status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const readOnlyStatuses = [
    "completed",
    "finalized",
    "history",
    "history_only",
    "cancelled",
  ];
  const isCompleted = ["completed", "finalized", "history", "history_only"].includes(
    rawConsultationStatus
  );
  const isSoapReadOnly = readOnlyStatuses.includes(rawConsultationStatus);
  const readOnlyReason =
    rawConsultationStatus === "cancelled"
      ? "This consultation is cancelled and stored for records."
      : "This consultation is completed and stored in History.";

  // Telemedicine context for clean draft/finalized navigation. Online consults
  // should never offer "Back to Queue"; they prefer Appointments / Telemedicine.
  const appointmentForConsult = (consultation as any).appointment || null;
  const consultTypeRaw = String(
    appointmentForConsult?.consultation_type ||
      appointmentForConsult?.purpose ||
      ""
  ).toLowerCase();
  const teleSession =
    appointmentForConsult?.telemedicine_request?.session ||
    appointmentForConsult?.telemedicine_session ||
    (consultation as any).telemedicine_session ||
    null;
  const isTelemedicineConsult =
    consultTypeRaw.includes("online") ||
    consultTypeRaw.includes("telemedicine") ||
    Boolean(appointmentForConsult?.telemedicine_request) ||
    Boolean(teleSession);
  const teleSessionStatus = String(teleSession?.status || "").toLowerCase();
  const teleSessionActive = ["active", "waiting", "paused"].includes(
    teleSessionStatus
  );
  const teleSessionEnded = ["ended", "no_show", "cancelled"].includes(
    teleSessionStatus
  );
  const teleSessionId = teleSession?.id ?? null;

  // Slice B1: SOAP draft stage + TTL (visibility only) + ITR snapshot.
  const stage = getConsultationStage(consultation);
  const itr: ItrSnapshotView = getItrSnapshot(consultation);
  const draftSavedAt = (consultation as any).draft_saved_at as string | null;
  const draftExpiry = getDraftExpiry(consultation);
  const draftExpired = stage.key === "expired";
  const mapping = getConsultationMapping(consultation);
  const hasDiagnosisPlan = Boolean(
    safeText(diagnosis || assessment) && safeText(treatment || plan)
  );
  const currentWorkflowIndex = (() => {
    if (mapping.stage.key === "cancelled") return 1;
    if (isCompleted) return 5;
    if (mapping.stage.key === "not_started") return 0;
    if (mapping.soap.key === "no_soap") return 1;
    if (mapping.soap.key === "soap_needs_review") return 2;
    if (!hasDiagnosisPlan) return 3;
    if (mapping.afterCare.key !== "no_after_care") return 4;
    return 5;
  })();
  const workflowSteps = [
    "Queue / Visit State",
    "Consultation Started",
    "SOAP Documentation",
    "Diagnosis / Treatment",
    "After-Care Plan",
    "Completed",
  ].map((label, index) => ({
    label,
    state:
      mapping.stage.key === "cancelled" && index >= currentWorkflowIndex
        ? "problem"
        : index < currentWorkflowIndex || isCompleted
        ? "done"
        : index === currentWorkflowIndex
        ? "current"
        : "pending",
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={topHeaderStyle}>
        <div>
          <Link to="/consultations" style={backLinkStyle}>
            {t("cd_back", lang)}
          </Link>

          <h1 style={pageTitleStyle}>{t("cd_title", lang)}</h1>

          <p style={pageSubtitleStyle}>
            {formatDate(
              (consultation as any).consultation_date ||
                (consultation as any).created_at
            )}{" "}
            • {stage.label}
          </p>

          {!isSoapReadOnly ? (
            <p style={draftTtlStyle(draftExpired)}>
              <Clock3 size={13} style={{ verticalAlign: "-2px" }} />{" "}
              {draftExpired
                ? "Draft expired — review before completing. Still editable; nothing was deleted."
                : draftExpiry
                ? `Draft active until ${formatDateTime(draftExpiry.toISOString())}`
                : "Draft active."}
              {draftSavedAt
                ? ` · Last saved ${formatDateTime(draftSavedAt)}`
                : ""}
            </p>
          ) : null}

          {!isSoapReadOnly && isTelemedicineConsult && teleSessionEnded ? (
            <p style={teleEndedHintStyle}>
              <CheckCircle2 size={13} style={{ verticalAlign: "-2px" }} />{" "}
              Telemedicine session ended — finalize SOAP when ready.
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {isSoapReadOnly ? (
            <>
              <span style={completedBadgeStyle}>
                <CheckCircle2 size={16} />
                {rawConsultationStatus === "cancelled" ? "Cancelled" : "Completed"}
              </span>

              {isCompleted && canPrescribe ? (
                <button
                  type="button"
                  onClick={goToEprescriptionRelease}
                  style={buttonStyle}
                >
                  Create E-Prescription
                </button>
              ) : null}

              <button
                type="button"
                onClick={() =>
                  printItrForm({
                    consultationDate:
                      pv((consultation as any).consultation_date) ||
                      pv(itr.firstAttendedAt),
                    philhealth: pv(itr.philhealth),
                    fullName: pv(itr.fullName) || getPatientName(consultation),
                    address: pv(itr.address),
                    age: pv(itr.age),
                    birthdate: pv(itr.birthdate),
                    sex: pv(itr.sex),
                    // Not captured in SOAP/ITR data → blank for hand-writing.
                    civilStatus: "",
                    religion: "",
                    education: "",
                    height: "",
                    weight: pv(clinical.weight),
                    bmi: pv(clinical.bmi),
                    temperature: pv(clinical.temperature_celsius),
                    bloodPressure: pv(clinical.blood_pressure),
                    spo2: pv(clinical.spo2),
                    heartRate: pv(clinical.heart_rate),
                    pulseRate: "",
                    respiratoryRate: "",
                    bloodType: "",
                    visualAcuityLeft: pv(clinical.visual_acuity_left),
                    visualAcuityRight: pv(clinical.visual_acuity_right),
                    guardian: pv(itr.guardian),
                    personalSocialHistory: pv(itr.personalSocialHistory),
                    pastMedicalHistory: pv(itr.pastMedicalHistory),
                    allergies: pv(itr.allergies),
                    isPediatric: Boolean(clinical.pediatric_client),
                    lengthCm: pv(clinical.length_cm),
                    headCircumferenceCm: pv(clinical.head_circumference_cm),
                    skinfoldThicknessCm: pv(clinical.skinfold_thickness_cm),
                    waistCm: pv(clinical.waist_cm),
                    hipCm: pv(clinical.hip_cm),
                    limbsCm: pv(clinical.limbs_cm),
                    muacCm: pv(clinical.muac_cm),
                    awakeAndAlert: Boolean(clinical.awake_and_alert),
                    alteredSensorium: Boolean(clinical.altered_sensorium),
                    subjective: pv(subjective),
                    objective: pv(objective),
                    assessment: pv(assessment),
                    plan: pv(plan),
                    remarksDiagnosis:
                      [pv(diagnosis), pv(treatment)].filter(Boolean).join("\n"),
                    prescribedDrugs: pv(clinical.prescribed_drugs) || pv(treatment),
                    attendingName: pv(itr.attendingStaff),
                  })
                }
                style={secondaryButton}
              >
                Print / Export SOAP
              </button>

              {/* Online telemedicine never returns to the onsite queue. */}
              {!isTelemedicineConsult ? (
                <button
                  type="button"
                  onClick={() => navigate("/queue")}
                  style={secondaryButton}
                >
                  Back to Queue
                </button>
              ) : null}

              {isTelemedicineConsult ? (
                <button
                  type="button"
                  onClick={() => navigate("/telemedicine")}
                  style={secondaryButton}
                >
                  Telemedicine History
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => navigate("/appointments")}
                style={secondaryButton}
              >
                Back to Appointments
              </button>
            </>
          ) : (
            <>
              <span style={stageBadgeStyle(stage.key)}>
                {stage.key === "expired" ? <Clock3 size={14} /> : null}
                SOAP Draft
              </span>

              <button onClick={onSave} disabled={saving} style={secondaryButton}>
                {saving ? t("btn_saving_ellipsis", lang) : "Save Draft"}
              </button>

              <button onClick={onComplete} disabled={saving} style={buttonStyle}>
                Finalize Consultation
              </button>

              {isTelemedicineConsult && teleSessionActive && teleSessionId ? (
                <button
                  type="button"
                  onClick={() => navigate(`/telemedicine/room/${teleSessionId}`)}
                  style={secondaryButton}
                >
                  Back to Telemedicine
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => navigate("/appointments")}
                style={secondaryButton}
              >
                Back to Appointments
              </button>
            </>
          )}
        </div>
      </div>

      {isSoapReadOnly ? (
        <section style={readOnlyNoticeStyle}>
          <CheckCircle2 size={18} />
          <div>
            <strong>Read-only SOAP</strong>
            <p>{readOnlyReason}</p>
          </div>
        </section>
      ) : null}

      <section style={statusPanelStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={titleStyle}>Consultation Status Map</h2>
            <p style={mutedTextStyle}>
              Source, queue state, consultation stage, SOAP, and after-care are
              separated so staff can see exactly what needs action.
            </p>
          </div>

          <StatusBadge
            label={mapping.lifecycle.label}
            tone={mapping.lifecycle.tone}
            size="md"
          />
        </div>

        <div style={statusSummaryGridStyle}>
          <IndicatorSummaryCard title="Source" indicator={mapping.source} />
          <IndicatorSummaryCard
            title="Queue / Visit State"
            indicator={mapping.queue}
          />
          <IndicatorSummaryCard
            title="Consultation Stage"
            indicator={mapping.stage}
          />
          <IndicatorSummaryCard title="SOAP Status" indicator={mapping.soap} />
          <IndicatorSummaryCard
            title="After-Care Status"
            indicator={mapping.afterCare}
          />
        </div>

        <div style={workflowGridStyle}>
          {workflowSteps.map((step, index) => (
            <WorkflowStepCard
              key={step.label}
              number={index + 1}
              label={step.label}
              state={step.state as "done" | "current" | "pending" | "problem"}
            />
          ))}
        </div>

        <div style={nextStepNoticeStyle}>
          <strong>Next Step</strong>
          <span>{getConsultationNextStep(consultation)}</span>
        </div>

        <div style={mappingGuideStyle}>
          <strong>Mapping Guide</strong>
          <span>Appointment = booking/request schedule</span>
          <span>Queue = patient waiting/being called</span>
          <span>Consultation = clinical encounter</span>
          <span>SOAP = medical documentation</span>
          <span>After-care = prescription/lab/follow-up/referral</span>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={titleStyle}>Patient ITR Snapshot</h2>
            <p style={mutedTextStyle}>
              Auto-loaded from the patient profile when the chart is opened at the
              desk. Missing entries show “Not provided”.
            </p>
          </div>
        </div>

        <div style={itrGridStyle}>
          <Info label="Full name" value={itr.fullName} />
          <Info label="Age" value={itr.age} />
          <Info label="Sex / Gender" value={itr.sex} />
          <Info label="Birthdate" value={itr.birthdate} />
          <Info label="Barangay" value={itr.barangay} />
          <Info label="Address" value={itr.address} />
          <Info label="Contact number" value={itr.contact} />
          <Info label="Guardian" value={itr.guardian} />
          <Info label="PhilHealth / ID" value={itr.philhealth} />
          <Info label="Queue" value={itr.queueLabel} />
          <Info label="First attended" value={itr.firstAttendedAt} />
          <Info label="Attending staff" value={itr.attendingStaff} />
        </div>

        <div style={{ ...itrGridStyle, marginTop: 12 }}>
          <Info label="Appointment reason" value={itr.appointmentReason} />
          <Info label="Allergies" value={itr.allergies} />
          <Info label="Past medical history" value={itr.pastMedicalHistory} />
          <Info
            label="Maintenance medications"
            value={itr.maintenanceMedications}
          />
          <Info label="Family history" value={itr.familyHistory} />
          <Info
            label="Personal / social history"
            value={itr.personalSocialHistory}
          />
        </div>

        {consultation.past_consultations &&
        consultation.past_consultations.length > 0 ? (
          <div style={pastBoxStyle}>
            <strong>Past consultations</strong>
            <ul style={pastListStyle}>
              {consultation.past_consultations.map((p) => (
                <li key={p.id}>
                  {p.consultation_date || "—"} ·{" "}
                  {p.diagnosis || p.chief_complaint || "No diagnosis recorded"} (
                  {p.status || "—"})
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div style={{ ...mutedTextStyle, marginTop: 10 }}>
            No past consultations on record.
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={titleStyle}>{t("cd_section_recording", lang)}</h2>

            <p style={mutedTextStyle}>{t("cd_recording_desc", lang)}</p>
          </div>

          {!isSoapReadOnly ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!recording ? (
                <button onClick={startSpeechToText} style={secondaryButton}>
                  {t("cd_btn_start_recording", lang)}
                </button>
              ) : (
                <button onClick={stopSpeechToText} style={dangerButton}>
                  {t("cd_btn_stop", lang)}
                </button>
              )}

              <button onClick={onAiSummarize} disabled={saving} style={buttonStyle}>
                {t("cd_btn_ai_summarize", lang)}
              </button>
            </div>
          ) : null}
        </div>

        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder={t("cd_transcript_placeholder", lang)}
          readOnly={isSoapReadOnly}
          style={{
            ...textareaStyle,
            minHeight: 130,
            marginTop: 14,
            background: isSoapReadOnly ? "#F8FAFC" : "#FFFFFF",
          }}
        />
      </section>

      {aiSummary && (
        <section style={aiSummarySectionStyle}>
          <div style={aiSummaryHeaderStyle}>
            <div>
              <div style={aiEyebrowStyle}>AI Summary</div>
              <h2 style={aiTitleStyle}>SOAP Response</h2>
              <p style={aiSubtitleStyle}>
                Review the generated SOAP cards below. The values are already
                copied into the SOAP notes for editing.
              </p>
            </div>

            <div style={aiMetaWrapStyle}>
              <span style={aiMetaPillStyle}>
                Source: {aiSummary.source || "AI"}
              </span>
              <span style={aiMetaPillStyle}>
                Confidence: {aiSummary.confidence ?? "—"}%
              </span>
            </div>
          </div>

          <div style={aiOverviewCardStyle}>
            <strong>Generated Summary</strong>
            <p>{buildAiSummaryText(aiSummary, consultation)}</p>
          </div>

          <div style={aiSoapGridStyle}>
            <AiSoapCard
              label="Chief Complaint"
              value={aiChiefComplaint}
              tone="green"
            />
            <AiSoapCard
              label="Subjective"
              value={aiSubjective}
              tone="blue"
            />
            <AiSoapCard
              label="Objective"
              value={aiObjective}
              tone="slate"
            />
            <AiSoapCard
              label="Assessment"
              value={aiAssessment}
              tone="amber"
            />
            <AiSoapCard label="Plan" value={aiPlan} tone="green" />
            <AiSoapCard
              label="Diagnosis"
              value={aiDiagnosis}
              tone="violet"
            />
            <AiSoapCard
              label="Treatment"
              value={aiTreatment}
              tone="teal"
            />
          </div>
        </section>
      )}

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={titleStyle}>{t("cd_section_soap", lang)}</h2>
            <p style={mutedTextStyle}>
              Auto-fill pulls the patient ITR into EMPTY fields only — it never
              overwrites what you have typed.
            </p>
          </div>

          {!isSoapReadOnly ? (
            <button
              type="button"
              onClick={autoFillFromItr}
              style={secondaryButton}
            >
              <Sparkles size={16} />
              Auto-fill from ITR
            </button>
          ) : null}
        </div>

        <div style={soapGridStyle}>
          <Field
            label={t("cd_field_subjective", lang)}
            value={subjective}
            setValue={setSubjective}
            readOnly={isSoapReadOnly}
          />
          <Field
            label={t("cd_field_objective", lang)}
            value={objective}
            setValue={setObjective}
            readOnly={isSoapReadOnly}
          />
          <Field
            label={t("cd_field_assessment", lang)}
            value={assessment}
            setValue={setAssessment}
            readOnly={isSoapReadOnly}
          />
          <Field
            label={t("cd_field_plan", lang)}
            value={plan}
            setValue={setPlan}
            readOnly={isSoapReadOnly}
          />
          <Field
            label={t("con_th_diagnosis", lang)}
            value={diagnosis}
            setValue={setDiagnosis}
            readOnly={isSoapReadOnly}
          />
          <Field
            label={t("cd_field_treatment", lang)}
            value={treatment}
            setValue={setTreatment}
            readOnly={isSoapReadOnly}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <Field
            label={t("cd_field_notes", lang)}
            value={notes}
            setValue={setNotes}
            large
            readOnly={isSoapReadOnly}
          />
        </div>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={titleStyle}>Vitals &amp; Clinical Findings</h2>
            <p style={mutedTextStyle}>
              RHU staff / doctor-filled. Saved with the SOAP note and included in
              the Diagnosis + ITR report and CSV.
            </p>
          </div>
        </div>

        <div style={vitalsGridStyle}>
          <ClinicalInput label="V/S (Vital Signs)" value={clinical.vital_signs} onChange={(v) => setClinicalField("vital_signs", v)} readOnly={isSoapReadOnly} />
          <ClinicalInput label="BP" value={clinical.blood_pressure} onChange={(v) => setClinicalField("blood_pressure", v)} readOnly={isSoapReadOnly} placeholder="120/80" />
          <ClinicalInput label="Temp (°C)" value={clinical.temperature_celsius} onChange={(v) => setClinicalField("temperature_celsius", v)} readOnly={isSoapReadOnly} placeholder="36.5" />
          <ClinicalInput label="HR" value={clinical.heart_rate} onChange={(v) => setClinicalField("heart_rate", v)} readOnly={isSoapReadOnly} placeholder="bpm" />
          <ClinicalInput label="SpO2" value={clinical.spo2} onChange={(v) => setClinicalField("spo2", v)} readOnly={isSoapReadOnly} placeholder="%" />
          <ClinicalInput label="WT (Weight)" value={clinical.weight} onChange={(v) => setClinicalField("weight", v)} readOnly={isSoapReadOnly} placeholder="kg" />
          <ClinicalInput label="BMI" value={clinical.bmi} onChange={(v) => setClinicalField("bmi", v)} readOnly={isSoapReadOnly} />
          <ClinicalInput label="Visual Acuity" value={clinical.visual_acuity} onChange={(v) => setClinicalField("visual_acuity", v)} readOnly={isSoapReadOnly} />
          <ClinicalInput label="Visual Acuity (L)" value={clinical.visual_acuity_left} onChange={(v) => setClinicalField("visual_acuity_left", v)} readOnly={isSoapReadOnly} />
          <ClinicalInput label="Visual Acuity (R)" value={clinical.visual_acuity_right} onChange={(v) => setClinicalField("visual_acuity_right", v)} readOnly={isSoapReadOnly} />
        </div>

        <div style={{ marginTop: 16 }}>
          <span style={fieldLabelStyle}>General Survey</span>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8 }}>
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={clinical.awake_and_alert}
                disabled={isSoapReadOnly}
                onChange={(e) => setClinicalField("awake_and_alert", e.target.checked)}
              />
              Awake and Alert
            </label>
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={clinical.altered_sensorium}
                disabled={isSoapReadOnly}
                onChange={(e) => setClinicalField("altered_sensorium", e.target.checked)}
              />
              Altered Sensorium
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <ClinicalInput
              label="General Survey notes"
              value={clinical.general_survey}
              onChange={(v) => setClinicalField("general_survey", v)}
              readOnly={isSoapReadOnly}
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={clinical.pediatric_client}
              disabled={isSoapReadOnly}
              onChange={(e) => setClinicalField("pediatric_client", e.target.checked)}
            />
            Pediatric Client (0–24 months) — show growth measurements
          </label>

          {clinical.pediatric_client ? (
            <div style={{ ...vitalsGridStyle, marginTop: 12 }}>
              <ClinicalInput label="Length (cm)" value={clinical.length_cm} onChange={(v) => setClinicalField("length_cm", v)} readOnly={isSoapReadOnly} />
              <ClinicalInput label="Head Circumference (cm)" value={clinical.head_circumference_cm} onChange={(v) => setClinicalField("head_circumference_cm", v)} readOnly={isSoapReadOnly} />
              <ClinicalInput label="Skinfold Thickness (cm)" value={clinical.skinfold_thickness_cm} onChange={(v) => setClinicalField("skinfold_thickness_cm", v)} readOnly={isSoapReadOnly} />
              <ClinicalInput label="Waist (cm)" value={clinical.waist_cm} onChange={(v) => setClinicalField("waist_cm", v)} readOnly={isSoapReadOnly} />
              <ClinicalInput label="Hip (cm)" value={clinical.hip_cm} onChange={(v) => setClinicalField("hip_cm", v)} readOnly={isSoapReadOnly} />
              <ClinicalInput label="Limbs (cm)" value={clinical.limbs_cm} onChange={(v) => setClinicalField("limbs_cm", v)} readOnly={isSoapReadOnly} />
              <ClinicalInput label="MUAC (cm)" value={clinical.muac_cm} onChange={(v) => setClinicalField("muac_cm", v)} readOnly={isSoapReadOnly} />
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 16 }}>
          <Field
            label="Prescribed Drug/s"
            value={clinical.prescribed_drugs}
            setValue={(v) => setClinicalField("prescribed_drugs", v)}
            readOnly={isSoapReadOnly}
          />
        </div>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={titleStyle}>Follow-up &amp; SMS Reminder</h2>
            <p style={mutedTextStyle}>
              Schedule a return visit and (optionally) text the patient. Sending
              is non-blocking — the SOAP save is never affected by SMS.
            </p>
          </div>

          <label style={followUpToggleStyle}>
            <input
              type="checkbox"
              checked={needsFollowUp}
              onChange={(e) => setNeedsFollowUp(e.target.checked)}
            />
            Follow-up needed
          </label>
        </div>

        {needsFollowUp ? (
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            <div style={followUpGridStyle}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>Follow-up date option</span>
                <select
                  value={followUpType}
                  onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}
                  style={inputStyle}
                >
                  <option value="single">Single Date</option>
                  <option value="range">Date Range</option>
                </select>
              </label>

              {followUpType === "single" ? (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={fieldLabelStyle}>Follow-up Date</span>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => {
                      setFollowUpDate(e.target.value);
                      setFollowUpStartDate(e.target.value);
                      setFollowUpEndDate("");
                    }}
                    style={inputStyle}
                  />
                </label>
              ) : (
                <>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={fieldLabelStyle}>Start Date</span>
                    <input
                      type="date"
                      value={followUpStartDate}
                      onChange={(e) => {
                        setFollowUpStartDate(e.target.value);
                        setFollowUpDate(e.target.value);
                      }}
                      style={inputStyle}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={fieldLabelStyle}>End Date</span>
                    <input
                      type="date"
                      value={followUpEndDate}
                      onChange={(e) => setFollowUpEndDate(e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                </>
              )}

              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>Follow-up Time</span>
                <input
                  type="time"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>Urgency</span>
                <select
                  value={followUpUrgency}
                  onChange={(e) =>
                    setFollowUpUrgency(e.target.value as FollowUpUrgency)
                  }
                  style={inputStyle}
                >
                  <option value="routine">Routine</option>
                  <option value="watch">Watch</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>Mobile Number</span>
                <input
                  type="text"
                  value={followUpMobile}
                  onChange={(e) => setFollowUpMobile(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  style={inputStyle}
                />
              </label>
            </div>

            <Field
              label="Reason for follow-up"
              value={followUpReason}
              setValue={setFollowUpReason}
            />

            <Field
              label="Instructions for patient (included in SMS)"
              value={followUpInstructions}
              setValue={setFollowUpInstructions}
              large
            />

            <label style={followUpToggleStyle}>
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => setSmsEnabled(e.target.checked)}
              />
              Send SMS reminder to patient
            </label>
          </div>
        ) : (
          <p style={{ ...mutedTextStyle, marginTop: 12 }}>
            No follow-up scheduled. Tick “Follow-up needed” to set a return visit
            and notify the patient.
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 14,
          }}
        >
          <button
            type="button"
            onClick={onSaveFollowUp}
            disabled={savingFollowUp || resendingFollowUp}
            style={buttonStyle}
          >
            <BellRing size={16} />
            {savingFollowUp ? "Saving…" : "Save Follow-up"}
          </button>

          {needsFollowUp &&
          followUpResult?.id &&
          safeText(followUpResult.mobile_number || followUpMobile) ? (
            <button
              type="button"
              onClick={onResendFollowUpSms}
              disabled={savingFollowUp || resendingFollowUp}
              style={secondaryButton}
              title={
                true
                  ? "Save the current details and send the SMS again"
                  : "Enable “Send SMS reminder” first"
              }
            >
              <Send size={16} />
              {resendingFollowUp ? "Resending…" : "Resend SMS"}
            </button>
          ) : null}

          {followUpResult ? (
            <span style={smsStatusPillStyle(followUpResult.sms_status)}>
              {getFollowUpSmsLabel(followUpResult)}
              {followUpResult.sms_sent_at
                ? ` · ${formatDateTime(followUpResult.sms_sent_at)}`
                : ""}
            </span>
          ) : null}
        </div>

        {followUpResult ? (
          <div style={followUpSmsMetaStyle}>
            {followUpResult.sms_last_attempt_at ? (
              <span>
                Last SMS attempt:{" "}
                {formatDateTime(followUpResult.sms_last_attempt_at)}
              </span>
            ) : null}

            {followUpResult.sms_sent_at ? (
              <span>
                SMS sent: {formatDateTime(followUpResult.sms_sent_at)}
              </span>
            ) : null}

            {String(followUpResult.sms_status || "").toLowerCase() ===
              "failed" &&
            safeText(
              followUpResult.sms_error_message || followUpResult.sms_error
            ) ? (
              <span style={{ color: "#B91C1C" }}>
                SMS error:{" "}
                {followUpResult.sms_error_message || followUpResult.sms_error}
              </span>
            ) : null}
          </div>
        ) : null}

        {followUpResult?.sms_status === "failed" &&
        followUpResult?.sms_error &&
        !followUpResult?.sms_error_message ? (
          <p style={{ ...mutedTextStyle, color: "#B91C1C", marginTop: 8 }}>
            SMS error: {followUpResult.sms_error}. The reminder was still saved.
          </p>
        ) : null}
      </section>

      {canPrescribe ? (
      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={titleStyle}>E-Prescription Options</h2>
            <p style={mutedTextStyle}>
              Choose how the RHU staff will continue the e-prescription process.
            </p>
          </div>
        </div>

        <div style={rxOptionGridStyle}>
          <div style={rxOptionCardStyle}>
            <div style={rxIconStyle}>
              <Camera size={24} />
            </div>

            <div>
              <h3 style={rxOptionTitleStyle}>Option 1: Scan E-Prescription</h3>
              <p style={rxOptionTextStyle}>
                Upload a prescription image or PDF. The backend will OCR the
                file, parse medicine details, and create an e-prescription
                record.
              </p>
            </div>

            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(event) =>
                setSelectedRxFile(event.target.files?.[0] || null)
              }
              style={fileInputStyle}
            />

            {selectedRxFile ? (
              <div style={selectedFileStyle}>
                <FileText size={16} />
                {selectedRxFile.name}
              </div>
            ) : null}

            <button
              onClick={onUploadPrescription}
              disabled={saving || !selectedRxFile}
              style={{
                ...buttonStyle,
                opacity: saving || !selectedRxFile ? 0.65 : 1,
                cursor: saving || !selectedRxFile ? "not-allowed" : "pointer",
                justifyContent: "center",
              }}
            >
              <UploadCloud size={18} />
              {saving ? "Scanning..." : "Scan & Generate E-Prescription"}
            </button>
          </div>

          <div style={rxOptionCardStyle}>
            <div style={rxIconStyle}>
              <CheckCircle2 size={24} />
            </div>

            <div>
              <h3 style={rxOptionTitleStyle}>
                Option 2: Go to E-Prescription Release
              </h3>
              <p style={rxOptionTextStyle}>
                Opens the E-Prescription module and automatically fills the
                selected patient, Resident Profile ID, Consultation ID, and
                diagnosis from this consultation.
              </p>
            </div>

            <button
              type="button"
              onClick={goToEprescriptionRelease}
              style={{
                ...secondaryButton,
                minHeight: 44,
                justifyContent: "center",
              }}
            >
              Go to E-Prescription Release
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {prescriptionResult && (
          <div style={rxResultStyle}>
            <strong>E-Prescription Created</strong>

            {prescriptionResult.prescription_number ? (
              <p>Prescription No: {prescriptionResult.prescription_number}</p>
            ) : null}

            {prescriptionResult.medicines?.length ? (
              <ul>
                {prescriptionResult.medicines.map((medicine, index) => (
                  <li key={index}>
                    {medicine.name || medicine.instructions || "Medicine item"}
                  </li>
                ))}
              </ul>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {prescriptionResult.pdf_url ? (
                <a
                  href={prescriptionResult.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  style={openPdfButtonStyle}
                >
                  Open Prescription PDF
                </a>
              ) : null}

              <button
                type="button"
                onClick={goToEprescriptionRelease}
                style={secondaryButton}
              >
                Review / Release in E-Prescription
              </button>
            </div>
          </div>
        )}
      </section>
      ) : null}

      {!isSoapReadOnly ? (
        <div style={bottomBarStyle}>
          <span style={mutedTextStyle}>
            {draftExpired
              ? "Draft window expired — still editable. Save or complete when ready."
              : "Save your progress as a draft, or complete the consultation."}
          </span>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={onSave} disabled={saving} style={secondaryButton}>
              {saving ? t("btn_saving_ellipsis", lang) : "Save Draft"}
            </button>

            <button onClick={onComplete} disabled={saving} style={buttonStyle}>
              {t("cd_btn_complete", lang)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  setValue,
  large,
  readOnly,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  large?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={fieldLabelStyle}>{label}</span>

      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        readOnly={readOnly}
        style={{
          ...textareaStyle,
          minHeight: large ? 140 : 95,
          background: readOnly ? "#F8FAFC" : "#FFFFFF",
          cursor: readOnly ? "not-allowed" : "text",
        }}
      />
    </label>
  );
}

function ClinicalInput({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        style={{
          ...inputStyle,
          background: readOnly ? "#F8FAFC" : "#FFFFFF",
          cursor: readOnly ? "not-allowed" : "text",
        }}
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoCardStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function IndicatorSummaryCard({
  title,
  indicator,
}: {
  title: string;
  indicator: ConsultationIndicator;
}) {
  return (
    <div style={indicatorCardStyle}>
      <div style={infoLabelStyle}>{title}</div>
      <StatusBadge label={indicator.label} tone={indicator.tone} size="sm" />
      <p style={indicatorNextStepStyle}>{indicator.nextStep}</p>
    </div>
  );
}

function WorkflowStepCard({
  number,
  label,
  state,
}: {
  number: number;
  label: string;
  state: "done" | "current" | "pending" | "problem";
}) {
  const tone = {
    done: { bg: "#ECFDF5", border: "#A7F3D0", color: "#047857" },
    current: { bg: "#EFF6FF", border: "#BFDBFE", color: "#1D4ED8" },
    pending: { bg: "#F8FAFC", border: "#E2E8F0", color: "#64748B" },
    problem: { bg: "#FEF2F2", border: "#FECACA", color: "#B91C1C" },
  }[state];

  return (
    <div
      style={{
        ...workflowStepStyle,
        background: tone.bg,
        borderColor: tone.border,
        color: tone.color,
      }}
    >
      <span style={{ ...workflowNumberStyle, background: tone.color }}>
        {state === "done" ? <CheckCircle2 size={15} /> : number}
      </span>
      <strong>{label}</strong>
    </div>
  );
}

function AiSoapCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "blue" | "slate" | "amber" | "violet" | "teal";
}) {
  const toneStyle = {
    green: {
      background: "#ECFDF5",
      border: "#A7F3D0",
      label: "#047857",
    },
    blue: {
      background: "#EFF6FF",
      border: "#BFDBFE",
      label: "#1D4ED8",
    },
    slate: {
      background: "#F8FAFC",
      border: "#CBD5E1",
      label: "#475569",
    },
    amber: {
      background: "#FFFBEB",
      border: "#FDE68A",
      label: "#B45309",
    },
    violet: {
      background: "#F5F3FF",
      border: "#DDD6FE",
      label: "#6D28D9",
    },
    teal: {
      background: "#F0FDFA",
      border: "#99F6E4",
      label: "#0F766E",
    },
  }[tone];

  return (
    <div
      style={{
        ...aiSoapCardStyle,
        background: toneStyle.background,
        borderColor: toneStyle.border,
      }}
    >
      <div style={{ ...aiSoapCardLabelStyle, color: toneStyle.label }}>
        {label}
      </div>

      <p style={aiSoapCardTextStyle}>{value || "—"}</p>
    </div>
  );
}

const topHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const backLinkStyle: CSSProperties = {
  color: "#0D9488",
  fontWeight: 800,
  textDecoration: "none",
};

const pageTitleStyle: CSSProperties = {
  margin: "10px 0 4px",
  fontSize: 30,
  color: "#0F172A",
};

const pageSubtitleStyle: CSSProperties = {
  margin: 0,
  color: "#64748B",
};

const cardStyle: CSSProperties = {
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 10px 20px rgba(15,23,42,0.04)",
};

const statusPanelStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: 16,
};

const readOnlyNoticeStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: 14,
  borderRadius: 16,
  background: "#F8FAFC",
  border: "1px solid #CBD5E1",
  color: "#475569",
};

const statusSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const indicatorCardStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 8,
  minHeight: 122,
  padding: 13,
  borderRadius: 14,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
};

const indicatorNextStepStyle: CSSProperties = {
  margin: 0,
  color: "#64748B",
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 700,
};

const workflowGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const workflowStepStyle: CSSProperties = {
  minHeight: 72,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 12,
  borderRadius: 14,
  border: "1px solid",
  fontSize: 13,
};

const workflowNumberStyle: CSSProperties = {
  width: 28,
  height: 28,
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  color: "#FFFFFF",
  fontWeight: 950,
  fontSize: 12,
};

const nextStepNoticeStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 13,
  borderRadius: 14,
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#047857",
  fontSize: 13,
  lineHeight: 1.45,
};

const mappingGuideStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 13,
  borderRadius: 14,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#334155",
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 750,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 18,
  fontWeight: 900,
};

const mutedTextStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748B",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const soapGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
  marginTop: 14,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: 12,
  resize: "vertical",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const buttonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "11px 16px",
  background: "#0D9488",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const secondaryButton: CSSProperties = {
  border: "1px solid #0D9488",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#F0FDFA",
  color: "#0F766E",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const dangerButton: CSSProperties = {
  border: "1px solid #DC2626",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#FEF2F2",
  color: "#B91C1C",
  fontWeight: 800,
  cursor: "pointer",
};

const completedBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 999,
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#047857",
  fontWeight: 900,
  fontSize: 13,
};

function stageBadgeStyle(
  key: "draft" | "ongoing" | "completed" | "cancelled" | "expired"
): CSSProperties {
  const tones: Record<string, { bg: string; border: string; color: string }> = {
    draft: { bg: "#FEF3C7", border: "#FDE68A", color: "#92400E" },
    ongoing: { bg: "#DBEAFE", border: "#BFDBFE", color: "#1D4ED8" },
    completed: { bg: "#ECFDF5", border: "#A7F3D0", color: "#047857" },
    cancelled: { bg: "#FEE2E2", border: "#FECACA", color: "#B91C1C" },
    expired: { bg: "#FEE2E2", border: "#FECACA", color: "#B91C1C" },
  };
  const tone = tones[key] ?? tones.draft;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 999,
    background: tone.bg,
    border: `1px solid ${tone.border}`,
    color: tone.color,
    fontWeight: 900,
    fontSize: 13,
  };
}

function draftTtlStyle(expired: boolean): CSSProperties {
  return {
    margin: "6px 0 0",
    fontSize: 12,
    fontWeight: 700,
    color: expired ? "#B91C1C" : "#64748B",
  };
}

const teleEndedHintStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  fontWeight: 800,
  color: "#9A3412",
};

const itrGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const pastBoxStyle: CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#0F172A",
};

const pastListStyle: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 18,
  color: "#334155",
  fontSize: 13,
  lineHeight: 1.7,
};

const fieldLabelStyle: CSSProperties = {
  color: "#475569",
  fontWeight: 800,
  fontSize: 13,
};

const bottomBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 20px rgba(15,23,42,0.04)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 14,
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const vitalsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const checkboxRowStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "#0F172A",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const followUpToggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "#0F172A",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const followUpGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const followUpSmsMetaStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 10,
  color: "#64748B",
  fontSize: 13,
  fontWeight: 700,
};

function smsStatusPillStyle(status?: string | null): CSSProperties {
  const s = String(status || "").toLowerCase();
  const tones: Record<string, { bg: string; border: string; color: string }> = {
    sent: { bg: "#ECFDF5", border: "#A7F3D0", color: "#047857" },
    failed: { bg: "#FEE2E2", border: "#FECACA", color: "#B91C1C" },
    pending: { bg: "#FEF3C7", border: "#FDE68A", color: "#92400E" },
    not_sent: { bg: "#F1F5F9", border: "#CBD5E1", color: "#475569" },
  };
  const tone = tones[s] ?? tones.not_sent;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    background: tone.bg,
    border: `1px solid ${tone.border}`,
    color: tone.color,
    fontWeight: 800,
    fontSize: 12,
  };
}

const infoCardStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 12,
  background: "#F8FAFC",
};

const infoLabelStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  fontWeight: 800,
};

const infoValueStyle: CSSProperties = {
  color: "#0F172A",
  marginTop: 4,
  fontWeight: 800,
};

const aiSummarySectionStyle: CSSProperties = {
  background: "#F0FDFA",
  border: "1px solid #99F6E4",
  borderRadius: 20,
  padding: 18,
  boxShadow: "0 12px 26px rgba(15, 118, 110, 0.08)",
};

const aiSummaryHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 14,
};

const aiEyebrowStyle: CSSProperties = {
  color: "#0F766E",
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: ".08em",
};

const aiTitleStyle: CSSProperties = {
  margin: "4px 0 4px",
  color: "#0F172A",
  fontSize: 22,
  fontWeight: 950,
};

const aiSubtitleStyle: CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.5,
};

const aiMetaWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const aiMetaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 30,
  padding: "0 10px",
  borderRadius: 999,
  background: "#CCFBF1",
  color: "#0F766E",
  fontSize: 12,
  fontWeight: 900,
};

const aiOverviewCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: "#FFFFFF",
  border: "1px solid #CCFBF1",
  color: "#0F172A",
  marginBottom: 14,
  lineHeight: 1.6,
};

const aiSoapGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const aiSoapCardStyle: CSSProperties = {
  minHeight: 118,
  padding: 14,
  borderRadius: 16,
  border: "1px solid",
  display: "grid",
  alignContent: "start",
  gap: 8,
};

const aiSoapCardLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const aiSoapCardTextStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 13,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const rxOptionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
  marginTop: 16,
};

const rxOptionCardStyle: CSSProperties = {
  border: "1px solid #CCFBF1",
  borderRadius: 18,
  padding: 16,
  background: "#F8FAFC",
  display: "grid",
  gap: 12,
};

const rxIconStyle: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 16,
  background: "#CCFBF1",
  color: "#0F766E",
  display: "grid",
  placeItems: "center",
};

const rxOptionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 16,
  fontWeight: 900,
};

const rxOptionTextStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#64748B",
  lineHeight: 1.55,
  fontSize: 13,
};

const fileInputStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: 10,
  background: "#FFFFFF",
};

const selectedFileStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "#0F766E",
  fontSize: 13,
  fontWeight: 800,
};

const rxResultStyle: CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#0F172A",
};

const openPdfButtonStyle: CSSProperties = {
  ...buttonStyle,
  textDecoration: "none",
};
