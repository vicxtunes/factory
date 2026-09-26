"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/profile/Avatar";
import { searchContacts } from "@/lib/chat/actions";
import { participantKey } from "@/lib/chat/policy";
import type { ChatPerson, ParticipantType } from "@/lib/chat/types";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Searchable list of people the viewer may contact (server applies policy).
 * Fills its parent: the search box stays put and only the list scrolls, so
 * give the parent a bounded height (e.g. flex-1 min-h-0, or h-80).
 * `filter` narrows further client-side, e.g. groups exclude clients.
 * In multi mode rows are checkboxes; otherwise tapping a row picks it.
 */
export function ContactPicker({
  multi = false,
  selected = [],
  onToggle,
  onPick,
  filter,
  excludeKeys = [],
}: {
  multi?: boolean;
  selected?: ChatPerson[];
  onToggle?: (person: ChatPerson) => void;
  onPick?: (person: ChatPerson) => void;
  filter?: (type: ParticipantType) => boolean;
  excludeKeys?: string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchContacts(query).then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setResults(res.data);
          setError(null);
        } else {
          setError(res.error);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const selectedKeys = new Set(selected.map(participantKey));
  const excluded = new Set(excludeKeys);
  const visible = (results ?? []).filter((p) => (!filter || filter(p.type)) && !excluded.has(participantKey(p)));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <input
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people"
        aria-label="Search people"
        className="w-full min-h-10 shrink-0 rounded-[var(--radius)] border border-border bg-background px-3 text-sm outline-none focus:border-brand-300"
      />

      {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}

      <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
        {results === null ? (
          <li className="p-3 text-sm text-muted">Loading…</li>
        ) : visible.length === 0 ? (
          <li className="p-3 text-sm text-muted">No one found.</li>
        ) : (
          visible.map((p) => {
            const key = participantKey(p);
            const checked = selectedKeys.has(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => (multi ? onToggle?.(p) : onPick?.(p))}
                  aria-pressed={multi ? checked : undefined}
                  className="flex w-full items-center gap-3 rounded-[var(--radius)] p-2 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <Avatar url={p.avatarUrl} name={p.name} sizeClassName="h-9 w-9 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted">{p.subtitle}</span>
                  </span>
                  {multi ? (
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] ${
                        checked ? "border-brand-500 bg-brand-500 text-white" : "border-border"
                      }`}
                    >
                      {checked ? "✓" : ""}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
