"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { KindPicker, type KindChoice } from "@repo/ui/studios/KindPicker";
import { openBusiness } from "@repo/lib/studios/actions";

import { finishVendorSignUp, startVendorSignUp } from "../../auth-actions";

const card = "rounded-2xl border border-border bg-surface p-5 shadow-theme-xs sm:p-6";

/**
 * Choose what the business does; a visitor then makes their account (name,
 * email, password, then the emailed code). Either way the vendor business
 * opens and set-up begins.
 */
export function VendorJoin({ signedInAs }: { signedInAs: string | null }) {
  const router = useRouter();
  const [choice, setChoice] = useState<KindChoice | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** Opens the vendor business on the account now signed in, and goes to its set-up. */
  async function openIt(): Promise<boolean> {
    const res = await openBusiness(choice);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    router.push("/studio/welcome");
    return true;
  }

  function sendCode() {
    setError(null);
    start(async () => {
      const res = await startVendorSignUp({ name, email, password, confirm });
      if (!res.ok) return setError(res.error);
      if (res.step === "code") {
        setCode("");
        setSentTo(res.sentTo);
      }
    });
  }

  if (sentTo) {
    return (
      <form
        className={`${card} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await finishVendorSignUp({ code, password, confirm });
            if (!res.ok) return setError(res.error);
            await openIt();
          });
        }}
      >
        <div>
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted">We emailed a 6-digit code to {sentTo}. It works for 10 minutes.</p>
        </div>
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
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <Button type="submit" className="min-h-11 w-full" loading={pending} disabled={code.length !== 6}>
          Create my account
        </Button>
        <div className="flex justify-between text-xs text-muted">
          <button type="button" className="hover:text-foreground hover:underline" onClick={() => setSentTo(null)} disabled={pending}>
            Change my details
          </button>
          <button type="button" className="hover:text-foreground hover:underline" onClick={sendCode} disabled={pending}>
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!choice) return setError("Choose what your business does.");
        if (!signedInAs) return sendCode();
        setError(null);
        start(async () => {
          await openIt();
        });
      }}
    >
      <section className={card}>
        <h2 className="mb-4 font-semibold">1. What does your business do?</h2>
        <KindPicker value={choice} onChange={setChoice} kinds={["vendor"]} />
      </section>

      {signedInAs ? (
        <p className="text-sm text-muted">
          Signed in as <span className="font-medium text-foreground">{signedInAs}</span>: your vendor business goes on this account.
        </p>
      ) : (
        <section className={`${card} space-y-4`}>
          <h2 className="font-semibold">2. Your account</h2>
          <Field label="Your name">
            <TextInput autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Email" hint="Where your sign-in codes and bookings go.">
            <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </Field>
          <Field label="Confirm password">
            <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
        </section>
      )}

      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background px-4 py-4 sm:static sm:mx-0 sm:border-0 sm:p-0">
        <Button type="submit" className="min-h-11 w-full sm:w-auto" loading={pending} disabled={!choice}>
          {signedInAs ? "Open my vendor business" : "Continue"}
        </Button>
        {signedInAs ? null : <p className="mt-2 text-xs text-muted">We&apos;ll email you a code to check it&apos;s your email.</p>}
      </div>
    </form>
  );
}
