"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { CODE_DIGITS, PASSWORD_MIN, type OnboardingStep } from "@repo/lib/studio-access/core";
import {
  saveStudioDetails,
  sendStudioEmailCode,
  setStudioPassword,
  submitStudioForReview,
  verifyStudioEmail,
} from "@repo/lib/studio-access/actions";
import { setStudioSlug } from "@repo/lib/studio-portal/actions";

import { LogoUploader } from "./LogoUploader";
import { SetupActions, SetupSplit, SetupWelcome, type SetupStep } from "./SetupLayouts";

/** Everything the wizard shows, as the server sees it now. */
export interface SetupView {
  status: "onboarding" | "changes_requested";
  /** Why Aming sent it back, when it did. */
  reviewNote: string | null;
  /** The form's starting values: saved ones, else suggestions from the owner's Aming account. */
  details: { name: string; ownerFirstName: string; ownerLastName: string; phone: string };
  /** Whether the details have been saved (suggestions alone don't count). */
  detailsSaved: boolean;
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

const STEPS: { id: OnboardingStep; label: string; hint: string; optional?: boolean; title: string; description: string }[] = [
  { id: "details", label: "Business details", hint: "Name, owner and phone", title: "Your business", description: "Your clients and Aming see these. We filled them in from your Aming account: change anything that isn't right." },
  { id: "logo", label: "Logo", hint: "Shown on your page and documents", optional: true, title: "Your logo", description: "It appears on your public page, quotations, invoices and workspace. You can add it later from Business profile." },
  { id: "address", label: "Web address", hint: "Your public page", title: "Your web address", description: "Your public page, and where your clients sign in. You can change it later; old links keep working." },
  { id: "email", label: "Email", hint: "For codes and Aming's messages", title: "Verify your email", description: `We'll send a ${CODE_DIGITS}-digit code to check it's yours. It's used to reset your business password.` },
  { id: "password", label: "Password", hint: "Protects your business", title: "Business password", description: "Your business holds your clients' details and money. The password is asked on each device every 30 days, and after signing out of Aming." },
  { id: "submit", label: "Submit", hint: "Aming reviews your business", title: "Submit for review", description: "Aming checks every new business before it opens. You'll get an email and a notification." },
];

function doneSteps(v: SetupView): Record<Exclude<OnboardingStep, "submit">, boolean> {
  return {
    details: v.detailsSaved,
    logo: !!v.logoUrl,
    address: !!v.slug,
    email: v.emailVerified,
    password: v.hasPassword,
  };
}

function firstStep(v: SetupView): Step {
  const done = doneSteps(v);
  if (v.status === "onboarding" && !Object.values(done).some(Boolean)) return "welcome";
  // The logo is optional: resume at the first required step that's missing.
  return (Object.keys(done) as (keyof typeof done)[]).find((s) => s !== "logo" && !done[s]) ?? "submit";
}

/** 540 → "9:00". */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const ErrorText = ({ error }: { error: string | null }) =>
  error ? <p className="mt-4 text-sm text-error-600 dark:text-error-400">{error}</p> : null;

/**
 * A new studio's set-up: welcome, then its details, logo, address, a verified
 * email and a password, then submit for Aming's review. Each step is saved as
 * it's done, so leaving and coming back resumes where it stopped.
 */
export function OnboardingWizard({ view }: { view: SetupView }) {
  const [step, setStep] = useState<Step>(() => firstStep(view));
  const done = doneSteps(view);
  const index = STEPS.findIndex((s) => s.id === step);
  const go = (to: number) => setStep(to < 0 ? "welcome" : STEPS[to]!.id);
  const next = () => go(index + 1);
  const back = { onClick: () => go(index - 1) };

  const steps: SetupStep[] = STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    hint: s.hint,
    optional: s.optional,
    state: s.id === step ? "current" : s.id !== "submit" && done[s.id] ? "done" : "todo",
  }));

  if (step === "welcome") {
    return (
      <SetupSplit
        steps={steps}
        title="Set up your business"
        description="Run your photography business from one place, next to your Aming orders. It takes about 5 minutes; Aming then reviews your business before it opens."
      >
        <SetupWelcome onStart={() => setStep("details")} />
      </SetupSplit>
    );
  }

  const meta = STEPS[index]!;
  const notice =
    view.status === "changes_requested" && view.reviewNote ? (
      <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm dark:border-orange-500/30 dark:bg-orange-500/10">
        <p className="font-semibold">Aming asked for a few changes</p>
        <p className="mt-1 whitespace-pre-line">{view.reviewNote}</p>
        <p className="mt-2 text-muted">Make the changes, then submit again.</p>
      </div>
    ) : null;

  return (
    <SetupSplit steps={steps} title={meta.title} description={meta.description} notice={notice} onSelect={(id) => setStep(id as OnboardingStep)}>
      {step === "details" ? <DetailsStep view={view} back={back} onDone={next} /> : null}
      {step === "logo" ? (
        <>
          <LogoUploader logoUrl={view.logoUrl} optional />
          <SetupActions back={back}>
            <Button variant={view.logoUrl ? "primary" : "secondary"} onClick={next}>
              {view.logoUrl ? "Continue" : "Skip for now"}
            </Button>
          </SetupActions>
        </>
      ) : null}
      {step === "address" ? <AddressStep view={view} back={back} onDone={next} /> : null}
      {step === "email" ? <EmailStep view={view} back={back} onDone={next} /> : null}
      {step === "password" ? <PasswordStep view={view} back={back} onDone={next} /> : null}
      {step === "submit" ? <SubmitStep view={view} back={back} onGoTo={setStep} /> : null}
    </SetupSplit>
  );
}

type StepProps = { view: SetupView; back: { onClick: () => void }; onDone: () => void };

function DetailsStep({ view, back, onDone }: StepProps) {
  const router = useRouter();
  const [form, setForm] = useState(view.details);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
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
      <div className="space-y-4">
        <Field label="Business name">
          <TextInput value={form.name} onChange={(e) => set("name")(e.target.value)} maxLength={80} required />
        </Field>
        <div className="grid gap-4 @md:grid-cols-2">
          <Field label="Owner's first name">
            <TextInput value={form.ownerFirstName} onChange={(e) => set("ownerFirstName")(e.target.value)} maxLength={50} autoComplete="given-name" required />
          </Field>
          <Field label="Owner's last name">
            <TextInput value={form.ownerLastName} onChange={(e) => set("ownerLastName")(e.target.value)} maxLength={50} autoComplete="family-name" required />
          </Field>
        </div>
        <Field label="Business phone" hint="Your clients call and WhatsApp this number.">
          <PhoneInput value={form.phone} onChange={set("phone")} required />
        </Field>
      </div>
      <ErrorText error={error} />
      <SetupActions back={back}>
        <Button type="submit" loading={pending}>
          Save and continue
        </Button>
      </SetupActions>
    </form>
  );
}

function AddressStep({ view, back, onDone }: StepProps) {
  const router = useRouter();
  const [slug, setSlug] = useState(view.slug ?? view.suggestedSlug);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const host = view.origin.replace(/^https?:\/\//, "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (slug === view.slug) return onDone();
        start(async () => {
          const res = await setStudioSlug(slug);
          if (!res.ok) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <Field label="Address" hint="3–40 lowercase letters, numbers and hyphens.">
        <div className="flex items-stretch overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-theme-xs focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10">
          {host ? <span className="flex max-w-[45%] items-center truncate border-r border-border bg-background px-3 text-sm text-muted">{host}/</span> : null}
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            maxLength={40}
            required
            className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          />
        </div>
      </Field>
      <ErrorText error={error} />
      <SetupActions back={back}>
        <Button type="submit" loading={pending}>
          Save and continue
        </Button>
      </SetupActions>
    </form>
  );
}

function EmailStep({ view, back, onDone }: StepProps) {
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
      <>
        <p className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm">
          <span className="text-success-600 dark:text-success-400">✓ Verified</span>
          <span className="truncate">{view.ownerEmail}</span>
        </p>
        <SetupActions back={back}>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Use another email
          </Button>
          <Button onClick={onDone}>Continue</Button>
        </SetupActions>
      </>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!sentTo) return send();
        start(async () => {
          const res = await verifyStudioEmail(code);
          if (!res.ok) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <div className="space-y-4">
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={120} required readOnly={!!sentTo && wait > 0} />
        </Field>
        {sentTo ? (
          <>
            {alreadySent ? <p className="text-sm text-muted">A code was already sent to {sentTo}. Use that one: a new code can only be sent once it&apos;s used or expired.</p> : null}
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
            <button type="button" onClick={send} disabled={wait > 0 || pending} className="text-sm font-medium text-brand-600 hover:underline disabled:text-muted disabled:no-underline">
              {wait > 0 ? `New code in ${clock(wait)}` : "Send a new code"}
            </button>
          </>
        ) : null}
      </div>
      <ErrorText error={error} />
      <SetupActions back={back}>
        <Button type="submit" loading={pending} disabled={!!sentTo && code.length !== CODE_DIGITS}>
          {sentTo ? "Verify" : "Send code"}
        </Button>
      </SetupActions>
    </form>
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
    <div className="grid gap-4 @md:grid-cols-2">
      <Field label="New password" hint={`At least ${PASSWORD_MIN} characters.`}>
        <PasswordInput value={password} onChange={(e) => onPassword(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={72} required />
      </Field>
      <Field label="Type it again">
        <PasswordInput value={confirm} onChange={(e) => onConfirm(e.target.value)} autoComplete="new-password" maxLength={72} required />
      </Field>
    </div>
  );
}

function PasswordStep({ view, back, onDone }: StepProps) {
  const router = useRouter();
  const [changing, setChanging] = useState(!view.hasPassword);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!changing) {
    return (
      <>
        <p className="rounded-xl border border-border px-4 py-3 text-sm text-success-600 dark:text-success-400">✓ Password set</p>
        <SetupActions back={back}>
          <Button variant="secondary" onClick={() => setChanging(true)}>
            Change it
          </Button>
          <Button onClick={onDone}>Continue</Button>
        </SetupActions>
      </>
    );
  }

  return (
    <form
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
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      <ErrorText error={error} />
      <SetupActions back={back}>
        <Button type="submit" loading={pending}>
          Save and continue
        </Button>
      </SetupActions>
    </form>
  );
}

function SubmitStep({ view, back, onGoTo }: Omit<StepProps, "onDone"> & { onGoTo: (step: Step) => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = doneSteps(view);
  const host = view.origin.replace(/^https?:\/\//, "");
  const rows: { step: OnboardingStep; label: string; value: string | null; required: boolean }[] = [
    { step: "details", label: "Business", value: done.details ? `${view.details.name} · ${view.details.phone}` : null, required: true },
    { step: "details", label: "Owner", value: done.details ? `${view.details.ownerFirstName} ${view.details.ownerLastName}` : null, required: true },
    { step: "logo", label: "Logo", value: view.logoUrl ? "Uploaded" : null, required: false },
    { step: "address", label: "Web address", value: view.slug ? `${host}/${view.slug}` : null, required: true },
    { step: "email", label: "Email", value: view.emailVerified ? view.ownerEmail : null, required: true },
    { step: "password", label: "Password", value: view.hasPassword ? "Set" : null, required: true },
  ];
  const ready = rows.every((r) => !r.required || r.value);

  return (
    <>
      <dl className="divide-y divide-border rounded-xl border border-border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 px-4 py-3 text-sm">
            <dt className="w-24 shrink-0 text-muted">{r.label}</dt>
            <dd className="min-w-0 flex-1 truncate font-medium">
              {r.value ?? <span className={`font-normal ${r.required ? "text-error-600 dark:text-error-400" : "text-muted"}`}>{r.required ? "Missing" : "Not added"}</span>}
            </dd>
            <button type="button" onClick={() => onGoTo(r.step)} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
              {r.value ? "Edit" : "Add"}
            </button>
          </div>
        ))}
      </dl>
      <ErrorText error={error} />
      <SetupActions back={back}>
        <Button
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
      </SetupActions>
    </>
  );
}
