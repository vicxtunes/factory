"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { portalOpenLink, portalSignIn, portalSignOut, portalStayIn } from "@repo/lib/studio-portal/actions";

const pinInput = {
  inputMode: "numeric" as const,
  pattern: "[0-9]{4}",
  maxLength: 4,
  autoComplete: "one-time-code",
  className: "tracking-[0.5em]",
};

/** A studio's client who set a PIN earlier signs in with their phone and 4-digit PIN. */
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
        <PhoneInput value={phone} onChange={setPhone} required />
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

/** From the studio's link: one tap signs this device in to the client's page, for good. */
export function OpenPageButton({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        type="button"
        loading={pending}
        className="w-full"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await portalOpenLink(slug, token);
            if (!res.ok) return setError(res.error);
            router.replace(`/${slug}/me`);
          })
        }
      >
        Open my page
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <p className="text-xs text-muted">This phone stays signed in: no password, no PIN.</p>
    </div>
  );
}

/** Keeps this device signed in at the studio: renews its sign-in on every visit. Renders nothing. */
export function PortalStayIn({ slug }: { slug: string }) {
  useEffect(() => {
    void portalStayIn(slug);
  }, [slug]);
  return null;
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
