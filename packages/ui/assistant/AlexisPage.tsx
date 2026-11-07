"use client";

import { useEffect, useState } from "react";

import type { ChatSummary, PanelState } from "@repo/lib/assistant/panel/server";

import { BottomSheet } from "../BottomSheet";
import { FormSheet } from "../FormSheet";
import { AlexisMark, Composer, FreeCard, Messages, startGuide, TermsGate, Usage, useAlexis, Welcome, type Alexis, type AlexisActions } from "./AlexisChat";

// Alexis's own page in each app: the person's chats on the left (New chat,
// search, recent chats, and the "free for now" card), and the open chat. An
// empty chat is the welcome: the greeting, a big message box and suggestions.
// On a phone the chats are in a sheet behind the Chats button.

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

/** New chat, search and the recent chats. */
function ChatList({ alexis, onPicked }: { alexis: Alexis; onPicked?: () => void }) {
  const ready = alexis.ready!;
  const [words, setWords] = useState("");
  const [found, setFound] = useState<ChatSummary[] | null>(null);

  useEffect(() => {
    const q = words.trim();
    if (!q) return;
    const timer = window.setTimeout(() => void alexis.search(q).then(setFound), 300);
    return () => window.clearTimeout(timer);
  }, [words, alexis]);

  const list = words.trim() ? (found ?? []) : ready.chats;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          alexis.startNew();
          onPicked?.();
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
      >
        <PlusIcon className="h-4 w-4" /> New chat
      </button>
      <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm focus-within:border-brand-300">
        <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={words}
          onChange={(e) => {
            setWords(e.target.value);
            if (!e.target.value.trim()) setFound(null);
          }}
          placeholder="Search chats"
          aria-label="Search chats"
          className="w-full bg-transparent outline-none placeholder:text-gray-400"
        />
      </label>
      <p className="px-1 text-xs font-medium text-muted">{words.trim() ? "Found" : "Recent chats"}</p>
      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-1">
        {list.length ? (
          list.map((c) => {
            const active = c.id === ready.chatId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    void alexis.open(c.id);
                    onPicked?.();
                  }}
                  className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm ${
                    active ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                  }`}
                >
                  <ClockIcon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{c.title}</span>
                </button>
              </li>
            );
          })
        ) : (
          <li className="px-2 text-sm text-muted">{words.trim() ? "No chats found." : "No chats yet."}</li>
        )}
      </ul>
    </div>
  );
}

export function AlexisPage({ actions, initial }: { actions: AlexisActions; initial: PanelState }) {
  const alexis = useAlexis(actions, initial);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const { state, ready } = alexis;

  if (!state || state.kind !== "ready") {
    return (
      <div data-alexis className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center">
        <AlexisMark size="lg" />
        {state?.kind === "terms" ? (
          <div className="flex h-[70dvh] w-full flex-col text-left">
            <TermsGate alexis={alexis} terms={state.terms} />
          </div>
        ) : (
          <p className="text-sm text-muted">
            {state?.kind === "no_terms" ? "Alexis opens once its terms of use are published. Check back soon." : "Alexis isn't available on your account yet."}
          </p>
        )}
      </div>
    );
  }

  const empty = !state.messages.length && !alexis.busy;
  const title = state.chats.find((c) => c.id === state.chatId)?.title ?? "New chat";
  return (
    <div data-alexis className="flex h-[calc(100dvh-9.5rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-sm lg:h-[calc(100dvh-7.5rem)]">
      <aside className="hidden w-72 shrink-0 flex-col gap-4 border-r border-border p-4 lg:flex">
        <div className="flex items-center gap-2 px-1 pt-1">
          <AlexisMark size="md" />
          <span className="text-base font-semibold">Alexis</span>
        </div>
        <ChatList alexis={alexis} />
        <FreeCard usage={state.usage} onOpen={() => setUsageOpen(true)} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background/40">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setChatsOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium"
          >
            <ClockIcon className="h-4 w-4 text-muted" /> Chats
          </button>
          <span className="min-w-0 flex-1 truncate text-sm text-muted">{empty ? "" : title}</span>
          <button
            type="button"
            onClick={alexis.startNew}
            aria-label="New chat"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </header>
        {!empty ? <p className="hidden truncate border-b border-border px-6 py-3 text-sm font-medium lg:block">{title}</p> : null}

        {empty ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
            <Welcome alexis={alexis} big>
              <Composer alexis={alexis} big placeholder="What do you need today?" />
            </Welcome>
            {alexis.error ? <p className="mt-4 text-sm text-error-600">{alexis.error}</p> : null}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8">
              <div className="mx-auto max-w-3xl">
                <Messages alexis={alexis} onGuide={startGuide} />
              </div>
            </div>
            <div className="border-t border-border px-4 py-3 sm:px-8">
              <div className="mx-auto max-w-3xl">
                {alexis.error ? <p className="pb-2 text-sm text-error-600">{alexis.error}</p> : null}
                <Composer alexis={alexis} />
              </div>
            </div>
          </>
        )}
      </section>

      <BottomSheet open={chatsOpen} onClose={() => setChatsOpen(false)} title="Your chats">
        <div className="flex h-[60dvh] flex-col gap-4">
          {ready ? <ChatList alexis={alexis} onPicked={() => setChatsOpen(false)} /> : null}
          <FreeCard
            usage={state.usage}
            onOpen={() => {
              setChatsOpen(false);
              setUsageOpen(true);
            }}
          />
        </div>
      </BottomSheet>
      <FormSheet open={usageOpen} onClose={() => setUsageOpen(false)} title="Alexis usage">
        <Usage usage={state.usage} />
      </FormSheet>
    </div>
  );
}
