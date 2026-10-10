"use client";

import type { ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import type { useSteps } from "@repo/ui/Stepper";

// A long form in steps, as one card: a rail of numbered steps along the top
// (done ones ticked, joined by a line that fills as the form advances), the
// open step's heading and fields, then Previous on the left and Continue on
// the right under a rule. The caller owns the fields and the step state
// (useSteps, from Stepper).

const Tick = () => (
  <svg viewBox="0 0 16 16" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

const Chevron = ({ back = false }: { back?: boolean }) => (
  <svg viewBox="0 0 16 16" className={`size-4 ${back ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </svg>
);

/** Where the form is: each step a numbered circle with its name under it; the ones reached so far can be opened. */
export function StepRail({ titles, step, reached, onGo }: { titles: readonly string[]; step: number; reached: number; onGo: (to: number) => void }) {
  // More than three names don't fit a phone: there, only the open step is named.
  const crowded = titles.length > 3;
  return (
    <nav aria-label="Steps">
      <ol className="flex">
        {titles.map((t, i) => {
          const state = i === step ? "current" : i < step ? "done" : "ahead";
          return (
            <li key={t} className="relative flex min-w-0 flex-1 flex-col items-center">
              {i > 0 ? <span aria-hidden className={`absolute left-[calc(-50%+24px)] right-[calc(50%+24px)] top-[17px] h-0.5 rounded-full ${i <= step ? "bg-brand-500" : "bg-border"}`} /> : null}
              <button
                type="button"
                disabled={i > reached}
                aria-current={state === "current" ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${t}`}
                onClick={() => onGo(i)}
                className={`relative grid size-9 place-items-center rounded-full text-sm font-semibold transition-colors ${
                  state === "ahead"
                    ? "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                    : `bg-brand-500 text-white ${state === "current" ? "ring-4 ring-brand-500/20" : "hover:bg-brand-600"}`
                }`}
              >
                {state === "done" ? <Tick /> : <span className="tnum">{i + 1}</span>}
              </button>
              <span
                className={`mt-2 max-w-full px-1 text-center text-xs sm:text-sm ${state === "ahead" ? "text-muted" : "font-medium"} ${
                  crowded && state !== "current" ? "hidden sm:block" : ""
                }`}
              >
                {t}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The card: the rail, the open step's heading and fields, and Previous / Continue. Continue submits, so the step's fields validate first. */
export function StepForm({
  titles,
  steps,
  heading,
  hint,
  submitLabel,
  pending = false,
  error,
  onSubmit,
  children,
}: {
  titles: readonly string[];
  steps: ReturnType<typeof useSteps>;
  heading: string;
  hint?: ReactNode;
  /** The last step's button, e.g. "Book". */
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  /** Called on the last step; the earlier ones move on by themselves. */
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (steps.last) onSubmit();
        else steps.next();
      }}
      className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-8"
    >
      <StepRail titles={titles} step={steps.step} reached={steps.reached} onGo={steps.go} />
      <div className="mt-8 sm:mt-10">
        <h2 className="text-base font-semibold">{heading}</h2>
        {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      </div>
      <div className="mt-6 space-y-6">{children}</div>
      {error ? <p className="mt-4 text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="mt-8 flex items-center gap-2 border-t border-border pt-5">
        {steps.step === 0 ? null : (
          <Button type="button" variant="secondary" onClick={steps.back} disabled={pending}>
            <Chevron back />
            Previous
          </Button>
        )}
        <Button type="submit" className="ml-auto" loading={steps.last && pending}>
          {steps.last ? submitLabel : "Continue"}
          {steps.last ? null : <Chevron />}
        </Button>
      </div>
    </form>
  );
}

export interface Choice<T extends string> {
  value: T;
  title: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * One of a few options. `layout="cards"`: a row each, with an icon, a line of
 * explanation and a radio dot. `layout="tiles"`: short labels side by side.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  layout = "cards",
}: {
  label: string;
  value: T | "";
  onChange: (value: T) => void;
  options: readonly Choice<T>[];
  layout?: "cards" | "tiles";
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className={layout === "tiles" ? "grid gap-2" : "space-y-2"}
        style={layout === "tiles" ? { gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((o) => {
          const on = o.value === value;
          const frame = on ? "border-brand-500 ring-2 ring-brand-500/25" : "border-border hover:bg-background";
          return layout === "tiles" ? (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={`min-h-11 rounded-xl border px-2 text-sm disabled:opacity-50 ${frame} ${on ? "bg-brand-50 font-medium dark:bg-brand-500/15" : ""}`}
            >
              {o.title}
            </button>
          ) : (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50 sm:p-4 ${frame}`}
            >
              {o.icon ? <span className="shrink-0 text-muted">{o.icon}</span> : null}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{o.title}</span>
                {o.hint ? <span className="block text-sm text-muted">{o.hint}</span> : null}
              </span>
              <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-full border ${on ? "border-brand-500" : "border-gray-300 dark:border-gray-600"}`}>
                {on ? <span className="size-2 rounded-full bg-brand-500" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
