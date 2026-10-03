"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import type { Urgency } from "@repo/lib/types";

import { UrgencyBadge } from "./UrgencyBadge";

// A personal to-do list ("My tasks"): open tasks sorted into Overdue /
// Today / Next 7 days / Later / No date by their due date against `today`,
// finished ones in a Completed group that starts collapsed. Tick a task to
// complete it, type in the box at the top to add one.
//
// The caller owns the tasks — `onToggle` / `onAdd` report changes, and
// `today` is passed in (not read from the clock) so server and client agree
// on which group a task is in. Only which groups are collapsed lives here.
// Draft — lives in the Design Room until a page adopts it.

export interface TaskListItem {
  key: string;
  title: string;
  done: boolean;
  /** ISO date (YYYY-MM-DD). */
  due?: string;
  /** Only rush/urgent show a badge — "normal" would be noise on every row. */
  priority?: Urgency;
  /** Small label after the title, e.g. the project the task belongs to. */
  project?: string;
}

type GroupKey = "overdue" | "today" | "week" | "later" | "none" | "done";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" },
  { key: "done", label: "Completed" },
];

const DAY = 86_400_000;

const daysFrom = (today: string, due: string) => Math.round((Date.parse(due) - Date.parse(today)) / DAY);

function groupOf(item: TaskListItem, today: string): GroupKey {
  if (item.done) return "done";
  if (!item.due) return "none";
  const days = daysFrom(today, item.due);
  return days < 0 ? "overdue" : days === 0 ? "today" : days <= 7 ? "week" : "later";
}

function dueLabel(item: TaskListItem, today: string) {
  if (!item.due) return null;
  const days = daysFrom(today, item.due);
  if (days < 0 && !item.done) return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, overdue: true };
  if (days === 0) return { text: "Today", overdue: false };
  if (days === 1) return { text: "Tomorrow", overdue: false };
  const text = new Date(`${item.due}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return { text, overdue: false };
}

export function TaskList({
  items,
  today,
  onToggle,
  onAdd,
  onItemClick,
}: {
  items: TaskListItem[];
  /** ISO date the groups are worked out against. */
  today: string;
  onToggle: (key: string) => void;
  /** Shows the quick-add box. New tasks have no due date, so they land in "No date". */
  onAdd?: (title: string) => void;
  /** Makes titles clickable, e.g. to open the task in a Drawer. */
  onItemClick?: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => new Set(["done"]));
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  // A ticked task jumps to Completed (collapsed), taking keyboard focus with
  // it; this moves focus to its neighbour once the list has re-rendered.
  const refocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!refocusRef.current) return;
    listRef.current?.querySelector<HTMLElement>(`[data-check="${CSS.escape(refocusRef.current)}"]`)?.focus();
    refocusRef.current = null;
  }, [items]);

  const sections = GROUPS.map((g) => ({ ...g, items: items.filter((i) => groupOf(i, today) === g.key) })).filter((g) => g.items.length > 0);
  const openCount = items.filter((i) => !i.done).length;

  function toggle(item: TaskListItem, groupItems: TaskListItem[]) {
    const i = groupItems.indexOf(item);
    const neighbour = groupItems[i + 1] ?? groupItems[i - 1];
    if (neighbour) refocusRef.current = neighbour.key;
    onToggle(item.key);
    setAnnouncement(item.done ? `Reopened ${item.title}.` : `Completed ${item.title}.`);
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || !onAdd) return;
    onAdd(title);
    setDraft("");
    setAnnouncement(`Added ${title}.`);
  }

  function toggleGroup(key: GroupKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div ref={listRef} className="space-y-4">
      {onAdd ? (
        <form onSubmit={add} className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 shadow-theme-xs focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10">
          <span aria-hidden className="text-lg leading-none text-muted">
            +
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task…"
            aria-label="Add a task"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-white/30"
          />
          {draft.trim() ? <span className="shrink-0 text-xs text-muted">Enter ↵</span> : null}
        </form>
      ) : null}

      {openCount === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">{items.length === 0 ? "No tasks yet" : "All caught up"}</p>
          <p className="mt-1 text-xs text-muted">{items.length === 0 ? "Add one above to get started." : "Every task is done — nice work."}</p>
        </div>
      ) : null}

      {sections.map((section) => {
        const isCollapsed = collapsed.has(section.key);
        const headingId = `${idPrefix}-${section.key}`;
        return (
          <section key={section.key} aria-labelledby={headingId}>
            <h3 id={headingId}>
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggleGroup(section.key)}
                className="flex min-h-11 w-full items-center gap-2 text-left text-sm"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`size-3.5 text-muted transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                >
                  <path d="m4 6 4 4 4-4" />
                </svg>
                <span className={`font-semibold ${section.key === "overdue" ? "text-error-600 dark:text-error-400" : ""}`}>{section.label}</span>
                <span className="rounded-full bg-gray-200/70 px-2 py-0.5 text-xs font-medium tnum text-gray-600 dark:bg-white/10 dark:text-gray-300">
                  {section.items.length}
                </span>
              </button>
            </h3>
            {isCollapsed ? null : (
              <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
                {section.items.map((item) => {
                  const due = dueLabel(item, today);
                  return (
                    <li key={item.key} className="flex min-h-12 items-center gap-1 pr-3">
                      <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          data-check={item.key}
                          checked={item.done}
                          onChange={() => toggle(item, section.items)}
                          aria-label={item.done ? `Reopen ${item.title}` : `Complete ${item.title}`}
                          className="size-4 cursor-pointer rounded-full accent-brand-500"
                        />
                      </label>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {onItemClick ? (
                          <button
                            type="button"
                            onClick={() => onItemClick(item.key)}
                            className={`min-w-0 truncate text-left text-sm hover:text-brand-600 ${item.done ? "text-muted line-through" : ""}`}
                          >
                            {item.title}
                          </button>
                        ) : (
                          <span className={`min-w-0 truncate text-sm ${item.done ? "text-muted line-through" : ""}`}>{item.title}</span>
                        )}
                        {item.project ? (
                          <span className="hidden shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[0.7rem] text-gray-600 sm:inline dark:bg-white/5 dark:text-gray-300">
                            {item.project}
                          </span>
                        ) : null}
                      </div>
                      {item.priority && item.priority !== "normal" && !item.done ? <UrgencyBadge urgency={item.priority} /> : null}
                      {due ? (
                        <span
                          className={`shrink-0 whitespace-nowrap text-xs ${due.overdue ? "font-medium text-error-600 dark:text-error-400" : "text-muted"}`}
                        >
                          {due.text}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
