"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { deleteMessage, getConversation, getMessages, markConversationRead } from "@/lib/chat/actions";
import { describeTyping, useTypingIndicator } from "@/lib/chat/client/useTypingIndicator";
import { participantKey } from "@/lib/chat/policy";
import { setSupportReportStatus } from "@/lib/support/actions";
import type { ChatMessage, ConversationDetail } from "@/lib/chat/types";

import { Composer } from "./Composer";
import { ThreadSkeleton } from "./ChatSkeleton";
import { ConversationInfoDrawer } from "./ConversationInfoDrawer";
import { ConversationAvatar, IssueStatusBadge } from "./ConversationList";
import { dayKey, formatDayLabel } from "./format";
import { BackIcon, InfoIcon } from "./icons";
import { MessageBubble, SystemMessage } from "./MessageBubble";

/** Consecutive messages from one sender within this window share one avatar. */
const GROUPING_WINDOW_MS = 5 * 60 * 1000;
/** "Near the bottom" threshold for auto-scrolling on new messages. */
const STICK_TO_BOTTOM_PX = 120;

/** The line under a conversation's title: who's in it, and who can see it. */
function headerSubtitle(detail: ConversationDetail, meKey: string | null): string {
  const muted = detail.muted ? " · muted" : "";
  switch (detail.kind) {
    case "direct":
      return detail.members.find((m) => participantKey(m) !== meKey)?.subtitle ?? "";
    case "client_order":
      return detail.me.type === "client"
        ? "About this order · with our team"
        : `With the client, about this order · all staff can see${muted}`;
    case "order":
      return `Internal: the client can't see this · ${detail.members.length} following${muted}`;
    case "support":
      return `Shared with all staff · ${detail.members.length} following${muted}`;
    case "issue":
      return "Issue report · private to you and the developer";
    case "group":
      return `${detail.members.length} members${muted}`;
  }
}

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * One open conversation: header, scrolling message thread, composer.
 *
 * Mount with key={conversationId}: state is per-conversation.
 *
 * `refreshKey` changes whenever ChatApp receives a realtime signal for this
 * conversation; the view then re-fetches the conversation and the newest page
 * of messages and merges them into what's already loaded.
 */
export function ConversationView({
  conversationId,
  refreshKey,
  onBack,
  onRead,
  onLeft,
}: {
  conversationId: string;
  refreshKey: number;
  /** Omit when embedded (e.g. inside an order drawer): hides the back arrow. */
  onBack?: () => void;
  onRead: () => void;
  onLeft: () => void;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const preserveFromBottom = useRef<number | null>(null);
  const lastMarkedId = useRef<string | null>(null);

  // --- Loading ------------------------------------------------------------

  const refresh = useCallback(async () => {
    const [d, page] = await Promise.all([getConversation(conversationId), getMessages(conversationId)]);
    if (!d.ok) return setError(d.error);
    setDetail(d.data);
    if (page.ok) setMessages((prev) => mergeMessages(prev, page.data.messages));
  }, [conversationId]);

  // Initial load. ChatApp mounts one ConversationView per conversation
  // (key={conversationId}), so switching threads starts from fresh state.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getConversation(conversationId), getMessages(conversationId)]).then(([d, page]) => {
      if (cancelled) return;
      if (!d.ok) return setError(d.error);
      if (!page.ok) return setError(page.error);
      setDetail(d.data);
      setMessages(page.data.messages);
      setCursor(page.data.nextCursor);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Realtime nudges (skip the initial render — the effect above loads).
  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== firstKey.current) refresh();
  }, [refreshKey, refresh]);

  async function loadOlder() {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    if (el) preserveFromBottom.current = el.scrollHeight - el.scrollTop;
    const page = await getMessages(conversationId, cursor);
    setLoadingOlder(false);
    if (!page.ok) return setError(page.error);
    setMessages((prev) => mergeMessages(page.data.messages, prev));
    setCursor(page.data.nextCursor);
  }

  // --- Scrolling ----------------------------------------------------------

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (preserveFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - preserveFromBottom.current; // keep place after loading older
      preserveFromBottom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
    if (el.scrollTop < 40) loadOlder();
  }

  // --- Read state ---------------------------------------------------------

  const meKey = detail ? participantKey(detail.me) : null;
  const isMine = useCallback((m: ChatMessage) => !!m.sender && participantKey(m.sender) === meKey, [meKey]);

  useEffect(() => {
    if (!detail || !messages.length || document.visibilityState !== "visible") return;
    const last = messages[messages.length - 1];
    if (lastMarkedId.current === last.id || isMine(last)) return;
    lastMarkedId.current = last.id;
    markConversationRead(conversationId).then(onRead);
  }, [messages, detail, conversationId, isMine, onRead]);

  // Receipt under my latest message: "Seen" / "Seen by A, B" / "Sent".
  const receipt = useMemo(() => {
    if (!detail) return null;
    const lastMine = [...messages].reverse().find((m) => isMine(m) && !m.deletedAt);
    if (!lastMine || messages[messages.length - 1]?.id !== lastMine.id) return null;
    const others = detail.members.filter((m) => participantKey(m) !== meKey);
    const seenBy = others.filter((m) => m.lastReadAt && m.lastReadAt >= lastMine.createdAt);
    if (!seenBy.length) return "Sent";
    if (detail.kind === "direct") return "Seen";
    return seenBy.length === others.length && others.length > 1 ? "Seen by everyone" : `Seen by ${seenBy.map((m) => m.name).join(", ")}`;
  }, [detail, messages, isMine, meKey]);

  const myName = detail?.members.find((m) => participantKey(m) === meKey)?.name ?? null;
  const typing = useTypingIndicator(
    detail?.typingChannel ?? null,
    meKey && myName ? { key: meKey, name: myName } : null,
  );
  const typingLabel = describeTyping(typing.typingNames);

  const avatarByKey = useMemo(
    () => new Map((detail?.members ?? []).map((m) => [participantKey(m), m.avatarUrl])),
    [detail],
  );

  // --- Render -------------------------------------------------------------

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted">{error}</p>
        {onBack ? (
          <button type="button" onClick={onBack} className="text-sm font-medium text-brand-600">
            Back to chats
          </button>
        ) : null}
      </div>
    );
  }

  /** Issue threads: the developer marks the report resolved / reopens it. */
  async function toggleResolved() {
    if (!detail?.issue) return;
    setResolving(true);
    setResolveError(null);
    const res = await setSupportReportStatus(detail.issue.reportId, detail.issue.status !== "resolved").catch(() => ({
      ok: false as const,
      error: "Couldn't update the issue. Please try again.",
    }));
    setResolving(false);
    if (!res.ok) return setResolveError(res.error);
    refresh();
  }

  if (!detail) return <ThreadSkeleton />;

  const showSenderNames = detail.kind !== "direct";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-2 py-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to chats"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-gray-100 md:hidden dark:hover:bg-white/5"
          >
            <BackIcon className="h-5 w-5" />
          </button>
        ) : null}
        <ConversationAvatar c={detail} />
        <button type="button" onClick={() => setInfoOpen(true)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold">{detail.title}</span>
          <span className="block truncate text-xs text-muted">
            {headerSubtitle(detail, meKey)}
          </span>
        </button>
        {detail.issue ? (
          detail.permissions.canResolve ? (
            <button
              type="button"
              onClick={toggleResolved}
              disabled={resolving}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                detail.issue.status === "resolved"
                  ? "border border-border text-foreground hover:bg-gray-100 dark:hover:bg-white/5"
                  : "bg-success-600 text-white hover:bg-success-700"
              }`}
            >
              {detail.issue.status === "resolved" ? "Reopen" : "Mark resolved"}
            </button>
          ) : (
            <IssueStatusBadge status={detail.issue.status} />
          )
        ) : null}
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="Conversation info"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <InfoIcon className="h-5 w-5" />
        </button>
      </header>

      {resolveError ? <p className="border-b border-border px-4 py-2 text-xs text-error-600">{resolveError}</p> : null}

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {cursor ? (
          <div className="py-3 text-center">
            <button type="button" onClick={loadOlder} disabled={loadingOlder} className="text-xs font-medium text-brand-600">
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        ) : messages.length ? (
          <p className="py-4 text-center text-[11px] text-muted">This is the start of the conversation.</p>
        ) : null}

        {messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">No messages yet. Say hello 👋</p>
        ) : null}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const grouped =
            !newDay &&
            !!prev &&
            prev.kind !== "system" &&
            m.kind !== "system" &&
            !!prev.sender &&
            !!m.sender &&
            participantKey(prev.sender) === participantKey(m.sender) &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUPING_WINDOW_MS;

          return (
            <Fragment key={m.id}>
              {newDay ? (
                <div className="my-3 flex items-center gap-3 text-[11px] font-medium text-muted">
                  <span className="h-px flex-1 bg-border" />
                  {formatDayLabel(m.createdAt)}
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              {m.kind === "system" ? (
                <SystemMessage message={m} />
              ) : (
                <MessageBubble
                  message={m}
                  mine={isMine(m)}
                  grouped={grouped}
                  showSenderName={showSenderNames}
                  senderAvatarUrl={m.sender ? (avatarByKey.get(participantKey(m.sender)) ?? null) : null}
                  onReply={() => {
                    setEditing(null);
                    setReplyTo(m);
                  }}
                  onEdit={() => {
                    setReplyTo(null);
                    setEditing(m);
                  }}
                  onDelete={() => deleteMessage(m.id).then(refresh)}
                />
              )}
            </Fragment>
          );
        })}

        {receipt ? <p className="mt-1 px-1 text-right text-[11px] text-muted">{receipt}</p> : null}
      </div>

      {typingLabel ? (
        <p className="px-4 pb-1 text-xs italic text-muted" aria-live="polite">
          {typingLabel}
        </p>
      ) : null}

      {!detail.permissions.canPost ? (
        <p className="border-t border-border px-4 py-3 text-center text-xs text-muted">
          {detail.permissions.readOnlyReason ?? "You can't send messages here."}
        </p>
      ) : (
        <Composer
          conversationId={conversationId}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSent={(message) => {
            stickToBottom.current = true;
            setReplyTo(null);
            setMessages((prev) => mergeMessages(prev, [message]));
            onRead();
          }}
          onEdited={() => {
            setEditing(null);
            refresh();
          }}
          onTyping={typing.notifyTyping}
          onStoppedTyping={typing.notifyStopped}
        />
      )}

      <ConversationInfoDrawer
        key={detail.id}
        open={infoOpen}
        detail={detail}
        onClose={() => setInfoOpen(false)}
        onChanged={refresh}
        onLeft={() => {
          setInfoOpen(false);
          onLeft();
        }}
      />
    </div>
  );
}
