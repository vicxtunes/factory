"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";

import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { Avatar } from "@repo/ui/profile/Avatar";
import { Tabs } from "@repo/ui/Tabs";

import {
  choosePassword,
  forgetThisDevice,
  signIn,
  startReset,
  startSignUp,
  unlock,
  verifyCode,
  type AuthStep,
} from "./auth-actions";
import { passkeyUnlockOptions, unlockWithPasskey, unlockWithPattern } from "./device-unlock";
import { PatternPad } from "./pattern-pad";

type Method = "email" | "phone";

// What the screen shows. "code" remembers how the flow started, so
// "Resend code" can repeat it.
type View =
  | { kind: "unlock" }
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

const pill =
  "inline-flex min-h-10 w-full items-center justify-center rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
// Black on light, white on dark.
const primaryPill = `${pill} bg-foreground text-background hover:opacity-90`;
const secondaryPill = `${pill} border border-border bg-surface text-foreground hover:bg-background`;
const linkClass = "text-xs text-muted underline-offset-2 hover:text-foreground hover:underline";

// Sign in with email or phone and password, then the 6-digit code emailed
// to the account. Also: create an account, and forgot password (which is how
// an account from before passwords sets its first one). The server side is
// ./auth-actions.ts.
//
// A browser that has signed in with the code before opens on the lock
// screen instead (`remembered`): their picture, their name and just the
// password — or, set up in Manage profile, their pattern or fingerprint/face
// (./device-unlock.ts).
export function ContinueForm({
  remembered,
}: {
  remembered: { name: string; avatarUrl: string | null; unlockWith: { pattern: boolean; passkey: boolean } } | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: remembered ? "unlock" : "signin" });
  const [unlockBy, setUnlockBy] = useState<"pattern" | "password">(remembered?.unlockWith.pattern ? "pattern" : "password");
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

  /**
   * One screen: a title and a line under it, the fields, the main button,
   * then "or" and the way out (`other`).
   */
  function screen({
    title,
    subtitle,
    top,
    onSubmit,
    submit,
    submitting,
    disabled,
    other,
    children,
  }: {
    title: string;
    subtitle: ReactNode;
    top?: ReactNode;
    onSubmit: () => void;
    submit: string;
    submitting: string;
    disabled?: boolean;
    other?: { label: string; onClick: () => void };
    children: ReactNode;
  }) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex flex-col items-center gap-1.5 text-center">
          {top}
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        {children}
        {error ? <p className="text-center text-sm text-[var(--rush)]">{error}</p> : null}
        <button type="submit" className={primaryPill} disabled={pending || disabled}>
          {pending ? submitting : submit}
        </button>
        {other ? (
          <>
            <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-muted">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <button type="button" onClick={other.onClick} disabled={pending} className={secondaryPill}>
              {other.label}
            </button>
          </>
        ) : null}
      </form>
    );
  }

  const backToSignIn = { label: "Return to sign in", onClick: () => go("signin") };

  function switchUnlock(by: "pattern" | "password") {
    setUnlockBy(by);
    setError(null);
  }

  /** Fingerprint / face: the device signs the server's challenge. */
  function unlockWithDevice() {
    setError(null);
    start(async () => {
      const options = await passkeyUnlockOptions();
      if (!options) {
        setUnlockBy("password");
        return setError("Use your password.");
      }
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options });
      } catch {
        return setError("Fingerprint or face wasn't confirmed. Try again, or use your password.");
      }
      const res = await unlockWithPasskey(response);
      if (res.ok) return router.refresh();
      if (res.usePassword) setUnlockBy("password");
      setError(res.error);
    });
  }

  const deviceButton = remembered?.unlockWith.passkey ? (
    <button type="button" onClick={unlockWithDevice} disabled={pending} className={secondaryPill}>
      Unlock with fingerprint or face
    </button>
  ) : null;

  if (view.kind === "unlock" && remembered && unlockBy === "pattern") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <Avatar url={remembered.avatarUrl} name={remembered.name} sizeClassName="mb-2 h-16 w-16 text-2xl" />
          <h1 className="text-base font-semibold text-foreground">Welcome back, {remembered.name}</h1>
          <p className="text-xs text-muted">{pending ? "Checking…" : "Draw your pattern to continue."}</p>
        </div>
        <PatternPad
          disabled={pending}
          onDone={(pattern) => {
            setError(null);
            start(async () => {
              const res = await unlockWithPattern(pattern);
              if (res.ok) return router.refresh();
              if (res.usePassword) setUnlockBy("password");
              setError(res.error);
            });
          }}
        />
        {error ? <p className="text-center text-sm text-[var(--rush)]">{error}</p> : null}
        {deviceButton}
        <div className="flex justify-center">
          <button type="button" onClick={() => switchUnlock("password")} className={linkClass}>
            Use password instead
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "unlock" && remembered) {
    return screen({
      top: <Avatar url={remembered.avatarUrl} name={remembered.name} sizeClassName="mb-2 h-16 w-16 text-2xl" />,
      title: `Welcome back, ${remembered.name}`,
      subtitle: "Enter your password to continue.",
      onSubmit: () => run(() => unlock(password)),
      submit: "Sign in",
      submitting: "Checking…",
      other: {
        label: "Use another account",
        onClick: () =>
          start(async () => {
            await forgetThisDevice();
            go("signin");
          }),
      },
      children: (
        <>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              maxLength={72}
              required
              autoFocus
            />
          </Field>
          <div className={`flex ${remembered.unlockWith.pattern ? "justify-between" : "justify-end"}`}>
            {remembered.unlockWith.pattern ? (
              <button type="button" onClick={() => switchUnlock("pattern")} className={linkClass}>
                Use pattern
              </button>
            ) : null}
            <button type="button" onClick={() => go("reset")} className={linkClass}>
              Forgot password?
            </button>
          </div>
          {deviceButton}
        </>
      ),
    });
  }

  if (view.kind === "code") {
    return screen({
      title: "Check your email",
      subtitle: `We emailed a 6-digit code to ${view.sentTo}. It works for 10 minutes.`,
      onSubmit: () => run(() => verifyCode(code)),
      submit: "Continue",
      submitting: "Checking…",
      disabled: code.length !== 6,
      other: backToSignIn,
      children: (
        <>
          <Field label="Code">
            <TextInput
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center tracking-[0.4em]"
              required
              autoFocus
            />
          </Field>
          <div className="flex justify-end">
            <button type="button" onClick={() => run(view.resend)} disabled={pending} className={linkClass}>
              Resend code
            </button>
          </div>
        </>
      ),
    });
  }

  if (view.kind === "password") {
    return screen({
      title: "Choose a password",
      subtitle: "Email verified. Use at least 8 characters.",
      onSubmit: () => run(() => choosePassword({ password, confirm })),
      submit: "Save and sign in",
      submitting: "Saving…",
      children: (
        <>
          <Field label="New password">
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
        </>
      ),
    });
  }

  if (view.kind === "signup") {
    return screen({
      title: "Create an account",
      subtitle: "We'll email you a code to verify your email.",
      onSubmit: () => run(() => startSignUp({ name, email, phone })),
      submit: "Create account",
      submitting: "Sending code…",
      other: { label: "I already have an account", onClick: () => go("signin") },
      children: (
        <>
          <Field label="Full name or business name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required autoFocus />
          </Field>
          <Field label="Email">
            <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Phone number">
            <PhoneInput value={phone} onChange={setPhone} required />
          </Field>
        </>
      ),
    });
  }

  if (view.kind === "reset") {
    return screen({
      title: "Password reset",
      subtitle: "We'll email you a code, then you choose a new password. Signed in with just your phone before? This is how you set your first one.",
      onSubmit: () => run(() => startReset({ method, identifier })),
      submit: "Send code",
      submitting: "Sending code…",
      other: backToSignIn,
      children: identifierFields,
    });
  }

  if (view.kind === "add-email") {
    return screen({
      title: "Add your email",
      subtitle: "Your account has no email yet. Add one and we'll send it a code to verify it.",
      onSubmit: () => run(() => startReset({ method, identifier, email })),
      submit: "Send code",
      submitting: "Sending code…",
      other: backToSignIn,
      children: (
        <Field label="Email">
          <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
      ),
    });
  }

  return screen({
    title: "Sign in",
    subtitle: "Use your email or phone number and your password.",
    onSubmit: () => run(() => signIn({ method, identifier, password })),
    submit: "Sign in",
    submitting: "Checking…",
    other: { label: "Create an account", onClick: () => go("signup") },
    children: (
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
      </>
    ),
  });
}
