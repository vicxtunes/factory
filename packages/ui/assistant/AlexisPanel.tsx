"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { agreeToAlexisTerms, askAlexis, openAlexis } from "@repo/lib/assistant/panel/actions";
import type { PanelMessage, PanelState, UsageView } from "@repo/lib/assistant/panel/server";

import { Button } from "../Button";
import { Drawer } from "../Drawer";
import { TextArea } from "../Field";
import { Spinner } from "../Spinner";
import { Tabs } from "../Tabs";

// Alexis on every page (packages/lib/assistant/panel): a floating button that
// opens the chat. A full-screen sheet on a phone, a side panel on a computer.
// It knows which page it was opened on.

type View = "chat" | "usage";

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  );
}

export function AlexisPanel() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PanelState | null>(null);
  const [view, setView] = useState<View>("chat");

  async function show() {
    setOpen(true);
    setState(null);
    setState(await openAlexis(path).catch((): PanelState => ({ kind: "off" })));
  }

  const usage = state?.kind === "ready" || state?.kind === "terms" ? state.usage : null;

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="Ask Alexis"
        className={`fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-theme-lg transition-transform hover:bg-brand-600 active:scale-95 print:hidden lg:right-6 lg:bottom-6 ${open ? "hidden" : ""}`}
      >
        <SparkIcon className="h-6 w-6" />
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="inline-flex items-center gap-2">
            <SparkIcon className="h-4 w-4 text-brand-500" /> Alexis
          </span>
        }
        scrollBody={false}
      >
        {!state ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        ) : state.kind === "off" ? (
          <p className="text-sm text-muted">Alexis isn&apos;t available on your account yet.</p>
        ) : state.kind === "no_terms" ? (
          <p className="text-sm text-muted">Alexis opens once its terms of use are published. Check back soon.</p>
        ) : state.kind === "terms" ? (
          <TermsGate terms={state.terms} onAgree={async () => setState(await agreeToAlexisTerms(state.terms.version, path))} />
        ) : (
          <>
            <Tabs<View>
              label="Alexis"
              value={view}
              onChange={setView}
              tabs={[
                { key: "chat", label: "Chat" },
                { key: "usage", label: "Usage" },
              ]}
              className="-mx-4 -mt-4 mb-3 px-4"
            />
            {view === "chat" ? (
              <Chat
                initial={state.messages}
                path={path}
                onUsage={(u) => setState((s) => (s?.kind === "ready" ? { ...s, usage: u } : s))}
              />
            ) : usage ? (
              <Usage usage={usage} />
            ) : null}
          </>
        )}
      </Drawer>
    </>
  );
}

function TermsGate({ terms, onAgree }: { terms: { version: number; body: string }; onAgree: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">Before you start</h3>
        <p className="mt-1 text-sm text-muted">
          Alexis is a paid feature, free for now. Read its terms of use and agree to them to start. Version {terms.version}.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-3 text-sm whitespace-pre-wrap">{terms.body}</div>
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      <Button
        className="w-full font-semibold"
        loading={busy}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onAgree();
          } catch {
            setError("The terms have changed. Close Alexis and open it again to read the new ones.");
          }
          setBusy(false);
        }}
      >
        I agree
      </Button>
    </div>
  );
}

function Chat({ initial, path, onUsage }: { initial: PanelMessage[]; path: string; onUsage: (u: UsageView) => void }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    setMessages((m) => [...m, { id: `mine-${Date.now()}`, role: "user", body, createdAt: new Date().toISOString() }]);
    const res = await askAlexis(body, { path, title: document.title }).catch(() => ({ ok: false as const, error: "Couldn't reach Alexis. Check your connection." }));
    if (res.ok) {
      setMessages((m) => [...m, res.reply]);
      onUsage(res.usage);
    } else {
      setError(res.error);
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">Hi, I&apos;m Alexis. Ask me about this page, or about how to do something in the app.</p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-brand-500 text-white" : "border border-border bg-background"
              }`}
            >
              {m.body}
            </p>
          </div>
        ))}
        {busy ? (
          <p className="inline-flex items-center gap-2 text-xs text-muted">
            <Spinner className="h-3 w-3" /> Alexis is typing
          </p>
        ) : null}
        <div ref={end} />
      </div>
      {error ? <p className="pb-2 text-sm text-error-600">{error}</p> : null}
      <form
        className="flex items-end gap-2 border-t border-border pt-3 pb-[env(safe-area-inset-bottom)]"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <TextArea
          rows={2}
          value={text}
          maxLength={2000}
          placeholder="Ask Alexis"
          aria-label="Message to Alexis"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button type="submit" disabled={busy || !text.trim()} className="shrink-0">
          Send
        </Button>
      </form>
    </div>
  );
}

function Usage({ usage }: { usage: UsageView }) {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain text-sm">
      {usage.free ? (
        <p className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
          Alexis is a paid feature, <span className="font-semibold">free for now</span>. This month&apos;s usage: {usage.month}, waived.
        </p>
      ) : null}
      <p className="text-muted">{usage.payerWords}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt className="text-muted">Today</dt>
        <dd className="text-right tabular-nums">{usage.today}</dd>
        <dt className="text-muted">This month</dt>
        <dd className="text-right font-semibold tabular-nums">{usage.month}</dd>
        {usage.cap ? (
          <>
            <dt className="text-muted">Monthly limit</dt>
            <dd className="text-right tabular-nums">{usage.cap.limit}</dd>
          </>
        ) : null}
      </dl>
      {usage.cap?.reached ? (
        <p className="rounded-xl border border-warning-500/40 bg-warning-50 p-3 text-warning-700 dark:bg-warning-500/10 dark:text-warning-100">
          You&apos;ve reached this month&apos;s limit. Alexis opens again on {usage.cap.resumes}.
        </p>
      ) : null}
      {usage.months.length > 1 ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">By month</h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {usage.months.map((m) => (
              <li key={m.label} className="flex justify-between px-3 py-2">
                <span>{m.label}</span>
                <span className="tabular-nums">{m.amount}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Latest replies</h3>
        {usage.recent.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {usage.recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex justify-between px-3 py-2">
                <span className="text-muted">{r.at}</span>
                <span className="tabular-nums">{r.amount}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No replies yet.</p>
        )}
      </section>
    </div>
  );
}
