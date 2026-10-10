"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { portalOpenLink, portalSignIn, portalSignOut, portalStayIn } from "@repo/lib/studio-portal/actions";

/** A studio's client signs in with just their phone number. */
export function PortalSignIn({ slug }: { slug: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await portalSignIn(slug, { phone });
      if (!res.ok) return setError(res.error);
      router.push(`/${slug}/me`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Phone number">
        <PhoneInput value={phone} onChange={setPhone} required />
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" loading={pending} className="w-full">
        Open my page
      </Button>
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
