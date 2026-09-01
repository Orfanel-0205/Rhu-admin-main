// src/services/chatbot.ts

import apiClient from "../lib/apiClient";
import type { CmsDraft } from "../utils/cmsDraftHandoff";

export type ChatRole = "user" | "assistant";

export type AdminSuggestedAction =
  | "open_dashboard"
  | "open_patient_registry"
  | "open_queue"
  | "open_appointments"
  | "open_consultations"
  | "open_telemedicine"
  | "open_prescriptions"
  | "open_team_chat"
  | "open_inventory"
  | "open_analytics"
  | "open_heatmap"
  | "open_cms"
  | "open_events"
  | "open_feedback"
  | "open_followups"
  | "open_notifications"
  | "open_sms"
  | "open_reports"
  | "open_registrations"
  | "open_users"
  | "open_settings"
  | null;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
}

export interface TutorialCard {
  title: string;
  body: string;
  mascot?: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  audience: "staff" | "resident";
  status: "active" | "ended" | "deleted" | string;
  started_at: string;
  updated_at?: string | null;
  last_activity_at?: string | null;
  preview: string;
  message_count: number;
}

export interface ChatResponse {
  message: ChatMessage;
  session_id: string;
  audience?: "staff" | "resident";
  intent?: string;
  suggested_action?: AdminSuggestedAction;
  tutorial_cards?: TutorialCard[];
  /**
   * Present only when the assistant drafted CMS content: a structured version
   * of the same text, ready to load into the Event Creation form.
   */
  cms_draft?: CmsDraft | null;
  meta?: {
    response_ms?: number;
    source?: string;
  };
}

interface ChatHistoryListResponse {
  data: ChatSessionSummary[];
}

interface ChatMessagesResponse {
  data: ChatMessage[];
  session?: ChatSessionSummary;
}

/**
 * "operations" = day-to-day assistant. "tutorial" = the Getting Started
 * onboarding coach, which walks new staff through one feature at a time.
 */
export type AssistantMode = "operations" | "tutorial";

export async function sendAdminChatMessage(params: {
  message: string;
  history?: ChatMessage[];
  sessionId?: string | null;
  currentPage?: string;
  currentButton?: string;
  assistantMode?: AssistantMode;
}): Promise<ChatResponse> {
  const response = await apiClient.post<ChatResponse>("/chat/message", {
    message: params.message,
    session_id: params.sessionId ?? null,
    history: params.history ?? [],
    audience: "staff",
    source: "admin",
    context: {
      current_page: params.currentPage,
      current_button: params.currentButton,
      app_section: "rhu_admin_dashboard",
      assistant_mode: params.assistantMode ?? "operations",
    },
  });

  return response.data;
}

export async function getAdminChatSessions(): Promise<ChatSessionSummary[]> {
  const response = await apiClient.get<ChatHistoryListResponse>("/chat/history", {
    params: {
      audience: "staff",
    },
  });

  if (Array.isArray(response.data?.data)) {
    return response.data.data;
  }

  return [];
}

export async function getAdminSessionMessages(
  sessionId: string
): Promise<ChatMessage[]> {
  const response = await apiClient.get<ChatMessagesResponse>("/chat/history", {
    params: {
      audience: "staff",
      session_id: sessionId,
    },
  });

  if (Array.isArray(response.data?.data)) {
    return response.data.data;
  }

  return [];
}

/**
 * Backward-compatible helper for old callers.
 * It returns the most recent staff chat's messages instead of one flattened history.
 */
export async function getAdminChatHistory(): Promise<ChatMessage[]> {
  const sessions = await getAdminChatSessions();

  if (!sessions.length) {
    return [];
  }

  return getAdminSessionMessages(sessions[0].id);
}

export async function endAdminChatSession(
  sessionId?: string | null
): Promise<void> {
  await apiClient.post("/chat/end", {
    audience: "staff",
    session_id: sessionId ?? null,
  });
}

export async function deleteAdminChatSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/chat/history/${encodeURIComponent(sessionId)}`, {
    params: {
      audience: "staff",
    },
  });
}
