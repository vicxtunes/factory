"use client";

import { useState, type FormEvent } from "react";

import { Avatar, type AvatarPerson } from "./Avatar";
import { Button } from "./Button";

// A task's history: one-line events ("Amina moved this to Review") and
// comments in a card, oldest first along a thread line, each with who and
// how long ago. With `onComment`, a comment box sits at the bottom
// (⌘/Ctrl+Enter posts). Times are relative to `now`, passed in so server and
// client render the same text.
// Draft — lives in the Design Room until a page adopts it.

export interface ActivityEntry {
  key: string;
  person: AvatarPerson;
  /** ISO date-time. */
  at: string;
  kind: "event" | "comment";
  text: string;
}

function ago(at: string, now: string) {
  const minutes = Math.round((Date.parse(now) - Date.parse(at)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function ActivityFeed({
  entries,
  now,
  onComment,
  emptyMessage = "No activity yet.",
}: {
  entries: ActivityEntry[];
  /** ISO date-time the "2h ago" labels count back from. */
  now: string;
  /** Shows the comment box. */
  onComment?: (text: string) => void;
  emptyMessage?: string;
}) {
  const [draft, setDraft] = useState("");

  function post(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !onComment) return;
    onComment(text);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Activity</h3>
      {entries.length === 0 ? <p className="text-xs text-muted">{emptyMessage}</p> : null}
      <ol className="relative space-y-4">
        {/* Thread line behind the avatars. */}
        {entries.length > 1 ? <span aria-hidden className="absolute bottom-3 left-3 top-3 w-px bg-border" /> : null}
        {entries.map((entry) => {
          const when = (
            <time dateTime={entry.at} title={new Date(entry.at).toUTCString()} className="text-xs text-muted">
              {ago(entry.at, now)}
            </time>
          );
          return (
            <li key={entry.key} className="relative flex gap-3">
              <span aria-hidden className="relative">
                <Avatar name={entry.person.name} src={entry.person.src} size="sm" className="ring-4 ring-surface" />
              </span>
              {entry.kind === "comment" ? (
                <div className="min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface px-3 py-2">
                  <p className="text-xs">
                    <span className="font-semibold">{entry.person.name}</span> · {when}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{entry.text}</p>
                </div>
              ) : (
                <p className="min-w-0 flex-1 pt-0.5 text-sm text-muted">
                  <span className="font-medium text-foreground">{entry.person.name}</span> {entry.text} · {when}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {onComment ? (
        <form onSubmit={post} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
            }}
            placeholder="Write a comment…"
            aria-label="Write a comment"
            rows={2}
            className="min-h-20 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm shadow-theme-xs outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:placeholder:text-white/30"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Ctrl + Enter to post</span>
            <Button type="submit" className="text-xs" disabled={!draft.trim()}>
              Comment
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
