"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { setStudioSlug } from "@repo/lib/studio-portal/actions";

/**
 * The studio's own address, client.<domain>/<slug>: its public page and where
 * its clients sign in. Changing it keeps the old address working (it redirects).
 */
export function StudioAddressForm({ current, suggested, origin }: { current: string | null; suggested: string; origin: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(current ?? suggested);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const url = current ? `${origin}/${current}` : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await setStudioSlug(slug);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <p className="text-sm font-semibold">Your business&apos;s address</p>
      <p className="text-sm text-muted">Your public page, and where your clients sign in with their phone and PIN. Share it anywhere.</p>
      <Field label="Address" hint={current ? "If you change it, the old address keeps working." : undefined}>
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-sm text-muted">{origin.replace(/^https?:\/\//, "")}/</span>
          <TextInput value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} required maxLength={40} />
        </div>
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} disabled={slug === current}>
          {current ? "Change address" : "Save address"}
        </Button>
        {url ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline">
              Open
            </a>
          </>
        ) : null}
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved.</span> : null}
      </div>
    </form>
  );
}
