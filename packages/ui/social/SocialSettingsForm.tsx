"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { setSocialSettings } from "@repo/lib/social/actions";
import { zernioMonthlyUsd, type SocialSettings } from "@repo/lib/social/core";

// The boss's limits on Social posts (packages/lib/social) and what Zernio
// charges for the pages connected now; changed in a pop-up.
export function SocialSettingsForm({ settings, connected }: { settings: SocialSettings; connected: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState(String(settings.postsAMonth));
  const [pages, setPages] = useState(String(settings.accountsPerBusiness));
  const [x, setX] = useState(settings.xAllowed);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Pages connected" value={connected === null ? "Zernio not set up" : String(connected)} />
        <Tile label="Zernio this month" value={connected === null ? "—" : `about $${zernioMonthlyUsd(connected)}`} />
        <Tile label="Pages per business" value={String(settings.accountsPerBusiness)} />
        <Tile label="Posts a month each" value={String(settings.postsAMonth)} />
      </div>
      <p className="text-xs text-muted">Zernio charges per connected page a month: the first 2 free, then $6 each up to 10, $3 up to 100, $1 after. A business&apos;s pages are disconnected a week after its Pro ends. X {settings.xAllowed ? "is on (X's fees come from the Zernio balance)" : "is off"}.</p>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Change limits
      </Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Social posts limits">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await setSocialSettings({ postsAMonth: posts, accountsPerBusiness: pages, xAllowed: x });
              if (!res.ok) return setError(res.error);
              router.refresh();
              setOpen(false);
            });
          }}
        >
          <Field label="Pages a business can connect" hint="Each one costs Aming up to $6 a month.">
            <TextInput inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value.replace(/\D/g, ""))} required />
          </Field>
          <Field label="Posts a month per business">
            <TextInput inputMode="numeric" value={posts} onChange={(e) => setPosts(e.target.value.replace(/\D/g, ""))} required />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={x} onChange={(e) => setX(e.target.checked)} className="size-4" />
            Allow X (Twitter). Zernio passes on X&apos;s own fees.
          </label>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending}>
            Save
          </Button>
        </form>
      </FormSheet>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <span className="block text-xs text-muted">{label}</span>
      <span className="block font-semibold tnum">{value}</span>
    </div>
  );
}
