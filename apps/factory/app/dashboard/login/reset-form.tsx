"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";

import { chooseNewPassword, startPasswordReset, verifyResetCode } from "./reset-actions";

type Step = "email" | "code" | "password";

const linkClass = "text-xs text-muted underline-offset-2 hover:underline";

// Forgot password: email → emailed 6-digit code → new password → signed in.
// The server side is ./reset-actions.ts.
export function ResetForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** Runs a step; `then` is what a success leads to. */
  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, then: () => void) {
    setError(null);
    start(async () => {
      const res = await action();
      if (res.ok) then();
      else setError(res.error);
    });
  }

  const sendCode = () =>
    run(
      () => startPasswordReset(email),
      () => {
        setCode("");
        setStep("code");
      },
    );

  const errorLine = error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null;
  const backToSignIn = (
    <button type="button" onClick={onBack} className={linkClass}>
      Back to sign in
    </button>
  );

  function form(onSubmit: () => void, children: React.ReactNode) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
      </form>
    );
  }

  if (step === "code") {
    return form(
      () => run(() => verifyResetCode(code), () => setStep("password")),
      <>
        <p className="text-sm text-muted">
          If {email} is a dashboard account, we emailed it a 6-digit code. It works for 10 minutes.
        </p>
        <Field label="Code">
          <TextInput
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            autoFocus
          />
        </Field>
        {errorLine}
        <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending || code.length !== 6}>
          {pending ? "Checking…" : "Continue"}
        </Button>
        <div className="flex justify-between">
          <button type="button" onClick={sendCode} disabled={pending} className={linkClass}>
            Resend code
          </button>
          {backToSignIn}
        </div>
      </>,
    );
  }

  if (step === "password") {
    return form(
      () =>
        run(
          () => chooseNewPassword({ password, confirm }),
          () => {
            router.replace("/dashboard");
            router.refresh();
          },
        ),
      <>
        <p className="text-sm text-muted">Email verified. Choose a new password.</p>
        <Field label="New password" hint="At least 8 characters.">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            autoFocus
          />
        </Field>
        <Field label="Type it again">
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={72} required />
        </Field>
        {errorLine}
        <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending}>
          {pending ? "Saving…" : "Save and sign in"}
        </Button>
        {backToSignIn}
      </>,
    );
  }

  return form(
    sendCode,
    <>
      <p className="text-sm text-muted">We&apos;ll email you a code, then you choose a new password.</p>
      <Field label="Email">
        <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      {errorLine}
      <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending}>
        {pending ? "Sending code…" : "Send code"}
      </Button>
      {backToSignIn}
    </>,
  );
}
