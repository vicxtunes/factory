"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";

import { startLogin, verifyLoginCode, type StartLoginResult } from "./actions";

type Step =
  | { kind: "phone" }
  | { kind: "new" }
  | { kind: "add-email" }
  | { kind: "code"; sentTo: string; input: LoginInput };

type LoginInput = Parameters<typeof startLogin>[0];

// Phone first, to find the account; then a 6-digit code emailed to the
// address on file. An unknown number asks for a name and email to create
// the account; an older account without an email adds one and verifies it.
export function ContinueForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send(input: LoginInput) {
    setError(null);
    start(async () => {
      const res: StartLoginResult = await startLogin(input);
      if (!res.ok) setError(res.error);
      else if (res.step === "code") setStep({ kind: "code", sentTo: res.sentTo, input });
      else setStep({ kind: res.step });
    });
  }

  // Each step sends only what it has collected.
  function submitStart() {
    if (step.kind === "new") send({ phone, name, email });
    else if (step.kind === "add-email") send({ phone, email });
    else send({ phone });
  }

  function submitCode() {
    setError(null);
    start(async () => {
      const res = await verifyLoginCode(code);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function useDifferentNumber() {
    setStep({ kind: "phone" });
    setName("");
    setEmail("");
    setCode("");
    setError(null);
  }

  const errorLine = error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null;
  const differentNumber = (
    <button
      type="button"
      onClick={useDifferentNumber}
      className="text-xs text-muted underline-offset-2 hover:underline"
    >
      Use a different number
    </button>
  );

  if (step.kind === "code") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitCode();
        }}
      >
        <p className="text-sm text-muted">We emailed a 6-digit code to {step.sentTo}. It expires in 10 minutes.</p>
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
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Log in"}
        </Button>
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => {
              setCode("");
              send(step.input);
            }}
            disabled={pending}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Resend code
          </button>
          {differentNumber}
        </div>
      </form>
    );
  }

  if (step.kind === "new") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitStart();
        }}
      >
        <p className="text-sm text-muted">
          We don&apos;t have an account for {phone} yet. Tell us who you are so our reception knows who
          they&apos;re dealing with.
        </p>
        <Field label="Full name or business name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus />
        </Field>
        <Field label="Email" hint="We'll send your sign-in code here">
          <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {errorLine}
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending code…" : "Continue"}
        </Button>
        {differentNumber}
      </form>
    );
  }

  if (step.kind === "add-email") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitStart();
        }}
      >
        <p className="text-sm text-muted">
          We now sign you in with a code sent by email. Add your email and we&apos;ll send you a code to verify it.
        </p>
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        {errorLine}
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending code…" : "Continue"}
        </Button>
        {differentNumber}
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submitStart();
      }}
    >
      <Field label="Phone number">
        <PhoneInput value={phone} onChange={setPhone} required autoFocus />
      </Field>
      {errorLine}
      <Button variant="primary" type="submit" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
      <p className="text-xs text-muted">
        New here? Just enter your number — we&apos;ll set up your account and email you a sign-in code.
      </p>
    </form>
  );
}
