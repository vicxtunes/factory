"use client";

import { useState } from "react";

import { StepRail } from "@repo/ui/StepForm";

// The rail alone, five steps, part-way through: done steps are ticked and
// can be opened again; on a phone only the open step is named.
const STEPS = ["Account type", "Account info", "Business details", "Billing details", "Completed"];

export default function StepFormRail() {
  const [step, setStep] = useState(1);
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-4 sm:p-8">
      <StepRail titles={STEPS} step={step} reached={3} onGo={setStep} />
    </div>
  );
}
