"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MessageMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Ask "Are you sure?" inside the menu before running onSelect. */
  confirm?: string;
}

/** Keep the menu this far from the viewport edges. */
const EDGE = 8;

/**
 * The right-click (or long-press) menu for one chat message. Rendered in a
 * portal at the pointer position, so it isn't clipped by the scrolling
 * thread or a drawer. Closes on outside click, Escape, scroll or resize.
 */
export function MessageMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MessageMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [confirming, setConfirming] = useState<MessageMenuItem | null>(null);

  // Flip/clamp so the menu stays on screen near the pointer.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = x + width + EDGE > window.innerWidth ? Math.max(EDGE, x - width) : x;
    const top = y + height + EDGE > window.innerHeight ? Math.max(EDGE, y - height) : y;
    setPos({ left, top });
  }, [x, y, confirming]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  // Up/down arrows move between items.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  const itemClass = "flex w-full items-center rounded-md px-3 py-2 text-left text-sm outline-none";

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[100] min-w-40 rounded-[var(--radius)] border border-border bg-surface p-1 shadow-theme-lg"
    >
      {confirming ? (
        <>
          <p className="px-3 py-2 text-xs text-muted">{confirming.confirm}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              confirming.onSelect();
              onClose();
            }}
            className={`${itemClass} font-medium text-[var(--rush)] hover:bg-[var(--rush)]/10 focus-visible:bg-[var(--rush)]/10`}
          >
            {confirming.label}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setConfirming(null)}
            className={`${itemClass} hover:bg-gray-100 focus-visible:bg-gray-100 dark:hover:bg-white/5 dark:focus-visible:bg-white/5`}
          >
            Cancel
          </button>
        </>
      ) : (
        items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              if (item.confirm) return setConfirming(item);
              item.onSelect();
              onClose();
            }}
            className={`${itemClass} ${
              item.danger
                ? "text-[var(--rush)] hover:bg-[var(--rush)]/10 focus-visible:bg-[var(--rush)]/10"
                : "hover:bg-gray-100 focus-visible:bg-gray-100 dark:hover:bg-white/5 dark:focus-visible:bg-white/5"
            }`}
          >
            {item.label}
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}
