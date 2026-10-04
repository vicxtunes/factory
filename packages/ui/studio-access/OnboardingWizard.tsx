"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { StudioAddressForm } from "@repo/ui/studio-portal/StudioAddressForm";
import { CODE_DIGITS, PASSWORD_MIN, type OnboardingStep } from "@repo/lib/studio-access/core";
import {
  saveStudioDetails,
  sendStudioEmailCode,
  setStudioPassword,
  submitStudioForReview,
  verifyStudioEmail,
} from "@repo/lib/studio-access/actions";

import { LogoUploader } from "./LogoUploader";

/** Everything the wizard shows, as the server sees it now. */
export interface SetupView {
  status: "onboarding" | "changes_requested";
  /** Why Aming sent it back, when it did. */
  reviewNote: string | null;
  details: { name: string; ownerFirstName: string; ownerLastName: string; phone: string };
  logoUrl: string | null;
  slug: string | null;
  suggestedSlug: string;
  /** The client portal's address, for showing the studio's own. */
  origin: string;
  ownerEmail: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
}

type Step = "welcome" | OnboardingStep;

const STEPS: { id: OnboardingStep; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "logo", label: "Logo" },
  { id: "address", label: "Address" },
  { id: "email", label: "Email" },
  { id: "password", label: "Password" },
  { id: "submit", label: "Submit" },
];

const BENEFITS = [
  { title: "Your clients and bookings, in one place", text: "Every client, shoot, project and task, with your team." },
  { title: "Quote, invoice, get paid", text: "Quotations clients accept from a link, invoices, payments and receipts." },
  { title: "Deliver photos beautifully", text: "Private galleries clients view and download, a portfolio, and 1 GB free." },
  { title: "Your own web address", text: "A public page for your studio, where your clients sign in with their phone." },
  { title: "Prints and albums from Aming", text: "Order for a project and follow its production right there." },
];

function doneSteps(v: SetupView): Record<Exclude<OnboardingStep, "submit">, boolean> {
  const d = v.details;
  return {
    details: !!(d.name && d.ownerFirstName && d.ownerLastName && d.phone),
    logo: !!v.logoUrl,
    address: !!v.slug,
    email: v.emailVerified,
    password: v.hasPassword,
  };
}

function firstStep(v: SetupView): Step {
  const done = doneSteps(v);
  if (v.status === "onboarding" && !Object.values(done).some(Boolean)) return "welcome";
  return (Object.keys(done) as (keyof typeof done)[]).find((s) => !done[s]) ?? "submit";
}

/** 540 → "9:00". */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const ErrorText = ({ error }: { error: string | null }) =>
  error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null;

/**
 * A new studio's set-up: welcome, then its details, logo, address, a verified
 * email and a password, then submit for Aming's review. Each step is saved as
 * it's done, so leaving and coming back resumes where it stopped.
 */
export function OnboardingWizard({ view }: { view: SetupView }) {
  const [step, setStep] = useState<Step>(() => firstStep(view));
  const done = doneSteps(view);
  const next = (from: OnboardingStep) => setStep(STEPS[STEPS.findIndex((s) => s.id === from) + 1]!.id);

  if (step === "welcome") {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Welcome to My Studio</h1>
          <p className="text-sm text-muted">Run your photography business from one place, next to your Aming orders.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <li key={b.title} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
              <p className="text-sm font-semibold">{b.title}</p>
              <p className="mt-1 text-sm text-muted">{b.text}</p>
            </li>
          ))}
        </ul>
        <p className="text-center text-sm text-muted">
          Setting up takes a few minutes. Aming then reviews your studio before it opens.
        </p>
        <Button className="w-full" onClick={() => setStep("details")}>
          Set up my studio
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {view.status === "changes_requested" && view.reviewNote ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm dark:border-orange-500/30 dark:bg-orange-500/10">
          <p className="font-semibold">Aming asked for a few changes</p>
          <p className="mt-1 whitespace-pre-line">{view.reviewNote}</p>
          <p className="mt-2 text-muted">Make the changes, then submit again.</p>
        </div>
      ) : null}

      <ol className="flex gap-1 overflow-x-auto" aria-label="Set-up steps">
        {STEPS.map((s, i) => {
          const current = s.id === step;
          const complete = s.id !== "submit" && done[s.id];
          return (
            <li key={s.id} className="flex-1">
              <button
                type="button"
                onClick={() => setStep(s.id)}
                aria-current={current ? "step" : undefined}
                className={`w-full rounded-lg border-b-2 px-1 pb-1.5 pt-1 text-xs font-medium ${
                  current ? "border-brand-500 text-foreground" : complete ? "border-success-500 text-muted" : "border-border text-muted"
                }`}
              >
                {complete ? "✓ " : `${i + 1}. `}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-6">
        {step === "details" ? <DetailsStep view={view} onDone={() => next("details")} /> : null}
        {step === "logo" ? (
          <>
            <StepTitle title="Your logo" text="It shows on your public page, your documents and your workspace." />
            <LogoUploader logoUrl={view.logoUrl} />
            <div className="flex justify-end gap-2">
              <Button variant={view.logoUrl ? "primary" : "secondary"} onClick={() => next("logo")}>
                {view.logoUrl ? "Continue" : "Skip for now"}
              </Button>
            </div>
          </>
        ) : null}
        {step === "address" ? (
          <>
            <StudioAddressForm current={view.slug} suggested={view.suggestedSlug} origin={view.origin} />
            <div className="flex justify-end">
              <Button disabled={!view.slug} onClick={() => next("address")}>
                Continue
              </Button>
            </div>
          </>
        ) : null}
        {step === "email" ? <EmailStep view={view} onDone={() => next("email")} /> : null}
        {step === "password" ? <PasswordStep view={view} onDone={() => next("password")} /> : null}
        {step === "submit" ? <SubmitStep view={view} onGoTo={setStep} /> : null}
      </section>
    </div>
  );
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

function DetailsStep({ view, onDone }: { view: SetupView; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState(view.details);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await saveStudioDetails(form);
          if (!res.ok) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <StepTitle title="Your studio" text="Check these: your clients and Aming will see them. Change anything that's not right." />
      <Field label="Studio name">
        <TextInput value={form.name} onChange={(e) => set("name")(e.target.value)} maxLength={80} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Owner's first name">
          <TextInput value={form.ownerFirstName} onChange={(e) => set("ownerFirstName")(e.target.value)} maxLength={50} autoComplete="given-name" required />
        </Field>
        <Field label="Owner's last name">
          <TextInput value={form.ownerLastName} onChange={(e) => set("ownerLastName")(e.target.value)} maxLength={50} autoComplete="family-name" required />
        </Field>
      </div>
      <Field label="Studio phone" hint="Your clients call and WhatsApp this number.">
        <PhoneInput value={form.phone} onChange={set("phone")} required />
      </Field>
      <ErrorText error={error} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Save and continue
        </Button>
      </div>
    </form>
  );
}

function EmailStep({ view, onDone }: { view: SetupView; onDone: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!view.emailVerified);
  const [email, setEmail] = useState(view.ownerEmail ?? "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [alreadySent, setAlreadySent] = useState(false);
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = () =>
    start(async () => {
      setError(null);
      const res = await sendStudioEmailCode(email);
      if (!res.ok) return setError(res.error);
      setSentTo(res.data.sentTo);
      setAlreadySent(res.data.alreadySent);
      setCode("");
      setWait(res.data.resendIn);
    });

  if (!editing) {
    return (
      <div className="space-y-4">
        <StepTitle title="Your email" text="We send password resets and Aming's messages here." />
        <p className="text-sm">
          <span className="text-success-600 dark:text-success-400">✓ Verified:</span> {view.ownerEmail}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Use another email
          </Button>
          <Button onClick={onDone}>Continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StepTitle title="Your email" text={`We'll send a ${CODE_DIGITS}-digit code to check it's yours. It's used to reset your studio password.`} />
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex-1">
          <Field label="Email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={120} required />
          </Field>
        </div>
        <Button type="submit" variant={sentTo ? "secondary" : "primary"} loading={pending && !code} disabled={wait > 0}>
          {wait > 0 ? `New code in ${clock(wait)}` : sentTo ? "Send a new code" : "Send code"}
        </Button>
      </form>
      {sentTo ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await verifyStudioEmail(code);
              if (!res.ok) return setError(res.error);
              router.refresh();
              onDone();
            });
          }}
        >
          {alreadySent ? (
            <p className="text-sm text-muted">A code was already sent to {sentTo}. Use that one: a new code can only be sent once it&apos;s used or expired.</p>
          ) : null}
          <Field label={`Code sent to ${sentTo}`} hint="It works for 10 minutes. Check spam if it isn't there.">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_DIGITS))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="tracking-[0.4em] tnum"
              required
              autoFocus
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending} disabled={code.length !== CODE_DIGITS}>
              Verify
            </Button>
          </div>
        </form>
      ) : null}
      <ErrorText error={error} />
    </div>
  );
}

/** Two password boxes; used here and to reset a forgotten one. */
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="New password" hint={`At least ${PASSWORD_MIN} characters.`}>
        <PasswordInput value={password} onChange={(e) => onPassword(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={72} required />
      </Field>
      <Field label="Type it again">
        <PasswordInput value={confirm} onChange={(e) => onConfirm(e.target.value)} autoComplete="new-password" maxLength={72} required />
      </Field>
    </div>
  );
}

function PasswordStep({ view, onDone }: { view: SetupView; onDone: () => void }) {
  const router = useRouter();
  const [changing, setChanging] = useState(!view.hasPassword);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!changing) {
    return (
      <div className="space-y-4">
        <StepTitle title="Studio password" text="Asked on each device every 30 days, and after signing out of Aming." />
        <p className="text-sm text-success-600 dark:text-success-400">✓ Password set</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setChanging(true)}>
            Change it
          </Button>
          <Button onClick={onDone}>Continue</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await setStudioPassword({ password, confirm });
          if (!res.ok) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <StepTitle
        title="Studio password"
        text="Your studio holds your clients' details and money. This password keeps it safe: it's asked on each device every 30 days, and after signing out of Aming."
      />
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      <ErrorText error={error} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Save password
        </Button>
      </div>
    </form>
  );
}

function SubmitStep({ view, onGoTo }: { view: SetupView; onGoTo: (step: Step) => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = doneSteps(view);
  const rows: { step: OnboardingStep; label: string; value: string | null; required: boolean }[] = [
    { step: "details", label: "Studio", value: done.details ? `${view.details.name} · ${view.details.phone}` : null, required: true },
    { step: "details", label: "Owner", value: done.details ? `${view.details.ownerFirstName} ${view.details.ownerLastName}` : null, required: true },
    { step: "logo", label: "Logo", value: view.logoUrl ? "Uploaded" : null, required: false },
    { step: "address", label: "Address", value: view.slug ? `${view.origin.replace(/^https?:\/\//, "")}/${view.slug}` : null, required: true },
    { step: "email", label: "Email", value: view.emailVerified ? view.ownerEmail : null, required: true },
    { step: "password", label: "Password", value: view.hasPassword ? "Set" : null, required: true },
  ];
  const ready = rows.every((r) => !r.required || r.value);

  return (
    <div className="space-y-4">
      <StepTitle title="Submit for review" text="Aming checks every new studio before it opens. You'll get an email and a notification." />
      <dl className="divide-y divide-border rounded-xl border border-border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-muted">{r.label}</dt>
            <dd className="flex items-center gap-3 text-right">
              {r.value ?? <span className={r.required ? "text-error-600 dark:text-error-400" : "text-muted"}>{r.required ? "Missing" : "Not added"}</span>}
              <button type="button" onClick={() => onGoTo(r.step)} className="text-xs font-medium text-brand-600 hover:underline">
                {r.value ? "Edit" : "Add"}
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <ErrorText error={error} />
      <Button
        className="w-full"
        disabled={!ready}
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await submitStudioForReview();
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
      >
        Submit for review
      </Button>
    </div>
  );
}
