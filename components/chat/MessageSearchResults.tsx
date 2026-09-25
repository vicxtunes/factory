"use client";

import { Fragment, useEffect, useState } from "react";

import { searchMessages } from "@/lib/chat/actions";
import { CHAT_LIMITS } from "@/lib/chat/policy";
import type { ChatSearchResult } from "@/lib/chat/types";

import { formatListTime, KIND_LABELS } from "./format";
import { SearchIcon } from "./icons";

const DEBOUNCE_MS = 300;

/** Wraps each case-insensitive occurrence of `query` in <mark>. */
function Highlight({ text, query }: { text: string; query: string }) {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(q, i);
    if (at < 0) {
      parts.push({ text: text.slice(i), hit: false });
      break;
    }
    if (at > i) parts.push({ text: text.slice(i, at), hit: false });
    parts.push({ text: text.slice(at, at + q.length), hit: true });
    i = at + q.length;
  }
  return (
    <>
      {parts.map((p, k) =>
        p.hit ? (
          <mark key={k} className="rounded-sm bg-brand-100 px-0.5 text-foreground dark:bg-brand-500/30">
            {p.text}
          </mark>
        ) : (
          <Fragment key={k}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * "Messages" section of the inbox search: every message the viewer can see
 * that contains the query (searched server-side). Picking one opens its
 * conversation.
 */
export function MessageSearchResults({ query, onSelect }: { query: string; onSelect: (conversationId: string) => void }) {
  const q = query.trim();
  const active = q.length >= CHAT_LIMITS.minSearchLength;
  const [results, setResults] = useState<{ query: string; hits: ChatSearchResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchMessages(q).then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setResults({ query: q, hits: res.data });
          setError(null);
        } else {
          setError(res.error);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, active]);

  if (!active) return null;
  const current = results?.query === q ? results.hits : null;

  return (
    <section className="border-t border-border p-1.5" aria-label="Message search results">
      <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <SearchIcon className="h-3.5 w-3.5" />
        Messages
      </p>
      {error ? (
        <p className="px-2 py-2 text-xs text-[var(--rush)]">{error}</p>
      ) : current === null ? (
        <p className="px-2 py-2 text-xs text-muted">Searching…</p>
      ) : current.length === 0 ? (
        <p className="px-2 py-2 text-xs text-muted">No messages contain “{q}”.</p>
      ) : (
        <ul>
          {current.map((hit) => (
            <li key={hit.messageId}>
              <button
                type="button"
                onClick={() => onSelect(hit.conversationId)}
                className="w-full rounded-[var(--radius)] p-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {hit.conversationTitle}
                    {hit.conversationKind !== "direct" ? (
                      <span className="ml-1.5 text-[10px] font-medium uppercase text-muted">{KIND_LABELS[hit.conversationKind]}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] tnum text-muted">{formatListTime(hit.createdAt)}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs text-muted">
                  {hit.senderName ? <span className="font-medium text-foreground">{hit.senderName}: </span> : null}
                  <Highlight text={hit.snippet} query={q} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
