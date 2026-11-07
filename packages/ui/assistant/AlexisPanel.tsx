"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { agreeToAlexisTerms, openAlexis } from "@repo/lib/assistant/panel/actions";
import type { ActionCard, DecideResult, PanelMessage, PanelState, SendResult, UsageView } from "@repo/lib/assistant/panel/server";
import type { GuideStep, PageLink } from "@repo/lib/assistant/panel/toolbox";

import { Button } from "../Button";
import { Drawer } from "../Drawer";
import { TextArea } from "../Field";
import { Spinner } from "../Spinner";
import { Tabs } from "../Tabs";

// Alexis on every page (packages/lib/assistant/panel): a floating button that
// opens the chat. A full-screen sheet on a phone, a side panel on a computer.
// It knows which page it was opened on and the links on it, can prepare
// changes the person confirms on a card, and can walk them to a page step by
// step. Each app passes its own server actions (apps/*/app/alexis-actions.ts).

export interface AlexisActions {
  ask: (text: string, page: { path: string; title: string; links: PageLink[] }) => Promise<SendResult>;
  confirm: (id: string, path: string) => Promise<DecideResult>;
  cancel: (id: string) => Promise<DecideResult>;
}

type View = "chat" | "usage";

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  );
}

/** The links on the page behind the panel: where Alexis may send the person. */
function pageLinks(): PageLink[] {
  const seen = new Map<string, string>();
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    if (!href.startsWith("/") || href.startsWith("//") || a.closest("[data-alexis]")) continue;
    const label = (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (label && !seen.has(href)) seen.set(href, label);
    if (seen.size >= 120) break;
  }
  return [...seen].map(([href, label]) => ({ href, label }));
}

// ---------- The guide: one step at a time, across pages ----------

interface GuideState {
  steps: GuideStep[];
  at: number;
}

let guide: GuideState | null = null;
const listeners = new Set<() => void>();
function setGuide(next: GuideState | null) {
  guide = next;
  for (const l of listeners) l();
}
const subscribeGuide = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The visible button or link whose words match, on the page as it is now. */
function findTarget(words: string): HTMLElement | null {
  const want = words.toLowerCase().replace(/\s+/g, " ").trim();
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("a, button, [role=tab], [role=button], summary, label"));
  const visible = candidates.filter((el) => !el.closest("[data-alexis]") && el.getClientRects().length > 0);
  const text = (el: HTMLElement) => (el.getAttribute("aria-label") || el.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
  return visible.find((el) => text(el) === want) ?? visible.find((el) => text(el).includes(want)) ?? null;
}

function GuideBar() {
  const state = useSyncExternalStore(subscribeGuide, () => guide, () => null);
  const path = usePathname();
  const router = useRouter();
  // The step whose button couldn't be found on the screen, if any.
  const [missed, setMissed] = useState<GuideStep | null>(null);
  const step = state ? state.steps.at(state.at) : undefined;

  useEffect(() => {
    if (!step) return;
    const here = path === step.href.split(/[?#]/)[0];
    if (!here) {
      router.push(step.href);
      return;
    }
    if (!step.tap) return;
    let target: HTMLElement | null = null;
    let tries = 0;
    const timer = window.setInterval(() => {
      target = findTarget(step.tap!);
      if (target || ++tries > 15) {
        window.clearInterval(timer);
        setMissed(target ? null : step);
        if (target) {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
          target.style.outline = "3px solid var(--color-brand-500)";
          target.style.outlineOffset = "3px";
          target.style.borderRadius = target.style.borderRadius || "8px";
        }
      }
    }, 200);
    return () => {
      window.clearInterval(timer);
      if (target) {
        target.style.outline = "";
        target.style.outlineOffset = "";
      }
    };
  }, [step, path, router]);

  if (!state || !step) return null;
  const last = state.at === state.steps.length - 1;
  return (
    <div data-alexis className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-50 rounded-2xl border border-brand-200 bg-surface p-3 shadow-theme-xl sm:left-auto sm:right-4 sm:w-96 lg:bottom-6 dark:border-brand-500/30">
      <p className="text-xs font-medium text-brand-600 dark:text-brand-400">
        Alexis · step {state.at + 1} of {state.steps.length}
      </p>
      <p className="mt-1 text-sm">
        {step.say}
        {step.tap ? (
          <>
            {" "}
            Tap <span className="font-semibold">{step.tap}</span>.
          </>
        ) : null}
      </p>
      {step.tap && missed === step ? <p className="mt-1 text-xs text-muted">I can&apos;t find it on this screen. It may be in the menu.</p> : null}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setGuide(null)}>
          Stop
        </Button>
        <Button size="sm" onClick={() => setGuide(last ? null : { ...state, at: state.at + 1 })}>
          {last ? "Done" : "Next"}
        </Button>
      </div>
    </div>
  );
}

const DESKTOP = "(min-width: 1024px)";
const subscribeDesktop = (onChange: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/** A full-screen sheet on a phone; on a computer, a panel beside the page that stays open while the person works. */
function Frame({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  const title = (
    <span className="inline-flex items-center gap-2">
      <SparkIcon className="h-4 w-4 text-brand-500" /> Alexis
    </span>
  );
  if (!desktop) {
    return (
      <Drawer open={open} onClose={onClose} title={title} scrollBody={false}>
        {children}
      </Drawer>
    );
  }
  if (!open) return null;
  return (
    <aside aria-label="Alexis" className="fixed inset-y-0 right-0 z-40 flex w-[26rem] flex-col border-l border-border bg-surface shadow-theme-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-foreground dark:hover:bg-white/5"
        >
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">{children}</div>
    </aside>
  );
}

// ---------- The panel ----------

export function AlexisPanel({ actions }: { actions: AlexisActions }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PanelState | null>(null);
  const [view, setView] = useState<View>("chat");
  const guiding = useSyncExternalStore(subscribeGuide, () => guide !== null, () => false);

  async function show() {
    setGuide(null);
    setOpen(true);
    setState(null);
    setState(await openAlexis(path).catch((): PanelState => ({ kind: "off" })));
  }

  const usage = state?.kind === "ready" || state?.kind === "terms" ? state.usage : null;

  return (
    <div data-alexis>
      <GuideBar />
      <button
        type="button"
        onClick={show}
        aria-label="Ask Alexis"
        className={`fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-theme-lg transition-transform hover:bg-brand-600 active:scale-95 print:hidden lg:right-6 lg:bottom-6 ${open || guiding ? "hidden" : ""}`}
      >
        <SparkIcon className="h-6 w-6" />
      </button>
      <Frame open={open} onClose={() => setOpen(false)}>
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
                actions={actions}
                onUsage={(u) => setState((s) => (s?.kind === "ready" ? { ...s, usage: u } : s))}
                onGuide={(steps) => {
                  setOpen(false);
                  setGuide({ steps, at: 0 });
                }}
              />
            ) : usage ? (
              <Usage usage={usage} />
            ) : null}
          </>
        )}
      </Frame>
    </div>
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

const STATUS_WORDS: Record<ActionCard["status"], string> = {
  pending: "Waiting for you",
  running: "Working…",
  done: "Done",
  failed: "Didn't work",
  cancelled: "Cancelled",
};

function Card({ card, onDecide }: { card: ActionCard; onDecide: (yes: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const open = card.status === "pending" && !card.expired;
  return (
    <div className="mt-2 rounded-xl border border-border bg-surface p-3 text-sm text-foreground">
      <p className="font-semibold">{card.title}</p>
      {card.lines.length ? (
        <ul className="mt-1 space-y-0.5 text-muted">
          {card.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            loading={busy === "yes"}
            disabled={!!busy}
            onClick={async () => {
              setBusy("yes");
              await onDecide(true);
              setBusy(null);
            }}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            loading={busy === "no"}
            disabled={!!busy}
            onClick={async () => {
              setBusy("no");
              await onDecide(false);
              setBusy(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <p className={`mt-2 text-xs font-medium ${card.status === "done" ? "text-success-600" : card.status === "failed" ? "text-error-600" : "text-muted"}`}>
          {card.expired ? "Expired: ask Alexis again" : STATUS_WORDS[card.status]}
          {card.result && card.status !== "done" ? `: ${card.result}` : ""}
        </p>
      )}
    </div>
  );
}

function Chat({
  initial,
  path,
  actions,
  onUsage,
  onGuide,
}: {
  initial: PanelMessage[];
  path: string;
  actions: AlexisActions;
  onUsage: (u: UsageView) => void;
  onGuide: (steps: GuideStep[]) => void;
}) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    setMessages((m) => [...m, { id: `mine-${Date.now()}`, role: "user", body, createdAt: new Date().toISOString(), actions: [], guide: null }]);
    const res = await actions
      .ask(body, { path, title: document.title, links: pageLinks() })
      .catch((): SendResult => ({ ok: false, error: "Couldn't reach Alexis. Check your connection." }));
    if (res.ok) {
      setMessages((m) => [...m, res.reply]);
      onUsage(res.usage);
    } else {
      setError(res.error);
    }
    setBusy(false);
  }

  async function decide(card: ActionCard, yes: boolean) {
    setError(null);
    const res = await (yes ? actions.confirm(card.id, path) : actions.cancel(card.id)).catch(
      (): DecideResult => ({ ok: false, error: "Couldn't reach Alexis. Check your connection." }),
    );
    if (!res.ok) return setError(res.error);
    setMessages((m) => [...m.map((msg) => ({ ...msg, actions: msg.actions.map((a) => (a.id === card.id ? res.card : a)) })), res.note]);
    if (yes && res.card.status === "done") router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">Hi, I&apos;m Alexis. Ask me about this page, look something up, or ask where to find something.</p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] ${m.role === "user" ? "" : "w-full sm:w-auto"}`}>
              <p
                className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-brand-500 text-white" : "border border-border bg-background"
                }`}
              >
                {m.body}
              </p>
              {m.actions.map((card) => (
                <Card key={card.id} card={card} onDecide={(yes) => decide(card, yes)} />
              ))}
              {m.guide?.length ? (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => onGuide(m.guide!)}>
                  Show me
                </Button>
              ) : null}
            </div>
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
