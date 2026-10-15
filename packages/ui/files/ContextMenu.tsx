"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ContextEntry = { label: string; onSelect: () => void; danger?: boolean; checked?: boolean } | { note: string } | "-";

/**
 * A right-click menu at a point on the screen (kept inside it): arrow keys
 * move, Enter picks, Escape, a click elsewhere or scrolling closes. Focus
 * goes back where it was.
 */
export function ContextMenu({ x, y, label, entries, onClose }: { x: number; y: number; label: string; entries: ContextEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = ref.current!;
    const { width, height } = menu.getBoundingClientRect();
    setAt({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)) });
    const before = document.activeElement as HTMLElement | null;
    menu.querySelector<HTMLElement>("[role=menuitem], [role=menuitemradio]")?.focus();
    return () => before?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("contextmenu", away, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("contextmenu", away, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  function onKeyDown(e: React.KeyboardEvent) {
    const items = [...ref.current!.querySelectorAll<HTMLElement>("[role=menuitem], [role=menuitemradio]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: at.left, top: at.top }}
      className="fixed z-50 min-w-48 rounded-xl border border-border bg-surface p-1 text-sm shadow-lg"
    >
      {entries.map((entry, i) =>
        entry === "-" ? (
          <div key={i} role="separator" className="my-1 h-px bg-border" />
        ) : "note" in entry ? (
          <p key={i} className="max-w-56 px-3 py-1.5 text-xs text-muted">
            {entry.note}
          </p>
        ) : (
          <button
            key={i}
            type="button"
            role={entry.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={entry.checked}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left outline-none hover:bg-background focus:bg-background ${
              entry.danger ? "text-error-600 dark:text-error-400" : ""
            }`}
          >
            <span className="w-3 text-xs">{entry.checked ? "✓" : ""}</span>
            {entry.label}
          </button>
        ),
      )}
    </div>
  );
}
