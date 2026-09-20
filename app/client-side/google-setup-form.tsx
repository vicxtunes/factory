"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";

import { checkAccount, linkGoogleAccount, logoutClient } from "./actions";

type Step = "phone" | "pin" | "new";

// Second half of "Continue with Google": Google has told us who they are,
// now we ask for a phone number. A number we already know links to that
// client (their orders and history carry over, nothing is recreated); a new
// number asks for the remaining details and creates the account.
export function GoogleSetupForm({ defaultName, email }: { defaultName: string; email: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState(defaultName);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submitPhone() {
    setError(null);
    start(async () => {
      const acct = await checkAccount(phone);
      if (!acct.exists) {
        setStep("new");
        return;
      }
      // Existing client: link straight away. If they've set a PIN (and their
      // Google email isn't already the one on file) the server asks for it.
      const res = await linkGoogleAccount({ phone });
      if (res.ok) router.refresh();
      else if (res.error === "PIN required.") setStep("pin");
      else setError(res.error);
    });
  }

  function submit(extra: { name?: string; pin?: string }) {
    setError(null);
    start(async () => {
      const res = await linkGoogleAccount({ phone, ...extra });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function useDifferentAccount() {
    start(async () => {
      await logoutClient();
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "phone") submitPhone();
        else if (step === "pin") submit({ pin });
        else submit({ name });
      }}
    >
      <p className="text-sm text-muted">
        Signed in with Google{email ? ` as ${email}` : ""}.{" "}
        {step === "phone"
          ? "What's your phone number? If you've ordered with us before, we'll connect your existing account."
          : null}
        {step === "pin" ? `Enter your PIN for ${phone} to connect your existing account.` : null}
        {step === "new" ? `We don't have an account for ${phone} yet — confirm your name to create one.` : null}
      </p>

      {step === "phone" ? (
        <Field label="Phone number">
          <TextInput
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoFocus
          />
        </Field>
      ) : null}

      {step === "pin" ? (
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
      ) : null}

      {step === "new" ? (
        <Field label="Your name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
      ) : null}

      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}

      <Button variant="primary" type="submit" className="w-full" disabled={pending}>
        {pending ? "Working…" : step === "new" ? "Create account" : "Continue"}
      </Button>

      <div className="flex gap-4">
        {step !== "phone" ? (
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setPin("");
              setError(null);
            }}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Use a different number
          </button>
        ) : null}
        <button
          type="button"
          onClick={useDifferentAccount}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          Use a different Google account
        </button>
      </div>
    </form>
  );
}
