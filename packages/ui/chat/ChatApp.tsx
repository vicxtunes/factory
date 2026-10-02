"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { getInbox } from "@repo/lib/chat/client/api";
import { useChatSignals, type ChatSignalHandler } from "@repo/lib/chat/client/useChatSignals";
import { participantKey } from "@repo/lib/chat/policy";
import { CONVERSATION_PARAM } from "@repo/lib/chat/routes";
import type { ConversationSummary, ParticipantRef } from "@repo/lib/chat/types";

import { ConversationList } from "./ConversationList";
import { ConversationView } from "./ConversationView";
import { CHAT_FRAME_CLASS } from "./ChatSkeleton";
import { ChatIcon } from "./icons";
import { NewConversationDrawer } from "./NewConversationDrawer";

const INBOX_BATCH_MS = 1000;

/**
 * The complete chat experience, surface-agnostic: drop it into any page
 * inside any shell. Two panes on desktop (inbox + thread). On phones it takes
 * over the whole screen like WhatsApp (no app header or bottom bar), one pane
 * at a time, and `exitHref` is where the inbox's back arrow returns to. The
 * open conversation lives in the URL (?c=<id>) so push notifications and
 * "Open order chat" buttons can deep-link into it.
 *
 * `initialInbox` is loaded by the server with the page (app/chat/layout.tsx),
 * so the list shows at once; realtime signals keep it fresh from there.
 */
export function ChatApp({
  viewer,
  exitHref,
  initialInbox,
}: {
  viewer: ParticipantRef;
  exitHref?: string;
  initialInbox?: ConversationSummary[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = searchParams.get(CONVERSATION_PARAM);

  const [inbox, setInbox] = useState<ConversationSummary[]>(initialInbox ?? []);
  const [loading, setLoading] = useState(!initialInbox);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  // Bumped when a realtime signal concerns the open conversation.
  const [threadRefreshKey, setThreadRefreshKey] = useState(0);

  const loadInbox = useCallback(
    () =>
      getInbox().then((res) => {
        setLoading(false);
        if (res.ok) {
          setInbox(res.data);
          setError(null);
        } else {
          setError(res.error);
        }
      }),
    [],
  );

  const hasInitialInbox = !!initialInbox;
  useEffect(() => {
    if (!hasInitialInbox) loadInbox();
  }, [loadInbox, hasInitialInbox]);

  // A burst of messages sends a burst of signals: the inbox reloads once,
  // a moment after the last one. The open conversation refreshes at once.
  const inboxTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(inboxTimer.current), []);
  const onSignal = useCallback<ChatSignalHandler>(
    (signal) => {
      window.clearTimeout(inboxTimer.current);
      inboxTimer.current = window.setTimeout(loadInbox, INBOX_BATCH_MS);
      if (signal.type === "refresh" || signal.conversationId === activeId) setThreadRefreshKey((k) => k + 1);
    },
    [loadInbox, activeId],
  );
  useChatSignals(onSignal);

  // Switching conversations only rewrites the URL (Next keeps
  // useSearchParams in sync with history.replaceState): no server render,
  // ConversationView loads the thread itself.
  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set(CONVERSATION_PARAM, id);
      else params.delete(CONVERSATION_PARAM);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams],
  );

  return (
    <div className={CHAT_FRAME_CLASS}>
      <aside
        className={`w-full shrink-0 border-r border-border md:block md:w-80 lg:w-96 ${activeId ? "hidden" : "block"}`}
      >
        {error ? (
          <p className="p-6 text-center text-sm text-muted">{error}</p>
        ) : (
          <ConversationList
            conversations={inbox}
            loading={loading}
            activeId={activeId}
            onSelect={select}
            onNew={() => setNewOpen(true)}
            exitHref={exitHref}
          />
        )}
      </aside>

      <section className={`min-w-0 flex-1 ${activeId ? "block" : "hidden md:block"}`}>
        {activeId ? (
          <ConversationView
            key={activeId}
            conversationId={activeId}
            cacheKey={participantKey(viewer)}
            refreshKey={threadRefreshKey}
            onBack={() => select(null)}
            onRead={loadInbox}
            onLeft={() => {
              select(null);
              loadInbox();
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted">
            <ChatIcon className="h-12 w-12 text-brand-300" />
            <p className="text-sm">Pick a conversation, or start a new one.</p>
          </div>
        )}
      </section>

      <NewConversationDrawer
        open={newOpen}
        viewer={viewer}
        onClose={() => setNewOpen(false)}
        onOpened={(id) => {
          setNewOpen(false);
          select(id);
          loadInbox();
        }}
      />
    </div>
  );
}
