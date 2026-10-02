"use client";

import { forwardRef, useSyncExternalStore, type ReactNode } from "react";

// Building blocks for the client's order screens (order placed, quote,
// order view), laid out for phones: the price first and large, then
// collapsible sections that each show a one-line summary while closed.

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True on tablet/desktop widths, where sections start open. False during server rendering. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * The price, as the most prominent thing on the screen. `tone="pending"`
 * is for a price that isn't known yet.
 */
export function PriceHero({
  label,
  price,
  note,
  tone = "firm",
  children,
}: {
  label: string;
  /** Already formatted, e.g. "USh 340,000". */
  price: ReactNode;
  note?: ReactNode;
  tone?: "firm" | "pending";
  /** Actions under the price (How to pay, Approve…). */
  children?: ReactNode;
}) {
  return (
    // Same size and style as the amount card PaymentMethods used to show
    // inside "How to pay": the price now appears once, here, at the top.
    <section
      aria-label={label}
      className={
        tone === "firm"
          ? "rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm dark:border-brand-500/30 dark:bg-brand-500/10"
          : "rounded-2xl border border-border bg-surface p-4 text-sm"
      }
    >
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={tone === "firm" ? "text-2xl font-extrabold tabular-nums" : "text-base font-semibold"}>{price}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </section>
  );
}

/**
 * A tap-to-open section. While closed it still shows `summary`, so nothing
 * is hidden without a hint of what's inside. Starts open on desktop.
 */
export const Collapsible = forwardRef<
  HTMLDetailsElement,
  { title: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }
>(function Collapsible({ title, summary, defaultOpen, children }, ref) {
  const isDesktop = useIsDesktop();
  return (
    <details
      ref={ref}
      // Keyed on the breakpoint so crossing it resets the default.
      key={isDesktop ? "desktop" : "mobile"}
      open={defaultOpen ?? isDesktop}
      className="group scroll-mt-4 rounded-2xl border border-border bg-surface"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {summary ? <span className="block truncate text-xs text-muted group-open:hidden">{summary}</span> : null}
        </span>
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="border-t border-border p-3 text-sm">{children}</div>
    </details>
  );
});
