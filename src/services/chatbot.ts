// src/services/chatbot.ts

import apiClient from "../lib/apiClient";
import { describeScreen } from "../lib/screenContext";
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
  /**
   * Extra instructions for the page being opened. Only `search` is supported,
   * so the assistant can arrive with the search box already filled in.
   */
  action_params?: Record<string, string> | null;
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
  /** Dashboard language (en / tag / pag): the reply comes back in this language. */
  uiLanguage?: string;
  /** Short, spoken-style answers for staff who are not comfortable with computers. */
  simpleMode?: boolean;
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
      ui_language: params.uiLanguage,
      simple_mode: params.simpleMode ? 1 : undefined,
      // The figures currently drawn on screen, so "what does this
      // mean?" can be answered about these numbers. Aggregates only:
      // see screenContext.ts for what a page may and may not publish.
      screen: describeScreen() || undefined,
    },
  });

  return response.data;
}

/**
 * The same answer as sendAdminChatMessage, delivered a piece at a time.
 *
 * `onChunk` fires for each new piece of text, so the reply can be shown as it
 * is written instead of after the whole paragraph arrives. The resolved value
 * is the finished reply, with the page to open and any search or filter.
 *
 * Uses fetch rather than the shared API client because that one buffers whole
 * responses; streaming needs the body read as it comes. The token is read from
 * the same place the client keeps it.
 */
export async function streamAdminChatMessage(
  params: {
    message: string;
    history?: ChatMessage[];
    sessionId?: string | null;
    currentPage?: string;
    currentButton?: string;
    assistantMode?: AssistantMode;
    uiLanguage?: string;
    simpleMode?: boolean;
  },
  onChunk: (text: string) => void
): Promise<ChatResponse> {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  const token = localStorage.getItem("ka_agapay_token");

  const response = await fetch(`${base}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
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
        ui_language: params.uiLanguage,
        simple_mode: params.simpleMode ? 1 : undefined,
        // The figures currently drawn on screen, so "what does this
        // mean?" can be answered about these numbers. Aggregates only:
        // see screenContext.ts for what a page may and may not publish.
        screen: describeScreen() || undefined,
      },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Assistant stream failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: ChatResponse | null = null;

  // Server-sent events: blank-line separated blocks of "event:" and "data:".
  // A network chunk can split a block, so only complete blocks are parsed.
  for (;;) {
    const { value, done: finished } = await reader.read();

    if (finished) break;

    buffer += decoder.decode(value, { stream: true });

    let split = buffer.indexOf("\n\n");

    while (split !== -1) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      split = buffer.indexOf("\n\n");

      const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim();
      const raw = /^data:\s*(.+)$/m.exec(block)?.[1];

      if (!event || !raw) continue;

      try {
        const payload = JSON.parse(raw);

        if (event === "chunk" && typeof payload.text === "string" && payload.text) {
          onChunk(payload.text);
        } else if (event === "done") {
          done = payload as ChatResponse;
        }
      } catch {
        // A malformed block is skipped rather than breaking the reply.
      }
    }
  }

  if (!done) {
    throw new Error("The assistant did not finish its answer.");
  }

  return done;
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
