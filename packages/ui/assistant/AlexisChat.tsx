"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { takeLines } from "@repo/lib/assistant/panel/lines";
import { agreeToAlexisTerms, openAlexis, openAlexisChat, searchAlexisChats } from "@repo/lib/assistant/panel/actions";
import type { ActionCard, ChatSummary, DecideResult, PanelMessage, PanelState, SendResult, UsageView } from "@repo/lib/assistant/panel/server";
import type { GuideStep, PageLink } from "@repo/lib/assistant/panel/toolbox";
import { uploadFileToStorage } from "@repo/lib/storage/upload-client";

import { Button } from "../Button";
import { AddMediaButton } from "../media/AddMediaButton";
import { LogoUploader } from "../studio-access/LogoUploader";
import { Spinner } from "../Spinner";
import { UploadThumbs, uploadKey, type UploadThumb } from "../UploadThumbs";

// The pieces of Alexis shared by the side panel (AlexisPanel) and the full
// page (AlexisPage): the chat state, messages with their cards, the message
// box with Attach, the welcome, usage, and the step-by-step guide.

/** Each app's own server actions (apps/*\/app/alexis-actions.ts). */
export interface AlexisActions {
  confirm: (id: string, path: string) => Promise<DecideResult>;
  cancel: (id: string) => Promise<DecideResult>;
}

export type ReadyState = Extract<PanelState, { kind: "ready" }>;

const OFFLINE = "Couldn't reach Alexis. Check your connection.";

export function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  );
}

/** Alexis's mark: the spark on a soft brand tile. */
export function AlexisMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16 rounded-2xl" : size === "md" ? "h-10 w-10 rounded-xl" : "h-7 w-7 rounded-lg";
  const icon = size === "lg" ? "h-9 w-9" : size === "md" ? "h-6 w-6" : "h-4 w-4";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-brand-100 to-brand-50 text-brand-500 dark:from-brand-500/25 dark:to-brand-500/5 ${box}`}>
      <SparkIcon className={icon} />
    </span>
  );
}

/** The links on the page behind Alexis: where it may send the person. */
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

// ---------- The chat's state ----------

/** While Alexis works on a reply: what it's doing, and its words so far (each step of its loop starts afresh). */
export interface Draft {
  doing: string | null;
  step: number;
  text: string;
}

type StreamLine = { type: "step"; words: string } | { type: "text"; step: number; delta: string } | { type: "done"; result: SendResult };

/** One message to Alexis through this app's /api/alexis, telling `onLine` each line of the stream. */
async function ask(body: unknown, onLine: (line: Exclude<StreamLine, { type: "done" }>) => void): Promise<SendResult> {
  const res = await fetch("/api/alexis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const failed = (await res.json().catch(() => null)) as SendResult | null;
    return failed && !failed.ok ? failed : { ok: false, error: OFFLINE };
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let held = "";
  let result: SendResult | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const taken = takeLines(held, value);
    held = taken.held;
    for (const raw of taken.lines) {
      const line = JSON.parse(raw) as StreamLine;
      if (line.type === "done") result = line.result;
      else onLine(line);
    }
  }
  return result ?? { ok: false, error: OFFLINE };
}

/** Alexis for this person: their chats, the open one, sending, deciding cards, uploading confirmed files. */
export function useAlexis(actions: AlexisActions, initial: PanelState | null = null) {
  const path = usePathname();
  const router = useRouter();
  const [state, setState] = useState<PanelState | null>(initial);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Files waiting to upload once their card is confirmed, by card id. They stay on this device.
  const [held, setHeld] = useState<Record<string, File[]>>({});

  const ready = state?.kind === "ready" ? state : null;
  const patch = (p: Partial<ReadyState>) => setState((s) => (s?.kind === "ready" ? { ...s, ...p } : s));

  async function load() {
    setState(null);
    setError(null);
    setState(await openAlexis(path).catch((): PanelState => ({ kind: "off" })));
  }

  async function agree(version: number) {
    setState(await agreeToAlexisTerms(version, path));
  }

  function startNew() {
    setError(null);
    patch({ chatId: null, messages: [] });
  }

  async function open(chatId: string) {
    setError(null);
    patch({ chatId, messages: [] });
    setBusy(true);
    const messages = await openAlexisChat(chatId).catch(() => null);
    setBusy(false);
    if (messages) patch({ chatId, messages });
    else setError("That chat couldn't be opened.");
  }

  async function search(words: string): Promise<ChatSummary[]> {
    return searchAlexisChats(words).catch(() => []);
  }

  async function send(text: string, files: File[]) {
    if (!ready || busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    setError(null);
    const temp: PanelMessage = { id: `mine-${Date.now()}`, role: "user", body: text.trim() || "(files attached)", createdAt: new Date().toISOString(), actions: [], guide: null, files: files.map((f) => f.name), choices: [], images: [], widgets: [] };
    patch({ messages: [...ready.messages, temp] });
    setDraft({ doing: null, step: 0, text: "" });
    const res = await ask(
      { chatId: ready.chatId, text, page: { path, title: document.title, links: pageLinks() }, files: files.map((f) => f.name) },
      (line) =>
        setDraft((d) => {
          const now = d ?? { doing: null, step: 0, text: "" };
          if (line.type === "step") return { ...now, doing: line.words };
          // A later step of its loop starts its words afresh: what it said before a tool call isn't the reply.
          return line.step === now.step ? { ...now, doing: null, text: now.text + line.delta } : { doing: null, step: line.step, text: line.delta };
        }),
    ).catch((): SendResult => ({ ok: false, error: OFFLINE }));
    setDraft(null);
    if (res.ok) {
      // Any card may end up uploading them: an order learns its item only once it's placed.
      const uploads = files.length ? res.reply.actions : [];
      if (uploads.length) setHeld((h) => ({ ...h, ...Object.fromEntries(uploads.map((card) => [card.id, files])) }));
      setState((s) =>
        s?.kind === "ready"
          ? {
              ...s,
              chatId: res.chat.id,
              chats: [res.chat, ...s.chats.filter((c) => c.id !== res.chat.id)],
              messages: [...s.messages.filter((m) => m.id !== temp.id), res.mine, res.reply],
              usage: res.usage,
            }
          : s,
      );
    } else {
      setError(res.error);
    }
    setBusy(false);
  }

  async function decide(card: ActionCard, yes: boolean) {
    setError(null);
    const res = await (yes ? actions.confirm(card.id, path) : actions.cancel(card.id)).catch((): DecideResult => ({ ok: false, error: OFFLINE }));
    if (!res.ok) return setError(res.error);
    setState((s) =>
      s?.kind === "ready"
        ? { ...s, messages: [...s.messages.map((m) => ({ ...m, actions: m.actions.map((a) => (a.id === card.id ? res.card : a)) })), res.note] }
        : s,
    );
    if (yes && res.card.status === "done" && !res.card.uploadItemId) router.refresh();
  }

  return { state, ready, busy, draft, error, load, agree, startNew, open, search, send, decide, held, path };
}

export type Alexis = ReturnType<typeof useAlexis>;

// ---------- Messages ----------

const STATUS_WORDS: Record<ActionCard["status"], string> = {
  pending: "Waiting for you",
  running: "Working…",
  done: "Done",
  failed: "Didn't work",
  cancelled: "Cancelled",
};

/** After a confirmed "add files" card: the attached files upload here, or (without them, after a reload) the item's own Add photos. */
function CardUpload({ itemId, files }: { itemId: string; files: File[] | undefined }) {
  const [items, setItems] = useState<UploadThumb[]>(() => (files ?? []).map((file) => ({ key: uploadKey(file), file, state: "uploading" as const, progress: 0 })));
  const started = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (started.current || !files?.length) return;
    started.current = true;
    const update = (key: string, p: Partial<UploadThumb>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));
    void (async () => {
      for (const file of files) {
        const key = uploadKey(file);
        const res = await uploadFileToStorage(itemId, file, (progress) => update(key, { progress }));
        update(key, res.ok ? { state: "done", progress: 1 } : { state: "failed", error: res.error });
      }
      router.refresh();
    })();
  }, [files, itemId, router]);

  async function retry(key: string) {
    const item = items.find((i) => i.key === key);
    if (!item) return;
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, state: "uploading", progress: 0, error: undefined } : i)));
    const res = await uploadFileToStorage(itemId, item.file, (progress) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, progress } : i))));
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...(res.ok ? { state: "done" as const, progress: 1 } : { state: "failed" as const, error: res.error }) } : i)));
  }

  if (!files?.length) {
    return (
      <div className="mt-2">
        <p className="mb-1 text-xs text-muted">Choose the files again to add them:</p>
        <AddMediaButton orderItemId={itemId} />
      </div>
    );
  }
  return (
    <div className="mt-2">
      <UploadThumbs items={items} onRetry={retry} />
    </div>
  );
}

function Card({ card, files, onDecide }: { card: ActionCard; files: File[] | undefined; onDecide: (yes: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const open = card.status === "pending" && !card.expired;
  const act = (yes: boolean) => async () => {
    setBusy(yes ? "yes" : "no");
    await onDecide(yes);
    setBusy(null);
  };
  return (
    <div className="mt-2 rounded-xl border border-border bg-surface p-3 text-sm text-foreground shadow-theme-xs">
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
          <Button size="sm" className="flex-1" loading={busy === "yes"} disabled={!!busy} onClick={act(true)}>
            Confirm
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" loading={busy === "no"} disabled={!!busy} onClick={act(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <p className={`mt-2 text-xs font-medium ${card.status === "done" ? "text-success-600" : card.status === "failed" ? "text-error-600" : "text-muted"}`}>
          {card.expired ? "Expired: ask Alexis again" : STATUS_WORDS[card.status]}
          {card.result && card.status !== "done" ? `: ${card.result}` : ""}
        </p>
      )}
      {card.status === "done" && card.uploadItemId ? <CardUpload itemId={card.uploadItemId} files={files} /> : null}
    </div>
  );
}

export function Messages({ alexis, onGuide }: { alexis: Alexis; onGuide: (steps: GuideStep[]) => void }) {
  const end = useRef<HTMLDivElement>(null);
  const messages = alexis.ready?.messages ?? [];
  // Tappable answers belong to the latest reply only.
  const lastReplyId = messages.findLast((m) => m.role === "assistant")?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, alexis.busy, alexis.draft?.text.length]);
  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          {m.role === "assistant" ? <AlexisMark size="sm" /> : null}
          <div className={`min-w-0 ${m.role === "user" ? "max-w-[85%]" : "max-w-[85%] flex-1 sm:flex-none"}`}>
            <p className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-brand-500 text-white" : "border border-border bg-surface"}`}>{m.body}</p>
            {m.files.length ? (
              <p className={`mt-1 text-xs text-muted ${m.role === "user" ? "text-right" : ""}`}>
                Attached: {m.files.length === 1 ? m.files[0] : `${m.files.length} files`}
              </p>
            ) : null}
            {m.images.length ? (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {m.images.map((img) => (
                  <a key={img.url} href={img.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- product photos from storage, any size */}
                    <img src={img.url} alt={img.name} loading="lazy" className="aspect-square w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
            {m.choices.length && m.id === lastReplyId ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.choices.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={alexis.busy}
                    onClick={() => void alexis.send(c, [])}
                    className="min-h-9 rounded-full border border-brand-300 bg-brand-50 px-3 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
            {m.widgets.includes("logo") ? (
              <div className="mt-2 rounded-xl border border-border bg-surface p-3">
                <LogoUploader logoUrl={null} />
              </div>
            ) : null}
            {m.actions.map((card) => (
              <Card key={card.id} card={card} files={alexis.held[card.id]} onDecide={(yes) => alexis.decide(card, yes)} />
            ))}
            {m.guide?.length ? (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => onGuide(m.guide!)}>
                Show me
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {alexis.busy ? (
        <div className="flex gap-2">
          <AlexisMark size="sm" />
          <div className="min-w-0 max-w-[85%]">
            {alexis.draft?.text ? <p className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm whitespace-pre-wrap">{alexis.draft.text}</p> : null}
            <p className="mt-1 inline-flex items-center gap-2 text-xs text-muted">
              <Spinner className="h-3 w-3" /> {alexis.draft?.doing ? `${alexis.draft.doing}…` : alexis.draft?.text ? "Writing…" : "Alexis is thinking…"}
            </p>
          </div>
        </div>
      ) : null}
      <div ref={end} />
    </div>
  );
}

// ---------- The message box ----------

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3.4 20.4l17.5-7.5a1 1 0 000-1.8L3.4 3.6a1 1 0 00-1.4 1.1L4 11l9 1-9 1-2 6.3a1 1 0 001.4 1.1z" />
    </svg>
  );
}

const MAX_FILES = 30;

/** The box people write in: Attach (when they may add files to an order), and Send. `big`: the welcome screen's. */
export function Composer({ alexis, big = false, placeholder = "Ask Alexis" }: { alexis: Alexis; big?: boolean; placeholder?: string }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const canAttach = alexis.ready?.canAttach ?? false;

  function submit() {
    if (alexis.busy || (!text.trim() && !files.length)) return;
    void alexis.send(text, files);
    setText("");
    setFiles([]);
  }

  return (
    <form
      className={`rounded-2xl border border-border bg-surface shadow-theme-xs focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 ${big ? "p-3" : "p-2"}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start gap-2">
        {big ? <SparkIcon className="mt-2 h-4 w-4 shrink-0 text-brand-500" /> : null}
        <textarea
          rows={big ? 2 : 1}
          value={text}
          maxLength={2000}
          placeholder={placeholder}
          aria-label="Message to Alexis"
          className="min-h-10 w-full resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-gray-400"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      {files.length ? (
        <ul className="mt-1 flex flex-wrap gap-1.5 px-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background py-0.5 pr-1 pl-2.5 text-xs">
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-gray-100 dark:hover:bg-white/5"
                onClick={() => setFiles((prev) => prev.filter((_, n) => n !== i))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1 flex items-center justify-between gap-2">
        {canAttach ? (
          <>
            <button
              type="button"
              onClick={() => picker.current?.click()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <PaperclipIcon className="h-4 w-4" /> Attach
            </button>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
                e.target.value = "";
              }}
            />
          </>
        ) : (
          <span />
        )}
        <button
          type="submit"
          aria-label="Send"
          disabled={alexis.busy || (!text.trim() && !files.length)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-40"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

// ---------- Welcome, terms, usage ----------

/** An empty chat: "Welcome back, Sarah! What can I help you with today?", the message box if given, and suggestions to tap. */
export function Welcome({ alexis, big = false, children }: { alexis: Alexis; big?: boolean; children?: ReactNode }) {
  const ready = alexis.ready;
  if (!ready) return null;
  return (
    <div className="flex flex-col items-center text-center">
      <AlexisMark size={big ? "lg" : "md"} />
      <h2 className={`mt-4 font-semibold tracking-tight ${big ? "text-2xl sm:text-3xl" : "text-lg"}`}>
        Welcome back, {ready.firstName}!
        <br />
        What can I help you <span className="text-brand-500">with today?</span>
      </h2>
      {children ? <div className="mt-8 w-full max-w-xl text-left">{children}</div> : null}
      {ready.suggestions.length ? (
        <div className={`flex flex-wrap justify-center gap-2 ${big ? "mt-6 max-w-xl" : "mt-5"}`}>
          {ready.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void alexis.send(s, [])}
              className="min-h-9 rounded-full border border-border bg-surface px-3 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:text-gray-300"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TermsGate({ alexis, terms }: { alexis: Alexis; terms: { version: number; body: string } }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">Before you start</h3>
        <p className="mt-1 text-sm text-muted">Alexis is a paid feature, free for now. Read its terms of use and agree to them to start. Version {terms.version}.</p>
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
            await alexis.agree(terms.version);
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

export function Usage({ usage }: { usage: UsageView }) {
  return (
    <div className="space-y-4 text-sm">
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

/** The orange "free for now" card: this month's usage, and a way to see it all. */
export function FreeCard({ usage, onOpen }: { usage: UsageView; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="relative w-full overflow-hidden rounded-2xl bg-brand-500 p-4 text-left text-white shadow-theme-sm hover:bg-brand-600">
      <SparkIcon className="absolute -top-1 -right-1 h-14 w-14 text-white/20" />
      <p className="font-semibold">{usage.free ? "Alexis is free for now" : "Alexis usage"}</p>
      <p className="mt-1 text-xs text-white/85">
        This month: {usage.month}
        {usage.free ? ", waived" : ""}. Tap to see your usage.
      </p>
    </button>
  );
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

export const startGuide = (steps: GuideStep[]) => setGuide({ steps, at: 0 });
export const stopGuide = () => setGuide(null);
export const useGuiding = () => useSyncExternalStore(subscribeGuide, () => guide !== null, () => false);

/** The visible button or link whose words match, on the page as it is now. */
function findTarget(words: string): HTMLElement | null {
  const want = words.toLowerCase().replace(/\s+/g, " ").trim();
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("a, button, [role=tab], [role=button], summary, label"));
  const visible = candidates.filter((el) => !el.closest("[data-alexis]") && el.getClientRects().length > 0);
  const text = (el: HTMLElement) => (el.getAttribute("aria-label") || el.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
  return visible.find((el) => text(el) === want) ?? visible.find((el) => text(el).includes(want)) ?? null;
}

export function GuideBar() {
  const state = useSyncExternalStore(subscribeGuide, () => guide, () => null);
  const path = usePathname();
  const router = useRouter();
  // The step whose button couldn't be found on the screen, if any.
  const [missed, setMissed] = useState<GuideStep | null>(null);
  const step = state ? state.steps.at(state.at) : undefined;

  useEffect(() => {
    if (!step) return;
    // Only this app's own pages, whatever the guide says (packages/lib/assistant/panel/core.ts isAppPath).
    if (new URL(step.href, window.location.origin).origin !== window.location.origin || !/^\/(?![\/\\])/.test(step.href)) {
      stopGuide();
      return;
    }
    if (path !== step.href.split(/[?#]/)[0]) {
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
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400">
        <SparkIcon className="h-3.5 w-3.5" /> Alexis · step {state.at + 1} of {state.steps.length}
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
        <Button variant="ghost" size="sm" onClick={stopGuide}>
          Stop
        </Button>
        <Button size="sm" onClick={() => setGuide(last ? null : { ...state, at: state.at + 1 })}>
          {last ? "Done" : "Next"}
        </Button>
      </div>
    </div>
  );
}
