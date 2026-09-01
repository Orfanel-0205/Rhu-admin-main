// src/pages/TeamChat.tsx
// Team Chat — internal staff-to-staff messaging (web admin only).
//
// Load-safety: the page polls ONLY while mounted (interval cleared on unmount),
// asks the backend for a cheap since_id delta rather than re-fetching history,
// and lazy-loads thread history in pages via before_id. New-message alerts call
// into the existing global toast (emitToast) without modifying it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Search, Plus, Users, Send, ArrowLeft, ImagePlus, X, Trash2, Settings, Pencil, Phone, Video, PhoneOff, Check, CheckCheck } from "lucide-react";
import { color, radius, space } from "../theme/tokens";
import ModuleTabs from "../components/ui/ModuleTabs";
import ImageUploader, { CMS_CROP_PRESETS } from "../components/ImageUploader";
import { emitToast } from "../lib/toastBus";
import { useAuthStore } from "../store/authStore";
import {
  listConversations,
  pollUpdates,
  startCall,
  joinCall,
  declineCall,
  endCall,
  type ChatCall,
  getThread,
  listContacts,
  createDm,
  createGroup,
  deleteConversation,
  deleteMessage,
  updateGroup,
  sendMessage,
  markRead,
  searchMessages,
  uploadAttachment,
  type ConversationSummary,
  type ChatMessage,
  type ChatContact,
} from "../services/teamChat";

// Poll cadence while the Team Chat page is open AND the browser tab is visible.
// Each tick is a SINGLE request (conversation delta + open-thread tail combined),
// so at ~15 req/min it stays comfortably under the per-user rate limit alongside
// the notifications bell and sidebar polls.
const POLL_MS = 4000;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Human "last seen" label from the presence heartbeat. Presence is derived from
 * a timestamp refreshed by existing polls, so it is deliberately coarse.
 */
function lastSeenLabel(iso?: string | null): string {
  if (!iso) return "Offline";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Offline";

  const mins = Math.floor((Date.now() - then) / 60000);

  if (mins < 1) return "Active now";
  if (mins < 60) return `Last seen ${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "Last seen yesterday" : `Last seen ${days}d ago`;
}

function Avatar({
  name,
  url,
  size = 42,
  online,
}: {
  name: string;
  url?: string | null;
  size?: number;
  /** undefined = do not show a presence dot at all (groups, unknown). */
  online?: boolean;
}) {
  const inner = url ? (
    <img
      src={url}
      alt={name}
      style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color.brandDark,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontWeight: 900,
        fontSize: size * 0.36,
        flexShrink: 0,
      }}
    >
      {initials(name) || "?"}
    </div>
  );

  if (online === undefined) return inner;

  return (
    <span
      style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
      title={online ? "Active now" : "Offline"}
    >
      {inner}
      <span
        aria-label={online ? "Active now" : "Offline"}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: Math.max(9, size * 0.26),
          height: Math.max(9, size * 0.26),
          borderRadius: 999,
          background: online ? "#22C55E" : "#CBD5E1",
          border: "2px solid #fff",
        }}
      />
    </span>
  );
}

export default function TeamChat() {
  const authUser = useAuthStore((s) => s.user);
  const meId = Number(authUser?.user_id ?? authUser?.id ?? 0);
  const [mode, setMode] = useState<"chats" | "search">("chats");

  /**
   * Calls. `incomingCall` is whatever active call the poll reported that I have
   * not joined or dismissed; `joinedCall` is the one I am actually in.
   * dismissedCallsRef keeps a declined call from re-ringing on the next tick.
   */
  const [incomingCall, setIncomingCall] = useState<ChatCall | null>(null);
  const [joinedCall, setJoinedCall] = useState<ChatCall | null>(null);
  const [callBusy, setCallBusy] = useState(false);
  const dismissedCallsRef = useRef<Set<number>>(new Set());
  const callWindowRef = useRef<Window | null>(null);

  // Single-panel collapse for phones/tablets: below this width the list and the
  // thread never share the screen — the list shows until a conversation is
  // tapped, then the thread takes over (the existing back arrow returns to it).
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<
    { attachment_path: string; url: string; attachment_meta: any } | null
  >(null);
  const [attachOpen, setAttachOpen] = useState(false);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupPicks, setGroupPicks] = useState<number[]>([]);
  const [groupImage, setGroupImage] = useState<{ path: string; url: string } | null>(null);
  const [groupImageUploading, setGroupImageUploading] = useState(false);

  // Group settings (rename / change icon) modal state.
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState("");
  const [settingsImage, setSettingsImage] = useState<{ path?: string; url: string } | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<(ChatMessage & { conversation_id: number })[]>([]);
  const [searching, setSearching] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesBoxRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const maxSeenRef = useRef(0); // highest conversation message id seen (for updates since_id)
  const threadMaxRef = useRef(0); // highest message id in the OPEN thread (for after_id tail)
  const notifiedRef = useRef(0); // highest message id already toasted (dedupe)
  const backoffUntilRef = useRef(0); // epoch ms until which polling pauses after a 429

  activeIdRef.current = activeId;

  // Keep the open-thread high-water mark in sync so the poll only ever asks for
  // messages strictly newer than what is already on screen.
  useEffect(() => {
    threadMaxRef.current = thread.reduce((m, x) => Math.max(m, x.id), 0);
  }, [thread]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  /** DM peer presence, and how many group members are active right now. */
  const otherOnline = useMemo(() => {
    if (!active || active.type !== "dm") return false;
    return Boolean(active.participants.find((p) => p.id !== meId)?.is_online);
  }, [active, meId]);

  const onlineMemberCount = useMemo(() => {
    if (!active || active.type !== "group") return 0;
    return active.participants.filter((p) => p.id !== meId && p.is_online).length;
  }, [active, meId]);

  /**
   * Seen receipts. `read_up_to` is the highest message id read by EVERY other
   * active participant, so a group only reads "Seen" once everyone has caught
   * up — matching what the label claims.
   */
  const lastMineId = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i -= 1) {
      if (thread[i].sender_id === meId) return thread[i].id;
    }
    return 0;
  }, [thread, meId]);

  const seenByAll = useMemo(
    () => lastMineId > 0 && Number(active?.read_up_to ?? 0) >= lastMineId,
    [active, lastMineId]
  );


  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations]
  );

  const mergeConversations = useCallback((incoming: ConversationSummary[]) => {
    if (incoming.length === 0) return;
    setConversations((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      for (const c of incoming) byId.set(c.id, c);
      return Array.from(byId.values()).sort((a, b) => {
        const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
        const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
        return tb - ta;
      });
    });
  }, []);

  // Initial load.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await listConversations();
        setConversations(data);
        maxSeenRef.current = data.reduce(
          (m, c) => Math.max(m, c.last_message?.id ?? 0),
          0
        );
      } catch {
        emitToast("Could not load your conversations.", "error");
      }
    })();
  }, []);

  // Polling — runs ONLY while this page is mounted AND the tab is visible.
  // Each tick does two cheap indexed queries: an `updates` conversation delta
  // (for the list + toast) and, for the open thread, an `after_id` tail that
  // returns only messages newer than what is already shown (usually empty).
  useEffect(() => {
    let cancelled = false;

    const appendToOpenThread = (msgs: ChatMessage[]) => {
      if (msgs.length === 0) return;
      const box = messagesBoxRef.current;
      // Only auto-scroll when the reader is already near the bottom, so a live
      // message never yanks someone who scrolled up to read older history.
      const nearBottom = box
        ? box.scrollHeight - box.scrollTop - box.clientHeight < 140
        : true;

      setThread((prev) => {
        const have = new Set(prev.map((m) => m.id));
        const add = msgs.filter((m) => !have.has(m.id));
        return add.length ? [...prev, ...add] : prev;
      });

      if (nearBottom) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
      }
    };

    const tick = async () => {
      if (cancelled || document.hidden) return;
      // Respect a cool-off window after a 429 so we never pile onto the limit.
      if (Date.now() < backoffUntilRef.current) return;

      const openId = activeIdRef.current;
      try {
        // ONE request per tick: conversation delta + the open thread's tail.
        const { data, active_messages, active_calls } = await pollUpdates(
          maxSeenRef.current,
          openId ?? 0,
          threadMaxRef.current
        );

        // Ring for a call someone else started that I have not dismissed.
        // This rides the existing tick, so it adds no request of its own.
        const ringing = (active_calls ?? []).find(
          (c) => !c.started_by_me && !dismissedCallsRef.current.has(c.id)
        );
        setIncomingCall(ringing ?? null);

        // If the call I am in has ended elsewhere, drop out of it.
        setJoinedCall((prev) =>
          prev && !(active_calls ?? []).some((c) => c.id === prev.id) ? null : prev
        );

        if (data.length > 0) {
          // Toast genuinely new inbound messages (not mine, not the open thread).
          for (const c of data) {
            const lm = c.last_message;
            if (
              lm &&
              lm.id > notifiedRef.current &&
              meId > 0 &&
              lm.sender_id !== meId &&
              c.id !== activeIdRef.current
            ) {
              emitToast(`New message from ${c.title}`, "info");
            }
          }

          const maxIncoming = data.reduce((m, c) => Math.max(m, c.last_message?.id ?? 0), 0);
          notifiedRef.current = Math.max(notifiedRef.current, maxIncoming);
          maxSeenRef.current = Math.max(maxSeenRef.current, maxIncoming);
          mergeConversations(data);
        }

        // Live tail for the open conversation (already fetched in the same call).
        if (openId && active_messages.length > 0) {
          appendToOpenThread(active_messages);
          const tailMax = active_messages.reduce((m, x) => Math.max(m, x.id), threadMaxRef.current);
          threadMaxRef.current = tailMax;
          maxSeenRef.current = Math.max(maxSeenRef.current, tailMax);

          // Clear unread only when the new tail contains an INBOUND message.
          if (active_messages.some((m) => m.sender_id !== meId)) {
            markRead(openId)
              .then(() =>
                setConversations((prev) =>
                  prev.map((c) => (c.id === openId ? { ...c, unread_count: 0 } : c))
                )
              )
              .catch(() => {});
          }
        }
      } catch (e: any) {
        // On rate-limit, back off for a while instead of hammering the server.
        if (e?.response?.status === 429) {
          backoffUntilRef.current = Date.now() + 30000;
        }
        // Any other dropped tick is harmless; the next one recovers.
      }
    };

    const timer = window.setInterval(tick, POLL_MS);
    // Catch up immediately when the tab regains focus (it was paused while hidden).
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [meId, mergeConversations]);

  const openConversation = useCallback(
    async (id: number) => {
      setActiveId(id);
      setThread([]);
      setHasMore(false);
      setLoadingThread(true);
      try {
        const { data, has_more, conversation } = await getThread(id);
        setThread(data);
        setHasMore(has_more);
        if (conversation) mergeConversations([conversation]);
        maxSeenRef.current = Math.max(
          maxSeenRef.current,
          data.reduce((m, x) => Math.max(m, x.id), 0)
        );
        await markRead(id);
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
        );
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 40);
      } catch {
        emitToast("Could not open that conversation.", "error");
      } finally {
        setLoadingThread(false);
      }
    },
    [mergeConversations]
  );

  const loadOlder = useCallback(async () => {
    if (!activeId || thread.length === 0) return;
    try {
      const { data, has_more } = await getThread(activeId, thread[0].id);
      setThread((prev) => [...data, ...prev]);
      setHasMore(has_more);
    } catch {
      emitToast("Could not load older messages.", "error");
    }
  }, [activeId, thread]);

  const doSend = useCallback(async () => {
    if (!activeId || sending) return;
    const body = composer.trim();
    if (!body && !pendingAttachment) return;

    setSending(true);
    try {
      const msg = await sendMessage(activeId, {
        body: body || undefined,
        attachment_path: pendingAttachment?.attachment_path,
        attachment_meta: pendingAttachment?.attachment_meta,
      });
      setThread((prev) => [...prev, msg]);
      setComposer("");
      setPendingAttachment(null);
      maxSeenRef.current = Math.max(maxSeenRef.current, msg.id);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                last_message: {
                  id: msg.id,
                  preview: msg.body ? msg.body.slice(0, 60) : "📷 Photo",
                  sender_id: meId,
                  created_at: msg.created_at,
                },
                last_message_at: msg.created_at,
              }
            : c
        )
      );
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Message failed to send.", "error");
    } finally {
      setSending(false);
    }
  }, [activeId, composer, pendingAttachment, sending, meId]);

  const openNewChat = useCallback(async (group: boolean) => {
    setGroupMode(group);
    setGroupPicks([]);
    setGroupTitle("");
    setGroupImage(null);
    setContactSearch("");
    setNewChatOpen(true);
    try {
      setContacts(await listContacts());
    } catch {
      emitToast("Could not load staff contacts.", "error");
    }
  }, []);

  // Upload the chosen group photo through the existing attachment endpoint and
  // keep its path to attach on group creation.
  const onPickGroupImage = useCallback(async (file: File | null) => {
    if (!file) {
      setGroupImage(null);
      return;
    }
    setGroupImageUploading(true);
    try {
      const uploaded = await uploadAttachment(file);
      setGroupImage({ path: uploaded.attachment_path, url: uploaded.url });
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Group image upload failed.", "error");
    } finally {
      setGroupImageUploading(false);
    }
  }, []);

  const handleDeleteConversation = useCallback(async (c: ConversationSummary) => {
    const ok =
      typeof globalThis.confirm === "function"
        ? globalThis.confirm(
            `Delete this conversation${c.type === "group" ? ` (${c.title})` : ""}? ` +
              "It will be removed from your list, but reappears if a new message arrives."
          )
        : true;
    if (!ok) return;
    try {
      await deleteConversation(c.id);
      setConversations((prev) => prev.filter((x) => x.id !== c.id));
      if (activeIdRef.current === c.id) setActiveId(null);
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Could not delete the conversation.", "error");
    }
  }, []);

  const handleDeleteMessage = useCallback(async (m: ChatMessage) => {
    const ok =
      typeof globalThis.confirm === "function"
        ? globalThis.confirm("Delete this message? It will show as “This message was deleted”.")
        : true;
    if (!ok) return;
    try {
      const updated = await deleteMessage(m.conversation_id, m.id);
      setThread((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...updated } : x)));
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Could not delete the message.", "error");
    }
  }, []);

  /**
   * Opens the Jitsi room in a separate window. The room comes from the backend,
   * which builds it with the SAME WebRtcService/provider config Telemedicine
   * uses — this is not a second video stack.
   */
  function openCallWindow(call: ChatCall) {
    const video = call?.video;

    // join_url carries the JWT in the right position; room_url is the
    // token-free display form and must NOT be used to join.
    const url = video?.join_url || "";

    if (!url) {
      emitToast("The call room is not configured. Ask IT to set the Jitsi settings.", "error");
      return;
    }

    /*
     * With JWT auth on, joining without a token silently fails on the 8x8
     * tenant — the room opens and then never connects. Say so instead of
     * handing the user a dead window.
     */
    if (video.jwt_enabled && !video.jwt) {
      emitToast(
        "Could not get a secure token for this call. Ask IT to check the Jitsi/JaaS key settings.",
        "error"
      );
      return;
    }

    if (video.is_demo && video.demo_warning) {
      emitToast(video.demo_warning, "warning");
    }

    callWindowRef.current = window.open(
      url,
      `kaagapay_call_${call.id}`,
      "noopener,noreferrer,width=1100,height=760"
    );

    if (!callWindowRef.current) {
      emitToast("Allow pop-ups for this site to open the call window.", "warning");
    }
  }

  async function doStartCall(callMode: "audio" | "video") {
    if (!active || callBusy) return;

    setCallBusy(true);
    try {
      const call = await startCall(active.id, callMode);
      setJoinedCall(call);
      openCallWindow(call);
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Could not start the call.", "error");
    } finally {
      setCallBusy(false);
    }
  }

  async function doAnswerCall() {
    if (!incomingCall || callBusy) return;

    setCallBusy(true);
    try {
      const call = await joinCall(incomingCall.id);
      setJoinedCall(call);
      setIncomingCall(null);
      openCallWindow(call);
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Could not join the call.", "error");
    } finally {
      setCallBusy(false);
    }
  }

  async function doDeclineCall() {
    if (!incomingCall || callBusy) return;

    const id = incomingCall.id;
    dismissedCallsRef.current.add(id);
    setIncomingCall(null);
    setCallBusy(true);

    try {
      await declineCall(id);
    } catch {
      // Dismissing locally is enough; the ring is already gone for this user.
    } finally {
      setCallBusy(false);
    }
  }

  async function doEndCall() {
    if (!joinedCall || callBusy) return;

    const id = joinedCall.id;
    setCallBusy(true);

    try {
      await endCall(id);
    } catch {
      // Ending is best-effort; the stale-call window closes it server-side anyway.
    } finally {
      setJoinedCall(null);
      setCallBusy(false);

      try {
        callWindowRef.current?.close();
      } catch {
        // Cross-origin close can throw; harmless.
      }
      callWindowRef.current = null;
    }
  }

  const openGroupSettings = useCallback(() => {
    if (!active || active.type !== "group") return;
    setSettingsTitle(active.title || "");
    setSettingsImage(active.avatar ? { url: active.avatar } : null);
    setGroupSettingsOpen(true);
  }, [active]);

  const onPickSettingsImage = useCallback(async (file: File | null) => {
    if (!file) {
      setSettingsImage(null);
      return;
    }
    try {
      const uploaded = await uploadAttachment(file);
      setSettingsImage({ path: uploaded.attachment_path, url: uploaded.url });
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Image upload failed.", "error");
    }
  }, []);

  const saveGroupSettings = useCallback(async () => {
    if (!active) return;
    if (!settingsTitle.trim()) {
      emitToast("Group name cannot be empty.", "info");
      return;
    }
    setSettingsSaving(true);
    try {
      const updated = await updateGroup(active.id, {
        title: settingsTitle.trim(),
        image_path: settingsImage?.path, // only sends a NEW uploaded image
      });
      mergeConversations([updated]);
      setGroupSettingsOpen(false);
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Could not update the group.", "error");
    } finally {
      setSettingsSaving(false);
    }
  }, [active, settingsTitle, settingsImage, mergeConversations]);

  useEffect(() => {
    if (!newChatOpen) return;
    const t = window.setTimeout(async () => {
      try {
        setContacts(await listContacts(contactSearch));
      } catch {
        /* ignore */
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [contactSearch, newChatOpen]);

  const startDm = useCallback(
    async (contact: ChatContact) => {
      try {
        const convo = await createDm(contact.id);
        mergeConversations([convo]);
        setNewChatOpen(false);
        setMode("chats");
        openConversation(convo.id);
      } catch (e: any) {
        emitToast(e?.response?.data?.message || "Could not start conversation.", "error");
      }
    },
    [mergeConversations, openConversation]
  );

  const startGroup = useCallback(async () => {
    if (!groupTitle.trim() || groupPicks.length === 0) {
      emitToast("Add a group name and at least one member.", "info");
      return;
    }
    try {
      const convo = await createGroup(groupTitle.trim(), groupPicks, groupImage?.path);
      mergeConversations([convo]);
      setNewChatOpen(false);
      setMode("chats");
      openConversation(convo.id);
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Could not create group.", "error");
    }
  }, [groupTitle, groupPicks, groupImage, mergeConversations, openConversation]);

  const runSearch = useCallback(async () => {
    const q = searchTerm.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await searchMessages(q);
      setSearchResults(data);
    } catch {
      emitToast("Search failed.", "error");
    } finally {
      setSearching(false);
    }
  }, [searchTerm]);

  const onPickImage = useCallback(async (file: File | null) => {
    if (!file) {
      setPendingAttachment(null);
      return;
    }
    try {
      const uploaded = await uploadAttachment(file);
      setPendingAttachment(uploaded);
      setAttachOpen(false);
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Image upload failed.", "error");
    }
  }, []);

  return (
    <div style={{ padding: space.lg ?? 20, width: "100%", maxWidth: "100%" }}>
      {/* Header sized to match the Patient Profile module's compact card style. */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0F172A" }}>
          Team Chat
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: color.textMuted }}>
          Internal staff messaging{totalUnread > 0 ? ` · ${totalUnread} unread` : ""}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          height: "calc(100vh - 200px)",
          minHeight: 480,
        }}
      >
        {/* LEFT PANEL — hidden on narrow screens once a conversation is open */}
        <div
          style={{
            flex: isNarrow ? "1 1 100%" : "0 0 340px",
            display: isNarrow && active ? "none" : "flex",
            flexDirection: "column",
            border: `1px solid ${color.line}`,
            borderRadius: radius.lg ?? 16,
            background: color.surface,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 12, borderBottom: `1px solid ${color.line}`, display: "grid", gap: 10 }}>
            <ModuleTabs
              active={mode}
              onChange={(k) => setMode(k as "chats" | "search")}
              tabs={[
                { key: "chats", label: "Chats", icon: <MessageSquare size={15} />, badge: totalUnread || undefined },
                { key: "search", label: "Search", icon: <Search size={15} /> },
              ]}
            />
            {mode === "chats" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => openNewChat(false)} style={pillBtn}>
                  <Plus size={15} /> New chat
                </button>
                <button type="button" onClick={() => openNewChat(true)} style={pillBtn}>
                  <Users size={15} /> New group
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Search your messages…"
                  style={inputStyle}
                />
                <button type="button" onClick={runSearch} style={pillBtn}>
                  <Search size={15} />
                </button>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {mode === "chats" ? (
              conversations.length === 0 ? (
                <Empty text="No conversations yet. Start a new chat." />
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openConversation(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openConversation(c.id);
                      }
                    }}
                    className="tc-conversation-row"
                    style={{
                      position: "relative",
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      padding: "11px 12px",
                      borderBottom: `1px solid ${color.line}`,
                      background: c.id === activeId ? "#F0FDFA" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <Avatar
                      name={c.title}
                      url={c.avatar}
                      online={
                        c.type === "dm"
                          ? Boolean(c.participants.find((p) => p.id !== meId)?.is_online)
                          : undefined
                      }
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.type === "group" ? "👥 " : ""}{c.title}
                        </span>
                        <span style={{ fontSize: 11, color: color.textMuted, flexShrink: 0 }}>
                          {timeLabel(c.last_message_at)}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 12.5, color: color.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.last_message?.preview ?? "No messages yet"}
                        </span>
                        {c.unread_count > 0 ? (
                          <span style={unreadBadge}>{c.unread_count}</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Delete (soft) — appears on row hover; stops the row's open click. */}
                    <button
                      type="button"
                      className="tc-delete-btn"
                      aria-label="Delete conversation"
                      title="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(c);
                      }}
                      style={deleteRowBtnStyle}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )
            ) : searching ? (
              <Empty text="Searching…" />
            ) : searchResults.length === 0 ? (
              <Empty text={searchTerm ? "No matching messages." : "Type to search your messages."} />
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setMode("chats");
                    openConversation(r.conversation_id);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: `1px solid ${color.line}`,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13, color: "#0F172A" }}>{r.body}</div>
                  <div style={{ fontSize: 11, color: color.textMuted, marginTop: 3 }}>
                    {timeLabel(r.created_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL — the only panel shown on narrow screens once open */}
        <div
          style={{
            flex: 1,
            display: isNarrow && !active ? "none" : "flex",
            flexDirection: "column",
            border: `1px solid ${color.line}`,
            borderRadius: radius.lg ?? 16,
            background: color.surface,
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {!active ? (
            <div style={{ flex: 1, display: "grid", placeItems: "center", color: color.textMuted }}>
              <div style={{ textAlign: "center" }}>
                <MessageSquare size={40} color={color.line} />
                <p style={{ marginTop: 10, fontSize: 14 }}>Select a conversation to start messaging.</p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${color.line}`, display: "flex", gap: 12, alignItems: "center" }}>
                <button type="button" onClick={() => setActiveId(null)} style={{ ...iconBtn, display: "inline-flex" }} aria-label="Back">
                  <ArrowLeft size={18} />
                </button>

                {/* Group icon click → settings (rename / change icon) for managers. */}
                {active.type === "group" && active.can_manage ? (
                  <button
                    type="button"
                    onClick={openGroupSettings}
                    title="Group settings"
                    aria-label="Group settings"
                    style={{ position: "relative", border: "none", background: "none", padding: 0, cursor: "pointer" }}
                  >
                    <Avatar name={active.title} url={active.avatar} size={38} />
                    <span
                      style={{
                        position: "absolute",
                        right: -3,
                        bottom: -3,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: color.brandDark,
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        border: "2px solid #fff",
                      }}
                    >
                      <Pencil size={9} />
                    </span>
                  </button>
                ) : (
                  <Avatar
                    name={active.title}
                    url={active.avatar}
                    size={38}
                    online={active.type === "dm" ? otherOnline : undefined}
                  />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>
                    {active.type === "group" ? "👥 " : ""}{active.title}
                  </div>
                  <div style={{ fontSize: 12, color: otherOnline ? "#15803D" : color.textMuted }}>
                    {active.type === "group"
                      ? `${active.participant_count} members${
                          onlineMemberCount > 0 ? ` · ${onlineMemberCount} active now` : ""
                        }`
                      : otherOnline
                        ? "Active now"
                        : lastSeenLabel(active.participants.find((p) => p.id !== meId)?.last_active_at)}
                  </div>
                </div>

                {joinedCall ? (
                  <button
                    type="button"
                    onClick={doEndCall}
                    disabled={callBusy}
                    style={{ ...iconBtn, background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5" }}
                    aria-label="End call"
                    title="End call"
                  >
                    <PhoneOff size={18} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => doStartCall("audio")}
                      disabled={callBusy}
                      style={iconBtn}
                      aria-label="Start voice call"
                      title="Start voice call"
                    >
                      <Phone size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => doStartCall("video")}
                      disabled={callBusy}
                      style={iconBtn}
                      aria-label="Start video call"
                      title="Start video call"
                    >
                      <Video size={18} />
                    </button>
                  </>
                )}

                {active.type === "group" && active.can_manage ? (
                  <button
                    type="button"
                    onClick={openGroupSettings}
                    style={iconBtn}
                    aria-label="Group settings"
                    title="Group settings"
                  >
                    <Settings size={18} />
                  </button>
                ) : null}
              </div>

              {incomingCall ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 16px",
                    background: "#ECFDF5",
                    borderBottom: `1px solid ${color.line}`,
                  }}
                >
                  {incomingCall.mode === "video" ? (
                    <Video size={18} color="#047857" />
                  ) : (
                    <Phone size={18} color="#047857" />
                  )}
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: "#065F46" }}>
                    {incomingCall.started_by_name} is calling…
                  </div>
                  <button
                    type="button"
                    onClick={doAnswerCall}
                    disabled={callBusy}
                    style={{ ...pillBtn, background: "#047857", color: "#fff", border: "none" }}
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    onClick={doDeclineCall}
                    disabled={callBusy}
                    style={{ ...pillBtn, background: "#fff", color: "#B91C1C", border: "1px solid #FCA5A5" }}
                  >
                    Decline
                  </button>
                </div>
              ) : null}

              <div ref={messagesBoxRef} style={{ flex: 1, overflowY: "auto", padding: 16, background: "#FAFAFA" }}>
                {hasMore ? (
                  <div style={{ textAlign: "center", marginBottom: 12 }}>
                    <button type="button" onClick={loadOlder} style={pillBtn}>
                      Load older messages
                    </button>
                  </div>
                ) : null}
                {loadingThread ? (
                  <Empty text="Loading…" />
                ) : (
                  thread.map((m) => {
                    const mine = m.sender_id === meId;
                    const canDelete = !m.deleted && mine;

                    if (m.deleted) {
                      // Soft-deleted → placeholder bubble (row kept in DB).
                      return (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            justifyContent: mine ? "flex-end" : "flex-start",
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              maxWidth: "72%",
                              background: "#F1F5F9",
                              color: "#94A3B8",
                              border: `1px dashed ${color.line}`,
                              borderRadius: 14,
                              padding: "8px 13px",
                              fontSize: 13,
                              fontStyle: "italic",
                            }}
                          >
                            🚫 This message was deleted
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={m.id}
                        className="tc-message-row"
                        style={{
                          display: "flex",
                          justifyContent: mine ? "flex-end" : "flex-start",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 8,
                        }}
                      >
                        {mine && canDelete ? (
                          <button
                            type="button"
                            className="tc-msg-delete"
                            aria-label="Delete message"
                            title="Delete message"
                            onClick={() => handleDeleteMessage(m)}
                            style={msgDeleteBtnStyle}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}

                        <div
                          style={{
                            maxWidth: "72%",
                            background: mine ? color.brandDark : "#FFFFFF",
                            color: mine ? "#fff" : "#0F172A",
                            border: mine ? "none" : `1px solid ${color.line}`,
                            borderRadius: 14,
                            padding: m.attachment_url ? 6 : "9px 13px",
                            boxShadow: "0 1px 2px rgba(15,23,42,.05)",
                          }}
                        >
                          {m.attachment_url ? (
                            <a href={m.attachment_url} target="_blank" rel="noreferrer">
                              <img
                                src={m.attachment_url}
                                alt="attachment"
                                style={{ maxWidth: 260, maxHeight: 260, borderRadius: 10, display: "block" }}
                              />
                            </a>
                          ) : null}
                          {m.body ? (
                            <div style={{ fontSize: 14, lineHeight: 1.45, padding: m.attachment_url ? "6px 7px 2px" : 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {m.body}
                            </div>
                          ) : null}
                          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 3, textAlign: "right", padding: m.attachment_url ? "0 7px 4px" : 0 }}>
                            {timeLabel(m.created_at)}
                          </div>
                        </div>

                        {!mine && canDelete ? (
                          <button
                            type="button"
                            className="tc-msg-delete"
                            aria-label="Delete message"
                            title="Delete message (Super Admin)"
                            onClick={() => handleDeleteMessage(m)}
                            style={msgDeleteBtnStyle}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
                {lastMineId > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      gap: 4,
                      marginTop: -2,
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: seenByAll ? "#0F766E" : color.textMuted,
                    }}
                    title={
                      seenByAll
                        ? "Seen by everyone in this conversation"
                        : "Delivered — not read yet"
                    }
                  >
                    {seenByAll ? <CheckCheck size={13} /> : <Check size={13} />}
                    {seenByAll ? "Seen" : "Sent"}
                  </div>
                ) : null}

                <div ref={bottomRef} />
              </div>

              {pendingAttachment ? (
                <div style={{ padding: "8px 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                  <img src={pendingAttachment.url} alt="pending" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                  <span style={{ fontSize: 12.5, color: color.textMuted }}>Photo attached</span>
                  <button type="button" onClick={() => setPendingAttachment(null)} style={iconBtn} aria-label="Remove attachment">
                    <X size={15} />
                  </button>
                </div>
              ) : null}

              <div style={{ padding: 12, borderTop: `1px solid ${color.line}`, display: "flex", gap: 8, alignItems: "flex-end" }}>
                <button type="button" onClick={() => setAttachOpen(true)} style={iconBtn} aria-label="Attach photo">
                  <ImagePlus size={20} />
                </button>
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      doSend();
                    }
                  }}
                  placeholder="Type a message…"
                  rows={1}
                  style={{ ...inputStyle, flex: 1, resize: "none", maxHeight: 120 }}
                />
                <button
                  type="button"
                  onClick={doSend}
                  disabled={sending || (!composer.trim() && !pendingAttachment)}
                  style={{
                    ...pillBtn,
                    background: color.brandDark,
                    color: "#fff",
                    border: "none",
                    opacity: sending || (!composer.trim() && !pendingAttachment) ? 0.5 : 1,
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ATTACH MODAL */}
      {attachOpen ? (
        <Modal title="Attach a photo" onClose={() => setAttachOpen(false)}>
          <ImageUploader
            label="Chat photo (max 8 MB)"
            maxSizeMB={8}
            aspect={4 / 3}
            presets={CMS_CROP_PRESETS}
            onChange={onPickImage}
          />
        </Modal>
      ) : null}

      {/* NEW CHAT / GROUP MODAL */}
      {newChatOpen ? (
        <Modal
          title={groupMode ? "New group" : "New chat"}
          onClose={() => setNewChatOpen(false)}
        >
          {groupMode ? (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                {/* Group photo — optional; falls back to initials if none. */}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    flexShrink: 0,
                    overflow: "hidden",
                    background: color.brandDark,
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                  }}
                >
                  {groupImage ? (
                    <img
                      src={groupImage.url}
                      alt="Group"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <Users size={22} />
                  )}
                </div>
                <input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="Group name"
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <ImageUploader
                  label={groupImageUploading ? "Uploading photo…" : "Group photo (optional)"}
                  value={groupImage?.url ?? null}
                  onChange={onPickGroupImage}
                  maxSizeMB={5}
                  aspect={1}
                  presets={CMS_CROP_PRESETS}
                />
              </div>
            </>
          ) : null}
          <input
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            placeholder="Search staff…"
            style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
          />
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${color.line}`, borderRadius: 10 }}>
            {contacts.length === 0 ? (
              <Empty text="No staff found in your RHU." />
            ) : (
              contacts.map((c) => {
                const picked = groupPicks.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      groupMode
                        ? setGroupPicks((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                          )
                        : startDm(c)
                    }
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "9px 12px",
                      border: "none",
                      borderBottom: `1px solid ${color.line}`,
                      background: picked ? "#F0FDFA" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <Avatar name={c.name} url={c.avatar} size={34} online={c.is_online} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: color.textMuted }}>
                        {c.role ?? "Staff"}{c.rhu_id ? ` · RHU ${c.rhu_id}` : ""}
                      </div>
                    </div>
                    {groupMode && picked ? <span style={{ color: color.brandDark, fontWeight: 900 }}>✓</span> : null}
                  </button>
                );
              })
            )}
          </div>
          {groupMode ? (
            <button
              type="button"
              onClick={startGroup}
              style={{ ...pillBtn, background: color.brandDark, color: "#fff", border: "none", width: "100%", justifyContent: "center", marginTop: 12 }}
            >
              Create group ({groupPicks.length})
            </button>
          ) : null}
        </Modal>
      ) : null}

      {/* GROUP SETTINGS — rename + change icon */}
      {groupSettingsOpen && active && active.type === "group" ? (
        <Modal title="Group settings" onClose={() => setGroupSettingsOpen(false)}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                overflow: "hidden",
                flexShrink: 0,
                background: color.brandDark,
                color: "#fff",
                display: "grid",
                placeItems: "center",
              }}
            >
              {settingsImage?.url ? (
                <img src={settingsImage.url} alt="Group" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Users size={22} />
              )}
            </div>
            <input
              value={settingsTitle}
              onChange={(e) => setSettingsTitle(e.target.value)}
              placeholder="Group name"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <ImageUploader
              label="Change group photo"
              value={settingsImage?.url ?? null}
              onChange={onPickSettingsImage}
              maxSizeMB={5}
              aspect={1}
              presets={CMS_CROP_PRESETS}
            />
          </div>

          <button
            type="button"
            onClick={saveGroupSettings}
            disabled={settingsSaving}
            style={{
              ...pillBtn,
              background: color.brandDark,
              color: "#fff",
              border: "none",
              width: "100%",
              justifyContent: "center",
              opacity: settingsSaving ? 0.6 : 1,
            }}
          >
            {settingsSaving ? "Saving…" : "Save changes"}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: 24, textAlign: "center", color: color.textMuted, fontSize: 13 }}>
      {text}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fff",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 24px 60px rgba(15,23,42,.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>{title}</h3>
          <button type="button" onClick={onClose} style={iconBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  minHeight: 38,
  border: `1px solid ${color.line}`,
  borderRadius: radius.md,
  background: color.surface,
  color: color.slateFg,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const iconBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: color.slateFg,
  cursor: "pointer",
  padding: 6,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "9px 12px",
  borderRadius: radius.md,
  border: `1px solid ${color.line}`,
  fontSize: 13.5,
  fontFamily: "inherit",
  outline: "none",
  color: "#0F172A",
};

const deleteRowBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  border: "none",
  background: "transparent",
  color: "#94A3B8",
  cursor: "pointer",
  padding: 6,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
};

const msgDeleteBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  border: "none",
  background: "transparent",
  color: "#94A3B8",
  cursor: "pointer",
  padding: 4,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
};

const unreadBadge: React.CSSProperties = {
  minWidth: 18,
  height: 18,
  padding: "0 5px",
  borderRadius: 999,
  background: color.brandDark,
  color: "#fff",
  fontSize: 11,
  fontWeight: 900,
  display: "inline-grid",
  placeItems: "center",
  flexShrink: 0,
};
