// src/services/consultations.ts

import apiClient from "../lib/apiClient";
import { getRecordLifecycleStatus, normalizeLifecycleValue } from "../lib/recordLifecycle";
import type { LifecycleStatus } from "../lib/recordLifecycle";
import type { Tone } from "../theme/tokens";

export type ConsultationStatus = "open" | "ongoing" | "completed" | "cancelled" | string;

export interface ConsultationUser {
  id?: number;
  user_id?: number;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  mobile_number?: string | null;
  role?: string | null;

  // Profile fields used by the Patient ITR Snapshot panel
  sex?: string | null;
  gender?: string | null;
  birthday?: string | null;
  birth_date?: string | null;
  address?: string | null;
  barangay?: string | { name?: string | null } | null;
  resident_profile?: any;
}

export interface ConsultationAppointment {
  id?: number;
  user_id?: number;
  patient_id?: number;
  handled_by?: number | null;
  reason?: string | null;
  symptoms?: string | null;
  purpose?: string | null;
  address?: string | null;
  patient_address?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  status?: string | null;

  user?: ConsultationUser | null;
  patient?: ConsultationUser | null;
  resident?: ConsultationUser | null;
  handler?: ConsultationUser | null;
  doctor?: ConsultationUser | null;
  queue_ticket?: any | null;
}

export interface Consultation {
  id: number;

  user_id?: number;
  patient_id?: number;
  attended_by?: number | null;
  doctor_id?: number | null;
  appointment_id?: number | null;
  telemedicine_session_id?: number | null;
  telemedicine_request_id?: number | null;
  source?: string | null;
  visit_type?: string | null;

  consultation_date?: string | null;
  date?: string | null;
  follow_up_date?: string | null;

  chief_complaint?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  treatment_plan?: string | null;

  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  notes?: string | null;

  // RHU staff-filled clinical fields (additive)
  vital_signs?: string | null;
  weight?: string | null;
  bmi?: string | null;
  temperature_celsius?: string | null;
  blood_pressure?: string | null;
  spo2?: string | null;
  heart_rate?: string | null;
  visual_acuity?: string | null;
  visual_acuity_left?: string | null;
  visual_acuity_right?: string | null;
  pediatric_client?: boolean | null;
  length_cm?: string | null;
  head_circumference_cm?: string | null;
  skinfold_thickness_cm?: string | null;
  waist_cm?: string | null;
  hip_cm?: string | null;
  limbs_cm?: string | null;
  muac_cm?: string | null;
  general_survey?: string | null;
  awake_and_alert?: boolean | null;
  altered_sensorium?: boolean | null;
  prescribed_drugs?: string | null;

  transcript?: string | null;
  ai_summary?: string | null;
  ai_summary_payload?: any;
  ai_summary_generated_at?: string | null;

  prescription_path?: string | null;
  prescription_format?: string | null;
  prescription_medicines?: any[] | string | null;

  status?: ConsultationStatus;

  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  started_at?: string | null;

  // Slice B1 — visit tracking
  first_attended_at?: string | null;
  first_attended_by?: number | null;
  draft_saved_at?: string | null;
  itr_snapshot?: Record<string, any> | null;
  first_attendant?: ConsultationUser | null;
  past_consultations?: Array<{
    id: number;
    consultation_date?: string | null;
    diagnosis?: string | null;
    chief_complaint?: string | null;
    status?: string | null;
    completed_at?: string | null;
  }>;

  resident?: ConsultationUser | null;
  patient?: ConsultationUser | null;
  user?: ConsultationUser | null;

  attendant?: ConsultationUser | null;
  doctor?: ConsultationUser | null;
  staff?: ConsultationUser | null;
  provider?: ConsultationUser | null;

  appointment?: ConsultationAppointment | null;
  queue_ticket?: any | null;
  medical_reports?: any[];
  prescriptions?: any[];
}

export interface ConsultationIndicator {
  key: string;
  label: string;
  tone: Tone;
  status: string;
  nextStep: string;
}

export interface ConsultationMapping {
  source: ConsultationIndicator;
  queue: ConsultationIndicator;
  stage: ConsultationIndicator;
  soap: ConsultationIndicator;
  afterCare: ConsultationIndicator;
  lifecycle: LifecycleStatus;
}

export interface ClinicalFields {
  // Vitals / RHU staff-filled
  vital_signs?: string;
  weight?: string;
  bmi?: string;
  temperature_celsius?: string;
  blood_pressure?: string;
  spo2?: string;
  heart_rate?: string;
  visual_acuity?: string;
  visual_acuity_left?: string;
  visual_acuity_right?: string;

  // Pediatric client
  pediatric_client?: boolean;
  length_cm?: string;
  head_circumference_cm?: string;
  skinfold_thickness_cm?: string;
  waist_cm?: string;
  hip_cm?: string;
  limbs_cm?: string;
  muac_cm?: string;

  // General survey
  general_survey?: string;
  awake_and_alert?: boolean;
  altered_sensorium?: boolean;

  // Prescription summary
  prescribed_drugs?: string;
}

export interface SoapPayload extends ClinicalFields {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  diagnosis?: string;
  treatment?: string;
  treatment_plan?: string;
  notes?: string;
  status?: string;
}

export interface AiSummaryPayload {
  transcript?: string;
  save_to_soap?: boolean;
}

export interface AiSummaryData {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosis: string;
  treatment: string;
  summary: string;
  confidence?: number;
  source?: string;
}

export interface AiSummaryResponse {
  message?: string;
  data: AiSummaryData;
  consultation: Consultation;
}

export interface ConsultationStats {
  total: number;
  open: number;
  ongoing: number;
  completed: number;
  cancelled: number;
  needsSoap: number;
  withDiagnosis: number;
}

function normalizeOne(payload: any): Consultation {
  return (
    payload?.consultation ??
    payload?.data?.consultation ??
    payload?.data ??
    payload
  );
}

function normalizeArray(payload: any): Consultation[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.consultations)) return payload.consultations;
  return [];
}

function buildFullName(user?: ConsultationUser | null): string {
  if (!user) return "";

  const directName = user.full_name || user.name;
  if (directName && directName.trim()) return directName.trim();

  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

function safeString(value: unknown): string {
  return String(value ?? "").trim();
}

export async function getConsultations(params?: {
  status?: string;
  search?: string;
  rhu_id?: number;
  per_page?: number;
}): Promise<Consultation[]> {
  const res = await apiClient.get("/admin/consultations", {
    params: {
      ...params,
      status: params?.status === "all" ? undefined : params?.status,
      per_page: params?.per_page ?? 100,
    },
  });

  return normalizeArray(res.data);
}

export async function getConsultation(id: string | number): Promise<Consultation> {
  const res = await apiClient.get(`/admin/consultations/${id}`);
  return normalizeOne(res.data);
}

export async function saveSoap(
  id: string | number,
  payload: SoapPayload
): Promise<Consultation> {
  const res = await apiClient.put(`/admin/consultations/${id}/soap`, payload);
  return normalizeOne(res.data);
}

export async function completeConsultation(
  id: string | number,
  payload?: SoapPayload
): Promise<Consultation> {
  const res = await apiClient.patch(
    `/admin/consultations/${id}/complete`,
    payload ?? {}
  );

  return normalizeOne(res.data);
}

export async function cancelConsultation(
  id: string | number,
  notes?: string
): Promise<Consultation> {
  return saveSoap(id, {
    status: "cancelled",
    notes: notes || "Consultation cancelled by RHU staff.",
  });
}

export async function summarizeConsultation(
  id: string | number,
  payload: AiSummaryPayload
): Promise<AiSummaryResponse> {
  const res = await apiClient.post(`/ai/summarize-consultation/${id}`, payload);

  return {
    message: res.data?.message,
    data: res.data?.data ?? res.data,
    consultation:
      res.data?.consultation ??
      res.data?.data?.consultation ??
      normalizeOne(res.data),
  };
}

function resolveConsultationUser(item: Consultation): ConsultationUser | null {
  return (
    item.resident ??
    item.patient ??
    item.user ??
    item.appointment?.resident ??
    item.appointment?.patient ??
    item.appointment?.user ??
    null
  );
}

export function getPatientName(item: Consultation): string {
  const user = resolveConsultationUser(item);

  const name = buildFullName(user);

  if (name) return name;

  // Fallback so mobile-booked / minimally-registered patients never render blank.
  if (user?.email?.trim()) return user.email.trim();
  if (user?.mobile_number?.trim()) return user.mobile_number.trim();

  return `Patient #${
    item.user_id ?? item.patient_id ?? item.appointment?.user_id ?? "—"
  }`;
}

function computeAge(birthday?: string | null, asOf?: string | null): number | null {
  if (!birthday) return null;

  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;

  const ref = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(ref.getTime())) return null;

  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}

export function getPatientAgeSex(item: Consultation): string {
  const user = resolveConsultationUser(item) as any;

  const age = computeAge(
    user?.birthday ?? user?.birth_date ?? user?.date_of_birth ?? null,
    getConsultationDate(item)
  );

  const sexRaw = safeString(user?.sex ?? user?.gender);
  const sex = sexRaw
    ? sexRaw.charAt(0).toUpperCase() + sexRaw.slice(1).toLowerCase()
    : "";

  if (age !== null && sex) return `${age} · ${sex}`;
  if (age !== null) return String(age);
  if (sex) return sex;

  return "—";
}

export function getPatientBarangay(item: Consultation): string {
  const user = resolveConsultationUser(item) as any;

  const appointmentResident = item.appointment?.resident as any;

  const barangay =
    user?.barangay?.name ??
    user?.barangay ??
    user?.resident_profile?.barangay?.name ??
    appointmentResident?.barangay ??
    "";

  return safeString(barangay) || "—";
}

export function getFollowupStatus(item: Consultation): string {
  // Follow-up reminders are a later phase; render gracefully if a field exists.
  const raw =
    (item as any).follow_up_status ??
    ((item as any).follow_up_date ? "scheduled" : null);

  if (!raw) return "None";

  return String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
}

export function getPatientMobile(item: Consultation): string {
  const user =
    item.resident ??
    item.patient ??
    item.user ??
    item.appointment?.resident ??
    item.appointment?.patient ??
    item.appointment?.user;

  return user?.mobile_number || "No mobile number";
}

export function getDoctorName(item: Consultation): string {
  const user =
    item.attendant ??
    item.doctor ??
    item.staff ??
    item.provider ??
    item.appointment?.handler ??
    item.appointment?.doctor;

  const name = buildFullName(user);

  return (
    name ||
    `RHU Staff${
      item.attended_by || item.doctor_id
        ? ` #${item.attended_by ?? item.doctor_id}`
        : ""
    }`
  );
}

export function getConsultationDate(item: Consultation): string | null {
  return (
    item.consultation_date ??
    item.date ??
    item.started_at ??
    item.created_at ??
    null
  );
}

export function getChiefComplaint(item: Consultation): string {
  return (
    safeString(item.chief_complaint) ||
    safeString(item.subjective) ||
    safeString(item.appointment?.reason) ||
    safeString(item.appointment?.symptoms) ||
    "No chief complaint recorded"
  );
}

export function getDiagnosisText(item: Consultation): string {
  return (
    safeString(item.diagnosis) ||
    safeString(item.assessment) ||
    "No diagnosis yet"
  );
}

export function getTreatmentText(item: Consultation): string {
  return (
    safeString(item.treatment) ||
    safeString(item.treatment_plan) ||
    safeString(item.plan) ||
    "No treatment plan yet"
  );
}

export function getConsultationStatusLabel(status?: string | null): string {
  switch (status) {
    case "open":
      return "Open";
    case "ongoing":
      return "Ongoing";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Open";
  }
}

function indicator(
  key: string,
  label: string,
  tone: Tone,
  nextStep: string
): ConsultationIndicator {
  return {
    key,
    label,
    tone,
    status: key,
    nextStep,
  };
}

function hasSoapText(item: Consultation): boolean {
  return Boolean(
    safeString(item.subjective) ||
      safeString(item.objective) ||
      safeString(item.assessment) ||
      safeString(item.plan) ||
      safeString(item.diagnosis) ||
      safeString(item.treatment) ||
      safeString(item.treatment_plan)
  );
}

function hasRequiredSoapForCompletion(item: Consultation): boolean {
  return Boolean(
    safeString(item.subjective) &&
      (safeString(item.assessment) || safeString(item.diagnosis)) &&
      (safeString(item.plan) || safeString(item.treatment) || safeString(item.treatment_plan))
  );
}

function rawSource(item: Consultation): string {
  return normalizeLifecycleValue(
    (item as any).source ??
      (item as any).visit_type ??
      (item as any).encounter_type ??
      (item as any).appointment?.type ??
      (item as any).appointment?.appointment_type ??
      ""
  );
}

export function getConsultationSourceIndicator(item: Consultation): ConsultationIndicator {
  const source = rawSource(item);

  if (
    source.includes("tele") ||
    item.telemedicine_session_id ||
    item.telemedicine_request_id ||
    (item as any).telemedicine_session ||
    (item as any).telemedicine_request
  ) {
    return indicator(
      "telemedicine",
      "Telemedicine",
      "violet",
      "Confirm the video session status and SOAP documentation."
    );
  }

  if (source.includes("follow") || (item as any).follow_up_id) {
    return indicator(
      "follow_up",
      "Follow-up",
      "brand",
      "Review the prior plan and update the follow-up result."
    );
  }

  if (item.appointment_id || item.appointment || source.includes("appointment")) {
    return indicator(
      "appointment",
      "Appointment",
      "info",
      "Continue care from the approved appointment record."
    );
  }

  return indicator(
    "walk_in",
    "Walk-in",
    "slate",
    "Continue care from the RHU walk-in workflow."
  );
}

function rawQueueTicket(item: Consultation): any | null {
  return (
    item.queue_ticket ??
    (item as any).queueTicket ??
    item.appointment?.queue_ticket ??
    (item.appointment as any)?.queueTicket ??
    null
  );
}

function rawQueueStatus(item: Consultation): string {
  const ticket = rawQueueTicket(item);

  return normalizeLifecycleValue(
    ticket?.status ??
      (item as any).queue_status ??
      (item as any).visit_state ??
      (item as any).queue_state ??
      ""
  );
}

export function getConsultationQueueIndicator(item: Consultation): ConsultationIndicator {
  const status = rawQueueStatus(item);

  switch (status) {
    case "waiting":
      return indicator("waiting", "Waiting", "warning", "Call patient from Queue.");
    case "called":
    case "now_calling":
      return indicator("called", "Called", "info", "Start consultation.");
    case "in_service":
    case "serving":
      return indicator("in_service", "In Service", "info", "Complete SOAP.");
    case "completed":
    case "served":
    case "done":
      return indicator(
        "served",
        "Served",
        "success",
        "Record is finalized and stored in History."
      );
    case "no_show":
      return indicator(
        "no_show",
        "No Show",
        "danger",
        "Patient did not respond. Create a new queue ticket if they return."
      );
    case "cancelled":
      return indicator(
        "cancelled",
        "Cancelled",
        "danger",
        "Queue ticket was cancelled. Add a new ticket only after staff review."
      );
    case "skipped":
      return indicator(
        "skipped",
        "Skipped",
        "warning",
        "Return patient to waiting if they are ready."
      );
    default:
      return indicator("not_in_queue", "Not in queue", "slate", "Add patient to queue.");
  }
}

export function getConsultationStageIndicator(item: Consultation): ConsultationIndicator {
  const status = normalizeLifecycleValue(item.status);

  if (status === "cancelled" || status === "rejected") {
    return indicator(
      "cancelled",
      "Cancelled",
      "danger",
      "No active action unless staff reopens or creates a new request."
    );
  }

  if (status === "completed") {
    return indicator(
      "completed",
      "Completed",
      "success",
      "SOAP finalized. Review prescription, lab request, or follow-up if needed."
    );
  }

  if (!hasSoapText(item) && !item.started_at && !item.first_attended_at) {
    return indicator(
      "not_started",
      "Not Started",
      "warning",
      "Open SOAP and begin documentation."
    );
  }

  if (consultationNeedsSoap(item)) {
    return indicator(
      "for_soap",
      "For SOAP",
      "warning",
      "Open SOAP and complete missing fields."
    );
  }

  if (hasRequiredSoapForCompletion(item)) {
    return indicator(
      "ready_to_complete",
      "Ready to Complete",
      "brand",
      "Review diagnosis and treatment before completion."
    );
  }

  return indicator(
    "in_consultation",
    "In Consultation",
    "info",
    "Continue consultation and complete SOAP."
  );
}

export function getSoapStatusIndicator(item: Consultation): ConsultationIndicator {
  const status = normalizeLifecycleValue(item.status);

  if (status === "completed") {
    return indicator(
      "soap_finalized",
      "SOAP Finalized",
      "success",
      "SOAP is finalized and included in reports."
    );
  }

  if (!hasSoapText(item)) {
    return indicator(
      "no_soap",
      "No SOAP yet",
      "warning",
      "Open SOAP and document the visit."
    );
  }

  if (consultationNeedsSoap(item)) {
    return indicator(
      "soap_needs_review",
      "SOAP Needs Review",
      "warning",
      "Complete the missing SOAP fields before finalizing."
    );
  }

  return indicator(
    "soap_draft",
    "SOAP Draft",
    "info",
    "Review the SOAP draft and complete the consultation when ready."
  );
}

function prescriptionsOf(item: Consultation): any[] {
  const direct = Array.isArray(item.prescriptions) ? item.prescriptions : [];
  const nested = Array.isArray((item as any).lab_requests)
    ? (item as any).lab_requests
    : [];

  return [...direct, ...nested];
}

export function getAfterCareStatusIndicator(item: Consultation): ConsultationIndicator {
  const records = prescriptionsOf(item);
  const hasExpiredLab = records.some((record) => {
    const type = normalizeLifecycleValue(record?.form_type ?? record?.type);
    if (type !== "lab_request") return false;

    const lifecycle = getRecordLifecycleStatus(record as any, {
      module: "lab_request",
      dateFields: ["available_date", "request_date", "created_at"],
      endDateFields: ["available_date", "valid_until"],
      completedStatuses: ["released", "completed"],
      deletedStatuses: ["voided", "cancelled", "deleted"],
      pendingStatuses: ["active", "issued", "pending", "draft"],
    });

    return lifecycle.key === "expired";
  });

  if (hasExpiredLab || (item as any).lab_request_expired) {
    return indicator(
      "lab_request_expired",
      "Lab request expired",
      "warning",
      "Review lab request."
    );
  }

  const hasPendingLab = records.some((record) => {
    const type = normalizeLifecycleValue(record?.form_type ?? record?.type);
    const status = normalizeLifecycleValue(record?.status);
    return (
      type === "lab_request" &&
      !["released", "completed", "cancelled", "voided"].includes(status)
    );
  });

  if (hasPendingLab || (item as any).lab_request_pending) {
    return indicator(
      "lab_request_pending",
      "Lab request pending",
      "warning",
      "Lab request pending. Release lab request PDF or update lab schedule."
    );
  }

  const hasPrescription = records.some((record) => {
    const type = normalizeLifecycleValue(record?.form_type ?? record?.type);
    const status = normalizeLifecycleValue(record?.status);
    return type !== "lab_request" && !["cancelled", "voided"].includes(status);
  });

  if (hasPrescription || safeString(item.prescribed_drugs) || item.prescription_path) {
    return indicator(
      "prescription_created",
      "Prescription created",
      "success",
      "Review released prescription and dispensing status if needed."
    );
  }

  if ((item as any).referral_needed || safeString((item as any).referral_reason)) {
    return indicator(
      "referral_needed",
      "Referral needed",
      "warning",
      "Prepare referral details and guide the patient."
    );
  }

  const followUpLifecycle = getRecordLifecycleStatus(item as any, {
    module: "follow_up",
    dateFields: ["follow_up_date"],
    completedStatuses: ["completed", "done", "contacted"],
  });

  if (item.follow_up_date || (item as any).follow_up_status) {
    if (followUpLifecycle.key === "overdue_follow_up") {
      return indicator(
        "overdue_follow_up",
        "Overdue Follow-up",
        "warning",
        "Follow-up overdue. Contact patient or reschedule."
      );
    }

    return indicator(
      "follow_up_scheduled",
      "Follow-up scheduled",
      "brand",
      "Review the follow-up reminder and patient instructions."
    );
  }

  return indicator(
    "no_after_care",
    "No after-care",
    "slate",
    "No prescription, lab request, follow-up, or referral recorded."
  );
}

export function getConsultationLifecycle(item: Consultation): LifecycleStatus {
  const status = normalizeLifecycleValue(item.status);
  const activeStatuses = [
    "",
    "open",
    "ongoing",
    "in_consultation",
    "ready_to_complete",
    "for_soap",
    "draft",
  ];

  if (activeStatuses.includes(status)) {
    return {
      key: "active",
      label: "Active Consultation",
      tone: "info",
      reason: "This consultation is still open for SOAP documentation.",
      nextStep: "Complete SOAP documentation.",
      date: getConsultationDate(item),
      isHistory: false,
    };
  }

  const lifecycle = getRecordLifecycleStatus(item as any, {
    module: "consultation",
    dateFields: ["completed_at", "consultation_date", "date", "created_at"],
    completedStatuses: ["completed"],
    deletedStatuses: ["cancelled", "deleted", "voided"],
    activeLabel: "Active Consultation",
    expiredLabel: "History",
  });

  if (status === "completed" && lifecycle.key === "completed") {
    return {
      ...lifecycle,
      label: "History",
      tone: "success",
      reason: "Completed consultation is finalized and kept for records and reports.",
      nextStep: "Record is finalized and stored in History.",
      isHistory: true,
    };
  }

  return lifecycle;
}

export function getConsultationMapping(item: Consultation): ConsultationMapping {
  const source = getConsultationSourceIndicator(item);
  const queue = getConsultationQueueIndicator(item);
  const stage = getConsultationStageIndicator(item);
  const soap = getSoapStatusIndicator(item);
  const afterCare = getAfterCareStatusIndicator(item);

  return {
    source,
    queue,
    stage,
    soap,
    afterCare,
    lifecycle: getConsultationLifecycle(item),
  };
}

// ── Slice B1: SOAP draft stage + TTL (visibility only) + ITR snapshot ───────

const DRAFT_TTL_MS = 60 * 60 * 1000; // 1 hour active window — indicator only, never deletion

export type ConsultationStageKey =
  | "draft"
  | "ongoing"
  | "completed"
  | "cancelled"
  | "expired";

function draftStartReference(item: Consultation): string | null {
  return (
    item.first_attended_at ||
    item.started_at ||
    item.created_at ||
    getConsultationDate(item) ||
    null
  );
}

export function getDraftExpiry(item: Consultation): Date | null {
  const ref = draftStartReference(item);
  if (!ref) return null;
  const d = new Date(ref);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + DRAFT_TTL_MS);
}

export function isDraftExpired(item: Consultation): boolean {
  const s = String(item.status || "").toLowerCase();
  if (s === "completed" || s === "cancelled") return false;
  const exp = getDraftExpiry(item);
  return exp ? Date.now() > exp.getTime() : false;
}

export function getConsultationStage(item: Consultation): {
  key: ConsultationStageKey;
  label: string;
} {
  const s = String(item.status || "").toLowerCase();
  if (s === "completed") return { key: "completed", label: "Completed" };
  if (s === "cancelled") return { key: "cancelled", label: "Cancelled" };
  if (isDraftExpired(item)) return { key: "expired", label: "Expired Draft" };
  if (s === "ongoing" || item.draft_saved_at) {
    return { key: "ongoing", label: "Ongoing" };
  }
  return { key: "draft", label: "Draft" };
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function notProvided(value: unknown): string {
  const s = String(value ?? "").trim();
  return s || "Not provided";
}

function computeAgeYears(
  birth?: string | null,
  asOf?: string | null
): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const ref = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export interface ItrSnapshotView {
  fullName: string;
  age: string;
  sex: string;
  birthdate: string;
  barangay: string;
  address: string;
  contact: string;
  guardian: string;
  philhealth: string;
  allergies: string;
  pastMedicalHistory: string;
  maintenanceMedications: string;
  familyHistory: string;
  personalSocialHistory: string;
  appointmentReason: string;
  queueLabel: string;
  firstAttendedAt: string;
  attendingStaff: string;
}

/**
 * Build the Patient ITR Snapshot for the SOAP page. Prefers the live resident
 * profile; falls back to the captured itr_snapshot; every field degrades to
 * "Not provided" so missing data never renders blank or crashes.
 */
export function getItrSnapshot(item: Consultation): ItrSnapshotView {
  const appointment: any = item.appointment ?? null;
  const appointmentUser: any =
    appointment?.resident ?? appointment?.patient ?? appointment?.user ?? null;
  const user: any = item.resident ?? item.patient ?? item.user ?? appointmentUser ?? null;
  const profile: any = user?.resident_profile ?? user?.residentProfile ?? null;
  const appointmentProfile: any =
    appointmentUser?.resident_profile ?? appointmentUser?.residentProfile ?? null;
  const snap: any = item.itr_snapshot ?? {};

  const birth =
    user?.birthday ??
    user?.birth_date ??
    profile?.birth_date ??
    profile?.birthdate ??
    profile?.date_of_birth ??
    snap?.birth_date ??
    null;

  const age = computeAgeYears(birth, getConsultationDate(item));

  const sexRaw =
    profile?.sex ?? profile?.gender ?? user?.sex ?? user?.gender ?? snap?.sex;

  const barangay =
    profile?.barangay?.name ??
    profile?.barangay ??
    (typeof user?.barangay === "string" ? user.barangay : user?.barangay?.name) ??
    snap?.barangay;

  const contact =
    user?.mobile_number ??
    profile?.mobile_number ??
    profile?.contact_number ??
    profile?.phone_number ??
    snap?.mobile_number;

  const philhealth =
    profile?.philhealth_number ??
    profile?.philhealth_no ??
    profile?.philhealth_pin ??
    snap?.philhealth;

  const queueTicket: any = item.appointment?.queue_ticket;
  const queueLabel = queueTicket
    ? `${queueTicket.ticket_number ?? "—"}${
        queueTicket.status ? ` · ${queueTicket.status}` : ""
      }`
    : "Not provided";

  return {
    fullName: notProvided(getPatientName(item)),
    age: age !== null ? `${age} yrs` : "Not provided",
    sex: sexRaw
      ? String(sexRaw).charAt(0).toUpperCase() +
        String(sexRaw).slice(1).toLowerCase()
      : "Not provided",
    birthdate: birth ? formatConsultationDate(birth) : "Not provided",
    barangay: notProvided(barangay),
    address: notProvided(
      appointment?.address ??
        appointment?.patient_address ??
        profile?.address ??
        appointmentProfile?.address ??
        snap?.address
    ),
    contact: notProvided(contact),
    guardian: notProvided(profile?.guardian_name ?? snap?.guardian_name),
    philhealth: notProvided(philhealth),
    allergies: notProvided(profile?.allergies ?? snap?.allergies),
    pastMedicalHistory: notProvided(
      profile?.past_medical_history ??
        profile?.medical_history ??
        snap?.past_medical_history
    ),
    maintenanceMedications: notProvided(
      profile?.maintenance_medications ?? snap?.maintenance_medications
    ),
    familyHistory: notProvided(
      profile?.family_history ?? snap?.family_history
    ),
    personalSocialHistory: notProvided(
      profile?.personal_social_history ?? snap?.personal_social_history
    ),
    appointmentReason: notProvided(
      item.appointment?.reason ?? item.chief_complaint
    ),
    queueLabel,
    firstAttendedAt: item.first_attended_at
      ? formatDateTime(item.first_attended_at)
      : "Not provided",
    attendingStaff: notProvided(getDoctorName(item)),
  };
}

export function getConsultationNextStep(item: Consultation): string {
  const mapping = getConsultationMapping(item);

  if (normalizeLifecycleValue(item.status) === "completed") {
    return "Record is finalized and stored in History.";
  }

  if (item.status === "cancelled") return "Record is cancelled.";

  const appointmentStatus = normalizeLifecycleValue(item.appointment?.status);

  if (mapping.source.key === "appointment" && appointmentStatus === "pending") {
    return "Approve appointment first.";
  }

  if (
    mapping.source.key !== "telemedicine" &&
    mapping.queue.key === "not_in_queue"
  ) {
    return "Add patient to queue.";
  }

  if (mapping.queue.key === "in_service") return "Complete SOAP documentation.";
  if (mapping.queue.key === "waiting") return "Call patient from Queue.";
  if (mapping.queue.key === "called") return "Start consultation.";

  const hasAssessment = Boolean(
    safeString(item.assessment) || safeString(item.diagnosis)
  );

  const hasPlan = Boolean(
    safeString(item.plan) || safeString(item.treatment) || safeString(item.treatment_plan)
  );

  if (!hasAssessment && !hasPlan) {
    return "Complete SOAP.";
  }

  if (!hasAssessment) {
    return "Complete SOAP.";
  }

  if (!hasPlan) {
    return "Complete SOAP.";
  }

  if (mapping.afterCare.key === "lab_request_pending") {
    return "Review lab request.";
  }

  return "Complete SOAP.";
}

export function consultationNeedsSoap(item: Consultation): boolean {
  if (item.status === "completed" || item.status === "cancelled") {
    return false;
  }

  return !(
    safeString(item.subjective) &&
    (safeString(item.assessment) || safeString(item.diagnosis)) &&
    (safeString(item.plan) || safeString(item.treatment))
  );
}

export function buildConsultationStats(items: Consultation[]): ConsultationStats {
  return {
    total: items.length,
    open: items.filter((item) => item.status === "open").length,
    ongoing: items.filter((item) => item.status === "ongoing").length,
    completed: items.filter((item) => item.status === "completed").length,
    cancelled: items.filter((item) => item.status === "cancelled").length,
    needsSoap: items.filter(consultationNeedsSoap).length,
    withDiagnosis: items.filter(
      (item) => safeString(item.diagnosis) || safeString(item.assessment)
    ).length,
  };
}

export function formatConsultationDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatLongConsultationDate(value?: string | null): string {
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
