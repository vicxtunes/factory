"use client";

import { useEffect, useState, useTransition } from "react";

import { Avatar } from "@repo/ui/Avatar";
import { Button } from "@repo/ui/Button";
import { MessageBubble } from "@repo/ui/chat/MessageBubble";
import { TextArea } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Tabs } from "@repo/ui/Tabs";
import type { ChatMessage } from "@repo/lib/chat/types";
import { hideComment, inbox, openThread, reply, suggestReply, type InboxItem, type InboxThread } from "@repo/lib/social/actions";

import { PlatformMark } from "./PlatformMark";

type Show = "all" | "comments" | "message";

const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** A comment or message in the chat's bubble. */
const bubble = (i: InboxItem, threadId: string): ChatMessage => ({
  id: i.id || `${threadId}-${i.at}`,
  conversationId: threadId,
  kind: "text",
  card: null,
  sender: null,
  senderName: i.from,
  body: [i.text, ...i.replies.map((r) => `↳ ${r.from}: ${r.text}`)].join("\n"),
  replyTo: null,
  attachments: [],
  createdAt: i.at ?? new Date(0).toISOString(),
  editedAt: null,
  deletedAt: null,
});

// Social Media → Inbox: comments and messages from every connected page. On a
// computer the list and the open thread sit side by side; on a phone the
// thread opens in a sheet. Alexis drafts replies; the business sends them.
export function SocialInbox({ canReply }: { canReply: boolean }) {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<InboxThread | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [wide, setWide] = useState(false);

  useEffect(() => {
    void inbox().then((res) => (res.ok ? setThreads(res.data) : setError(res.error)));
    const q = window.matchMedia("(min-width: 1024px)");
    const set = () => setWide(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);

  if (error) return <p className="py-10 text-center text-sm text-error-600">{error}</p>;
  const list = (threads ?? []).filter((t) => show === "all" || t.kind === show);

  return (
    <div className="lg:grid lg:h-[calc(100dvh-11rem)] lg:grid-cols-[22rem_1fr] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-surface">
      <div className="flex min-h-0 flex-col lg:border-r lg:border-border">
        <div className="lg:px-3">
          <Tabs
            label="Show"
            value={show}
            onChange={setShow}
            tabs={[
              { key: "all", label: "All" },
              { key: "comments", label: "Comments", count: threads?.filter((t) => t.kind === "comments").length },
              { key: "message", label: "Messages", count: threads?.filter((t) => t.kind === "message").length },
            ]}
          />
        </div>
        {!threads ? (
          <ul className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
            ))}
          </ul>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">All quiet</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto py-2">
            {list.map((t) => {
              const on = open?.kind === t.kind && open.id === t.id;
              return (
                <li key={t.kind + t.id}>
                  <button type="button" onClick={() => setOpen(t)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${on ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-background"}`}>
                    <span className="relative shrink-0">
                      {t.kind === "comments" && t.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element -- the post, from the platform
                        <img src={t.picture} alt="" className="size-11 rounded-xl object-cover" />
                      ) : (
                        <Avatar name={t.title} src={t.picture ?? undefined} size="md" />
                      )}
                      <span className="absolute -bottom-1 -right-1">
                        <PlatformMark platform={t.platform} size="xs" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold">{t.title}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted">{ago(t.at)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs text-muted">{t.preview}</span>
                        {t.count ? <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{t.count}</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {wide ? (
        <div className="min-h-0">
          {open ? (
            <Thread key={open.kind + open.id} thread={open} canReply={canReply} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">Pick a conversation</div>
          )}
        </div>
      ) : (
        <FormSheet open={open !== null} onClose={() => setOpen(null)} title={open?.title ?? ""}>
          {open ? <Thread key={open.kind + open.id} thread={open} canReply={canReply} /> : null}
        </FormSheet>
      )}
    </div>
  );
}

function Thread({ thread: t, canReply }: { thread: InboxThread; canReply: boolean }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState<InboxItem | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const load = () => openThread(t.kind, t.id, t.accountId).then((res) => (res.ok ? setItems(res.data) : setError(res.error)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per thread (keyed)
  }, []);

  const replyingTo = t.kind === "comments" ? to : (items?.filter((i) => !i.mine).at(-1) ?? null);
  const canWrite = canReply && (t.kind === "message" || !!to);

  function send() {
    setError(null);
    start(async () => {
      const res = await reply(t.kind, t.id, t.accountId, to?.id ?? "", text);
      if (!res.ok) return setError(res.error);
      setText("");
      setTo(null);
      await load();
    });
  }

  function suggest() {
    if (!replyingTo) return;
    setError(null);
    start(async () => {
      const res = await suggestReply(replyingTo.text, t.kind === "comments" ? `a post that says: ${t.preview}` : "");
      if (!res.ok) return setError(res.error);
      setText(res.data);
    });
  }

  return (
    <div className="flex h-full min-h-[60dvh] flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <PlatformMark platform={t.platform} size="sm" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{t.title}</p>
        {t.link ? (
          <a href={t.link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600">
            Open post
          </a>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {!items ? <p className="text-center text-sm text-muted">Loading…</p> : null}
        {items?.map((i, n) => (
          <div key={i.id || n}>
            <MessageBubble
              message={bubble(i, t.id)}
              mine={i.mine}
              grouped={n > 0 && items[n - 1].from === i.from}
              showSenderName
              senderAvatarUrl={null}
              onReply={() => (t.kind === "comments" && i.canReply ? setTo(i) : undefined)}
            />
            {canReply && t.kind === "comments" && !i.mine ? (
              <div className="ml-11 flex gap-3 pb-1 text-[11px] font-semibold text-muted">
                {i.canReply ? (
                  <button type="button" onClick={() => setTo(i)}>
                    Reply
                  </button>
                ) : null}
                {i.canHide ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await hideComment(t.id, t.accountId, i.id);
                        if (!res.ok) return setError(res.error);
                        await load();
                      })
                    }
                  >
                    Hide
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {canWrite ? (
        <div className="space-y-2 border-t border-border p-3">
          {to ? (
            <div className="flex items-center justify-between rounded-lg bg-background px-3 py-1.5 text-xs">
              <span className="truncate">
                ↳ <span className="font-semibold">{to.from}</span> {to.text}
              </span>
              <button type="button" aria-label="Cancel reply" onClick={() => setTo(null)} className="ml-2 text-muted">
                ✕
              </button>
            </div>
          ) : null}
          <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Reply" />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !replyingTo}
              onClick={suggest}
              className="inline-flex min-h-9 items-center gap-1 rounded-full bg-brand-50 px-3 text-xs font-semibold text-brand-700 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-300"
            >
              ✦ Alexis
            </button>
            <Button type="button" variant="primary" className="min-h-9 flex-1" loading={pending} disabled={pending || !text.trim()} onClick={send}>
              Send
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="px-4 pb-3 text-sm text-error-600">{error}</p> : null}
    </div>
  );
}
