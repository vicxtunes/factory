"use client";

import { useEffect, useRef, useState } from "react";

import { askBusiness } from "@repo/lib/business-chat/actions";
import type { ChatTurn } from "@repo/lib/business-chat/core";

/**
 * The chat on a Pro business's page (packages/lib/business-chat): a button at
 * the bottom right, a window that answers as the business. The conversation
 * stays in this browser tab. On these pages it's the only chat: Aming's Alexis
 * button is hidden while it's here (owner, 2026-11-22).
 */
export function BusinessChat({ slug, name }: { slug: string; name: string }) {
  const key = `business-chat:${slug}`;
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring this tab's conversation once
      if (saved) setTurns(JSON.parse(saved) as ChatTurn[]);
    } catch {
      /* no storage: start fresh */
    }
  }, [key]);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(turns.slice(-24)));
    } catch {
      /* no storage */
    }
    end.current?.scrollIntoView({ block: "end" });
  }, [key, turns, pending]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    const next: ChatTurn[] = [...turns, { role: "user", content: body }];
    setTurns(next);
    setText("");
    setError(null);
    setPending(true);
    askBusiness(slug, next)
      .then((res) => {
        if (res.ok) setTurns((t) => [...t, { role: "assistant", content: res.reply }]);
        else setError(res.error);
      })
      .catch(() => setError("Sorry, the chat couldn't answer just now. Try again in a moment."))
      .finally(() => setPending(false));
  }

  return (
    <>
      <style>{"[data-aming-alexis]{display:none!important}"}</style>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-lg hover:bg-brand-600 active:scale-95 print:hidden lg:right-6 bottom-[calc(1rem+env(safe-area-inset-bottom))] lg:bottom-6 ${open ? "hidden" : ""}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
        Ask us
      </button>

      {open ? (
        <section
          role="dialog"
          aria-label={`Chat with ${name}`}
          className="fixed inset-0 z-50 flex flex-col bg-surface sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(36rem,calc(100dvh-3rem))] sm:w-96 sm:rounded-2xl sm:border sm:border-border sm:shadow-theme-xl"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{name}</p>
              <p className="text-xs text-muted">Answers about our services, prices and free dates</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-background">
              ✕
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-background px-3 py-2">Hi! Ask me anything about {name}: what we offer, prices, or whether a date is free.</p>
            {turns.map((t, i) => (
              <p key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 break-words whitespace-pre-wrap ${t.role === "user" ? "ml-auto rounded-tr-sm bg-brand-500 text-white" : "rounded-tl-sm bg-background"}`}>
                {t.role === "assistant" ? <Linked text={t.content} /> : t.content}
              </p>
            ))}
            {pending ? <p className="w-16 rounded-2xl rounded-tl-sm bg-background px-3 py-2 text-muted">…</p> : null}
            {error ? <p className="text-error-600 dark:text-error-400">{error}</p> : null}
            <div ref={end} />
          </div>

          <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <textarea
              ref={input}
              rows={1}
              value={text}
              maxLength={500}
              placeholder="Type your question"
              aria-label="Your question"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) send(e);
              }}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-base sm:text-sm"
            />
            <button type="submit" disabled={pending || !text.trim()} className="inline-flex min-h-11 items-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              Send
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}

/** Links in a reply, tappable. */
function Linked({ text }: { text: string }) {
  // Full addresses, and the page's own paths (/business/s/service).
  const parts = text.split(/(https?:\/\/[^\s)"”]+|\/[a-z0-9-]+\/[sp]\/[a-z0-9-]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^(https?:\/\/|\/)/.test(p) ? (
          <a key={i} href={p} className="font-medium underline underline-offset-2">
            {p.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}
