"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { PasswordInput } from "@repo/ui/PasswordInput";

import { checkAccount, continueLogin } from "./actions";

type Step = { kind: "phone" } | { kind: "new"; phone: string } | { kind: "pin"; phone: string };

// Phone-first, single entry point: no PIN is required by default (security
// is opt-in — see /settings). Enter a phone number; a match with
// no PIN set logs straight in, a match with a PIN set asks for it, and no
// match at all asks for their full name or studio name to create the account.
export function ContinueForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submitPhone() {
    setError(null);
    start(async () => {
      const res = await checkAccount(phone);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (!res.exists) {
        setStep({ kind: "new", phone });
        return;
      }
      if (!res.pinRequired) {
        const login = await continueLogin({ phone });
        if (login.ok) router.refresh();
        else setError(login.error);
        return;
      }
      setStep({ kind: "pin", phone });
    });
  }

  function submitNew() {
    setError(null);
    start(async () => {
      const res = await continueLogin({ phone, name, email });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function submitPin() {
    setError(null);
    start(async () => {
      const res = await continueLogin({ phone, pin });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function useDifferentNumber() {
    setStep({ kind: "phone" });
    setName("");
    setEmail("");
    setPin("");
    setError(null);
  }

  if (step.kind === "new") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitNew();
        }}
      >
        <p className="text-sm text-muted">
          We don&apos;t have an account for {step.phone} yet. Tell us who you are so our reception knows who
          they&apos;re dealing with.
        </p>
        <Field label="Full name or business name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus />
        </Field>
        <Field label="Email" hint="Optional">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Continue"}
        </Button>
        <button
          type="button"
          onClick={useDifferentNumber}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          Use a different number
        </button>
      </form>
    );
  }

  if (step.kind === "pin") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitPin();
        }}
      >
        <p className="text-sm text-muted">Enter your PIN for {step.phone}.</p>
        <Field label="PIN">
          <PasswordInput
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            autoFocus
          />
        </Field>
        {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Log in"}
        </Button>
        <button
          type="button"
          onClick={useDifferentNumber}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          Use a different number
        </button>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submitPhone();
      }}
    >
      <Field label="Phone number">
        <PhoneInput value={phone} onChange={setPhone} required autoFocus />
      </Field>
      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
      <Button variant="primary" type="submit" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
      <p className="text-xs text-muted">
        New here? Just enter your number — we&apos;ll set up your account. You can add a PIN for
        extra security later, from Settings.
      </p>
    </form>
  );
}
