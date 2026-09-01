// src/components/AIChatAssistant.tsx

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Bot,
  X,
  Send,
  Loader2,
  Sparkles,
  HelpCircle,
  ExternalLink,
  History,
  Trash2,
  Plus,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Maximize2,
  Minimize2,
  GraduationCap,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { stashCmsDraft, type CmsDraft } from "../utils/cmsDraftHandoff";
import { useWebSpeechRecognition } from "../hooks/useWebSpeechRecognition";
import {
  deleteAdminChatSession,
  endAdminChatSession,
  getAdminChatSessions,
  getAdminSessionMessages,
  sendAdminChatMessage,
  type AssistantMode,
  type AdminSuggestedAction,
  type ChatMessage,
  type ChatSessionSummary,
  type TutorialCard,
} from "../services/chatbot";
import { registerTutorialListener } from "../lib/tutorialBus";
const MASCOT_SRC = "/ai-chatbot-doctor-quack.png";
const WELCOME: ChatMessage = {
  id: "welcome-admin",
  role: "assistant",
  content:
    "Hello RHU staff! I can guide you using Dashboard, Patient Registry, Queue, Appointments, Consultations, Telemedicine, E-Prescription, Team Chat, Inventory, CMS, Reports, Analytics, Heatmap, Feedback, Follow-ups, Notifications, SMS, Registration Approvals, Users, and Settings. What task do you want to do?",
  timestamp: new Date().toISOString(),
};

const QUICK_PROMPTS = [
  "Teach me how to use the Queue button",
  "How do I approve or check users?",
  "How do I post announcements to mobile?",
  "How do I send SMS to target demographics?",
  "How do I make a medicine dispensing report?",
  "Explain the dashboard analytics",
];

type ChatLanguage = "en" | "tl" | "pag";
type VoiceState = "idle" | "listening" | "processing" | "error";

const CHATBOT_LAYOUT_KEY = "ka_agapay_admin_chatbot_layout_v1";

// Launcher icon position (panelist follow-up round). Same persistence
// convention as the chat-panel layout above and langStore: plain
// localStorage keys — production app, not an artifact.
const CHATBOT_LAUNCHER_KEY = "ka_agapay_admin_chatbot_launcher_v1";
const LAUNCHER_SIZE = 58;

type LauncherPosition = { left: number; top: number };

function clampLauncherPosition(position: LauncherPosition): LauncherPosition {
  if (typeof window === "undefined") return position;

  return {
    left: clampNumber(position.left, 8, Math.max(8, window.innerWidth - LAUNCHER_SIZE - 8)),
    top: clampNumber(position.top, 8, Math.max(8, window.innerHeight - LAUNCHER_SIZE - 8)),
  };
}

function defaultLauncherPosition(): LauncherPosition {
  if (typeof window === "undefined") return { left: 24, top: 24 };

  // Matches the previous fixed spot (right: 28, bottom: 28).
  return {
    left: window.innerWidth - LAUNCHER_SIZE - 28,
    top: window.innerHeight - LAUNCHER_SIZE - 28,
  };
}

function readSavedLauncherPosition(): LauncherPosition {
  if (typeof window === "undefined") return defaultLauncherPosition();

  try {
    const raw = window.localStorage.getItem(CHATBOT_LAUNCHER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (
      parsed &&
      typeof parsed === "object" &&
      Number.isFinite(Number(parsed.left)) &&
      Number.isFinite(Number(parsed.top))
    ) {
      return clampLauncherPosition({
        left: Number(parsed.left),
        top: Number(parsed.top),
      });
    }
  } catch {
    // Ignore corrupt state.
  }

  return defaultLauncherPosition();
}
const SIDEBAR_SAFE_LEFT = 260;
// 400 (not 360) so that at the narrowest size the 150px Chat History column
// still leaves a usable message area beside it.
const MIN_CHAT_WIDTH = 400;
const MIN_CHAT_HEIGHT = 440;
// Hard ceiling. The effective maximum is the smaller of this and
// MAX_CHAT_WIDTH_RATIO of the viewport, so the panel can never swallow the
// screen on a laptop yet can still grow usefully on a large monitor.
const MAX_CHAT_WIDTH = 1100;
const MAX_CHAT_WIDTH_RATIO = 0.7;
const MAX_CHAT_HEIGHT = 760;

// Below this viewport width the panel is already near-full-width, so edge
// dragging would only produce a broken, too-narrow panel. Same 800px threshold
// clampChatLayout already uses to decide the sidebar-safe left margin.
const RESIZE_MIN_VIEWPORT = 800;

/**
 * Width bounds for the panel at the current viewport.
 *
 * Shared by clampChatLayout and the drag-resize handler so both agree on the
 * limits — the drag can never produce a width the clamp would then reject.
 */
function chatWidthBounds(viewportWidth: number): { min: number; max: number } {
  const safeLeft = viewportWidth > RESIZE_MIN_VIEWPORT ? SIDEBAR_SAFE_LEFT : 12;
  const available = viewportWidth - safeLeft - 12;
  const ratioMax = Math.round(viewportWidth * MAX_CHAT_WIDTH_RATIO);

  return {
    min: MIN_CHAT_WIDTH,
    // Never let the ceiling fall below the floor on very small viewports.
    max: Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, ratioMax, available)),
  };
}

const LANGUAGE_OPTIONS: Array<{ value: ChatLanguage; label: string; code: string }> = [
  { value: "en", label: "English", code: "en-US" },
  { value: "tl", label: "Tagalog", code: "fil-PH" },
  { value: "pag", label: "Pangasinan", code: "fil-PH" },
];

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampChatLayout(layout: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  if (typeof window === "undefined") return layout;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const safeLeft = viewportWidth > RESIZE_MIN_VIEWPORT ? SIDEBAR_SAFE_LEFT : 12;
  const bounds = chatWidthBounds(viewportWidth);
  const width = clampNumber(layout.width, bounds.min, bounds.max);
  const height = clampNumber(layout.height, MIN_CHAT_HEIGHT, Math.min(MAX_CHAT_HEIGHT, viewportHeight - 24));

  return {
    width,
    height,
    left: clampNumber(layout.left, safeLeft, Math.max(safeLeft, viewportWidth - width - 12)),
    top: clampNumber(layout.top, 12, Math.max(12, viewportHeight - height - 12)),
  };
}

function defaultChatLayout() {
  if (typeof window === "undefined") {
    return { left: 320, top: 80, width: 540, height: 640 };
  }

  return clampChatLayout({
    width: 540,
    height: 640,
    left: window.innerWidth - 568,
    top: window.innerHeight - 668,
  });
}

function readSavedChatLayout() {
  if (typeof window === "undefined") return defaultChatLayout();

  try {
    const raw = window.localStorage.getItem(CHATBOT_LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed && typeof parsed === "object") {
      return clampChatLayout({
        left: Number(parsed.left),
        top: Number(parsed.top),
        width: Number(parsed.width),
        height: Number(parsed.height),
      });
    }
  } catch {
    // Ignore corrupt layout state.
  }

  return defaultChatLayout();
}

const ACTION_ROUTES: Record<Exclude<AdminSuggestedAction, null>, string> = {
  open_dashboard: "/dashboard",
  open_patient_registry: "/patients",
  open_queue: "/queue",
  open_appointments: "/appointments",
  open_consultations: "/consultations",
  open_telemedicine: "/telemedicine",
  open_prescriptions: "/prescriptions",
  open_team_chat: "/team-chat",
  open_inventory: "/inventory",
  open_analytics: "/analytics",
  open_heatmap: "/heatmap-analytics",
  open_cms: "/cms",
  open_events: "/cms/events",
  open_feedback: "/feedback",
  open_followups: "/follow-up",
  open_notifications: "/notifications",
  open_sms: "/sms",
  open_reports: "/reports",
  open_registrations: "/registrations",
  open_users: "/users",
  open_settings: "/settings",
};

const ACTION_LABELS: Record<Exclude<AdminSuggestedAction, null>, string> = {
  open_dashboard: "Open Dashboard",
  open_patient_registry: "Open Patient Registry",
  open_queue: "Open Queue",
  open_appointments: "Open Appointments",
  open_consultations: "Open Consultations",
  open_telemedicine: "Open Telemedicine",
  open_prescriptions: "Open Prescriptions / Lab Requests",
  open_team_chat: "Open Team Chat",
  open_inventory: "Open Inventory",
  open_analytics: "Open Analytics",
  open_heatmap: "Open Heatmap",
  open_cms: "Open CMS",
  open_events: "Open Events",
  open_feedback: "Open Feedback",
  open_followups: "Open Follow-ups",
  open_notifications: "Open Notifications",
  open_sms: "Open SMS",
  open_reports: "Open Reports",
  open_registrations: "Open Registration Approvals",
  open_users: "Open Users",
  open_settings: "Open Settings",
};

function getButtonFromPath(pathname: string): string {
  if (pathname.includes("heatmap")) return "Heatmap Analytics";
  if (pathname.includes("cms/events")) return "Events";
  if (pathname.includes("registrations")) return "Registration Approvals";
  if (pathname.includes("team-chat")) return "Team Chat";
  if (pathname.includes("patients")) return "Patient Registry";
  if (pathname.includes("feedback")) return "Feedback";
  if (pathname.includes("follow")) return "Health Follow-up";
  if (pathname.includes("notifications")) return "Notifications";
  if (pathname.includes("queue")) return "Queue";
  if (pathname.includes("appointments")) return "Appointments";
  if (pathname.includes("consultations")) return "Consultations";
  if (pathname.includes("telemedicine")) return "Telemedicine";
  if (pathname.includes("prescriptions")) return "Prescriptions";
  if (pathname.includes("inventory")) return "Inventory";
  if (pathname.includes("analytics")) return "Analytics";
  if (pathname.includes("cms")) return "CMS";
  if (pathname.includes("announcements")) return "Announcements";
  if (pathname.includes("sms")) return "SMS";
  if (pathname.includes("reports")) return "Reports";
  if (pathname.includes("users")) return "Users";
  if (pathname.includes("settings")) return "Settings";
  return "Dashboard";
}

// Context-aware help shown in the admin chatbot, keyed by the module name from
// getButtonFromPath(). `tip` is a one-line "Current Page Tips"; `prompts` are the
// Quick Help chips that send a real question to the assistant.
type PageHelp = { tip: string; prompts: string[] };

const PAGE_HELP: Record<string, PageHelp> = {
  Dashboard: {
    tip: "Start here each shift: check the alerts, then open the module that needs attention.",
    prompts: [
      "What should I check first today?",
      "Explain today's alerts.",
      "How do I handle pending telemedicine?",
      "What does low stock mean?",
    ],
  },
  "Patient Registry": {
    tip: "Browse active patients, search by name or mobile, then open a profile for full history.",
    prompts: [
      "How do I find a patient profile?",
      "What can I see in patient history?",
      "Why is a patient missing here?",
      "How do I search by mobile number?",
    ],
  },
  Queue: {
    tip: "Call patients in order. Use Priority Next for senior, PWD, pregnant, or emergency cases.",
    prompts: [
      "How do I call the next patient?",
      "When should I use priority next?",
      "What is the difference between skip and no-show?",
      "How do I start service?",
    ],
  },
  Appointments: {
    tip: "Handle pending requests first. Approved bookings flow into the queue automatically.",
    prompts: [
      "How do I approve an appointment?",
      "What should I check before rejecting?",
      "When do I schedule versus start consultation?",
      "How do online appointments become telemedicine?",
    ],
  },
  Consultations: {
    tip: "Open SOAP for records that need it. Add assessment or diagnosis before completing.",
    prompts: [
      "How do I complete SOAP?",
      "Why is this record marked Needs SOAP?",
      "What fields are required before completing?",
      "How do I add follow-up?",
    ],
  },
  Prescriptions: {
    tip: "Release the PDF first, then dispense when the patient claims their medicine.",
    prompts: [
      "How do I create a prescription?",
      "When do I release PDF?",
      "How do I dispense medicine?",
      "What does void prescription mean?",
    ],
  },
  Telemedicine: {
    tip: "Screen the request, start the video, then document SOAP after the call ends.",
    prompts: [
      "How do I start a telemedicine session?",
      "What do I do after the video call?",
      "How do I document SOAP after telemedicine?",
      "Why is this request closed?",
    ],
  },
  "Team Chat": {
    tip: "Use internal staff messaging for co-worker coordination within the allowed RHU scope.",
    prompts: [
      "How do I start a staff chat?",
      "How do group conversations work?",
      "Why can't I message a co-worker?",
      "How do voice and video calls work?",
    ],
  },
  "Health Follow-up": {
    tip: "Staff reminders come from SOAP follow-up dates. Patient updates come from the mobile app.",
    prompts: [
      "Where do follow-up reports come from?",
      "How do I resend follow-up SMS?",
      "What does needs follow-up mean?",
      "How do patients submit updates?",
    ],
  },
  Feedback: {
    tip: "Review resident feedback and condition updates; clinical follow-up reminders stay in Health Follow-up.",
    prompts: [
      "How do I respond to feedback?",
      "When should I open Health Follow-up?",
      "What feedback needs attention?",
      "Where do resident updates come from?",
    ],
  },
  Notifications: {
    tip: "Use the inbox to review mobile requests, queue updates, appointment notices, and system alerts.",
    prompts: [
      "How do I review unread alerts?",
      "Which notifications need action?",
      "How do I mark alerts as read?",
      "Why did I get this notification?",
    ],
  },
  SMS: {
    tip: "Choose recipients, write a short safe message, preview the count, then confirm sending.",
    prompts: [
      "How do I send an SMS campaign?",
      "How do I preview recipients?",
      "What should I avoid in SMS text?",
      "Why do logs show only today?",
    ],
  },
  CMS: {
    tip: "Create simple, readable public information and preview the resident view before publishing.",
    prompts: [
      "How do I post an announcement?",
      "How do I write a resident-friendly post?",
      "When should I archive old advisories?",
      "How do announcements differ from events?",
    ],
  },
  Events: {
    tip: "Create a draft, complete schedule and audience targeting, then publish only after review.",
    prompts: [
      "How do I create an event?",
      "What fields are required to publish?",
      "How do I target barangays?",
      "How do I use the AI draft button?",
    ],
  },
  Users: {
    tip: "Resident accounts use the mobile app. Staff and admin roles need approval.",
    prompts: [
      "How do I change a user role?",
      "What is the difference between resident and staff?",
      "Who can approve staff?",
      "How do I disable an account safely?",
    ],
  },
  Inventory: {
    tip: "Act on low stock: record stock-in or adjust quantity, then check the history.",
    prompts: [
      "What should I do with low stock?",
      "How do I record stock-in?",
      "How do I adjust stock?",
      "How do I check inventory history?",
    ],
  },
  Reports: {
    tip: "Use formal Diagnosis + ITR, follow-up, staff workload, barangay, and CSV reports for documentation.",
    prompts: [
      "How do I export a report?",
      "What is Diagnosis + ITR?",
      "How do I use privacy masking?",
      "Which filters should I set first?",
    ],
  },
  Analytics: {
    tip: "Track patients, consultations, telemedicine, queue tickets, disease clusters, and chatbot questions for planning.",
    prompts: [
      "How should I read analytics?",
      "What should staff validate first?",
      "How do I export analytics?",
      "What do disease clusters mean?",
    ],
  },
  "Heatmap Analytics": {
    tip: "Use the separate queue and barangay disease-cluster workspaces to spot risk patterns.",
    prompts: [
      "How do I read the heatmap?",
      "What are active signals?",
      "How do queue and disease workspaces differ?",
      "When should I send an advisory?",
    ],
  },
  "Registration Approvals": {
    tip: "Review pending residents and staff, verify uploaded IDs/OCR, then approve or reject.",
    prompts: [
      "How do I approve a registration?",
      "What should I check in OCR?",
      "Why did verification fail?",
      "Who can approve staff accounts?",
    ],
  },
  Settings: {
    tip: "Review RHU information, notification, security, SMS, and backup settings before saving.",
    prompts: [
      "What settings should I verify?",
      "How do I test SMS settings?",
      "How do backups work?",
      "What should I avoid changing?",
    ],
  },
};

function getPageHelp(button: string): PageHelp {
  return (
    PAGE_HELP[button] ?? {
      tip: "Tap a button name to learn what each RHU module does and what to do next.",
      prompts: QUICK_PROMPTS,
    }
  );
}

type TutorialWorkflowStep = {
  module: string;
  route?: string;
  mascot: string;
  header: string;
  body: string;
  steps: string[];
  watch: string;
};

const TUTORIAL_WORKFLOW: TutorialWorkflowStep[] = [
  {
    module: "Getting Started",
    route: "/dashboard",
    mascot: "/Iconwelcome.png",
    header: "Ka-Agapay admin workflow",
    body: "Follow the real sidebar workflow from Dashboard through Settings. Use Next after each module, or open the page and keep the coach beside you.",
    steps: [
      "Start at Dashboard for the shift overview.",
      "Move through Patient Care before outreach and reports.",
      "Finish with Administration: Registration Approvals, Users, and Settings.",
    ],
    watch: "Do not skip review steps before publishing, sending SMS, approving accounts, or changing system settings.",
  },
  {
    module: "Dashboard",
    route: "/dashboard",
    mascot: "/Wavingduck.png",
    header: "Real-Time RHU Dashboard",
    body: "Live tracking for patients, consultations, queue, telemedicine, inventory, and barangay health heatmap.",
    steps: [
      "Check Priority Action Center first.",
      "Review Shift Summary and the KPI cards.",
      "Open the module that has the most urgent alert.",
    ],
    watch: "Dashboard numbers are summaries; open the source page before acting on a specific record.",
  },
  {
    module: "Patient Registry",
    route: "/patients",
    mascot: "/HappyDuckloving.png",
    header: "Patient Registry",
    body: "Browse and search active patients, then open a profile for full history.",
    steps: [
      "Search by patient name or mobile number.",
      "Open View to inspect the patient profile.",
      "Use the profile history before starting follow-up work.",
    ],
    watch: "If a patient is missing, check RHU scope, account status, and search spelling.",
  },
  {
    module: "Queue",
    route: "/queue",
    mascot: "/Thinkingduck.png",
    header: "Queue Management",
    body: "Near real-time queue status across RHU stations. Refreshes every 5 seconds from the backend queue API.",
    steps: [
      "Choose the correct RHU and service desk.",
      "Review priority flags before calling.",
      "Use Call Next, Serving, Done, Skip, or No-show in order.",
    ],
    watch: "Online appointments belong in Telemedicine, not the onsite queue.",
  },
  {
    module: "Appointments",
    route: "/appointments",
    mascot: "/Thinkingduck.png",
    header: "Appointment Management",
    body: "Simple RHU appointment board for approving, scheduling, rejecting, adding onsite patients to queue, and starting consultations.",
    steps: [
      "Review pending requests first.",
      "Confirm type: onsite, online, or consultation.",
      "Approve, schedule, reject, add to queue, or start consultation.",
    ],
    watch: "Rejected, cancelled, completed, or wrong-date appointments will not appear in today's active queue.",
  },
  {
    module: "Consultations",
    route: "/consultations",
    mascot: "/Consultationduck.png",
    header: "Consultation Management",
    body: "Review active consultation records, open SOAP documentation, check diagnosis status, and make sure every consultation is properly documented before completion.",
    steps: [
      "Open the active consultation record.",
      "Complete SOAP and diagnosis fields as required.",
      "Add prescriptions, lab requests, referrals, or follow-ups when needed.",
    ],
    watch: "Do not complete the record until required clinical documentation is present.",
  },
  {
    module: "Telemedicine",
    route: "/telemedicine",
    mascot: "/Duckcheckingmobilephone.png",
    header: "Telemedicine Management",
    body: "Screen online consultation requests, open video sessions, track request progress, and safely complete SOAP documentation.",
    steps: [
      "Screen complaint and urgency.",
      "Start or open the video session.",
      "Save or finalize SOAP notes after the call.",
    ],
    watch: "Ended, no-show, and cancelled sessions do not reopen; use the consultation record for documentation review.",
  },
  {
    module: "E-Prescription / Lab Request",
    route: "/prescriptions",
    mascot: "/Consultationduck.png",
    header: "E-Prescription / Lab Request",
    body: "Create medicine prescriptions or laboratory requests and release official PDFs.",
    steps: [
      "Create a prescription or lab request from the patient context.",
      "Review medicines, instructions, and request details.",
      "Release the official PDF, then dispense when claimed.",
    ],
    watch: "The assistant can help with workflow, not clinical doses or diagnosis decisions.",
  },
  {
    module: "Team Chat",
    route: "/team-chat",
    mascot: "/Side-waved duck.png",
    header: "Team Chat",
    body: "Internal staff messaging with chats, group conversations, search, presence, seen receipts, and voice/video calls.",
    steps: [
      "Open Chats or Search.",
      "Start a new chat or group conversation.",
      "Use calls only for staff coordination.",
    ],
    watch: "RHU scope still matters; some staff cannot message across facilities.",
  },
  {
    module: "Inventory",
    route: "/inventory",
    mascot: "/Thinkingduck.png",
    header: "Pamamahala ng Imbentaryo",
    body: "Real-time monitoring of medicines, vaccines, supplies, and equipment, including restock needs and expiry safety.",
    steps: [
      "Check low-stock, out-of-stock, and near-expiry items.",
      "Record stock-in, stock-out, or adjustments with notes.",
      "Use FEFO: first expiry, first out.",
    ],
    watch: "Expired items should not be dispensed.",
  },
  {
    module: "CMS Announcements",
    route: "/cms",
    mascot: "/Side-waved duck.png",
    header: "Content Management",
    body: "Create simple, readable, and timely public information for Ka-Agapay residents.",
    steps: [
      "Write a clear title and resident-friendly content.",
      "Preview the resident view.",
      "Publish only when final, then archive old advisories.",
    ],
    watch: "Announcements do not need event slots, but they still need careful wording.",
  },
  {
    module: "CMS Events & Programs",
    route: "/cms/events",
    mascot: "/Side-waved duck.png",
    header: "Events & Programs Management",
    body: "Create clear RHU events, health programs, and public advisories with safety checks before residents see them.",
    steps: [
      "Create a draft and complete basic details.",
      "Set schedule, venue, audience, barangay target, services, and SMS summary.",
      "Review details before publishing to residents.",
    ],
    watch: "Past schedules, missing venue, or SMS over 160 characters can block publishing.",
  },
  {
    module: "Reports",
    route: "/reports",
    mascot: "/Lightbulbduck.png",
    header: "RHU Reports",
    body: "Formal Diagnosis + ITR consultation records, follow-up tracking, data completeness, staff workload, barangay watchlist, and CSV exports.",
    steps: [
      "Set RHU, date range, and filters.",
      "Review the matching report cards and tables.",
      "Export CSV or masked CSV when evidence needs privacy.",
    ],
    watch: "Reports are only as complete as the source records, so check data completeness.",
  },
  {
    module: "Analytics",
    route: "/analytics",
    mascot: "/Lightbulbduck.png",
    header: "RHU Analytics",
    body: "Track patients, consultations, telemedicine usage, queue tickets, disease clusters, and chatbot questions for better RHU planning.",
    steps: [
      "Apply facility, barangay, complaint, and date filters.",
      "Review trends and risk signals.",
      "Validate high-risk findings before public action.",
    ],
    watch: "Analytics is a guide; RHU staff must validate records before decisions or advisories.",
  },
  {
    module: "Heatmap Analytics",
    route: "/heatmap-analytics",
    mascot: "/Lightbulbduck.png",
    header: "Heatmap Analytics",
    body: "Separate operational workspaces for RHU queue monitoring and barangay disease cluster surveillance.",
    steps: [
      "Choose queue monitoring or barangay disease cluster view.",
      "Use date range and active signal filters.",
      "Open related queue, SMS, or event actions after validation.",
    ],
    watch: "A hot spot is a signal to verify, not a final diagnosis by itself.",
  },
  {
    module: "Feedback",
    route: "/feedback",
    mascot: "/HappyDuckloving.png",
    header: "Service Feedback",
    body: "Patient service feedback and condition updates submitted from the mobile app, scoped to the assigned RHU.",
    steps: [
      "Review items that need attention.",
      "Respond to service feedback when appropriate.",
      "Open Health Follow-up for clinical follow-up reminders.",
    ],
    watch: "Do not treat feedback as a completed clinical follow-up record.",
  },
  {
    module: "Health Follow-up",
    route: "/follow-up",
    mascot: "/HappyDuckloving.png",
    header: "Health Follow-up",
    body: "Track overdue, due today, upcoming, and completed patient follow-ups.",
    steps: [
      "Filter by overdue, due today, upcoming, or completed.",
      "Open the related consultation when clinical context is needed.",
      "Resend follow-up SMS only after checking the record.",
    ],
    watch: "Follow-up reminders come from SOAP follow-up dates.",
  },
  {
    module: "Notifications",
    route: "/notifications",
    mascot: "/Lightbulbduck.png",
    header: "Notifications",
    body: "View mobile requests, queue updates, telemedicine reminders, appointment notices, RHU posts, and important system alerts in one inbox.",
    steps: [
      "Review unread alerts first.",
      "Open the linked record or module.",
      "Mark all read only after checking urgent items.",
    ],
    watch: "The bell is a signal list; the source page is where work is completed.",
  },
  {
    module: "SMS Center",
    route: "/sms",
    mascot: "/Duckcheckingmobilephone.png",
    header: "SMS Center",
    body: "Send safe RHU reminders, queue alerts, follow-ups, and program advisories. Preview recipients first to avoid wrong or accidental bulk sending.",
    steps: [
      "Choose recipient mode and filters.",
      "Write a short, non-sensitive message.",
      "Preview recipients, check credits, then confirm send.",
    ],
    watch: "SMS logs default to Today; switch to All history when checking old sends.",
  },
  {
    module: "Registration Approvals",
    route: "/registrations",
    mascot: "/Thinkingduck.png",
    header: "Registration Approvals",
    body: "Review pending registrants - residents and staff. Open View OCR to verify the submitted ID, then approve or reject.",
    steps: [
      "Open the pending registrant.",
      "Compare profile details with the submitted ID/OCR.",
      "Approve, reject, or request correction according to account rules.",
    ],
    watch: "Staff registrations need invitation-link context and the correct reviewer role.",
  },
  {
    module: "Users",
    route: "/users",
    mascot: "/Thinkingduck.png",
    header: "Pamamahala ng User",
    body: "Review, approve, edit, disable, or delete accounts safely. Super Admin can update user roles instantly.",
    steps: [
      "Search or filter accounts by role/status.",
      "Review details before changing role or status.",
      "Use Registration Link only as Super Admin for invited staff.",
    ],
    watch: "Deleted records are archived, not hard-deleted, so duplicate mobile/email values can still matter.",
  },
  {
    module: "Settings",
    route: "/settings",
    mascot: "/Thumbsupduck.png",
    header: "Settings Management",
    body: "Manage RHU information, notifications, security, and backup settings clearly and safely.",
    steps: [
      "Review details before changing values.",
      "Save valid settings.",
      "Test SMS and backup settings after changes.",
    ],
    watch: "Settings changes affect the whole workflow; verify before saving.",
  },
];

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSessionDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recent chat";
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function renderMessageContent(content: string) {
  return content.split("\n").map((line, index, lines) => (
    <span key={`${line}-${index}`}>
      {renderInlineMarkdown(line)}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

function ActionButton({
  action,
  onClick,
}: {
  action: Exclude<AdminSuggestedAction, null>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 8,
        border: "1px solid #A7F3D0",
        background: "#ECFDF5",
        color: "#047857",
        borderRadius: 999,
        padding: "8px 10px",
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <ExternalLink size={13} />
      {ACTION_LABELS[action]}
    </button>
  );
}

function TutorialCards({ cards }: { cards: TutorialCard[] }) {
  if (!cards.length) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        marginTop: 10,
      }}
    >
      {cards.map((card, index) => (
        <div
          key={`${card.title}-${index}`}
          style={{
            background: "#F0FDF9",
            border: "1px solid #CCFBF1",
            borderRadius: 12,
            padding: 10,
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
          }}
        >
          {card.mascot ? (
            <img
              src={card.mascot}
              alt=""
              style={{
                width: 42,
                height: 42,
                objectFit: "contain",
                flex: "0 0 auto",
              }}
            />
          ) : null}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: "#0F766E",
                marginBottom: 3,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#475569",
                lineHeight: 1.5,
              }}
            >
              {card.body}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GuidedTutorialPanel({
  stepIndex,
  onStepChange,
  onOpenRoute,
}: {
  stepIndex: number;
  onStepChange: (step: number) => void;
  onOpenRoute: (route: string) => void;
}) {
  const step = TUTORIAL_WORKFLOW[stepIndex] ?? TUTORIAL_WORKFLOW[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TUTORIAL_WORKFLOW.length - 1;

  return (
    <section
      aria-label="Getting Started workflow"
      style={{
        marginTop: 10,
        border: "1px solid #A7F3D0",
        borderRadius: 14,
        background: "#F0FDF9",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          padding: 12,
          borderBottom: "1px solid #CCFBF1",
        }}
      >
        <img
          src={step.mascot}
          alt=""
          style={{
            width: 58,
            height: 58,
            objectFit: "contain",
            flex: "0 0 auto",
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "#0F766E", fontSize: 11, fontWeight: 950 }}>
            Step {stepIndex + 1} of {TUTORIAL_WORKFLOW.length}
          </div>
          <h3
            style={{
              margin: "2px 0 3px",
              color: "#0F172A",
              fontSize: 15,
              lineHeight: 1.2,
              fontWeight: 950,
            }}
          >
            {step.module}
          </h3>
          <div style={{ color: "#0F766E", fontSize: 12, fontWeight: 900 }}>
            {step.header}
          </div>
          {isFirst ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginTop: 7,
                color: "#475569",
                fontSize: 11.5,
                lineHeight: 1.4,
              }}
            >
              <img
                src="/Wavingduck.png"
                alt=""
                style={{ width: 30, height: 30, objectFit: "contain", flex: "0 0 auto" }}
              />
              <span>Welcome. I will stay open while you move through the admin pages.</span>
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        <p style={{ margin: 0, color: "#334155", fontSize: 12.5, lineHeight: 1.55 }}>
          {step.body}
        </p>

        <ol style={{ margin: 0, paddingLeft: 18, color: "#334155", fontSize: 12, lineHeight: 1.55 }}>
          {step.steps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>

        <div
          style={{
            display: "flex",
            gap: 7,
            alignItems: "flex-start",
            border: "1px solid #FDE68A",
            background: "#FFFBEB",
            color: "#92400E",
            borderRadius: 10,
            padding: 9,
            fontSize: 11.5,
            lineHeight: 1.45,
          }}
        >
          <img
            src="/Lightbulbduck.png"
            alt=""
            style={{ width: 28, height: 28, objectFit: "contain", flex: "0 0 auto" }}
          />
          <span>{step.watch}</span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => onStepChange(Math.max(0, stepIndex - 1))}
            disabled={isFirst}
            title="Previous tutorial step"
            style={{
              border: "1px solid #CCFBF1",
              background: "#FFFFFF",
              color: isFirst ? "#94A3B8" : "#0F766E",
              borderRadius: 999,
              minHeight: 34,
              padding: "0 10px",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 900,
              cursor: isFirst ? "not-allowed" : "pointer",
            }}
          >
            <ArrowLeft size={14} />
            Previous
          </button>

          {step.route ? (
            <button
              type="button"
              onClick={() => onOpenRoute(step.route!)}
              style={{
                border: "1px solid #0F766E",
                background: "#FFFFFF",
                color: "#0F766E",
                borderRadius: 999,
                minHeight: 34,
                padding: "0 10px",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              <ExternalLink size={14} />
              Open
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onStepChange(Math.min(TUTORIAL_WORKFLOW.length - 1, stepIndex + 1))}
            disabled={isLast}
            title="Next tutorial step"
            style={{
              border: "none",
              background: isLast ? "#A7F3D0" : "#0F766E",
              color: "#FFFFFF",
              borderRadius: 999,
              minHeight: 34,
              padding: "0 10px",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 900,
              cursor: isLast ? "not-allowed" : "pointer",
            }}
          >
            Next
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}

function ChatHistoryPanel({
  visible,
  sessions,
  activeSessionId,
  loading,
  onNewChat,
  onSelect,
  onDelete,
}: {
  visible: boolean;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  loading: boolean;
  onNewChat: () => void;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}) {
  if (!visible) return null;

  return (
    <aside
      style={{
        width: 150,
        borderRight: "1px solid #E5E7EB",
        background: "#F8FAFC",
        display: "flex",
        flexDirection: "column",
        minWidth: 150,
      }}
    >
      <div style={{ padding: 10, borderBottom: "1px solid #E5E7EB" }}>
        <button
          type="button"
          onClick={onNewChat}
          style={{
            width: "100%",
            border: "1px solid #99F6E4",
            background: "#F0FDFA",
            color: "#0F766E",
            borderRadius: 999,
            padding: "8px 9px",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Plus size={13} />
          New Chat
        </button>
      </div>

      <div style={{ padding: "10px 10px 6px", color: "#64748B", fontSize: 11, fontWeight: 900 }}>
        Chat History
      </div>

      <div style={{ overflowY: "auto", flex: 1, padding: "0 10px 10px" }}>
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", padding: 16 }}>
            <Loader2 size={16} className="spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ color: "#94A3B8", fontSize: 12, padding: 8, lineHeight: 1.4 }}>
            No saved staff chats yet.
          </div>
        ) : (
          sessions.map((session) => {
            const active = activeSessionId === session.id;

            return (
              <div
                key={session.id}
                className="ka-chat-session-row"
                style={{
                  position: "relative",
                  display: "flex",
                  gap: 4,
                  alignItems: "stretch",
                  marginBottom: 6,
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  title={session.title || session.preview}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: active ? "1px solid #99F6E4" : "1px solid transparent",
                    background: active ? "#ECFDF5" : "transparent",
                    borderRadius: 10,
                    textAlign: "left",
                    padding: "7px 7px",
                    cursor: "pointer",
                    color: "#334155",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      marginBottom: 3,
                      color: active ? "#0F766E" : "#64748B",
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  >
                    <MessageSquare size={11} />
                    {formatSessionDate(session.last_activity_at ?? session.started_at)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: active ? 900 : 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {session.title || session.preview || "Untitled chat"}
                  </div>
                </button>

                <button
                  type="button"
                  className="ka-chat-session-delete"
                  onClick={() => onDelete(session.id)}
                  title="Delete chat"
                  aria-label="Delete chat"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#94A3B8",
                    cursor: "pointer",
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                    alignSelf: "center",
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default function AIChatAssistant() {
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [tutorialCards, setTutorialCards] = useState<TutorialCard[]>([]);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [cmsDraft, setCmsDraft] = useState<CmsDraft | null>(null);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("operations");
  // Set only by the automatic first-ever-login open, never by the sidebar entry
  // or the header toggle.
  const [firstLoginWelcome, setFirstLoginWelcome] = useState(false);
  const [suggestedAction, setSuggestedAction] = useState<AdminSuggestedAction>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [layout, setLayout] = useState(readSavedChatLayout);
  const [launcherPos, setLauncherPos] = useState<LauncherPosition>(readSavedLauncherPosition);
  const [chatLanguage, setChatLanguage] = useState<ChatLanguage>("en");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMessage, setVoiceMessage] = useState("");

  // Browser-native speech-to-text. Recognized text fills the chatbot input;
  // the user reviews it and presses Send (no auto-send). en-US is used because
  // Chrome rejects many regional tags (e.g. fil-PH) with language-not-supported.
  const voice = useWebSpeechRecognition({
    lang: "en-US",
    interimResults: false,
    continuous: false,
    onResult: (finalText) => setInput(finalText),
  });

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    left: number;
    top: number;
  } | null>(null);

  // Left-edge drag-to-resize. Anchors the RIGHT edge: the pointer keeps hold of
  // the left edge it grabbed, so `left` and `width` move by equal and opposite
  // amounts instead of the panel appearing to slide sideways.
  const resizeRef = useRef<{ startX: number; right: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  // Drives the responsive hiding of the drag handle.
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  const canResize = viewportWidth > RESIZE_MIN_VIEWPORT;

  const currentButton = useMemo(
    () => getButtonFromPath(location.pathname),
    [location.pathname]
  );

  const pageHelp = useMemo(() => getPageHelp(currentButton), [currentButton]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [assistantMode, messages, open, tutorialCards, tutorialStep, suggestedAction]);

  useEffect(() => {
    if (open) {
      void loadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /*
   * External entry points into the EXISTING tutorial mode: the sidebar's
   * "Getting Started" button and the automatic first-login trigger. Both land
   * here rather than duplicating any tutorial content.
   *
   * applyAssistantMode only calls state setters (stable identities), so the
   * empty dep list cannot capture a stale value.
   */
  useEffect(() => {
    registerTutorialListener(({ firstLogin }) => {
      setOpen(true);
      setFirstLoginWelcome(Boolean(firstLogin));
      applyAssistantMode("tutorial");
    });

    return () => registerTutorialListener(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHATBOT_LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // Local storage can be unavailable in private browsing.
    }
  }, [layout]);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setLayout((current) => clampChatLayout(current));
      setLauncherPos((current) => clampLauncherPosition(current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHATBOT_LAUNCHER_KEY, JSON.stringify(launcherPos));
    } catch {
      // Local storage can be unavailable in private browsing.
    }
  }, [launcherPos]);

  useEffect(() => {
    return () => {
      voice.stopListening();
      window.removeEventListener("pointermove", onDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the speech-recognition lifecycle into the existing voice UI state.
  useEffect(() => {
    if (voice.isListening) {
      setVoiceState("listening");
      setVoiceMessage("Listening...");
    } else if (voice.error) {
      setVoiceState("error");
      setVoiceMessage(voice.error);
    } else {
      setVoiceState("idle");
      setVoiceMessage("");
    }
  }, [voice.isListening, voice.error]);

  const loadSessions = async () => {
    setHistoryLoading(true);

    try {
      const chatSessions = await getAdminChatSessions();
      setSessions(chatSessions);
    } catch (error) {
      console.error("[AIChatAssistant] Failed to load sessions:", error);
      setSessions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const startNewChat = async () => {
    try {
      await endAdminChatSession(currentSessionId);
    } catch {
      // Non-blocking. A new chat can start locally even if the previous session cannot be marked ended.
    }

    setMessages([WELCOME]);
    setCurrentSessionId(null);
    setTutorialCards([]);
    setTutorialStep(0);
    setSuggestedAction(null);
    setCmsDraft(null);
    setInput("");
    void loadSessions();
  };

  const loadSession = async (sessionId: string) => {
    setLoading(true);
    setTutorialCards([]);
    setTutorialStep(0);
    setSuggestedAction(null);

    try {
      const sessionMessages = await getAdminSessionMessages(sessionId);
      setMessages(sessionMessages.length ? sessionMessages : [WELCOME]);
      setCurrentSessionId(sessionId);
    } catch (error) {
      console.error("[AIChatAssistant] Failed to load session:", error);
      setMessages([WELCOME]);
      setCurrentSessionId(null);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    const confirmed = window.confirm("Delete this chat history? This cannot be undone.");

    if (!confirmed) return;

    try {
      await deleteAdminChatSession(sessionId);
      setSessions((previous) => previous.filter((session) => session.id !== sessionId));

      if (currentSessionId === sessionId) {
        setMessages([WELCOME]);
        setCurrentSessionId(null);
        setTutorialCards([]);
        setSuggestedAction(null);
      }
    } catch (error) {
      console.error("[AIChatAssistant] Failed to delete session:", error);
    }
  };

  const sendMessage = async (text?: string) => {
    const finalText = (text ?? input).trim();

    if (!finalText || loading) return;

    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: finalText,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setTutorialCards([]);
    setSuggestedAction(null);

    try {
      const response = await sendAdminChatMessage({
        message: finalText,
        sessionId: currentSessionId,
        history: nextMessages.filter((message) => message.id !== "welcome-admin"),
        currentPage: location.pathname,
        currentButton,
        assistantMode,
      });

      setMessages((previous) => [...previous, response.message]);
      setCurrentSessionId(response.session_id ?? currentSessionId);
      setTutorialCards(response.tutorial_cards ?? []);
      setSuggestedAction(response.suggested_action ?? null);
      setCmsDraft(response.cms_draft ?? null);
      void loadSessions();
    } catch (error: any) {
      console.error("[AIChatAssistant] Send failed:", error);

      setMessages((previous) => [
        ...previous,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            error?.response?.data?.message ??
            "Sorry, I cannot connect to the assistant right now. Please check the backend API and AI/LLM key.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Hand the drafted content to the Events page. Works from ANY route — the
   * assistant floats over the whole dashboard — so the draft is stashed and the
   * Events page opens its Create modal pre-filled with it.
   */
  const useDraftInForm = () => {
    if (!cmsDraft) return;

    stashCmsDraft(cmsDraft);
    setOpen(false);
    navigate("/cms/events");
  };

  /**
   * Puts the assistant INTO a specific mode. A fresh session is started so the
   * coach is not reading back an unrelated operational conversation as if it
   * were the lesson.
   *
   * Split out of toggleAssistantMode so the header toggle and the external
   * entry points (sidebar "Getting Started", first-login trigger) drive the
   * exact same state transition — the tutorial is defined once, in one place.
   */
  const applyAssistantMode = (next: AssistantMode) => {
    setAssistantMode(next);
    setTutorialCards([]);
    setTutorialStep(0);
    setSuggestedAction(null);
    setCmsDraft(null);
    setCurrentSessionId(null);

    if (next !== "tutorial") {
      setFirstLoginWelcome(false);
    }

    setMessages([
      {
        id: "welcome-admin",
        role: "assistant",
        content:
          next === "tutorial"
            ? "Getting Started mode. I will walk you through the system from Dashboard through Settings. Use the tutorial card below, then click Next when you are ready."
            : "Back to the normal assistant. Ask me about any button, or ask me to draft an event or announcement.",
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  /**
   * Switches the assistant between day-to-day help and the Getting Started
   * onboarding coach (header button).
   */
  const toggleAssistantMode = () => {
    applyAssistantMode(assistantMode === "tutorial" ? "operations" : "tutorial");
  };

  const openTutorialRoute = (route: string) => {
    navigate(route);
  };

  const goToSuggestedAction = () => {
    if (!suggestedAction) return;

    const route = ACTION_ROUTES[suggestedAction];

    if (route) {
      navigate(route);
      setOpen(false);
    }
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("button, select")) {
      return;
    }

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: layout.left,
      top: layout.top,
    };

    window.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", stopDrag, { once: true });
  };

  const onDrag = (event: PointerEvent) => {
    const start = dragRef.current;
    if (!start) return;

    setLayout((current) =>
      clampChatLayout({
        ...current,
        left: start.left + event.clientX - start.startX,
        top: start.top + event.clientY - start.startY,
      })
    );
  };

  const stopDrag = () => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onDrag);
  };

  /**
   * Begin a left-edge resize.
   *
   * stopPropagation matters: the header directly above owns beginDrag (move),
   * so without it grabbing the handle would move the panel as well as resize it.
   */
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canResize) return;

    event.preventDefault();
    event.stopPropagation();

    resizeRef.current = {
      startX: event.clientX,
      // The right edge is captured once and held fixed for the whole gesture.
      right: layout.left + layout.width,
    };

    setResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  };

  const onResizeMove = (event: PointerEvent) => {
    const start = resizeRef.current;
    if (!start) return;

    const bounds = chatWidthBounds(window.innerWidth);

    // Width is clamped FIRST, then left is derived from the anchored right
    // edge. Doing it the other way (clamping left and width independently) lets
    // the right edge creep once the width hits a bound.
    const width = clampNumber(start.right - event.clientX, bounds.min, bounds.max);

    setLayout((current) =>
      clampChatLayout({ ...current, width, left: start.right - width })
    );
  };

  const stopResize = () => {
    resizeRef.current = null;
    setResizing(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    window.removeEventListener("pointermove", onResizeMove);
  };

  // Never leave the document stuck in a no-select / col-resize state if the
  // panel unmounts mid-drag.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onResizeMove);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Stepped size change from the header's smaller/larger buttons.
   *
   * These are NOT a maximize/restore toggle — they nudge width AND height by a
   * fixed amount and write the SAME layout state the drag handle writes, so the
   * two cannot disagree: dragging then clicking simply continues from wherever
   * the drag finished.
   */
  const adjustSize = (deltaWidth: number, deltaHeight: number) => {
    setLayout((current) =>
      clampChatLayout({
        ...current,
        width: current.width + deltaWidth,
        height: current.height + deltaHeight,
      })
    );
  };

  const resetLayout = () => {
    const next = defaultChatLayout();
    setLayout(next);
    try {
      window.localStorage.setItem(CHATBOT_LAYOUT_KEY, JSON.stringify(next));
    } catch {
      // Local storage can be unavailable.
    }
  };

  // ── Launcher drag (panelist follow-up round) ────────────────────────────
  // The COLLAPSED launcher icon is draggable so it can be moved off anything
  // it overlaps; the expanded panel keeps its own existing drag/resize. A
  // pointer travel under 6px counts as a click (opens the chat) — beyond
  // that it is a drag and release does NOT open.
  const launcherDragRef = useRef<{
    startX: number;
    startY: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);

  const onLauncherPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    launcherDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: launcherPos.left,
      top: launcherPos.top,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onLauncherPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = launcherDragRef.current;
    if (!start) return;

    const deltaX = event.clientX - start.startX;
    const deltaY = event.clientY - start.startY;

    if (!start.moved && Math.hypot(deltaX, deltaY) < 6) return;

    start.moved = true;
    setLauncherPos(
      clampLauncherPosition({ left: start.left + deltaX, top: start.top + deltaY })
    );
  };

  const onLauncherPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = launcherDragRef.current;
    launcherDragRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released.
    }

    if (start && !start.moved) {
      setOpen(true);
    }
  };

  const stopVoiceInput = () => {
    voice.stopListening();
  };

  const startVoiceInput = () => {
    if (!voice.isSupported) {
      setVoiceState("error");
      setVoiceMessage(
        "Speech recognition is not supported in this browser. Please use Google Chrome."
      );
      return;
    }

    // Toggle: clicking the mic again while listening stops it.
    if (voice.isListening) {
      voice.stopListening();
      return;
    }

    // onResult fills the input; the sync effect drives the voice UI state.
    voice.startListening();
  };

  return (
    <>
      <button
        type="button"
        onPointerDown={onLauncherPointerDown}
        onPointerMove={onLauncherPointerMove}
        onPointerUp={onLauncherPointerUp}
        style={{
          position: "fixed",
          left: launcherPos.left,
          top: launcherPos.top,
          width: LAUNCHER_SIZE,
          height: LAUNCHER_SIZE,
          borderRadius: "50%",
          border: "none",
          background: "linear-gradient(135deg, #0F766E, #14B8A6)",
          color: "#fff",
          display: open ? "none" : "grid",
          placeItems: "center",
          cursor: "grab",
          boxShadow: "0 14px 34px rgba(15,118,110,0.35)",
          zIndex: 1000,
          touchAction: "none",
        }}
        title="Open RHU Assistant (drag to reposition)"
      >
       <img
          src={MASCOT_SRC}
          alt="RHU Assistant"
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            left: layout.left,
            top: layout.top,
            width: layout.width,
            height: layout.height,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "calc(100vh - 56px)",
            background: "#FFFFFF",
            borderRadius: 20,
            boxShadow: "0 24px 80px rgba(15,23,42,0.24)",
            border: "1px solid #E5E7EB",
            overflow: "hidden",
            zIndex: 1001,
            display: "flex",
          }}
        >
          {/*
            Left-edge resize handle. Hidden below RESIZE_MIN_VIEWPORT, where the
            panel is already near full width and dragging could only make it
            worse. role="separator" + aria-orientation is the standard a11y
            shape for a pane splitter.
          */}
          {canResize ? (
            <div
              className={`ka-chat-resize-handle${resizing ? " is-resizing" : ""}`}
              onPointerDown={beginResize}
              onDoubleClick={resetLayout}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat panel"
              title="Drag to resize · double-click to reset"
            >
              <span className="ka-chat-resize-grip" />
            </div>
          ) : null}

          <ChatHistoryPanel
            visible={historyOpen}
            sessions={sessions}
            activeSessionId={currentSessionId}
            loading={historyLoading}
            onNewChat={startNewChat}
            onSelect={loadSession}
            onDelete={deleteSession}
          />

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div
              onPointerDown={beginDrag}
              style={{
                padding: "14px 18px",
                background: "linear-gradient(135deg, #064E3B, #0F766E)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                cursor: "move",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                  flex: "1 1 260px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={toggleAssistantMode}
                  title={
                    assistantMode === "tutorial"
                      ? "Back to the normal assistant"
                      : "Getting Started - guided walkthrough for new staff"
                  }
                  style={{
                    border: "none",
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 999,
                    background:
                      assistantMode === "tutorial" ? "#FFFFFF" : "rgba(255,255,255,0.16)",
                    color: assistantMode === "tutorial" ? "#0F766E" : "#fff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
                  }}
                >
                  <GraduationCap size={15} />
                  Getting Started
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryOpen((value) => !value)}
                  title="Toggle chat history"
                  style={{
                    border: "none",
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.16)",
                    color: "#fff",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                  }}
                >
                  <History size={16} />
                </button>

                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.16)",
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                  }}
                >
                  <Sparkles size={18} />
                </div>

                <div style={{ minWidth: 0, flex: "1 1 140px" }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>
                    {assistantMode === "tutorial" ? "Getting Started Coach" : "RHU AI Assistant"}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.82, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {assistantMode === "tutorial"
                      ? "Step-by-step walkthrough"
                      : `Current button: ${currentButton}`}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  minWidth: 0,
                  flex: "1 1 220px",
                  flexWrap: "wrap",
                  marginLeft: "auto",
                }}
              >
                <select
                  value={chatLanguage}
                  onChange={(event) => setChatLanguage(event.target.value as ChatLanguage)}
                  title="Chat language"
                  style={{
                    height: 32,
                    border: "1px solid rgba(255,255,255,0.24)",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    borderRadius: 999,
                    padding: "0 8px",
                    fontSize: 12,
                    fontWeight: 800,
                    outline: "none",
                    maxWidth: 132,
                    minWidth: 96,
                  }}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => adjustSize(-80, -80)}
                  title="Make chatbot smaller"
                  style={{
                    border: "none",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    borderRadius: 999,
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Minimize2 size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => adjustSize(80, 80)}
                  title="Make chatbot larger"
                  style={{
                    border: "none",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    borderRadius: 999,
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Maximize2 size={15} />
                </button>

                <button
                  type="button"
                  onClick={resetLayout}
                  title="Reset chatbot position and size"
                  style={{
                    border: "none",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    borderRadius: 999,
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <RotateCcw size={15} />
                </button>

                <button
                  type="button"
                  onClick={startNewChat}
                  title="New chat"
                  style={{
                    border: "1px solid rgba(255,255,255,0.24)",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    borderRadius: 999,
                    height: 32,
                    padding: "0 10px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <Plus size={14} />
                  New
                </button>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title="Close chat"
                  aria-label="Close chat"
                  style={{
                    border: "none",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    borderRadius: 999,
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div
              style={{
                padding: 14,
                background: "#F8FAFC",
                borderBottom: "1px solid #E5E7EB",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#0F766E",
                  fontSize: 12,
                  fontWeight: 900,
                  marginBottom: 6,
                }}
              >
                <HelpCircle size={14} />
                Quick Help — {currentButton}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  color: "#475569",
                  fontSize: 11,
                  lineHeight: 1.45,
                  marginBottom: 8,
                }}
              >
                <Sparkles size={13} style={{ color: "#0F766E", flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong style={{ color: "#0F766E" }}>Page tip:</strong> {pageHelp.tip}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  paddingBottom: 2,
                }}
              >
                {pageHelp.prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    disabled={loading}
                    style={{
                      whiteSpace: "nowrap",
                      border: "1px solid #CCFBF1",
                      background: "#F0FDF9",
                      color: "#0F766E",
                      borderRadius: 999,
                      padding: "7px 10px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 16,
                background: "#FFFFFF",
              }}
            >
              {messages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "84%",
                        background: isUser ? "#0F766E" : "#F3F4F6",
                        color: isUser ? "#fff" : "#111827",
                        borderRadius: isUser
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                        padding: "10px 12px",
                        fontSize: 13,
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {renderMessageContent(message.content)}
                      <div
                        style={{
                          fontSize: 10,
                          opacity: 0.65,
                          marginTop: 5,
                          textAlign: isUser ? "right" : "left",
                        }}
                      >
                        {formatTime(message.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#6B7280",
                    fontSize: 12,
                    marginBottom: 12,
                  }}
                >
                  <Loader2 size={14} className="spin" />
                  Assistant is typing...
                </div>
              )}

              {assistantMode === "tutorial" && firstLoginWelcome ? (
                <section
                  aria-label="Welcome"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 10,
                    padding: "10px 12px",
                    border: "1px solid #A7F3D0",
                    borderRadius: 14,
                    background: "#ECFDF5",
                  }}
                >
                  {/* Existing asset. The tutorial panel below already uses
                      Wavingduck at step 1, so this uses the other mascot to
                      avoid showing the same image twice. */}
                  <img
                    src="/HappyDuckloving.png"
                    alt=""
                    style={{ width: 44, height: 44, objectFit: "contain", flex: "0 0 auto" }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#065F46", fontSize: 13, fontWeight: 950 }}>
                      Welcome to Ka-Agapay!
                    </div>
                    <div style={{ color: "#475569", fontSize: 11.5, lineHeight: 1.4 }}>
                      Since this is your first time signing in, here is a short tour. You can
                      reopen it anytime from <strong>Getting Started</strong> in the sidebar.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFirstLoginWelcome(false)}
                    title="Dismiss welcome"
                    aria-label="Dismiss welcome"
                    style={{
                      marginLeft: "auto",
                      border: "none",
                      background: "transparent",
                      color: "#0F766E",
                      cursor: "pointer",
                      padding: 4,
                      lineHeight: 0,
                      flex: "0 0 auto",
                    }}
                  >
                    <X size={16} />
                  </button>
                </section>
              ) : null}

              {assistantMode === "tutorial" ? (
                <GuidedTutorialPanel
                  stepIndex={tutorialStep}
                  onStepChange={setTutorialStep}
                  onOpenRoute={openTutorialRoute}
                />
              ) : null}

              <TutorialCards cards={tutorialCards} />

              {cmsDraft && (
                <button
                  type="button"
                  onClick={useDraftInForm}
                  style={{
                    marginTop: 8,
                    border: "1px solid #A7F3D0",
                    background: "#ECFDF5",
                    color: "#047857",
                    borderRadius: 999,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <ExternalLink size={13} />
                  Use this draft in the Events form
                </button>
              )}

              {suggestedAction && (
                <ActionButton action={suggestedAction} onClick={goToSuggestedAction} />
              )}

              <div ref={bottomRef} />
            </div>

            <div
              style={{
                padding: 14,
                borderTop: "1px solid #E5E7EB",
                background: "#fff",
                display: "flex",
                gap: 8,
                alignItems: "center",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={startVoiceInput}
                disabled={voiceState === "processing" || loading}
                title={
                  voiceState === "listening"
                    ? "Stop listening"
                    : "Use voice input"
                }
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  border: "1px solid #CCFBF1",
                  background: voiceState === "listening" ? "#FEF3C7" : "#F0FDF9",
                  color: voiceState === "listening" ? "#92400E" : "#0F766E",
                  display: "grid",
                  placeItems: "center",
                  cursor:
                    voiceState === "processing" || loading ? "not-allowed" : "pointer",
                  flex: "0 0 auto",
                }}
              >
                {voiceState === "listening" ? <MicOff size={17} /> : <Mic size={17} />}
              </button>

              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`Ask about ${currentButton}…`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 42,
                  border: "1px solid #E5E7EB",
                  borderRadius: 999,
                  padding: "0 14px",
                  fontSize: 13,
                  outline: "none",
                }}
              />

              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  border: "none",
                  background: loading || !input.trim() ? "#A7F3D0" : "#0F766E",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  flex: "0 0 auto",
                }}
              >
                {loading ? <Loader2 size={16} /> : <Send size={16} />}
              </button>

              {voiceMessage ? (
                <span
                  style={{
                    position: "absolute",
                    left: 14,
                    bottom: 62,
                    fontSize: 11,
                    color: voiceState === "error" ? "#B91C1C" : "#64748B",
                    background: "#FFFFFF",
                    padding: "3px 6px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                  }}
                >
                  {voiceMessage}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
