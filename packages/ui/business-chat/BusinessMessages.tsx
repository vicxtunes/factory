"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Composer, type ComposerTransport } from "@repo/ui/chat/Composer";
import { dayKey, formatDayLabel, formatListTime } from "@repo/ui/chat/format";
import { BackIcon } from "@repo/ui/chat/icons";
import { MessageBubble } from "@repo/ui/chat/MessageBubble";
import { FormSheet } from "@repo/ui/FormSheet";
import { Avatar } from "@repo/ui/profile/Avatar";
import { uploadAttachment } from "@repo/lib/chat/client/upload";
import type { ChatMessage } from "@repo/lib/chat/types";
import { bizChats, bizClients, bizDelete, bizEdit, bizOpen, bizRead, bizSaveDevice, bizSend, bizStartUpload, bizThread } from "@repo/lib/business-messages/actions";
import { isMine, seenBy, SIGNAL_EVENT, TYPING_EVENT, type BizChatSummary, type BizThread } from "@repo/lib/business-messages/core";
import { createClient } from "@repo/lib/supabase/browser";

import { LeadPill } from "./Leads";
import { SendDocument } from "./SendDocument";
import { bizSetAssistantPaused } from "@repo/lib/business-messages/actions";

// Business messages (packages/lib/business-messages), WhatsApp-style, for both
// sides: the business's workspace (`slug` null) and its client on the
// business's page (`slug`). Chats on the left and the open chat on the right
// on a computer; on a phone the chat opens full screen over the list. Live:
// the server rings this side's channel and the list and open chat reload.

const ago = formatListTime;
const subtitle = (c: BizChatSummary) => c.projectTitle ?? "General";

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(min-width: 1024px)");
    const set = () => setWide(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);
  return wide;
}

export function BusinessMessages({ slug, startWith }: { slug: string | null; startWith?: string | null }) {
  const [chats, setChats] = useState<BizChatSummary[] | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(startWith ?? null);
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const wide = useWide();

  const loadList = useCallback(
    () =>
      bizChats(slug).then((res) => {
        if (!res.ok) return setError(res.error);
        setChats(res.data.chats);
        setChannel(res.data.channel);
      }),
    [slug],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // The doorbell: any change to this side's chats reloads the list, and the open chat.
  useEffect(() => {
    if (!channel) return;
    const supabase = createClient();
    const ch = supabase
      .channel(channel)
      .on("broadcast", { event: SIGNAL_EVENT }, () => {
        void loadList();
        setTick((t) => t + 1);
      })
      .subscribe();
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void loadList();
        setTick((t) => t + 1);
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      void supabase.removeChannel(ch);
    };
  }, [channel, loadList]);

  function open(id: string) {
    setOpenId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("c", id);
    window.history.replaceState(null, "", url);
  }
  function close() {
    setOpenId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
  }

  if (error) return <p className="py-10 text-center text-sm text-error-600">{error}</p>;
  const q = search.trim().toLowerCase();
  const shown = (chats ?? []).filter((c) => !q || `${c.title} ${c.projectTitle ?? ""}`.toLowerCase().includes(q));
  // On a computer the newest chat shows when none is picked: an empty right side helps no one.
  const activeId = openId ?? (wide ? (chats?.[0]?.id ?? null) : null);
  const openChat = chats?.find((c) => c.id === activeId) ?? null;

  const list = (
    <div className="flex min-h-0 flex-col lg:border-r lg:border-border">
      <div className="flex items-center gap-2 p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          aria-label="Search chats"
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-brand-300"
        />
        {slug === null ? (
          <button type="button" onClick={() => setPicking(true)} className="inline-flex h-10 shrink-0 items-center rounded-full bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
            New chat
          </button>
        ) : null}
      </div>
      {/* After the list loads: it reads the browser's notification setting, which the server can't. */}
      {slug !== null && chats ? <NotifyMe slug={slug} /> : null}
      {!chats ? (
        <ul className="space-y-2 p-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
          ))}
        </ul>
      ) : !shown.length ? (
        <p className="px-4 py-12 text-center text-sm text-muted">{q ? "No chat matches" : slug === null ? "No messages yet. Start one with New chat." : "No messages yet"}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open(c.id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/5 ${c.id === activeId && wide ? "bg-brand-25 dark:bg-brand-500/10" : ""}`}
              >
                <Avatar url={c.avatarUrl} name={c.title} sizeClassName="h-11 w-11 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{slug === null ? c.title : subtitle(c)}</span>
                    <span className={`shrink-0 text-[11px] ${c.unread ? "font-semibold text-brand-600" : "text-muted"}`}>{ago(c.lastMessageAt)}</span>
                  </span>
                  {slug === null ? (
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-xs text-brand-600">{subtitle(c)}</span>
                      {c.lead ? <LeadPill status={c.lead.status} /> : null}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {c.lastMine && c.lastPreview ? "✓ " : ""}
                      {c.lastPreview ?? (slug === null ? "" : "Write to us")}
                    </span>
                    {c.unread ? <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span> : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const threadView = activeId ? (
    <Thread key={activeId} slug={slug} chatId={activeId} fallback={openChat} tick={tick} onBack={close} onChanged={loadList} showBack={!wide} />
  ) : (
    <div className="hidden h-full items-center justify-center text-sm text-muted lg:flex">Pick a chat</div>
  );

  return (
    <>
      <div className="lg:grid lg:h-[calc(100dvh-11rem)] lg:grid-cols-[22rem_1fr] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-surface">
        {list}
        {wide ? <div className="min-h-0">{threadView}</div> : null}
      </div>
      {!wide && openId ? <div className="fixed inset-0 z-50 flex flex-col bg-surface">{threadView}</div> : null}
      {slug === null ? (
        <NewChat
          open={picking}
          onClose={() => setPicking(false)}
          onOpened={(id) => {
            setPicking(false);
            void loadList();
            open(id);
          }}
        />
      ) : null}
    </>
  );
}

/** One open chat: header, messages by day, and the box to write in. */
function Thread({
  slug,
  chatId,
  fallback,
  tick,
  onBack,
  onChanged,
  showBack,
}: {
  slug: string | null;
  chatId: string;
  fallback: BizChatSummary | null;
  tick: number;
  onBack: () => void;
  onChanged: () => void;
  showBack: boolean;
}) {
  const [thread, setThread] = useState<BizThread | null>(null);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const typingChannel = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const lastTypingSent = useRef(0);

  const load = useCallback(
    () =>
      bizThread(slug, chatId).then((res) => {
        if (!res.ok) return setError(res.error);
        setThread(res.data);
        setCursor((c) => c ?? res.data.nextCursor);
        // Reading it turns the other side's ✓✓ on, and clears the badge.
        if (res.data.messages.some((m) => !isMine(m, res.data.side, res.data.meClientId)) && res.data.chat.unread) {
          void bizRead(slug, chatId).then(onChanged);
        }
      }),
    [slug, chatId, onChanged],
  );

  useEffect(() => {
    void load();
  }, [load, tick]);

  // Typing… on the chat's own channel, browser to browser.
  useEffect(() => {
    if (!thread?.typingChannel) return;
    const supabase = createClient();
    let clear: number | undefined;
    const ch = supabase
      .channel(thread.typingChannel)
      .on("broadcast", { event: TYPING_EVENT }, ({ payload }) => {
        const p = payload as { side: string; typing: boolean };
        if (p.side === thread.side) return;
        window.clearTimeout(clear);
        setTyping(p.typing ? p.side : null);
        if (p.typing) clear = window.setTimeout(() => setTyping(null), 6000);
      })
      .subscribe();
    typingChannel.current = ch;
    return () => {
      window.clearTimeout(clear);
      typingChannel.current = null;
      void supabase.removeChannel(ch);
    };
    // The channel's name and side don't change while the chat is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.typingChannel]);

  const sayTyping = (on: boolean) => {
    if (!thread || !typingChannel.current) return;
    if (on && Date.now() - lastTypingSent.current < 3000) return;
    lastTypingSent.current = on ? Date.now() : 0;
    void typingChannel.current.send({ type: "broadcast", event: TYPING_EVENT, payload: { side: thread.side, typing: on } });
  };

  const messages = [...older, ...(thread?.messages ?? []), ...pending];

  // Stay at the bottom as messages arrive, unless they scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  async function loadOlder() {
    if (!cursor) return;
    const el = scroller.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    const res = await bizThread(slug, chatId, cursor);
    if (!res.ok) return setError(res.error);
    setOlder((o) => [...res.data.messages, ...o]);
    setCursor(res.data.nextCursor);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  }

  const transport: ComposerTransport = {
    upload: (file, options) => uploadAttachment((input) => bizStartUpload(slug, chatId, input), file, options),
    send: async (input) => {
      const res = await bizSend(slug, chatId, input);
      if (res.ok) {
        atBottom.current = true;
        void load();
        onChanged();
      }
      return res;
    },
    edit: async (id, body) => {
      const res = await bizEdit(slug, id, body);
      if (res.ok) void load();
      return res;
    },
  };

  /** A text shows at once, greyed until it's saved, as WhatsApp's clock. */
  function sendText(body: string, reply: ChatMessage | null) {
    const temp: ChatMessage = {
      id: `pending-${Date.now()}`,
      conversationId: chatId,
      kind: "text",
      card: null,
      sender: thread ? { type: "client", id: thread.side === "business" ? `business:${thread.meClientId}` : "customer:" } : null,
      senderName: "",
      body,
      replyTo: reply ? { id: reply.id, senderName: reply.senderName, body: reply.body } : null,
      attachments: [],
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
    };
    atBottom.current = true;
    setPending((p) => [...p, temp]);
    setReplyTo(null);
    void bizSend(slug, chatId, { body, replyToId: reply?.id ?? null }).then(async (res) => {
      if (!res.ok) setError(res.error);
      await load();
      setPending((p) => p.filter((m) => m.id !== temp.id));
      onChanged();
    });
  }

  const chat = thread?.chat ?? fallback;
  const title = chat ? (slug === null ? chat.title : (chat.projectTitle ?? chat.title)) : "";
  const sub = chat ? (slug === null ? subtitle(chat) : chat.projectTitle ? chat.title : "General") : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-3 py-2.5">
        {showBack ? (
          <button type="button" onClick={onBack} aria-label="Back to chats" className="-ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/5">
            <BackIcon className="h-5 w-5" />
          </button>
        ) : null}
        <Avatar url={chat?.avatarUrl ?? null} name={chat?.title ?? ""} sizeClassName="h-10 w-10 text-sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="min-w-0 truncate">{typing !== null ? "typing…" : sub}</span>
            {slug === null && chat?.lead ? <LeadPill status={chat.lead.status} /> : null}
          </span>
        </span>
        {slug === null && thread ? (
          <SendDocument
            chatId={chatId}
            onSent={() => {
              atBottom.current = true;
              void load();
              onChanged();
            }}
          />
        ) : null}
      </header>
      {slug === null && chat?.lead && chat.lead.status !== "lost" ? (
        <HandOver
          chatId={chatId}
          paused={chat.assistantPaused}
          onChanged={() => {
            void load();
            onChanged();
          }}
        />
      ) : null}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-2"
      >
        {cursor ? (
          <div className="py-2 text-center">
            <button type="button" onClick={loadOlder} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted hover:text-foreground">
              Older messages
            </button>
          </div>
        ) : null}
        {!thread && !error ? <p className="py-10 text-center text-sm text-muted">Loading…</p> : null}
        {thread && !messages.length ? <p className="py-10 text-center text-sm text-muted">Say hello 👋</p> : null}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const mine = thread ? isMine(m, thread.side, thread.meClientId) || m.id.startsWith("pending-") : false;
          const grouped = !newDay && !!prev && prev.sender?.id === m.sender?.id && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <Fragment key={m.id}>
              {newDay ? (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-muted shadow-theme-xs">{formatDayLabel(m.createdAt)}</span>
                </div>
              ) : null}
              <div className={m.id.startsWith("pending-") ? "opacity-60" : ""}>
                <MessageBubble
                  message={m}
                  mine={mine}
                  grouped={grouped}
                  // The business sees which of its people wrote; the client sees the business.
                  showSenderName={slug === null}
                  senderAvatarUrl={slug === null ? null : (chat?.avatarUrl ?? null)}
                  seen={mine && thread && !m.id.startsWith("pending-") ? seenBy(thread.otherReadAt, m.createdAt) : undefined}
                  onReply={() => setReplyTo(m)}
                  onEdit={mine ? () => setEditing(m) : undefined}
                  onDelete={
                    mine
                      ? () =>
                          void bizDelete(slug, m.id).then((res) => {
                            if (!res.ok) setError(res.error);
                            void load();
                            onChanged();
                          })
                      : undefined
                  }
                />
              </div>
            </Fragment>
          );
        })}
        {typing !== null ? <p className="mt-2 pl-10 text-xs italic text-muted">typing…</p> : null}
      </div>

      {error ? <p className="border-t border-border px-3 py-1.5 text-xs text-error-600">{error}</p> : null}
      {thread ? (
        <div className="pb-[env(safe-area-inset-bottom)]">
          <Composer
            conversationId={chatId}
            replyTo={replyTo}
            editing={editing}
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditing(null)}
            onSendText={sendText}
            onSent={() => setReplyTo(null)}
            onEdited={() => setEditing(null)}
            onTyping={() => sayTyping(true)}
            onStoppedTyping={() => sayTyping(false)}
            transport={transport}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The business starts a chat: pick a client. */
function NewChat({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (chatId: string) => void }) {
  const [clients, setClients] = useState<{ id: string; name: string; phone: string | null }[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || clients) return;
    void bizClients().then((res) => (res.ok ? setClients(res.data) : setError(res.error)));
  }, [open, clients]);

  const query = q.trim().toLowerCase();
  const shown = (clients ?? []).filter((c) => !query || c.name.toLowerCase().includes(query) || (c.phone ?? "").includes(query)).slice(0, 100);

  return (
    <FormSheet open={open} onClose={onClose} title="New chat">
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search clients"
        aria-label="Search clients"
        className="mb-3 h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-brand-300"
      />
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      {!clients && !error ? <p className="py-6 text-center text-sm text-muted">Loading…</p> : null}
      {clients && !shown.length ? <p className="py-6 text-center text-sm text-muted">No client matches</p> : null}
      <ul className="divide-y divide-border">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(c.id);
                const res = await bizOpen(c.id);
                setBusy(null);
                if (res.ok) onOpened(res.data);
                else setError(res.error);
              }}
              className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-60 dark:hover:bg-white/5"
            >
              <Avatar url={null} name={c.name} sizeClassName="h-10 w-10 text-sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name}</span>
                {c.phone ? <span className="block text-xs text-muted">{c.phone}</span> : null}
              </span>
              {busy === c.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </FormSheet>
  );
}

const vapidKey = () => {
  const base64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const raw = window.atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

/** The client's phone gets the business's replies as notifications: saved by itself once allowed, else one tap. */
function NotifyMe({ slug }: { slug: string }) {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [state, setState] = useState<"hidden" | "ask" | "busy">(() => (supported && Notification.permission === "default" ? "ask" : "hidden"));

  const save = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() as BufferSource }));
    const json = sub.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) await bizSaveDevice(slug, { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  }, [slug]);

  // Already allowed: this phone is saved (again) by itself.
  useEffect(() => {
    if (supported && Notification.permission === "granted") void save().catch(() => {});
  }, [supported, save]);

  if (state === "hidden") return null;
  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-xl bg-brand-25 px-3 py-2 text-sm dark:bg-brand-500/10">
      <span className="min-w-0 flex-1">Know when they reply</span>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const ok = (await Notification.requestPermission()) === "granted";
          if (ok) await save().catch(() => {});
          setState("hidden");
        }}
        className="shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        Turn on
      </button>
    </div>
  );
}

/** A lead's chat: Alexis is selling in it, or the team took over (and can hand it back). */
function HandOver({ chatId, paused, onChanged }: { chatId: string; paused: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    const res = await bizSetAssistantPaused(chatId, !paused);
    setBusy(false);
    if (res.ok) onChanged();
  }
  return (
    <div className={`flex items-center gap-2 border-b border-border px-3 py-2 text-xs ${paused ? "bg-gray-50 dark:bg-white/5" : "bg-brand-25 dark:bg-brand-500/10"}`}>
      <span aria-hidden>{paused ? "🙋" : "🤖"}</span>
      <span className="min-w-0 flex-1 truncate">{paused ? "You're handling this chat" : "Alexis is handling this chat"}</span>
      <button type="button" disabled={busy} onClick={flip} className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 font-medium hover:border-brand-300 disabled:opacity-50">
        {paused ? "Let Alexis continue" : "Take over"}
      </button>
    </div>
  );
}
