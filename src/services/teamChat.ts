// src/services/teamChat.ts
// Team Chat — internal staff-to-staff messaging API client.

import apiClient from "../lib/apiClient";

export type ConversationType = "dm" | "group";

export interface ChatContact {
  id: number;
  name: string;
  role: string | null;
  avatar: string | null;
  rhu_id: number | null;
  /**
   * Derived presence, not a socket: the server reports "seen within N minutes",
   * refreshed by a heartbeat that rides the polls the app already makes.
   */
  is_online?: boolean;
  last_active_at?: string | null;
}

export interface ReadReceipt {
  user_id: number;
  name: string | null;
  last_read_message_id: number;
}

/** Jitsi room descriptor, built by the same service Telemedicine uses. */
export interface CallVideoConfig {
  provider: string;
  domain: string;
  room_name: string;
  /** Token-free URL, for display/logging only. */
  room_url: string;
  /** The URL to actually open: carries the JWT ahead of the # fragment. */
  join_url: string;
  /** Per-user JaaS token for the staff member joining. Null when not issued. */
  jwt: string | null;
  jwt_enabled: boolean;
  is_demo: boolean;
  demo_warning: string | null;
  configured: boolean;
}

export interface ChatCall {
  id: number;
  conversation_id: number;
  mode: "audio" | "video";
  started_by: number;
  started_by_name: string;
  started_by_me: boolean;
  started_at: string | null;
  ended_at: string | null;
  active: boolean;
  video: CallVideoConfig;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  body: string | null;
  attachment_url: string | null;
  attachment_meta: Record<string, any> | null;
  deleted?: boolean;
  created_at: string | null;
}

export interface ConversationSummary {
  id: number;
  type: ConversationType;
  title: string;
  avatar: string | null;
  rhu_id: number | null;
  created_by?: number | null;
  can_manage?: boolean;
  participants: ChatContact[];
  participant_count: number;
  last_message: {
    id: number;
    preview: string;
    sender_id: number | null;
    created_at: string | null;
  } | null;
  last_message_at: string | null;
  unread_count: number;
  /** Per-participant read markers (seen receipts). */
  read_receipts?: ReadReceipt[];
  /** Highest message id read by EVERY other active participant. */
  read_up_to?: number;
}

export interface UploadedAttachment {
  attachment_path: string;
  url: string;
  attachment_meta: { mime: string; size: number; name: string };
}

export async function listConversations(perPage = 20): Promise<{
  data: ConversationSummary[];
  total_unread: number;
}> {
  const res = await apiClient.get("/team-chat/conversations", {
    params: { per_page: perPage },
  });
  return { data: res.data?.data ?? [], total_unread: res.data?.total_unread ?? 0 };
}

export async function pollUpdates(
  sinceId: number,
  activeId = 0,
  activeAfterId = 0
): Promise<{
  data: ConversationSummary[];
  total_unread: number;
  active_conversation_id: number;
  active_messages: ChatMessage[];
  active_calls: ChatCall[];
}> {
  const res = await apiClient.get("/team-chat/updates", {
    params: {
      since_id: sinceId,
      active_id: activeId || undefined,
      active_after_id: activeAfterId || undefined,
    },
  });
  return {
    data: res.data?.data ?? [],
    total_unread: res.data?.total_unread ?? 0,
    active_conversation_id: res.data?.active_conversation_id ?? 0,
    active_messages: res.data?.active_messages ?? [],
    // Incoming-call ring rides this SAME tick — no extra poller, so calling
    // costs nothing against the per-user rate limit.
    active_calls: res.data?.active_calls ?? [],
  };
}

export async function getThread(
  conversationId: number,
  beforeId?: number,
  limit = 30
): Promise<{ data: ChatMessage[]; has_more: boolean; conversation: ConversationSummary }> {
  const res = await apiClient.get(`/team-chat/conversations/${conversationId}`, {
    params: { before_id: beforeId || undefined, limit },
  });
  return {
    data: res.data?.data ?? [],
    has_more: Boolean(res.data?.has_more),
    conversation: res.data?.conversation,
  };
}

/** Real-time tail: only messages newer than `afterId` (cheap indexed delta). */
export async function getNewMessages(
  conversationId: number,
  afterId: number
): Promise<ChatMessage[]> {
  const res = await apiClient.get(`/team-chat/conversations/${conversationId}`, {
    params: { after_id: afterId },
  });
  return res.data?.data ?? [];
}

/** Global unread total for the sidebar badge (cheap indexed aggregate). */
export async function getUnreadCount(): Promise<number> {
  const res = await apiClient.get("/team-chat/unread-count");
  return Number(res.data?.unread_count ?? 0);
}

export async function listContacts(q = ""): Promise<ChatContact[]> {
  const res = await apiClient.get("/team-chat/contacts", { params: { q: q || undefined } });
  return res.data?.data ?? [];
}

export async function createDm(targetId: number): Promise<ConversationSummary> {
  const res = await apiClient.post("/team-chat/conversations", {
    type: "dm",
    target_id: targetId,
  });
  return res.data?.data;
}

export async function createGroup(
  title: string,
  participantIds: number[],
  imagePath?: string | null
): Promise<ConversationSummary> {
  const res = await apiClient.post("/team-chat/conversations", {
    type: "group",
    title,
    participant_ids: participantIds,
    image_path: imagePath || undefined,
  });
  return res.data?.data;
}

/**
 * Soft-delete a conversation from MY list (reuses the participant soft-leave).
 * It reappears if the other person sends a new message.
 */
export async function deleteConversation(conversationId: number): Promise<void> {
  await apiClient.post(`/team-chat/conversations/${conversationId}/leave`);
}

/** Soft-delete (redact) a single message — sender only. */
export async function deleteMessage(
  conversationId: number,
  messageId: number
): Promise<ChatMessage> {
  const res = await apiClient.delete(
    `/team-chat/conversations/${conversationId}/messages/${messageId}`
  );
  return res.data?.data;
}

/** Rename / change icon of a group (creator or Super Admin). */
export async function updateGroup(
  conversationId: number,
  payload: { title?: string; image_path?: string | null }
): Promise<ConversationSummary> {
  const res = await apiClient.patch(
    `/team-chat/conversations/${conversationId}`,
    payload
  );
  return res.data?.data;
}

export async function sendMessage(
  conversationId: number,
  payload: { body?: string; attachment_path?: string; attachment_meta?: Record<string, any> }
): Promise<ChatMessage> {
  const res = await apiClient.post(
    `/team-chat/conversations/${conversationId}/messages`,
    payload
  );
  return res.data?.data;
}

export async function markRead(conversationId: number): Promise<number> {
  const res = await apiClient.post(`/team-chat/conversations/${conversationId}/read`);
  return res.data?.total_unread ?? 0;
}

export async function searchMessages(
  q: string,
  page = 1,
  perPage = 20
): Promise<{ data: (ChatMessage & { conversation_id: number })[]; meta: any }> {
  const res = await apiClient.get("/team-chat/search", {
    params: { q, page, per_page: perPage },
  });
  return { data: res.data?.data ?? [], meta: res.data?.meta ?? {} };
}

export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append("image", file);
  const res = await apiClient.post("/team-chat/attachments", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data?.data;
}

// ---------------------------------------------------------------------------
// CALLS — voice/video, reusing the existing Jitsi integration
// ---------------------------------------------------------------------------

/**
 * Starts a call, or joins the one already running in this conversation.
 * The backend is idempotent, so two people pressing Call at once land in the
 * same Jitsi room rather than two separate rooms.
 */
export async function startCall(
  conversationId: number,
  mode: "audio" | "video" = "video"
): Promise<ChatCall> {
  const res = await apiClient.post(`/team-chat/conversations/${conversationId}/call`, { mode });
  return res.data?.data;
}

export async function joinCall(callId: number): Promise<ChatCall> {
  const res = await apiClient.post(`/team-chat/calls/${callId}/join`);
  return res.data?.data;
}

export async function declineCall(callId: number): Promise<ChatCall> {
  const res = await apiClient.post(`/team-chat/calls/${callId}/decline`);
  return res.data?.data;
}

export async function endCall(callId: number): Promise<ChatCall> {
  const res = await apiClient.post(`/team-chat/calls/${callId}/end`);
  return res.data?.data;
}
