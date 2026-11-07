"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { Drawer } from "../Drawer";
import { Spinner } from "../Spinner";
import { Tabs } from "../Tabs";
import { Composer, GuideBar, Messages, SparkIcon, startGuide, stopGuide, TermsGate, Usage, useAlexis, useGuiding, Welcome, type AlexisActions } from "./AlexisChat";

// Alexis on every page (packages/lib/assistant/panel): a floating button that
// opens a quick chat. A full-screen sheet on a phone; on a computer a panel
// beside the page that stays open while the person works. The full page
// (AlexisPage) has every chat; this opens the newest.

export type { AlexisActions } from "./AlexisChat";

type View = "chat" | "usage";

const DESKTOP = "(min-width: 1024px)";
const subscribeDesktop = (onChange: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

function Frame({ open, onClose, actions: headerActions, children }: { open: boolean; onClose: () => void; actions: ReactNode; children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  const title = (
    <span className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2">
        <SparkIcon className="h-4 w-4 text-brand-500" /> Alexis
      </span>
      {headerActions}
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
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">{title}</h2>
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

/** `fullPage`: where this app's full Alexis page is, if it has one. */
export function AlexisPanel({ actions, fullPage }: { actions: AlexisActions; fullPage: string | null }) {
  const alexis = useAlexis(actions);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const guiding = useGuiding();
  const { state, ready } = alexis;
  const onFullPage = !!fullPage && alexis.path === fullPage;

  function show() {
    stopGuide();
    setOpen(true);
    setView("chat");
    void alexis.load();
  }

  const header = ready ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <button type="button" onClick={alexis.startNew} className="min-h-9 rounded-lg px-2 text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10">
        New chat
      </button>
      {fullPage ? (
        <Link href={fullPage} onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center rounded-lg px-2 text-muted hover:bg-gray-100 dark:hover:bg-white/5">
          All chats
        </Link>
      ) : null}
    </span>
  ) : null;

  return (
    <div data-alexis>
      <GuideBar />
      {onFullPage ? null : (
        <button
          type="button"
          onClick={show}
          aria-label="Ask Alexis"
          className={`fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-theme-lg transition-transform hover:bg-brand-600 active:scale-95 print:hidden lg:right-6 lg:bottom-6 ${open || guiding ? "hidden" : ""}`}
        >
          <SparkIcon className="h-6 w-6" />
        </button>
      )}
      <Frame open={open} onClose={() => setOpen(false)} actions={header}>
        {!state ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        ) : state.kind === "off" ? (
          <p className="text-sm text-muted">Alexis isn&apos;t available on your account yet.</p>
        ) : state.kind === "no_terms" ? (
          <p className="text-sm text-muted">Alexis opens once its terms of use are published. Check back soon.</p>
        ) : state.kind === "terms" ? (
          <TermsGate alexis={alexis} terms={state.terms} />
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
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
                  {state.messages.length || alexis.busy ? (
                    <Messages
                      alexis={alexis}
                      onGuide={(steps) => {
                        setOpen(false);
                        startGuide(steps);
                      }}
                    />
                  ) : (
                    <div className="pt-6">
                      <Welcome alexis={alexis} />
                    </div>
                  )}
                </div>
                {alexis.error ? <p className="pb-2 text-sm text-error-600">{alexis.error}</p> : null}
                <div className="pb-[env(safe-area-inset-bottom)]">
                  <Composer alexis={alexis} />
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <Usage usage={state.usage} />
              </div>
            )}
          </>
        )}
      </Frame>
    </div>
  );
}
