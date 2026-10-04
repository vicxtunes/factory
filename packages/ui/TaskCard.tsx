import type { ReactNode } from "react";

import type { Urgency } from "@repo/lib/types";

import { AvatarStack, type AvatarPerson } from "./Avatar";
import { ProgressBar } from "./ProgressBar";
import { UrgencyBadge } from "./UrgencyBadge";

// Compact task summary for boards and lists: title, priority, due date (red
// when overdue), subtask progress and assignees. Every field but the title is
// optional and simply drops out when missing.
//
// With `onClick` the whole card is clickable, but it stays a <div>: the
// title is the real <button> (keyboard focus + Enter), and its click bubbles
// up to the card's handler. That keeps `actions` (e.g. a "⋯" menu) legal —
// a button can't nest inside another button — and leaves the card body
// draggable, which a <button> isn't in Firefox.
// Draft — lives in the Design Room until a page adopts it.
export function TaskCard({
  title,
  priority,
  due,
  subtasks,
  assignees = [],
  onClick,
  actions,
}: {
  title: string;
  priority?: Urgency;
  /** Caller formats it ("Due 6 Oct", "2 days overdue") and decides what counts as overdue. */
  due?: { label: string; overdue?: boolean };
  subtasks?: { done: number; total: number };
  assignees?: AvatarPerson[];
  onClick?: () => void;
  /** Pinned top-right, e.g. KanbanBoard's move menu. Should stop its own click propagation. */
  actions?: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={`w-full space-y-3 rounded-[var(--radius)] border border-border bg-surface p-3 text-left shadow-theme-xs ${
        onClick ? "cursor-pointer transition-shadow hover:shadow-theme-md has-[>div>button:focus-visible]:ring-3 has-[>div>button:focus-visible]:ring-brand-500/20" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        {onClick ? (
          <button type="button" className="line-clamp-2 min-w-0 flex-1 text-left text-sm font-medium outline-none">
            {title}
          </button>
        ) : (
          <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">{title}</p>
        )}
        {priority ? <UrgencyBadge urgency={priority} /> : null}
        {actions}
      </div>
      {subtasks ? <ProgressBar value={subtasks.done} max={subtasks.total} label="Subtasks done" showValue="fraction" /> : null}
      {due || assignees.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          {due ? (
            <span className={`text-xs ${due.overdue ? "font-medium text-error-600 dark:text-error-400" : "text-muted"}`}>{due.label}</span>
          ) : (
            <span />
          )}
          {assignees.length > 0 ? <AvatarStack people={assignees} /> : null}
        </div>
      ) : null}
    </div>
  );
}
