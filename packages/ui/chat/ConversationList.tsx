"use client";

import { useMemo, useState } from "react";

import { useBackOr } from "@repo/ui/navigation/back";
import { Avatar } from "@repo/ui/profile/Avatar";
import type { ConversationKind, ConversationSummary } from "@repo/lib/chat/types";

import { formatListTime, KIND_LABELS } from "./format";
import { BackIcon, GroupIcon, IssueIcon, OrderIcon, PlusIcon, SupportIcon } from "./icons";
import { ConversationListSkeleton } from "./ChatSkeleton";
import { MessageSearchResults } from "./MessageSearchResults";

type Filter = "all" | "unread" | "people" | "orders" | "help";

// Three groups by what a chat is about; each chat still carries its own kind's label.
const GROUPS: { value: Filter; label: string; kinds: ConversationKind[] }[] = [
  { value: "people", label: "People", kinds: ["direct", "group"] },
  { value: "orders", label: "Orders", kinds: ["client_order", "order"] },
  { value: "help", label: "Help", kinds: ["support", "issue"] },
];

/** How many chats have something new (muted ones don't count). */
const unreadIn = (chats: ConversationSummary[]) => chats.filter((c) => c.unreadCount > 0 && !c.muted).length;

const KIND_ICONS = {
  group: GroupIcon,
  order: OrderIcon,
  client_order: OrderIcon,
  support: SupportIcon,
  issue: IssueIcon,
} as const;

/** Open/Resolved pill for issue threads. */
export function IssueStatusBadge({ status }: { status: "open" | "resolved" }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${
        status === "resolved"
          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
          : "bg-[var(--urgent)]/15 text-[var(--urgent)]"
      }`}
    >
      {status === "resolved" ? "Resolved" : "Open"}
    </span>
  );
}

export function ConversationAvatar({ c }: { c: ConversationSummary }) {
  // People get their photo (or initial); shared threads get a kind icon.
  if (c.kind === "direct" || c.avatarUrl) {
    return <Avatar url={c.avatarUrl} name={c.title} sizeClassName="h-10 w-10 text-sm" />;
  }
  const Icon = KIND_ICONS[c.kind];
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
      <Icon className="h-5 w-5" />
    </span>
  );
}

/**
 * The inbox: searchable, filterable list of conversations, newest first.
 * The search box filters chats by name locally and, from two characters,
 * also searches message text server-side (MessageSearchResults). Data and
 * selection are owned by ChatApp.
 */
export function ConversationList({
  conversations,
  loading,
  activeId,
  onSelect,
  onNew,
  exitHref,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Phones only: the full-screen chat's way back to the rest of the app. */
  exitHref?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showFinished, setShowFinished] = useState(false);

  // Only offer the groups that would show something (plus All/Unread), each with what's new in it.
  const available = useMemo(() => {
    const groups = GROUPS.map((g) => ({ ...g, chats: conversations.filter((c) => g.kinds.includes(c.kind)) })).filter((g) => g.chats.length);
    return [
      { value: "all" as Filter, label: "All", unread: 0 },
      { value: "unread" as Filter, label: "Unread", unread: unreadIn(conversations) },
      ...groups.map((g) => ({ value: g.value, label: g.label, unread: unreadIn(g.chats) })),
    ];
  }, [conversations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kinds = GROUPS.find((g) => g.value === filter)?.kinds;
    return conversations.filter((c) => {
      if (filter === "unread" && c.unreadCount === 0) return false;
      if (kinds && !kinds.includes(c.kind)) return false;
      return !q || c.title.toLowerCase().includes(q) || (c.lastMessagePreview ?? "").toLowerCase().includes(q);
    });
  }, [conversations, filter, query]);
  // Finished orders and resolved issues wait at the bottom, folded, unless something new came in.
  const isSetAside = (c: ConversationSummary) => c.finished && c.unreadCount === 0 && c.id !== activeId;
  const current = visible.filter((c) => !isSetAside(c));
  const finished = visible.filter(isSetAside);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            {exitHref ? (
              <LeaveChat href={exitHref} />
            ) : null}
            <h1 className="text-base font-semibold">Chats</h1>
          </span>
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
          placeholder="Search chats and messages"
          aria-label="Search chats and messages"
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
                {f.unread && f.value !== "unread" ? (
                  <span className={`ml-1 rounded-full px-1.5 text-[10px] ${filter === f.value ? "bg-white/25" : "bg-brand-500 text-white"}`}>{f.unread}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !conversations.length ? (
          <div aria-busy="true">
            <ConversationListSkeleton />
          </div>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            {conversations.length === 0 ? "No conversations yet. Start one with New." : "No chats match."}
          </p>
        ) : (
          <>
            <ul className="p-1.5">
              {current.map((c) => (
                <ChatRow key={c.id} c={c} active={c.id === activeId} onSelect={() => onSelect(c.id)} />
              ))}
            </ul>
            {finished.length ? (
              <div className="border-t border-border p-1.5">
                <button
                  type="button"
                  onClick={() => setShowFinished((v) => !v)}
                  aria-expanded={showFinished}
                  className="flex w-full items-center justify-between rounded-[var(--radius)] px-2.5 py-2 text-left text-xs font-medium text-muted hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <span>Finished ({finished.length})</span>
                  <span aria-hidden>{showFinished ? "▴" : "▾"}</span>
                </button>
                {showFinished ? (
                  <ul>
                    {finished.map((c) => (
                      <ChatRow key={c.id} c={c} active={false} onSelect={() => onSelect(c.id)} />
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        )}
        <MessageSearchResults query={query} onSelect={onSelect} />
      </div>
    </div>
  );
}

/** One chat in the list: who or what, the last message, and what's new. */
function ChatRow({ c, active, onSelect }: { c: ConversationSummary; active: boolean; onSelect: () => void }) {
  const unread = c.unreadCount > 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-3 rounded-[var(--radius)] p-2.5 text-left transition-colors ${
          active ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
        }`}
      >
        <ConversationAvatar c={c} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>{c.title}</span>
              {c.issue ? <IssueStatusBadge status={c.issue.status} /> : null}
            </span>
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
}

/** Back to wherever chat was opened from, or to `href` when it was opened first. */
function LeaveChat({ href }: { href: string }) {
  const leave = useBackOr(href);
  return (
    <button
      type="button"
      onClick={leave}
      aria-label="Leave chat"
      className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-gray-100 md:hidden dark:hover:bg-white/5"
    >
      <BackIcon className="h-5 w-5" />
    </button>
  );
}
