"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { CalendarIcon, ClientsIcon, InvoiceIcon, PlaceOrderIcon, ShowroomIcon } from "@repo/ui/icons";

// The frames for a studio's set-up (chosen in the Design Room: "A · Split
// panel"). They lay out with container queries (@container), not screen
// breakpoints, so they adapt to the space they're given: a phone, a laptop,
// or a Design Room device frame.

export type SetupStepState = "done" | "current" | "todo";

export interface SetupStep {
  id: string;
  label: string;
  /** One short line on what the step is for. */
  hint: string;
  optional?: boolean;
  state: SetupStepState;
}

const NAVY = "bg-[#1f2a4d]";

export function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className={`text-lg font-bold tracking-tight ${inverted ? "text-white" : "text-[#1f2a4d] dark:text-white"}`}>
      Aming <span className="text-brand-500">Space</span>
    </span>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  );
}

const BackToAming = ({ className }: { className: string }) => (
  <Link href="/" className={className}>
    ← Back to Aming
  </Link>
);

/** A step's marker: a tick when done, its number otherwise. */
function StepMarker({ step, index }: { step: SetupStep; index: number }) {
  const base = "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold";
  if (step.state === "done") return <span className={`${base} bg-success-500 text-white`}><CheckIcon className="h-4 w-4" /></span>;
  if (step.state === "current") return <span className={`${base} bg-brand-500 text-white`}>{index + 1}</span>;
  return <span className={`${base} border border-white/30 text-white/70`}>{index + 1}</span>;
}

/** "Step 2 of 6" with a segmented bar; nothing before set-up has started (no current step). */
export function StepProgress({ steps }: { steps: SetupStep[] }) {
  const current = steps.findIndex((s) => s.state === "current");
  if (current < 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">
        Step {current + 1} of {steps.length} · <span className="text-foreground">{steps[current]?.label}</span>
      </p>
      <div className="flex gap-1" aria-hidden>
        {steps.map((s) => (
          <span key={s.id} className={`h-1 flex-1 rounded-full ${s.state === "done" ? "bg-success-500" : s.state === "current" ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10"}`} />
        ))}
      </div>
    </div>
  );
}

/** Back / Continue. Pinned to the bottom on narrow screens, inline on wide ones. */
export function SetupActions({ back, children }: { back?: { label?: string; onClick: () => void }; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-8 flex items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur @2xl:static @2xl:mx-0 @2xl:border-0 @2xl:bg-transparent @2xl:px-0 @2xl:py-0">
      {back ? (
        <button type="button" onClick={back.onClick} className="min-h-11 px-2 text-sm font-medium text-muted hover:text-foreground">
          {back.label ?? "Back"}
        </button>
      ) : null}
      <div className="ml-auto flex flex-1 justify-end gap-2 @2xl:flex-none [&>button]:flex-1 @2xl:[&>button]:flex-none">{children}</div>
    </div>
  );
}

// ── Welcome: what the studio gets, and what set-up needs. A list, not tiles. ──

const GETS = [
  { Icon: ClientsIcon, title: "Clients, bookings and projects", text: "Every shoot from first call to delivery, with your team." },
  { Icon: InvoiceIcon, title: "Quotations, invoices and receipts", text: "Clients accept and pay from a link." },
  { Icon: ShowroomIcon, title: "Photo delivery", text: "Private galleries your clients view and download. 1 GB included." },
  { Icon: CalendarIcon, title: "Your own web address", text: "A public page where your clients sign in with their phone." },
  { Icon: PlaceOrderIcon, title: "Prints and albums from Aming", text: "Order for a project and follow production in one place." },
];

const NEEDS = ["Your business's phone number", "An email you can open now (for a code)", "Your logo, if you have one: you can add it later"];

export function SetupWelcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-8">
      <ul className="divide-y divide-border">
        {GETS.map(({ Icon, title, text }) => (
          <li key={title} className="flex gap-4 py-3.5 first:pt-0">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">What you&apos;ll need</p>
        <ul className="mt-2 space-y-1.5">
          {NEEDS.map((n) => (
            <li key={n} className="flex items-start gap-2 text-sm">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
              {n}
            </li>
          ))}
        </ul>
      </div>
      <SetupActions>
        <button type="button" onClick={onStart} className="min-h-11 rounded-[var(--radius)] bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600">
          Start set-up
        </button>
      </SetupActions>
    </div>
  );
}

/**
 * Set-up's frame: a navy panel with the steps beside the form (wide), a
 * compact step header above it (narrow). `onSelect` lets the owner jump to a
 * step from the panel; `notice` sits above the heading (e.g. Aming's reason
 * for sending the studio back).
 */
export function SetupSplit({
  steps,
  title,
  description,
  notice,
  onSelect,
  children,
}: {
  steps: SetupStep[];
  title: string;
  description?: string;
  notice?: ReactNode;
  onSelect?: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="@container flex min-h-dvh flex-col bg-surface">
      <div className="flex-1 @3xl:grid @3xl:grid-cols-[300px_1fr]">
        <aside className={`hidden ${NAVY} p-8 text-white @3xl:flex @3xl:flex-col`}>
          <Wordmark inverted />
          <p className="mt-10 text-lg font-semibold">Set up your business</p>
          <p className="mt-1 text-sm text-white/60">About 5 minutes. Aming reviews every business before it opens.</p>
          <ol className="mt-8">
            {steps.map((s, i) => (
              <li key={s.id} className="relative pb-6 last:pb-0">
                {i < steps.length - 1 ? <span className="absolute left-3.5 top-8 h-[calc(100%-2.25rem)] w-px bg-white/15" aria-hidden /> : null}
                <button
                  type="button"
                  disabled={!onSelect}
                  onClick={() => onSelect?.(s.id)}
                  aria-current={s.state === "current" ? "step" : undefined}
                  className="flex w-full gap-3 rounded-lg text-left enabled:hover:opacity-90"
                >
                  <StepMarker step={s} index={i} />
                  <span className="pt-0.5">
                    <span className={`block text-sm font-medium ${s.state === "todo" ? "text-white/60" : ""}`}>
                      {s.label}
                      {s.optional ? <span className="ml-1.5 text-xs font-normal text-white/40">Optional</span> : null}
                    </span>
                    {s.state === "current" ? <span className="mt-0.5 block text-xs text-white/60">{s.hint}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-auto space-y-2 pt-8 text-xs text-white/50">
            <BackToAming className="block font-medium text-white/80 hover:text-white" />
            <p>Need help? Message Aming from Chat.</p>
          </div>
        </aside>
        <section className="flex flex-col px-4 py-6 @2xl:px-12 @2xl:py-12">
          <div className="mb-8 space-y-5 @3xl:hidden">
            <div className="flex items-center justify-between">
              <Wordmark />
              <BackToAming className="text-sm font-medium text-brand-600" />
            </div>
            <StepProgress steps={steps} />
          </div>
          <div className="w-full max-w-xl flex-1">
            {notice}
            <header className="mb-6 space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight @2xl:text-2xl">{title}</h1>
              {description ? <p className="text-sm leading-relaxed text-muted">{description}</p> : null}
            </header>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

/** A plain centred frame for set-up's other screens: being reviewed, suspended, unlock. */
export function SetupFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
        <Wordmark />
        <BackToAming className="text-sm font-medium text-brand-600 hover:underline" />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-16">{children}</main>
    </div>
  );
}
