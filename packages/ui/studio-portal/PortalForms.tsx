"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { portalSetPin, portalSignIn, portalSignOut } from "@repo/lib/studio-portal/actions";

const pinInput = {
  inputMode: "numeric" as const,
  pattern: "[0-9]{4}",
  maxLength: 4,
  autoComplete: "one-time-code",
  className: "tracking-[0.5em]",
};

/** A studio's client signs in with their phone and 4-digit PIN. */
export function PortalSignIn({ slug }: { slug: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await portalSignIn(slug, { phone, pin });
      if (!res.ok) return setError(res.error);
      router.push(`/${slug}/me`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Phone number">
        <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" placeholder="0772 123 456" />
      </Field>
      <Field label="PIN">
        <TextInput type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required {...pinInput} />
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" loading={pending} className="w-full">
        Open my page
      </Button>
      <p className="text-xs text-muted">No PIN yet, or forgot it? Ask the studio to send you a set-up link.</p>
    </form>
  );
}

/** From a set-up link: the client chooses their 4-digit PIN, then lands on their page. */
export function SetPinForm({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin !== again) return setError("The two PINs don't match.");
    start(async () => {
      const res = await portalSetPin(slug, token, pin);
      if (!res.ok) return setError(res.error);
      router.replace(`/${slug}/me`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Choose a 4-digit PIN">
        <TextInput type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required {...pinInput} />
      </Field>
      <Field label="Type it again">
        <TextInput type="password" value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))} required {...pinInput} />
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" loading={pending} className="w-full">
        Save PIN and open my page
      </Button>
      <p className="text-xs text-muted">Next time, sign in with your phone number and this PIN.</p>
    </form>
  );
}

export function PortalSignOutButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      loading={pending}
      onClick={() =>
        start(async () => {
          await portalSignOut(slug);
          router.replace(`/${slug}`);
        })
      }
    >
      Sign out
    </Button>
  );
}
