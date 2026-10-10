"use client";

import { useState } from "react";

/**
 * A long form in steps: which one is open, and how far it's been (steps up to
 * there can be opened again from the rail: see StepForm). Editing something that
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
