"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getInbox } from "@/lib/chat/actions";
import { useChatSignals, type ChatSignalHandler } from "@/lib/chat/client/useChatSignals";
import { CONVERSATION_PARAM } from "@/lib/chat/routes";
import type { ConversationSummary, ParticipantRef } from "@/lib/chat/types";

import { ConversationList } from "./ConversationList";
import { ConversationView } from "./ConversationView";
import { ChatIcon } from "./icons";
import { NewConversationDrawer } from "./NewConversationDrawer";

/**
 * The complete chat experience, surface-agnostic: drop it into any page
 * inside any shell. Two panes on desktop (inbox + thread); one pane at a
 * time on phones. The open conversation lives in the URL (?c=<id>) so push
 * notifications and "Open order chat" buttons can deep-link into it.
 */
export function ChatApp({ viewer }: { viewer: ParticipantRef }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = searchParams.get(CONVERSATION_PARAM);

  const [inbox, setInbox] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const onSignal = useCallback<ChatSignalHandler>(
    (signal) => {
      loadInbox();
      if (signal.type === "refresh" || signal.conversationId === activeId) setThreadRefreshKey((k) => k + 1);
    },
    [loadInbox, activeId],
  );
  useChatSignals(onSignal);

  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set(CONVERSATION_PARAM, id);
      else params.delete(CONVERSATION_PARAM);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[26rem] overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs md:h-[calc(100dvh-9rem)]">
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
          />
        )}
      </aside>

      <section className={`min-w-0 flex-1 ${activeId ? "block" : "hidden md:block"}`}>
        {activeId ? (
          <ConversationView
            key={activeId}
            conversationId={activeId}
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
