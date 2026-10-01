"use client";

import { useRef, type KeyboardEvent } from "react";

// Underlined category tabs with optional count badges — the app's standard
// way to split one list into views (design ref: public/design/tab-category.png).
// Controlled: the caller owns the selected key and filters its own list.
// Scrolls sideways on narrow screens instead of wrapping.

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Shown as a badge after the label; omit for no badge. */
  count?: number;
}

export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Accessible name for the tab list, e.g. "Order status". */
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern); Tab leaves the list.
  function onKeyDown(e: KeyboardEvent, index: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex overflow-x-auto border-b border-border ${className ?? ""}`}
      style={{ scrollbarWidth: "none" }}
    >
      {tabs.map((tab, i) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
              active
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={`tnum rounded-full border px-1.5 text-xs leading-5 ${
                  active
                    ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-400"
                    : "border-border text-muted"
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
