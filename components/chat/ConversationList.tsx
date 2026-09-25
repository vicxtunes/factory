"use client";

import { useMemo, useState } from "react";

import { Avatar } from "@/components/profile/Avatar";
import type { ConversationKind, ConversationSummary } from "@/lib/chat/types";

import { formatListTime, KIND_LABELS } from "./format";
import { GroupIcon, OrderIcon, PlusIcon, SupportIcon } from "./icons";

type Filter = "all" | "unread" | ConversationKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "direct", label: "Direct" },
  { value: "group", label: "Groups" },
  { value: "order", label: "Orders" },
  { value: "support", label: "Support" },
];

export function ConversationAvatar({ c }: { c: ConversationSummary }) {
  // People get their photo (or initial); shared threads get a kind icon.
  if (c.kind === "direct" || c.avatarUrl) {
    return <Avatar url={c.avatarUrl} name={c.title} sizeClassName="h-10 w-10 text-sm" />;
  }
  const Icon = c.kind === "group" ? GroupIcon : c.kind === "order" ? OrderIcon : SupportIcon;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
      <Icon className="h-5 w-5" />
    </span>
  );
}

/**
 * The inbox: searchable, filterable list of conversations, newest first.
 * Purely presentational — data and selection are owned by ChatApp.
 */
export function ConversationList({
  conversations,
  loading,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // Only offer filters that would show something (plus All/Unread).
  const available = useMemo(() => {
    const kinds = new Set(conversations.map((c) => c.kind));
    return FILTERS.filter((f) => f.value === "all" || f.value === "unread" || kinds.has(f.value as ConversationKind));
  }, [conversations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "unread" && c.unreadCount === 0) return false;
      if (filter !== "all" && filter !== "unread" && c.kind !== filter) return false;
      return !q || c.title.toLowerCase().includes(q) || (c.lastMessagePreview ?? "").toLowerCase().includes(q);
    });
  }, [conversations, filter, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold">Chats</h1>
          <button
            type="button"
            onClick={onNew}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius)] bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600"
          >
            <PlusIcon className="h-4 w-4" />
            New
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="w-full min-h-10 rounded-[var(--radius)] border border-border bg-background px-3 text-sm outline-none focus:border-brand-300"
        />
        {available.length > 2 ? (
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
            {available.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                  filter === f.value
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !conversations.length ? (
          <ul className="space-y-1 p-2" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 p-2">
                <span className="h-10 w-10 animate-pulse rounded-full bg-gray-100 dark:bg-white/5" />
                <span className="h-4 flex-1 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            {conversations.length === 0 ? "No conversations yet. Start one with New." : "Nothing matches."}
          </p>
        ) : (
          <ul className="p-1.5">
            {visible.map((c) => {
              const active = c.id === activeId;
              const unread = c.unreadCount > 0;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius)] p-2.5 text-left transition-colors ${
                      active ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <ConversationAvatar c={c} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>{c.title}</span>
                        <span className={`shrink-0 text-[11px] tnum ${unread ? "text-brand-600" : "text-muted"}`}>
                          {formatListTime(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={`truncate text-xs ${unread ? "text-foreground" : "text-muted"}`}>
                          {c.kind !== "direct" ? (
                            <span className="mr-1 rounded bg-gray-100 px-1 py-px text-[10px] font-medium uppercase text-gray-500 dark:bg-white/5 dark:text-gray-400">
                              {KIND_LABELS[c.kind]}
                            </span>
                          ) : null}
                          {c.lastMessageSenderName && c.kind !== "direct" ? `${c.lastMessageSenderName}: ` : ""}
                          {c.lastMessagePreview ?? "No messages yet"}
                        </span>
                        {unread ? (
                          <span
                            className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white ${
                              c.muted ? "bg-gray-400" : "bg-brand-500"
                            }`}
                          >
                            {c.unreadCount > 99 ? "99+" : c.unreadCount}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
