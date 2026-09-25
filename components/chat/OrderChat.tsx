"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import { openOrderConversation } from "@/lib/chat/actions";
import { useChatSignals, type ChatSignalHandler } from "@/lib/chat/client/useChatSignals";
import { chatHref } from "@/lib/chat/routes";

import { ConversationView } from "./ConversationView";
import { ChatIcon } from "./icons";

/**
 * The order's shared chat thread, embedded right where the order is shown
 * (order drawers on every surface) — no navigation away from the order.
 *
 * Collapsed it's a single "Order chat" button; expanding opens (creating on
 * first use) the thread and renders the full conversation inline, live via
 * the same realtime signals as the /chat page. "Open in Chat" jumps to the
 * full-screen view. The server decides whether this viewer is involved in
 * the order.
 */
export function OrderChat({ orderId, label = "Order chat" }: { orderId: string; label?: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const onSignal = useCallback<ChatSignalHandler>(
    (signal) => {
      if (signal.type === "refresh" || signal.conversationId === conversationId) setRefreshKey((k) => k + 1);
    },
    [conversationId],
  );
  // Only listen while the chat is actually on screen.
  useChatSignals(onSignal, expanded && !!conversationId);

  async function expand() {
    setError(null);
    if (conversationId) {
      setExpanded(true);
      return;
    }
    setOpening(true);
    const res = await openOrderConversation(orderId);
    setOpening(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConversationId(res.data);
    setExpanded(true);
  }

  if (!expanded || !conversationId) {
    return (
      <div>
        <button
          type="button"
          onClick={expand}
          disabled={opening}
          aria-expanded={false}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 dark:hover:bg-white/[0.03]"
        >
          <ChatIcon className="h-4 w-4" />
          {opening ? "Opening…" : label}
        </button>
        {error ? <p className="mt-1 text-xs text-[var(--rush)]">{error}</p> : null}
      </div>
    );
  }

  return (
    <section aria-label={label} className="overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <ChatIcon className="h-4 w-4" />
          {label}
        </span>
        <span className="flex items-center gap-3 text-xs font-medium">
          <Link href={chatHref(conversationId)} className="text-brand-600 hover:underline">
            Open in Chat ↗
          </Link>
          <button type="button" onClick={() => setExpanded(false)} aria-expanded className="text-muted hover:text-foreground">
            Hide
          </button>
        </span>
      </div>
      {/* Fixed height so the thread scrolls inside itself and the order
          details around it stay put; capped to the viewport on small phones. */}
      <div className="h-[28rem] max-h-[65dvh]">
        <ConversationView
          key={conversationId}
          conversationId={conversationId}
          refreshKey={refreshKey}
          onRead={() => {}}
          onLeft={() => {
            setExpanded(false);
            setConversationId(null);
          }}
        />
      </div>
    </section>
  );
}
