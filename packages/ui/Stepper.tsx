"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";

/**
 * A long form in steps: which one is open, and how far it's been (steps up to
 * there can be opened again from the indicator). Editing something that
 * already exists (`open`), every step can be opened straight away.
 */
export function useSteps(count: number, open: boolean) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(open ? count - 1 : 0);
  const go = (to: number) => {
    setStep(to);
    setReached((r) => Math.max(r, to));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return { step, reached, go, next: () => go(Math.min(step + 1, count - 1)), back: () => go(Math.max(step - 1, 0)), last: step === count - 1 };
}

/** Where the form is: "Step 2 of 4", and each step by name, the ones reached so far openable. */
export function StepIndicator({ titles, step, reached, onGo }: { titles: readonly string[]; step: number; reached: number; onGo: (to: number) => void }) {
  return (
    <nav aria-label="Steps" className="space-y-2">
      <p className="text-xs text-muted">
        Step {step + 1} of {titles.length}
      </p>
      <ol className="flex flex-wrap gap-2">
        {titles.map((t, i) => {
          const state = i === step ? "current" : i <= reached ? "reached" : "ahead";
          return (
            <li key={t}>
              <button
                type="button"
                disabled={state === "ahead"}
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => onGo(i)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm ${
                  state === "current"
                    ? "border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                    : state === "reached"
                      ? "border-border hover:bg-background"
                      : "border-border text-muted opacity-60"
                }`}
              >
                <span className="tnum text-xs">{i + 1}</span>
                {t}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Back, and Next (or, on the last step, the form's own submit label). The step's form validates before Next. */
export function StepActions({
  first,
  last,
  onBack,
  submitLabel,
  pending,
}: {
  first: boolean;
  last: boolean;
  onBack: () => void;
  submitLabel: string;
  pending: boolean;
}) {
  return (
    <div className="flex gap-2">
      {first ? null : (
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
          Back
        </Button>
      )}
      <Button type="submit" className="flex-1 sm:flex-none" loading={last && pending}>
        {last ? submitLabel : "Next"}
      </Button>
    </div>
  );
}
