"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";

import { ActionMenu } from "./ActionMenu";
import { ProgressBar } from "./ProgressBar";

// A task's checklist: tick items off, add one at the bottom, reorder by
// dragging the ⋮⋮ handle (or Move up / down in each row's ⋯ menu, for touch
// and keyboard), remove from the same menu. The header's ProgressBar tracks
// how many are done. The caller owns the items; this reports changes.
// Draft — lives in the Design Room until a page adopts it.

export interface Subtask {
  key: string;
  title: string;
  done: boolean;
}

export function SubtaskChecklist({
  items,
  onToggle,
  onAdd,
  onMove,
  onRemove,
}: {
  items: Subtask[];
  onToggle: (key: string) => void;
  /** Shows the "Add subtask" box. */
  onAdd?: (title: string) => void;
  /** `index` is the item's new position. Enables drag handles and Move up / down. */
  onMove?: (key: string, index: number) => void;
  /** Adds Remove to each row's menu. */
  onRemove?: (key: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const refocusRef = useRef<string | null>(null);
  const done = items.filter((i) => i.done).length;
  const hasMenu = !!onMove || !!onRemove;

  // Keep keyboard focus on a row's ⋯ button after a menu move re-orders it.
  useEffect(() => {
    if (!refocusRef.current) return;
    listRef.current?.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(refocusRef.current)}"]`)?.focus();
    refocusRef.current = null;
  }, [items]);

  function add(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || !onAdd) return;
    onAdd(title);
    setDraft("");
  }

  function onDragOver(e: DragEvent<HTMLUListElement>) {
    if (!dragKey) return;
    e.preventDefault();
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-row]")];
    const i = rows.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    const index = i === -1 ? rows.length : i;
    if (index !== dropIndex) setDropIndex(index);
  }

  function onDrop(e: DragEvent<HTMLUListElement>) {
    if (!dragKey || dropIndex === null || !onMove) return;
    e.preventDefault();
    const from = items.findIndex((i) => i.key === dragKey);
    const index = from < dropIndex ? dropIndex - 1 : dropIndex;
    if (index !== from) onMove(dragKey, index);
    setDragKey(null);
    setDropIndex(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">Subtasks</h3>
        {items.length > 0 ? <ProgressBar value={done} max={items.length} label="Subtasks done" showValue="fraction" className="flex-1" /> : null}
      </div>

      {items.length > 0 ? (
        <ul ref={listRef} onDragOver={onDragOver} onDrop={onDrop} className="divide-y divide-border rounded-[var(--radius)] border border-border bg-surface">
          {items.map((item, i) => (
            <li
              key={item.key}
              data-row
              draggable={!!onMove}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", item.title);
                e.dataTransfer.effectAllowed = "move";
                setDragKey(item.key);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setDropIndex(null);
              }}
              className={`relative flex min-h-11 items-center gap-1 pr-1 ${dragKey === item.key ? "opacity-40" : ""}`}
            >
              {dragKey && dropIndex === i ? <span aria-hidden className="absolute inset-x-0 -top-px h-0.5 bg-brand-500" /> : null}
              {dragKey && dropIndex === items.length && i === items.length - 1 ? (
                <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-500" />
              ) : null}
              {onMove ? (
                <span aria-hidden className="cursor-grab pl-1.5 text-muted active:cursor-grabbing">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                    <circle cx="6" cy="4" r="1.1" />
                    <circle cx="10" cy="4" r="1.1" />
                    <circle cx="6" cy="8" r="1.1" />
                    <circle cx="10" cy="8" r="1.1" />
                    <circle cx="6" cy="12" r="1.1" />
                    <circle cx="10" cy="12" r="1.1" />
                  </svg>
                </span>
              ) : null}
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 text-sm">
                <input type="checkbox" checked={item.done} onChange={() => onToggle(item.key)} className="size-4 shrink-0 accent-brand-500" />
                <span className={`truncate ${item.done ? "text-muted line-through" : ""}`}>{item.title}</span>
              </label>
              {hasMenu ? (
                <span className="mr-1">
                  <ActionMenu
                    label={`Subtask ${item.title} options`}
                    focusKey={item.key}
                    items={[
                      ...(onMove
                        ? [
                            {
                              label: "Move up",
                              disabled: i === 0,
                              onSelect: () => {
                                refocusRef.current = item.key;
                                onMove(item.key, i - 1);
                              },
                            },
                            {
                              label: "Move down",
                              disabled: i === items.length - 1,
                              onSelect: () => {
                                refocusRef.current = item.key;
                                onMove(item.key, i + 1);
                              },
                            },
                          ]
                        : []),
                      ...(onRemove ? [{ label: "Remove", onSelect: () => onRemove(item.key) }] : []),
                    ]}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-5 text-center text-xs text-muted">No subtasks yet.</p>
      )}

      {onAdd ? (
        <form onSubmit={add} className="flex items-center gap-2 rounded-[var(--radius)] border border-dashed border-border px-3 focus-within:border-brand-300">
          <span aria-hidden className="text-lg leading-none text-muted">
            +
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add subtask…"
            aria-label="Add subtask"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-white/30"
          />
        </form>
      ) : null}
    </div>
  );
}
