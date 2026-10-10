"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { Tabs } from "@repo/ui/Tabs";

import { choosePassword, signIn, startReset, startSignUp, verifyCode, type AuthStep } from "./auth-actions";

type Method = "email" | "phone";

// What the screen shows. "code" remembers how the flow started, so
// "Resend code" can repeat it.
type View =
  | { kind: "signin" }
  | { kind: "signup" }
  | { kind: "reset" }
  | { kind: "add-email" }
  | { kind: "code"; sentTo: string; resend: () => Promise<AuthStep> }
  | { kind: "password" };

const METHOD_TABS: { key: Method; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

const linkClass = "text-xs text-muted underline-offset-2 hover:underline";
const strongLinkClass = "font-medium text-foreground underline-offset-2 hover:underline";

// Sign in with email or phone and password, then the 6-digit code emailed
// to the account. Also: create an account, and forgot password (which is how
// an account from before passwords sets its first one). The server side is
// ./auth-actions.ts.
export function ContinueForm() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "signin" });
  const [method, setMethod] = useState<Method>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** Runs a step and moves to what it leads to. */
  function run(action: () => Promise<AuthStep>) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      if (res.step === "done") return router.refresh();
      setCode("");
      if (res.step === "code") setView({ kind: "code", sentTo: res.sentTo, resend: action });
      else setView({ kind: res.step });
    });
  }

  function go(kind: "signin" | "signup" | "reset") {
    setView({ kind });
    setPassword("");
    setConfirm("");
    setError(null);
  }

  function switchMethod(next: Method) {
    setMethod(next);
    setIdentifier("");
    setError(null);
  }

  const errorLine = error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null;
  const backToSignIn = (
    <button type="button" onClick={() => go("signin")} className={linkClass}>
      Back to sign in
    </button>
  );

  // Email or phone, chosen with the tabs above it.
  const identifierFields = (
    <>
      <Tabs tabs={METHOD_TABS} value={method} onChange={switchMethod} label="Sign in with" />
      {method === "email" ? (
        <Field label="Email" hint="Running a studio? Use your business email.">
          <TextInput type="email" autoComplete="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
        </Field>
      ) : (
        <Field label="Phone number">
          <PhoneInput value={identifier} onChange={setIdentifier} required autoFocus />
        </Field>
      )}
    </>
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

  if (view.kind === "code") {
    return form(
      () => run(() => verifyCode(code)),
      <>
        <p className="text-sm text-muted">We emailed a 6-digit code to {view.sentTo}. It works for 10 minutes.</p>
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
        <Button variant="primary" type="submit" className="w-full" disabled={pending || code.length !== 6}>
          {pending ? "Checking…" : "Continue"}
        </Button>
        <div className="flex justify-between">
          <button type="button" onClick={() => run(view.resend)} disabled={pending} className={linkClass}>
            Resend code
          </button>
          {backToSignIn}
        </div>
      </>,
    );
  }

  if (view.kind === "password") {
    return form(
      () => run(() => choosePassword({ password, confirm })),
      <>
        <p className="text-sm text-muted">Email verified. Choose a password for your account.</p>
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
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save and sign in"}
        </Button>
      </>,
    );
  }

  if (view.kind === "signup") {
    return form(
      () => run(() => startSignUp({ name, email, phone })),
      <>
        <Field label="Full name or business name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required autoFocus />
        </Field>
        <Field label="Email" hint="We'll send a code here to verify it.">
          <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Phone number">
          <PhoneInput value={phone} onChange={setPhone} required />
        </Field>
        {errorLine}
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending code…" : "Create account"}
        </Button>
        <p className="text-xs text-muted">
          Already have an account?{" "}
          <button type="button" onClick={() => go("signin")} className={strongLinkClass}>
            Sign in
          </button>
        </p>
      </>,
    );
  }

  if (view.kind === "reset") {
    return form(
      () => run(() => startReset({ method, identifier })),
      <>
        <p className="text-sm text-muted">
          We&apos;ll email you a code, then you choose a new password. Signed in with just your phone before? This is
          how you set your first password.
        </p>
        {identifierFields}
        {errorLine}
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending code…" : "Send code"}
        </Button>
        {backToSignIn}
      </>,
    );
  }

  if (view.kind === "add-email") {
    return form(
      () => run(() => startReset({ method, identifier, email })),
      <>
        <p className="text-sm text-muted">Your account has no email yet. Add one and we&apos;ll send it a code to verify it.</p>
        <Field label="Email">
          <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        {errorLine}
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending code…" : "Send code"}
        </Button>
        {backToSignIn}
      </>,
    );
  }

  return form(
    () => run(() => signIn({ method, identifier, password })),
    <>
      {identifierFields}
      <Field label="Password">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={72} required />
      </Field>
      <div className="flex justify-end">
        <button type="button" onClick={() => go("reset")} className={linkClass}>
          Forgot password?
        </button>
      </div>
      {errorLine}
      <Button variant="primary" type="submit" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </Button>
      <p className="text-xs text-muted">
        New here?{" "}
        <button type="button" onClick={() => go("signup")} className={strongLinkClass}>
          Create an account
        </button>
      </p>
    </>,
  );
}
