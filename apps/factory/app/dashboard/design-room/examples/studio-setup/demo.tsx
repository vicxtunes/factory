"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { PhoneInput } from "@repo/ui/PhoneInput";
import {
  SetupActions,
  SetupChecklist,
  SetupFocused,
  SetupSplit,
  SetupWelcome,
  type SetupStep,
} from "@repo/ui/studio-access/SetupLayouts";

// A clickable studio set-up for comparing the three layouts. The forms are
// stand-ins (nothing is saved); the frames are the real drafts.

const STEPS = [
  { id: "details", label: "Studio details", hint: "Name, owner and phone", title: "Your studio", description: "Your clients and Aming see these. We filled them in from your Aming account: change anything that isn't right." },
  { id: "logo", label: "Logo", hint: "Shown on your page and documents", optional: true, title: "Your logo", description: "It appears on your public page, quotations, invoices and workspace." },
  { id: "address", label: "Web address", hint: "Your public page", title: "Your web address", description: "Your public page, and where your clients sign in. You can change it later; old links keep working." },
  { id: "email", label: "Email", hint: "For codes and Aming's messages", title: "Verify your email", description: "We'll send a 6-digit code. It's used to reset your studio password." },
  { id: "password", label: "Password", hint: "Protects your studio", title: "Studio password", description: "Asked on each device every 30 days and after signing out of Aming." },
  { id: "review", label: "Submit", hint: "Aming reviews your studio", title: "Submit for review", description: "Aming checks every new studio before it opens. You'll get an email and a notification." },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function StepForm({ id }: { id: StepId }) {
  const [phone, setPhone] = useState("+256703360688");
  if (id === "details") {
    return (
      <div className="space-y-4">
        <Field label="Studio name">
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
        <Field label="Studio phone" hint="Your clients call and WhatsApp this number.">
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
    ["Studio", "Dementa Studios · +256 703 360 688"],
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

/** A or B: welcome first, then one step at a time. */
export function SteppedDemo({ layout, start = -1 }: { layout: "split" | "focused"; start?: number }) {
  const [index, setIndex] = useState(start);
  const Frame = layout === "split" ? SetupSplit : SetupFocused;
  if (index < 0) {
    return (
      <Frame steps={stepsAt(-1)} title="" description="">
        <SetupWelcome onStart={() => setIndex(0)} />
      </Frame>
    );
  }
  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;
  return (
    <Frame steps={stepsAt(index)} title={step.title} description={step.description}>
      <StepForm id={step.id} />
      <SetupActions back={{ onClick: () => setIndex(index - 1) }}>
        {step.id === "logo" ? (
          <Button variant="secondary" onClick={() => setIndex(index + 1)}>
            Skip for now
          </Button>
        ) : null}
        <Button onClick={() => setIndex(last ? 0 : index + 1)}>{last ? "Submit for review" : step.id === "email" ? "Verify" : "Save and continue"}</Button>
      </SetupActions>
    </Frame>
  );
}

/** C: every step on one page. */
export function ChecklistDemo() {
  const [done, setDone] = useState<string[]>(["details"]);
  const [open, setOpen] = useState<string | null>("logo");
  const steps: SetupStep[] = STEPS.filter((s) => s.id !== "review").map((s) => ({
    id: s.id,
    label: s.label,
    hint: s.hint,
    optional: "optional" in s,
    state: done.includes(s.id) ? "done" : "todo",
  }));
  const ready = steps.every((s) => s.optional || s.state === "done");
  return (
    <SetupChecklist
      steps={steps}
      open={open}
      onOpen={setOpen}
      renderStep={(id) => (
        <div className="space-y-4">
          <p className="text-sm text-muted">{STEPS.find((s) => s.id === id)!.description}</p>
          <StepForm id={id as StepId} />
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setDone((d) => [...new Set([...d, id])]);
                setOpen(steps.find((s) => s.id !== id && s.state !== "done" && !done.includes(s.id))?.id ?? null);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      footer={
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 @md:flex-row @md:items-center @md:justify-between">
          <p className="text-sm text-muted">{ready ? "All set. Aming will review your studio." : "Finish the required steps to submit."}</p>
          <Button disabled={!ready}>Submit for review</Button>
        </div>
      }
    />
  );
}
