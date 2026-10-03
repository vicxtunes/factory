"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";

import { ActionMenu } from "./ActionMenu";

// Columns of cards — drag a card to another column (or another spot in its
// own), drag a column by its header to reorder the board. Native HTML5 drag
// and drop, no library. Drag doesn't exist on touch screens or for keyboard
// users, so every card and column header also has a "⋯" menu that does the
// same moves (Move up / down / to <column>, Move left / right).
//
// The caller owns the board: `columns` lists each column's card keys in
// order, `renderCard` draws a card (usually a TaskCard, passing the menu it's
// handed into its `actions`), and moves come back through `onMove` /
// `onColumnMove` — apply them with `moveCard` / `moveColumn` below. Leaving
// out `onColumnMove` makes the columns fixed.
// Draft — lives in the Design Room until a page adopts it.

export interface KanbanColumn {
  key: string;
  label: string;
  /** Work-in-progress limit — the header turns amber when the column holds more. */
  limit?: number;
  /** Keys of the cards in this column, top to bottom. */
  cardKeys: string[];
}

/** `columns` with `cardKey` taken out of wherever it is and put at `index` in `toColumn`. */
export function moveCard(columns: KanbanColumn[], cardKey: string, toColumn: string, index: number): KanbanColumn[] {
  return columns
    .map((c) => ({ ...c, cardKeys: c.cardKeys.filter((k) => k !== cardKey) }))
    .map((c) => (c.key === toColumn ? { ...c, cardKeys: [...c.cardKeys.slice(0, index), cardKey, ...c.cardKeys.slice(index)] } : c));
}

/** `columns` with column `key` moved to position `index`. */
export function moveColumn(columns: KanbanColumn[], key: string, index: number): KanbanColumn[] {
  const column = columns.find((c) => c.key === key);
  if (!column) return columns;
  const rest = columns.filter((c) => c.key !== key);
  return [...rest.slice(0, index), column, ...rest.slice(index)];
}

type Drag = { type: "card"; key: string; from: string; fromIndex: number } | { type: "column"; key: string; fromIndex: number };

export function KanbanBoard({
  columns,
  renderCard,
  cardLabel,
  onMove,
  onColumnMove,
}: {
  columns: KanbanColumn[];
  /** Draws one card. Put `menu` somewhere on it (TaskCard's `actions`) so touch and keyboard users can move it. */
  renderCard: (key: string, menu: ReactNode) => ReactNode;
  /** Card's name for its menu label and move announcements, e.g. the task title. */
  cardLabel: (key: string) => string;
  /** `index` is the card's position in `toColumn` once moved — pass straight to `moveCard`. */
  onMove: (cardKey: string, toColumn: string, index: number) => void;
  /** Omit to keep columns in a fixed order. */
  onColumnMove?: (columnKey: string, index: number) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  // Where the dragged thing would land — drives the drop line.
  const [cardTarget, setCardTarget] = useState<{ column: string; index: number } | null>(null);
  const [columnTarget, setColumnTarget] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  // After a menu move the card/column re-renders somewhere else and its
  // menu button loses focus; this puts focus back on it once it's there.
  const refocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!refocusRef.current) return;
    boardRef.current?.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(refocusRef.current)}"]`)?.focus();
    refocusRef.current = null;
  }, [columns]);

  function clearDrag() {
    setDrag(null);
    setCardTarget(null);
    setColumnTarget(null);
  }

  function labelOf(columnKey: string) {
    return columns.find((c) => c.key === columnKey)?.label ?? columnKey;
  }

  function moveCardTo(cardKey: string, toColumn: string, index: number, viaMenu: boolean) {
    if (viaMenu) refocusRef.current = `card:${cardKey}`;
    onMove(cardKey, toColumn, index);
    setAnnouncement(`Moved ${cardLabel(cardKey)} to ${labelOf(toColumn)}, position ${index + 1}.`);
  }

  function moveColumnTo(columnKey: string, index: number, viaMenu: boolean) {
    if (!onColumnMove) return;
    if (viaMenu) refocusRef.current = `column:${columnKey}`;
    onColumnMove(columnKey, index);
    setAnnouncement(`Moved column ${labelOf(columnKey)} to position ${index + 1}.`);
  }

  // Card drop position = the first card whose vertical midpoint is below the pointer.
  function onColumnDragOver(e: DragEvent<HTMLElement>, columnKey: string) {
    if (drag?.type !== "card") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-card]")];
    const i = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    const index = i === -1 ? cards.length : i;
    if (cardTarget?.column !== columnKey || cardTarget.index !== index) setCardTarget({ column: columnKey, index });
  }

  function onColumnDrop(e: DragEvent<HTMLElement>, columnKey: string) {
    if (drag?.type !== "card" || !cardTarget) return;
    e.preventDefault();
    // cardTarget.index counts the dragged card itself when it's dropped back
    // into its own column; moveCard's index doesn't, so step back past it.
    let index = cardTarget.index;
    if (drag.from === columnKey && drag.fromIndex < index) index -= 1;
    if (!(drag.from === columnKey && drag.fromIndex === index)) moveCardTo(drag.key, columnKey, index, false);
    clearDrag();
  }

  // Column drop position = the first column whose horizontal midpoint is right of the pointer.
  function onBoardDragOver(e: DragEvent<HTMLElement>) {
    if (drag?.type !== "column") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cols = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-column]")];
    const i = cols.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2;
    });
    const index = i === -1 ? cols.length : i;
    if (columnTarget !== index) setColumnTarget(index);
  }

  function onBoardDrop(e: DragEvent<HTMLElement>) {
    if (drag?.type !== "column" || columnTarget === null) return;
    e.preventDefault();
    const index = drag.fromIndex < columnTarget ? columnTarget - 1 : columnTarget;
    if (index !== drag.fromIndex) moveColumnTo(drag.key, index, false);
    clearDrag();
  }

  return (
    <div
      ref={boardRef}
      onDragOver={onBoardDragOver}
      onDrop={onBoardDrop}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setCardTarget(null);
          setColumnTarget(null);
        }
      }}
      className="flex items-start gap-4 overflow-x-auto pb-1"
      style={{ scrollbarWidth: "none" }}
    >
      {columns.map((column, ci) => {
        const count = column.cardKeys.length;
        const overLimit = column.limit !== undefined && count > column.limit;
        const columnDropBefore = drag?.type === "column" && columnTarget === ci;
        const columnDropAfter = drag?.type === "column" && columnTarget === columns.length && ci === columns.length - 1;
        const cardDropHere = drag?.type === "card" && cardTarget?.column === column.key;

        return (
          <section
            key={column.key}
            data-column
            aria-label={column.label}
            onDragOver={(e) => onColumnDragOver(e, column.key)}
            onDrop={(e) => onColumnDrop(e, column.key)}
            className={`relative flex w-72 shrink-0 flex-col rounded-[var(--radius)] border bg-gray-50 dark:bg-white/[0.02] ${
              overLimit ? "border-amber-500/50" : "border-border"
            } ${drag?.type === "column" && drag.key === column.key ? "opacity-40" : ""}`}
          >
            {/* Column drop line — absolute, so showing it never shifts the layout being measured. */}
            {columnDropBefore ? <span aria-hidden className="absolute inset-y-0 -left-2.5 w-0.5 rounded-full bg-brand-500" /> : null}
            {columnDropAfter ? <span aria-hidden className="absolute inset-y-0 -right-2.5 w-0.5 rounded-full bg-brand-500" /> : null}

            <header
              draggable={!!onColumnMove}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", column.label);
                e.dataTransfer.effectAllowed = "move";
                setDrag({ type: "column", key: column.key, fromIndex: ci });
              }}
              onDragEnd={clearDrag}
              className={`flex items-center gap-2 px-3 py-2.5 ${onColumnMove ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{column.label}</h3>
              <span
                title={column.limit !== undefined ? `Limit ${column.limit}` : undefined}
                className={`rounded-full px-2 py-0.5 text-xs font-medium tnum ${
                  overLimit
                    ? "bg-amber-500/15 text-amber-600"
                    : "bg-gray-200/70 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                }`}
              >
                {column.limit !== undefined ? `${count}/${column.limit}` : count}
              </span>
              {onColumnMove ? (
                <ActionMenu
                  label={`Column ${column.label} options`}
                  focusKey={`column:${column.key}`}
                  items={[
                    { label: "Move left", disabled: ci === 0, onSelect: () => moveColumnTo(column.key, ci - 1, true) },
                    { label: "Move right", disabled: ci === columns.length - 1, onSelect: () => moveColumnTo(column.key, ci + 1, true) },
                  ]}
                />
              ) : null}
            </header>

            <div
              className={`flex min-h-24 flex-col gap-2 px-2 pb-2 ${
                cardDropHere && count === 0 ? "rounded-b-[var(--radius)] bg-brand-500/5" : ""
              }`}
            >
              {count === 0 ? (
                <p
                  className={`flex min-h-20 items-center justify-center rounded-[var(--radius)] border border-dashed text-xs text-muted ${
                    cardDropHere ? "border-brand-500" : "border-border"
                  }`}
                >
                  {cardDropHere ? "Drop here" : "No tasks"}
                </p>
              ) : null}
              {column.cardKeys.map((key, i) => {
                const dropBefore = cardDropHere && cardTarget?.index === i;
                const dropAfter = cardDropHere && cardTarget?.index === count && i === count - 1;
                const others = columns.filter((c) => c.key !== column.key);
                const menu = (
                  <ActionMenu
                    label={`Move ${cardLabel(key)}`}
                    focusKey={`card:${key}`}
                    items={[
                      { label: "Move up", disabled: i === 0, onSelect: () => moveCardTo(key, column.key, i - 1, true) },
                      { label: "Move down", disabled: i === count - 1, onSelect: () => moveCardTo(key, column.key, i + 1, true) },
                      ...(others.length > 0 ? [{ heading: "Move to" }] : []),
                      ...others.map((c) => ({ label: c.label, onSelect: () => moveCardTo(key, c.key, c.cardKeys.length, true) })),
                    ]}
                  />
                );

                return (
                  <div
                    key={key}
                    data-card
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData("text/plain", cardLabel(key));
                      e.dataTransfer.effectAllowed = "move";
                      setDrag({ type: "card", key, from: column.key, fromIndex: i });
                    }}
                    onDragEnd={clearDrag}
                    className={`relative ${drag?.type === "card" && drag.key === key ? "opacity-40" : ""}`}
                  >
                    {dropBefore ? <span aria-hidden className="absolute inset-x-0 -top-[5px] h-0.5 rounded-full bg-brand-500" /> : null}
                    {renderCard(key, menu)}
                    {dropAfter ? <span aria-hidden className="absolute inset-x-0 -bottom-[5px] h-0.5 rounded-full bg-brand-500" /> : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
