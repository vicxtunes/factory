"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { markDomainLive, setLookRentPrice } from "@repo/lib/pro/actions";
import type { DomainRequest } from "@repo/lib/pro/server";

const ugx = (n: number) => `UGX ${n.toLocaleString("en-UG")}`;

/** The boss's rent a month for one Pro look (owner, 2026-11-22: from 15,000): shown, changed in a pop-up; none takes looks off rent. */
export function LookRentForm({ rent }: { rent: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(rent ? String(rent) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: number | null) {
    setError(null);
    start(async () => {
      const res = await setLookRentPrice(next);
      if (!res.ok) return setError(res.error);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <p className="text-xs text-muted">Renting one Pro look (free businesses)</p>
        <p className="font-semibold tnum">{rent ? `${ugx(rent)} a month` : "Not for rent"}</p>
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setValue(rent ? String(rent) : "");
          setOpen(true);
        }}
      >
        {rent ? "Change rent" : "Set a rent"}
      </Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="A look's rent">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(Number(value));
          }}
        >
          <p className="text-sm text-muted">What a free business pays a month to use one Pro look. Pro businesses have every look.</p>
          <Field label="Rent a month (UGX)">
            <TextInput inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} placeholder="15000" required />
          </Field>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending}>
            Save rent
          </Button>
          {rent ? (
            <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={() => save(null)}>
              Stop renting looks
            </Button>
          ) : null}
        </form>
      </FormSheet>
    </div>
  );
}

/**
 * Businesses' own domains (Pro): waiting ones first. Connecting one is a
 * server step (scripts/connect-domain.sh: Nginx + certificate); then "It's on".
 */
export function DomainRequests({ requests }: { requests: DomainRequest[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!requests.length) return <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted">No business has asked for its own domain yet.</p>;

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {requests.map((r) => (
          <li key={r.tenantId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.domain}</p>
              <p className="truncate text-xs text-muted">
                {r.business}
                {r.pro ? "" : " · Pro ended: not shown"}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.live ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"}`}>
              {r.live ? "On" : "Waiting"}
            </span>
            <Button
              type="button"
              variant={r.live ? "ghost" : "secondary"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await markDomainLive(r.tenantId, !r.live);
                  if (!res.ok) return setError(res.error);
                  router.refresh();
                })
              }
            >
              {r.live ? "Turn off" : "It's on"}
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Connect a waiting domain on the server first (scripts/connect-domain.sh), then tap It&apos;s on.</p>
    </div>
  );
}
