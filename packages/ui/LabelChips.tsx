"use client";

import { useState, type FormEvent } from "react";

import { Popover } from "./Popover";

// Coloured tag chips on a task. Read-only without `onChange`; with it,
// each chip gets a ✕ and a "+ Label" button opens a searchable list of the
// available labels (tick to add/remove) that can also create a new one via
// `onCreate`. Chips wrap onto extra lines. Caller owns both lists.
// Draft — lives in the Design Room until a page adopts it.

const COLOURS = {
  gray: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  green: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  red: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  pink: "bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
};

export type LabelColor = keyof typeof COLOURS;

export interface Label {
  key: string;
  name: string;
  color: LabelColor;
}

export function LabelChip({ label, onRemove }: { label: Label; onRemove?: () => void }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-md pl-2 text-xs font-medium ${onRemove ? "pr-0.5" : "pr-2"} ${COLOURS[label.color]}`}>
      {label.name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove label ${label.name}`}
          className="inline-flex size-5 items-center justify-center rounded opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-2.5">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : null}
    </span>
  );
}

export function LabelChips({
  value,
  available,
  onChange,
  onCreate,
}: {
  /** Keys of the labels on the task. */
  value: string[];
  available: Label[];
  /** Omit for read-only chips. */
  onChange?: (keys: string[]) => void;
  /** Offers "Create “…”" for a search with no exact match. The caller adds it to `available` (and usually to `value`). */
  onCreate?: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const applied = value.map((k) => available.find((l) => l.key === k)).filter((l): l is Label => !!l);
  const q = query.trim();
  const matches = available.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = !!onCreate && q !== "" && !available.some((l) => l.name.toLowerCase() === q.toLowerCase());

  function toggle(key: string) {
    onChange?.(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  }

  function create(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    onCreate?.(q);
    setQuery("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {applied.map((l) => (
        <LabelChip key={l.key} label={l} onRemove={onChange ? () => toggle(l.key) : undefined} />
      ))}
      {!onChange && applied.length === 0 ? <span className="text-xs text-muted">No labels</span> : null}
      {onChange ? (
        <Popover
          bare
          ariaLabel="Add label"
          label={<span className="inline-flex h-6 items-center rounded-md border border-dashed border-gray-300 px-2 text-xs text-muted dark:border-white/20">+ Label</span>}
        >
          <div className="space-y-2">
            <form onSubmit={create}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={onCreate ? "Find or create a label…" : "Find a label…"}
                aria-label="Find a label"
                className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand-300"
              />
            </form>
            <ul className="max-h-60 overflow-y-auto">
              {matches.map((l) => (
                <li key={l.key}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-background">
                    <input type="checkbox" checked={value.includes(l.key)} onChange={() => toggle(l.key)} className="size-4 accent-brand-500" />
                    <LabelChip label={l} />
                  </label>
                </li>
              ))}
            </ul>
            {canCreate ? (
              <button type="button" onClick={create} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-background">
                <span className="text-muted">+</span> Create “{q}”
              </button>
            ) : matches.length === 0 ? (
              <p className="px-2 py-2 text-center text-xs text-muted">No labels match.</p>
            ) : null}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
