"use client";

import type { ReactNode } from "react";

// The layout of an opened task, top to bottom: title, a two-column grid of
// fields (status, priority, assignees, due date, labels — whatever the
// caller passes, usually the pickers), the description, then any further
// sections (SubtaskChecklist, ActivityFeed). Layout only: it owns no data
// and doesn't care whether it sits in a Drawer or on its own page.
//
// With `onTitleChange` the title is editable in place — committed on Enter
// or blur, Escape puts it back.
// Draft — lives in the Design Room until a page adopts it.

export function TaskDetail({
  title,
  onTitleChange,
  fields,
  description,
  children,
}: {
  title: string;
  onTitleChange?: (title: string) => void;
  fields: { label: string; content: ReactNode }[];
  description?: ReactNode;
  /** Further sections below the description, divided by rules. */
  children?: ReactNode;
}) {
  return (
    <article className="space-y-6">
      {onTitleChange ? (
        // Uncontrolled + keyed on `title`: typing is local, and a new title from the caller resets it.
        <input
          key={title}
          defaultValue={title}
          aria-label="Task title"
          onBlur={(e) => {
            const next = e.currentTarget.value.trim();
            if (next && next !== title) onTitleChange(next);
            else e.currentTarget.value = title;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = title;
              e.currentTarget.blur();
            }
          }}
          className="-mx-2 w-[calc(100%+1rem)] rounded-lg bg-transparent px-2 py-1 text-xl font-semibold outline-none hover:bg-background focus:bg-background focus:ring-3 focus:ring-brand-500/10"
        />
      ) : (
        <h2 className="text-xl font-semibold">{title}</h2>
      )}

      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1">
        {fields.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-xs font-medium text-muted">{f.label}</dt>
            <dd className="flex min-h-11 items-center">{f.content}</dd>
          </div>
        ))}
      </dl>

      {description ? (
        <section className="space-y-2 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Description</h3>
          <div className="text-sm leading-relaxed">{description}</div>
        </section>
      ) : null}

      {children ? <div className="space-y-6 border-t border-border pt-5 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-6">{children}</div> : null}
    </article>
  );
}
