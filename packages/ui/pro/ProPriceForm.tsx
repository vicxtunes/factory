"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { setProMonthlyPrice } from "@repo/lib/pro/actions";

const ugx = (n: number) => `UGX ${n.toLocaleString("en-UG")}`;

/** The boss's Pro price a month (owner, 2026-11-22): shown, changed in a pop-up; no price takes Pro off sale. */
export function ProPriceForm({ price, counts }: { price: number | null; counts: { pro: number; trial: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(price ? String(price) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: number | null) {
    setError(null);
    start(async () => {
      const res = await setProMonthlyPrice(next);
      if (!res.ok) return setError(res.error);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Price a month" value={price ? ugx(price) : "Not on sale"} />
        <Tile label="Businesses with Pro" value={String(counts.pro - counts.trial)} />
        <Tile label="On the free trial" value={String(counts.trial)} />
      </div>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {price ? "Change price" : "Set a price"}
      </Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Pro's price">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(Number(value));
          }}
        >
          <p className="text-sm text-muted">What a business pays a month for Pro looks, from its Aming card. Every business gets 14 days free when it opens.</p>
          <Field label="Price a month (UGX)">
            <TextInput inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} placeholder="50000" required />
          </Field>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending}>
            Save price
          </Button>
          {price ? (
            <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={() => save(null)}>
              Stop selling Pro
            </Button>
          ) : null}
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
