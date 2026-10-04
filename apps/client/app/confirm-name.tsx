"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";

import { confirmMyName } from "./actions";

/** First and last name inputs: sign-up and ConfirmName. */
export function NameFields({
  firstName,
  lastName,
  onFirstName,
  onLastName,
}: {
  firstName: string;
  lastName: string;
  onFirstName: (v: string) => void;
  onLastName: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="First name">
        <TextInput value={firstName} onChange={(e) => onFirstName(e.target.value)} autoComplete="given-name" maxLength={50} required autoFocus />
      </Field>
      <Field label="Last name">
        <TextInput value={lastName} onChange={(e) => onLastName(e.target.value)} autoComplete="family-name" maxLength={50} required />
      </Field>
    </div>
  );
}

// Shown once, in place of the page, to a signed-in client who hasn't given
// their real name yet (see confirmMyName). Pre-filled from the name on file.
export function ConfirmName({ initial }: { initial: { firstName: string; lastName: string } }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mx-auto max-w-md py-8">
      <form
        className="space-y-4 rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await confirmMyName({ firstName, lastName });
            if (res.ok) router.refresh();
            else setError(res.error);
          });
        }}
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Confirm your name</h1>
          <p className="text-sm text-muted">
            Your orders, invoices and receipts carry your real first and last name. Check it&apos;s right before you
            continue — you only do this once.
          </p>
        </div>
        <NameFields firstName={firstName} lastName={lastName} onFirstName={setFirstName} onLastName={setLastName} />
        {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Confirm and continue"}
        </Button>
      </form>
    </div>
  );
}
