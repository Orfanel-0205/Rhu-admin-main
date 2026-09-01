// src/services/telemedicine.ts

import apiClient from "../lib/apiClient";

export type TelemedicineRequestStatus =
  | "pending"
  | "screening"
  | "screened"
  | "endorsed_to_doctor"
  | "scheduled"
  | "rejected"
  | "cancelled"
  | "completed";

export type TelemedicineSessionStatus =
  | "scheduled"
  | "waiting"
  | "active"
  | "paused"
  | "ended"
  | "no_show"
  | "cancelled";

export type TelemedicineUrgency = "routine" | "urgent" | "emergency";

export interface TelemedicinePatient {
  id?: number;
  user_id?: number;
  name?: string;
  barangay?: string | null;
}

export interface TelemedicineDoctor {
  id?: number;
  user_id?: number;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
}

export interface TelemedicineSessionNote {
  id?: number;
  session_id?: number;
  recorded_by?: number;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  primary_diagnosis_code?: string | null;
  primary_diagnosis_label?: string | null;
  medications?: any[] | null;
  is_finalized?: boolean;
  finalized_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TelemedicineSession {
  id: number;
  request_id?: number;
  assigned_doctor_id?: number | null;
  bhw_companion_id?: number | null;
  status: TelemedicineSessionStatus;
  session_mode?: string;
  session_token?: string | null;
  session_link?: string | null;
  room_id?: string | null;
  room_token?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  actual_duration_minutes?: number | null;
  consultation_id?: number | null;

  schedule?: {
    date?: string | null;
    time?: string | null;
    estimated_duration_minutes?: number | null;
  };

  assigned_doctor?: TelemedicineDoctor | null;
  consultation?: {
    id?: number;
  } | null;

  notes?: TelemedicineSessionNote | null;
  request?: any;

  // Backend-provided configurable video provider (Jitsi / JaaS / self-hosted).
  video?: TelemedicineVideoConfig | null;
}

export interface TelemedicineVideoConfig {
  provider?: string;
  domain?: string;
  room_name?: string;
  room?: string;
  room_url?: string;
  join_url?: string;
  jwt?: string | null;
  jwt_enabled?: boolean;
  is_demo?: boolean;
  demo_warning?: string | null;
  configured?: boolean;
}

export interface EndTelemedicineResult {
  message?: string;
  consultation_id?: number | null;
  redirect_to?: string;
  can_finalize?: boolean;
  telemedicine_session?: TelemedicineSession;
  consultation?: any;
  appointment?: any;
}

export interface TelemedicineRequest {
  id: number;
  status: TelemedicineRequestStatus;
  urgency_level?: TelemedicineUrgency;
  chief_complaint?: string | null;
  symptoms?: string[] | string | null;
  additional_notes?: string | null;

  resident_profile_id?: number;
  requested_by_id?: number;
  rhu_id?: number;
  appointment_id?: number | null;

  resident?: TelemedicinePatient | null;
  requested_by?: any;
  rhu?: any;
  queue_ticket?: any;
  screening?: {
    screening_notes?: string | null;
    screened_at?: string | null;
    screened_by?: any;
    vitals?: {
      temperature?: string | null;
      blood_pressure?: string | null;
      heart_rate?: string | null;
      respiratory_rate?: string | null;
    } | null;
  } | null;

  endorsement?: {
    endorsed_to?: {
      id?: number;
      name?: string | null;
    } | null;
    endorsed_at?: string | null;
  } | null;

  rejection_reason?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;

  session?: TelemedicineSession | null;

  created_at?: string;
  updated_at?: string;
}

export interface TelemedicineStats {
  total: number;
  pending: number;
  scheduled: number;
  active: number;
  completed: number;
  urgent: number;
  emergency: number;
}

export interface SaveTelemedicineNotesPayload {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  primary_diagnosis_code?: string | null;
  primary_diagnosis_label?: string | null;
  medications?: any[] | null;
  finalize?: boolean;

  additional_notes?: string | null;
  rhu_staff_name?: string | null;
}

export interface TelemedicineAiSummary {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  diagnosis?: string;
  treatment?: string;
}

interface MeResponse {
  user_id?: number;
  id?: number;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  user?: any;
  data?: any;
}

function extractArray<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function extractData<T>(payload: any): T {
  return payload?.data ?? payload;
}

function extractMe(payload: MeResponse): any {
  return payload?.user ?? payload?.data ?? payload;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentTimeHHMM(): string {
  const now = new Date();

  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
}

function safeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function buildTelemedicineRoomUrl(session: TelemedicineSession): string {
  return `/telemedicine/room/${session.id}`;
}

export interface ResolvedJitsiConfig {
  configured: boolean;
  provider: string;
  domain: string;
  roomName: string;
  jwt: string | null;
  isDemo: boolean;
  demoWarning: string | null;
  url: string;
}

/**
 * Resolve the video provider config for a session.
 *
 * Prefers the backend-provided `video` block (configurable provider + JWT).
 * Only falls back to a local room name if the backend did not send one; it
 * NEVER silently defaults to public meet.jit.si — an unconfigured provider is
 * reported via `configured: false` so the UI can show a clean error.
 */
export function getJitsiConfig(session: TelemedicineSession): ResolvedJitsiConfig {
  const video = session.video || null;

  const provider = String(video?.provider || "").trim();
  const domain = String(video?.domain || "").trim();
  const isDemo = Boolean(video?.is_demo) || provider === "meet_public_demo";

  const roomName =
    String(
      video?.room_name ||
        video?.room ||
        session.room_id ||
        session.session_token ||
        `kaagapay-rhu1-session-${session.id}`
    ).trim();

  const jwt = video?.jwt ?? null;

  // The provider is usable when the backend says so, or when we at least have a
  // real domain to embed. Missing domain => not configured.
  const configured =
    video?.configured === true || (Boolean(domain) && Boolean(roomName));

  const safeRoom = roomName.replace(/[^a-zA-Z0-9_\-/]/g, "");

  let url =
    String(video?.join_url || video?.room_url || "").trim() ||
    (domain
      ? `https://${domain}/${safeRoom}#config.prejoinPageEnabled=false&config.disableDeepLinking=true`
      : "");

  /*
   * The backend now returns join_url with the token already in the correct
   * place, so normally nothing is appended here.
   *
   * This fallback only runs for a URL that arrived without one, and it inserts
   * the JWT BEFORE the '#' fragment. The previous version appended
   * "?jwt=..." to the end of a URL that already had "#config...", which made
   * the token part of the fragment — never sent to the server, so an
   * authenticated JaaS tenant rejected the join.
   */
  if (url && jwt && !url.includes("jwt=")) {
    const hashAt = url.indexOf("#");
    const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
    const fragment = hashAt >= 0 ? url.slice(hashAt) : "";
    const separator = base.includes("?") ? "&" : "?";

    url = `${base}${separator}jwt=${encodeURIComponent(jwt)}${fragment}`;
  }

  return {
    configured,
    provider: provider || "unknown",
    domain,
    roomName: safeRoom,
    jwt,
    isDemo,
    demoWarning: video?.demo_warning ?? null,
    url,
  };
}

/**
 * Legacy helper kept for compatibility — now backed by getJitsiConfig and the
 * backend video provider. Returns an embeddable URL (empty string if the
 * provider is not configured).
 */
export function buildExternalJitsiUrl(session: TelemedicineSession): string {
  if (session.session_link && session.session_link.startsWith("http")) {
    return session.session_link;
  }

  return getJitsiConfig(session).url;
}

export async function getCurrentUserId(): Promise<number> {
  const res = await apiClient.get<MeResponse>("/me");
  const user = extractMe(res.data);

  const id = Number(user?.user_id ?? user?.id);

  if (!id) {
    throw new Error("Could not determine the current RHU staff user ID.");
  }

  return id;
}

export type TelemedicineBoard =
  | "active"
  | "needs_soap"
  | "completed"
  | "history"
  | "all";

export async function getTelemedicineRequests(params?: {
  rhu_id?: number | string;
  status?: string;
  urgency_level?: string;
  date?: string;
  board?: TelemedicineBoard;
  include_archived?: boolean;
}): Promise<TelemedicineRequest[]> {
  const rawRhu = Number(params?.rhu_id || 0);

  const res = await apiClient.get("/telemedicine/requests", {
    params: {
      rhu_id: rawRhu > 0 ? rawRhu : undefined,
      status: params?.status === "all" ? undefined : params?.status,
      urgency_level:
        params?.urgency_level === "all" ? undefined : params?.urgency_level,
      date: params?.date,
      board: params?.board || undefined,
      include_archived: params?.include_archived ? "true" : undefined,
      per_page: 100,
    },
  });

  return extractArray<TelemedicineRequest>(res.data);
}

export async function getTelemedicineRequest(
  id: string | number
): Promise<TelemedicineRequest> {
  const res = await apiClient.get(`/telemedicine/requests/${id}`);
  return extractData<TelemedicineRequest>(res.data);
}

export async function screenAndScheduleNow(
  requestId: number,
  doctorId: number
): Promise<TelemedicineSession> {
  const res = await apiClient.patch(`/telemedicine/requests/${requestId}/screen`, {
    decision: "approve",
    screening_notes: "Approved for immediate online consultation by RHU staff.",
    schedule_now: true,
    assigned_doctor_id: doctorId,
    scheduled_date: todayDate(),
    scheduled_time: currentTimeHHMM(),
    session_mode: "in_app",
  });

  const request = extractData<TelemedicineRequest>(res.data);
  const session = request?.session;

  if (!session?.id) {
    throw new Error(
      "Telemedicine request was approved, but no video session was returned."
    );
  }

  return session;
}

export async function rejectTelemedicineRequest(
  requestId: number,
  reason: string
): Promise<TelemedicineRequest> {
  const res = await apiClient.patch(`/telemedicine/requests/${requestId}/screen`, {
    decision: "reject",
    screening_notes: reason,
    rejection_reason: reason,
  });

  return extractData<TelemedicineRequest>(res.data);
}

export async function cancelTelemedicineRequest(
  requestId: number,
  reason: string
): Promise<void> {
  await apiClient.delete(`/telemedicine/requests/${requestId}`, {
    data: {
      cancellation_reason: reason,
    },
  });
}

export async function getTelemedicineSession(
  sessionId: number | string
): Promise<TelemedicineSession> {
  const res = await apiClient.get(`/telemedicine/sessions/${sessionId}`);
  return extractData<TelemedicineSession>(res.data);
}

/**
 * Tell the resident the telemedicine room is ready (stored notification + push).
 * Jitsi never notifies the resident, so RHU staff must trigger this explicitly.
 */
export async function notifyTelemedicinePatient(
  sessionId: number
): Promise<{ message: string; notified: boolean; push_sent: boolean }> {
  const res = await apiClient.post(
    `/telemedicine/sessions/${sessionId}/notify-patient`
  );
  return res.data as { message: string; notified: boolean; push_sent: boolean };
}

export async function startTelemedicineSessionNow(
  sessionId: number
): Promise<TelemedicineSession> {
  try {
    await apiClient.patch(`/telemedicine/sessions/${sessionId}/status`, {
      status: "waiting",
    });
  } catch (error: any) {
    const message = String(error?.response?.data?.message || error?.message || "");

    if (
      !message.includes("waiting") &&
      !message.includes("active") &&
      !message.includes("transition") &&
      !message.includes("already")
    ) {
      throw error;
    }
  }

  try {
    const res = await apiClient.patch(`/telemedicine/sessions/${sessionId}/status`, {
      status: "active",
    });

    return extractData<TelemedicineSession>(res.data);
  } catch (error: any) {
    const message = String(error?.response?.data?.message || error?.message || "");

    if (
      message.includes("transition") ||
      message.includes("active") ||
      message.includes("already")
    ) {
      return getTelemedicineSession(sessionId);
    }

    throw error;
  }
}

export async function endTelemedicineSession(
  sessionId: number
): Promise<TelemedicineSession> {
  const res = await apiClient.patch(`/telemedicine/sessions/${sessionId}/status`, {
    status: "ended",
  });

  return extractData<TelemedicineSession>(res.data);
}

export interface EndTelemedicineSoap {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  diagnosis?: string;
  treatment?: string;
  notes?: string;
}

/**
 * End a telemedicine session from the room and make the consultation the source
 * of truth.
 *
 * finalize = false -> save SOAP draft + end video, consultation stays editable.
 * finalize = true  -> finalize SOAP and complete consultation + appointment +
 *                     telemedicine request + session.
 */
export async function endTelemedicineSessionWithSoap(
  sessionId: number,
  finalize: boolean,
  soap: EndTelemedicineSoap
): Promise<EndTelemedicineResult> {
  const res = await apiClient.patch(
    `/telemedicine/sessions/${sessionId}/end`,
    {
      finalize,
      soap,
    }
  );

  const payload = res.data ?? {};

  return {
    message: payload.message,
    consultation_id:
      payload.consultation_id ??
      payload.consultation?.id ??
      payload.telemedicine_session?.consultation_id ??
      null,
    redirect_to: payload.redirect_to ?? "consultation",
    can_finalize: payload.can_finalize ?? !finalize,
    telemedicine_session: payload.telemedicine_session ?? payload.data,
    consultation: payload.consultation ?? null,
    appointment: payload.appointment ?? null,
  };
}

export async function saveTelemedicineSessionNotes(
  sessionId: number,
  payload: SaveTelemedicineNotesPayload
): Promise<TelemedicineSessionNote> {
  const res = await apiClient.put(`/telemedicine/sessions/${sessionId}/notes`, payload);
  return extractData<TelemedicineSessionNote>(res.data);
}

export async function summarizeTelemedicineSession(
  sessionId: number,
  transcript: string
): Promise<TelemedicineAiSummary> {
  const res = await apiClient.post(`/ai/summarize-telemedicine-session/${sessionId}`, {
    transcript,
  });

  const payload = res.data?.data ?? res.data?.summary ?? res.data;

  return {
    subjective:
      payload?.subjective ??
      payload?.soap?.subjective ??
      payload?.S ??
      "",
    objective:
      payload?.objective ??
      payload?.soap?.objective ??
      payload?.O ??
      "",
    assessment:
      payload?.assessment ??
      payload?.soap?.assessment ??
      payload?.A ??
      "",
    plan:
      payload?.plan ??
      payload?.soap?.plan ??
      payload?.P ??
      "",
    diagnosis:
      payload?.diagnosis ??
      payload?.primary_diagnosis_label ??
      payload?.assessment ??
      "",
    treatment:
      payload?.treatment ??
      payload?.plan ??
      "",
  };
}

export function getTelemedicinePatientName(item: TelemedicineRequest): string {
  return item.resident?.name || `Patient Request #${item.id}`;
}

export function getTelemedicineComplaint(item: TelemedicineRequest): string {
  if (item.chief_complaint?.trim()) return item.chief_complaint.trim();

  if (Array.isArray(item.symptoms) && item.symptoms.length > 0) {
    return item.symptoms.join(", ");
  }

  if (typeof item.symptoms === "string" && item.symptoms.trim()) {
    return item.symptoms.trim();
  }

  return item.additional_notes?.trim() || "No complaint recorded.";
}

export function getTelemedicineUrgencyLabel(
  urgency?: string | null
): string {
  switch (urgency) {
    case "emergency":
      return "Emergency";
    case "urgent":
      return "Urgent";
    default:
      return "Routine";
  }
}

export function getTelemedicineRequestStatusLabel(
  status?: string | null
): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "screening":
      return "Screening";
    case "screened":
      return "Screened";
    case "endorsed_to_doctor":
      return "Endorsed to Doctor";
    case "scheduled":
      return "Scheduled";
    case "completed":
      return "Completed";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return "Pending";
  }
}

export function getTelemedicineSessionStatusLabel(
  status?: string | null
): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "waiting":
      return "Waiting";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "ended":
      return "Ended";
    case "no_show":
      return "No Show";
    case "cancelled":
      return "Cancelled";
    default:
      return "No session";
  }
}

export function getTelemedicineSessionLabel(
  session?: TelemedicineSession | null
): string {
  if (!session) return "No session yet";

  const date = session.schedule?.date || "";
  const time = session.schedule?.time || "";

  if (!date && !time) {
    return getTelemedicineSessionStatusLabel(session.status);
  }

  return `${date} ${String(time).slice(0, 5)}`;
}

export function getSessionConsultationId(
  session?: TelemedicineSession | null
): number | null {
  const raw = session?.consultation_id ?? session?.consultation?.id ?? null;

  const id = Number(raw);

  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function startTelemedicineScreening(
  requestId: number
): Promise<TelemedicineRequest> {
  const res = await apiClient.patch(`/telemedicine/requests/${requestId}/start-screening`);
  return extractData<TelemedicineRequest>(res.data);
}

export async function endorseTelemedicineToDoctor(
  requestId: number,
  endorsedToUserId: number,
  endorsementNotes?: string
): Promise<TelemedicineRequest> {
  const res = await apiClient.post(`/telemedicine/requests/${requestId}/endorse-to-doctor`, {
    endorsed_to: endorsedToUserId,
    endorsement_notes: endorsementNotes ?? null,
  });
  return extractData<TelemedicineRequest>(res.data);
}

export function isTelemedicineRequestClosed(item: TelemedicineRequest): boolean {
  return ["completed", "rejected", "cancelled"].includes(item.status);
}

export function isTelemedicineSessionClosed(
  session?: TelemedicineSession | null
): boolean {
  if (!session) return false;
  return ["ended", "no_show", "cancelled"].includes(session.status);
}

export function getTelemedicineNextStep(item: TelemedicineRequest): string {
  if (item.status === "pending") {
    if (item.urgency_level === "emergency") {
      return "Emergency case: advise immediate RHU/ER care, then document action.";
    }

    return "Review request, then start session or reject with reason.";
  }

  if (item.status === "screened") {
    return "Create or open scheduled video session.";
  }

  if (item.status === "scheduled") {
    if (item.session?.status === "active") {
      return "Session active. Continue consultation and SOAP notes.";
    }

    if (item.session?.status === "waiting") {
      return "Room is open. Start video consultation.";
    }

    if (item.session?.status === "ended") {
      return "Session ended. Finalize SOAP notes to complete record.";
    }

    return "Open the session when staff and patient are ready.";
  }

  if (item.status === "completed") {
    return "SOAP finalized. Consultation record completed.";
  }

  if (item.status === "rejected") {
    return safeText(item.rejection_reason) || "Request rejected.";
  }

  if (item.status === "cancelled") {
    return safeText(item.cancellation_reason) || "Request cancelled.";
  }

  return "Review telemedicine request.";
}

export function buildTelemedicineStats(
  requests: TelemedicineRequest[]
): TelemedicineStats {
  return {
    total: requests.length,
    pending: requests.filter((item) => item.status === "pending").length,
    scheduled: requests.filter((item) => item.status === "scheduled").length,
    active: requests.filter((item) =>
      ["waiting", "active", "paused"].includes(String(item.session?.status || ""))
    ).length,
    completed: requests.filter((item) => item.status === "completed").length,
    urgent: requests.filter((item) => item.urgency_level === "urgent").length,
    emergency: requests.filter((item) => item.urgency_level === "emergency").length,
  };
}

export function formatTelemedicineDateTime(value?: string | null): string {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}