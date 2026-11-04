"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { TextInput } from "@repo/ui/Field";
import { setCommissionRate, setWithdrawalFeePaidBy } from "@repo/lib/agents/actions";
import type { FeePaidBy } from "@repo/lib/agents/core";
import type { CategoryRate } from "@repo/lib/agents/server";

const FEE_OPTIONS: { value: FeePaidBy; label: string; text: string }[] = [
  { value: "agent", label: "The agent", text: "The fee comes out of what's sent, so their phone receives a little less than they asked for." },
  { value: "aming", label: "Aming", text: "The fee still comes out of what's sent, then Aming puts the same amount back on their balance for next time. HivePay's price list would be needed to send it in full." },
];

export function RatesBoard({ rates, feePaidBy }: { rates: CategoryRate[]; feePaidBy: FeePaidBy }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const missing = rates.filter((r) => r.rate === null).length;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
        <h2 className="text-sm font-semibold">Commission rates</h2>
        <p className="mt-1 text-xs text-muted">The % of each sale in a category. An agent&apos;s own rate overrides these. Changing a rate only affects new orders.</p>
        {missing ? <p className="mt-3 rounded-xl bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">{missing} {missing === 1 ? "category has" : "categories have"} no rate, so agents earn nothing on them.</p> : null}
        <ul className="mt-3 divide-y divide-border">
          {rates.map((r) => (
            <RateRow key={r.categoryId} rate={r} />
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
        <h2 className="text-sm font-semibold">Who pays the mobile money sending fee?</h2>
        <p className="mt-1 text-xs text-muted">Applies to withdrawals asked for from now on.</p>
        <div className="mt-3 space-y-2">
          {FEE_OPTIONS.map((o) => (
            <label key={o.value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${o.value === feePaidBy ? "border-brand-500 bg-brand-50 dark:bg-brand-500/15" : "border-border"}`}>
              <input
                type="radio"
                name="fee"
                className="mt-1"
                checked={o.value === feePaidBy}
                disabled={pending}
                onChange={() =>
                  start(async () => {
                    setError(null);
                    const res = await setWithdrawalFeePaidBy(o.value);
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  })
                }
              />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-muted">{o.text}</span>
              </span>
            </label>
          ))}
        </div>
        {error ? <p className="mt-2 text-sm text-error-600">{error}</p> : null}
      </section>
    </div>
  );
}

function RateRow({ rate }: { rate: CategoryRate }) {
  const router = useRouter();
  const [value, setValue] = useState(rate.rate?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = value.trim() !== "" && Number(value) !== rate.rate;

  return (
    <li className="py-3">
      <form
        className="flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await setCommissionRate({ categoryId: rate.categoryId, rate: value });
            if (!res.ok) setError(res.error);
            else router.refresh();
          });
        }}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{rate.categoryName}</span>
        <div className="w-20 shrink-0">
          <TextInput aria-label={`${rate.categoryName} rate, percent`} inputMode="decimal" className="text-right" value={value} onChange={(e) => setValue(e.target.value)} placeholder="None" />
        </div>
        <span className="text-sm text-muted">%</span>
        <Button type="submit" variant="secondary" className="min-h-9 text-xs" loading={pending} disabled={pending || !changed}>
          Save
        </Button>
      </form>
      {error ? <p className="mt-1 text-sm text-error-600">{error}</p> : null}
    </li>
  );
}
