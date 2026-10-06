"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { SetupActions, SetupSplit, SetupWelcome, type SetupStep } from "@repo/ui/studio-access/SetupLayouts";

// A clickable studio set-up in the real frame (SetupSplit). The forms are
// stand-ins: nothing is saved (the real steps are in OnboardingWizard).

const STEPS = [
  { id: "details", label: "Business details", hint: "Name, owner and phone", title: "Your business", description: "Your clients and Aming see these. We filled them in from your Aming account: change anything that isn't right." },
  { id: "logo", label: "Logo", hint: "Shown on your page and documents", optional: true, title: "Your logo", description: "It appears on your public page, quotations, invoices and workspace." },
  { id: "address", label: "Web address", hint: "Your public page", title: "Your web address", description: "Your public page, and where your clients sign in. You can change it later; old links keep working." },
  { id: "email", label: "Email", hint: "For codes and Aming's messages", title: "Verify your email", description: "We'll send a 6-digit code. It's used to reset your business password." },
  { id: "password", label: "Password", hint: "Protects your business", title: "Business password", description: "Asked on each device every 30 days and after signing out of Aming." },
  { id: "review", label: "Submit", hint: "Aming reviews your business", title: "Submit for review", description: "Aming checks every new business before it opens. You'll get an email and a notification." },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function StepForm({ id }: { id: StepId }) {
  const [phone, setPhone] = useState("+256703360688");
  if (id === "details") {
    return (
      <div className="space-y-4">
        <Field label="Business name">
          <TextInput defaultValue="Dementa Studios" />
        </Field>
        <div className="grid gap-4 @md:grid-cols-2">
          <Field label="Owner's first name">
            <TextInput defaultValue="Victor" />
          </Field>
          <Field label="Owner's last name">
            <TextInput defaultValue="Dementa" />
          </Field>
        </div>
        <Field label="Business phone" hint="Your clients call and WhatsApp this number.">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
      </div>
    );
  }
  if (id === "logo") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-xl bg-gray-100 text-xl font-semibold text-muted dark:bg-white/10">DS</span>
        <p className="text-sm font-medium">Drop your logo here, or choose a file</p>
        <p className="text-xs text-muted">A square JPG or PNG works best.</p>
        <Button variant="secondary" className="mt-2">Choose file</Button>
      </div>
    );
  }
  if (id === "address") {
    return (
      <Field label="Address" hint="Lowercase letters, numbers and hyphens.">
        <div className="flex items-stretch overflow-hidden rounded-[var(--radius)] border border-border bg-surface focus-within:border-brand-300">
          <span className="flex items-center border-r border-border bg-background px-3 text-sm text-muted">amingspace.com/</span>
          <input defaultValue="dementa-studios" className="min-h-11 flex-1 bg-transparent px-3 text-sm outline-none" />
        </div>
      </Field>
    );
  }
  if (id === "email") {
    return (
      <div className="space-y-4">
        <Field label="Email">
          <TextInput type="email" defaultValue="victordementa@gmail.com" />
        </Field>
        <Field label="Code sent to victordementa@gmail.com" hint="It works for 10 minutes. New code in 9:12.">
          <TextInput inputMode="numeric" placeholder="••••••" className="tracking-[0.5em] tnum" />
        </Field>
      </div>
    );
  }
  if (id === "password") {
    return (
      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="New password" hint="At least 8 characters.">
          <PasswordInput />
        </Field>
        <Field label="Type it again">
          <PasswordInput />
        </Field>
      </div>
    );
  }
  const rows: [string, string][] = [
    ["Business", "Dementa Studios · +256 703 360 688"],
    ["Owner", "Victor Dementa"],
    ["Logo", "Not added (optional)"],
    ["Address", "amingspace.com/dementa-studios"],
    ["Email", "victordementa@gmail.com"],
    ["Password", "Set"],
  ];
  return (
    <dl className="divide-y divide-border rounded-xl border border-border">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 px-4 py-3 text-sm @md:flex-row @md:justify-between">
          <dt className="text-muted">{k}</dt>
          <dd className="font-medium @md:text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const stepsAt = (index: number): SetupStep[] =>
  STEPS.map((s, i) => ({ id: s.id, label: s.label, hint: s.hint, optional: "optional" in s, state: i < index ? "done" : i === index ? "current" : "todo" }));

/** Welcome first, then one step at a time. */
export function SteppedDemo({ start = -1 }: { start?: number }) {
  const [index, setIndex] = useState(start);
  if (index < 0) {
    return (
      <SetupSplit steps={stepsAt(-1)} title="Set up your business" description="Run your photography business from one place, next to your Aming orders. It takes about 5 minutes; Aming then reviews your business before it opens.">
        <SetupWelcome onStart={() => setIndex(0)} />
      </SetupSplit>
    );
  }
  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;
  return (
    <SetupSplit steps={stepsAt(index)} title={step.title} description={step.description} onSelect={(id) => setIndex(STEPS.findIndex((s) => s.id === id))}>
      <StepForm id={step.id} />
      <SetupActions back={{ onClick: () => setIndex(index - 1) }}>
        {step.id === "logo" ? (
          <Button variant="secondary" onClick={() => setIndex(index + 1)}>
            Skip for now
          </Button>
        ) : null}
        <Button onClick={() => setIndex(last ? 0 : index + 1)}>{last ? "Submit for review" : step.id === "email" ? "Verify" : "Save and continue"}</Button>
      </SetupActions>
    </SetupSplit>
  );
}
