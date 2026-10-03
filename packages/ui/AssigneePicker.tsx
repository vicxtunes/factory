"use client";

import { useState } from "react";

import { Avatar, AvatarStack, type AvatarPerson } from "./Avatar";
import { Popover } from "./Popover";

// Who's on a task: the trigger shows their AvatarStack (or a dashed
// "Assign" circle when nobody is), and opens a searchable checklist of
// people. Multi-select — ticking doesn't close the panel. Caller owns the
// selection.
// Draft — lives in the Design Room until a page adopts it.

export interface PickerPerson extends AvatarPerson {
  id: string;
}

export function AssigneePicker({
  people,
  selected,
  onChange,
  label = "Assignees",
}: {
  people: PickerPerson[];
  /** Ids of the people assigned. */
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Accessible name for the trigger. */
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const chosen = people.filter((p) => selected.includes(p.id));
  const q = query.trim().toLowerCase();
  const matches = people.filter((p) => !q || p.name.toLowerCase().includes(q));

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <Popover
      bare
      ariaLabel={chosen.length > 0 ? `${label}: ${chosen.map((p) => p.name).join(", ")}. Change` : `${label}: none. Assign`}
      label={
        chosen.length > 0 ? (
          <span className="px-1">
            <AvatarStack people={chosen} />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-1 text-muted">
            <span className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-gray-400 text-xs">+</span>
            <span className="text-xs">Assign</span>
          </span>
        )
      }
    >
      <div className="space-y-2">
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand-300"
        />
        <ul className="max-h-60 overflow-y-auto">
          {matches.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm hover:bg-background">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="size-4 accent-brand-500" />
                <span aria-hidden>
                  <Avatar name={p.name} src={p.src} size="sm" />
                </span>
                {p.name}
              </label>
            </li>
          ))}
          {matches.length === 0 ? <li className="px-2 py-3 text-center text-xs text-muted">No one matches “{query.trim()}”.</li> : null}
        </ul>
        {selected.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="min-h-9 w-full rounded-lg text-xs font-medium text-muted hover:bg-background hover:text-foreground">
            Clear all
          </button>
        ) : null}
      </div>
    </Popover>
  );
}
