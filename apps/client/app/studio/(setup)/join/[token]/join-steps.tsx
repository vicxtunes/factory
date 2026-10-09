"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { joinTeam } from "@repo/lib/team/actions";

import { setPin } from "../../../../actions";

/** Signed in without a PIN: add one first, so only they can open the business. */
export function JoinPin({ name }: { name: string }) {
  const router = useRouter();
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin !== confirm) return setError("PINs don't match.");
    start(async () => {
      const res = await setPin(pin);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm">
        Signed in as <strong>{name}</strong>. Add a PIN to your account first: you&apos;ll enter it when you sign in, so no one else can open the business with
        your number.
      </p>
      <Field label="PIN (4 to 8 digits)">
        <PasswordInput value={pin} onChange={(e) => setPinValue(e.target.value)} inputMode="numeric" autoComplete="new-password" required />
      </Field>
      <Field label="PIN again">
        <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} inputMode="numeric" autoComplete="new-password" required />
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" loading={pending}>
        Add PIN
      </Button>
    </form>
  );
}

/** Signed in with a PIN: join, then open the business. */
export function JoinButton({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Signed in as <strong>{name}</strong>.
      </p>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button
        type="button"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await joinTeam(token);
            if (!res.ok) return setError(res.error);
            router.push("/studio");
          })
        }
      >
        Join
      </Button>
    </div>
  );
}
