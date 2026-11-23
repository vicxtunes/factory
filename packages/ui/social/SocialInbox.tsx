"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { TextArea } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { hideComment, inbox, openThread, reply, suggestReply, type InboxItem, type InboxThread } from "@repo/lib/social/actions";
import { platformName } from "@repo/lib/social/core";

import { PlatformMark } from "./PlatformMark";

const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

// Social posts → Inbox: comments on the business's posts and messages to its
// pages, from every connected platform (Zernio). A thread opens in a FormSheet;
// Alexis can suggest a reply, which the business checks before sending.
export function SocialInbox({ canReply }: { canReply: boolean }) {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<InboxThread | null>(null);

  useEffect(() => {
    void inbox().then((res) => (res.ok ? setThreads(res.data) : setError(res.error)));
  }, []);

  if (error) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{error}</p>;
  if (!threads) return <p className="p-6 text-center text-sm text-muted">Fetching comments and messages…</p>;
  return (
    <div className="space-y-3">
      {threads.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No comments or messages yet. They show here from all your pages.</p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {threads.map((t) => (
            <li key={t.kind + t.id}>
              <button type="button" onClick={() => setOpen(t)} className="flex w-full items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-theme-xs hover:bg-background">
                {t.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- from the platform
                  <img src={t.picture} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <PlatformMark platform={t.platform} className="size-10" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <PlatformMark platform={t.platform} className="size-3.5" />
                    <span className="truncate">{t.title}</span>
                    {t.count ? <span className="ml-auto shrink-0 rounded-full bg-brand-50 px-2 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t.count}</span> : null}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted">{t.preview || (t.kind === "comments" ? "A post" : "")}</span>
                  <span className="text-xs text-muted">{ago(t.at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormSheet open={open !== null} onClose={() => setOpen(null)} title={open ? `${open.title} · ${platformName(open.platform)}` : ""}>
        {open ? <Thread key={open.kind + open.id} thread={open} canReply={canReply} /> : null}
      </FormSheet>
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

  const lastTheirs = items?.filter((i) => !i.mine).at(-1) ?? null;
  const replyingTo = t.kind === "comments" ? to : lastTheirs;

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
    <div className="space-y-4">
      {t.link ? (
        <a href={t.link} target="_blank" rel="noreferrer" className="text-sm text-brand-600">
          Open the post on {platformName(t.platform)}
        </a>
      ) : null}
      {!items ? <p className="text-sm text-muted">Loading…</p> : null}
      {items?.length === 0 ? <p className="text-sm text-muted">Nothing here.</p> : null}
      <ul className="space-y-2">
        {items?.map((i) => (
          <li key={i.id} className={`rounded-xl p-3 text-sm ${i.mine ? "ml-8 bg-brand-50 dark:bg-brand-500/15" : "mr-8 bg-gray-100 dark:bg-white/5"}`}>
            <p className="text-xs font-medium text-muted">
              {i.from} · {ago(i.at)}
            </p>
            <p className="whitespace-pre-wrap">{i.text}</p>
            {i.replies.map((r, n) => (
              <p key={n} className="mt-1 border-l-2 border-border pl-2 text-xs">
                <span className="font-medium">{r.from}:</span> {r.text}
              </p>
            ))}
            {canReply && t.kind === "comments" ? (
              <div className="mt-2 flex gap-3 text-xs">
                {i.canReply ? (
                  <button type="button" className="text-brand-600" onClick={() => setTo(i)}>
                    Reply
                  </button>
                ) : null}
                {i.canHide ? (
                  <button
                    type="button"
                    className="text-muted"
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
          </li>
        ))}
      </ul>
      {canReply && (t.kind === "message" || to) ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          {to ? (
            <p className="flex items-center justify-between text-xs text-muted">
              Replying to {to.from}
              <button type="button" onClick={() => setTo(null)}>
                ✕
              </button>
            </p>
          ) : null}
          <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="Write a reply" />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="min-h-9 text-xs" disabled={pending || !replyingTo} onClick={suggest}>
              Suggest with Alexis
            </Button>
            <Button type="button" variant="primary" className="min-h-9 flex-1" loading={pending} disabled={pending || !text.trim()} onClick={send}>
              Send
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
    </div>
  );
}
