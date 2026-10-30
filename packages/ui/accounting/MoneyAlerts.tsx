"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { resolveMoneyAlert } from "@repo/lib/wallet/actions";
import type { MoneyAlert, MoneyAlertKind } from "@repo/lib/wallet/types";

const TITLES: Record<MoneyAlertKind, string> = {
  paid_not_credited: "Payment not credited",
  credited_not_paid: "Credited but not paid",
  possible_double: "Possible double payment",
  payout_unconfirmed: "Payout not confirmed",
};

/**
 * What the money watch found that doesn't add up (packages/lib/wallet/server/watch.ts),
 * until someone marks it resolved. Nothing shows when all is well.
 */
export function MoneyAlerts({ alerts }: { alerts: MoneyAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section className="rounded-2xl border border-error-500/40 bg-error-50 p-4 dark:bg-error-500/10">
      <h2 className="text-sm font-semibold text-error-700 dark:text-error-400">
        {alerts.length === 1 ? "1 payment needs checking" : `${alerts.length} payments need checking`}
      </h2>
      <p className="mt-0.5 text-xs text-muted">Found by comparing the app&apos;s records with HivePay&apos;s.</p>
      <ul className="mt-3 space-y-2">
        {alerts.map((a) => (
          <AlertRow key={a.id} alert={a} />
        ))}
      </ul>
    </section>
  );
}

function AlertRow({ alert }: { alert: MoneyAlert }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{TITLES[alert.kind]}</p>
        <p className="mt-0.5 text-sm">{alert.detail}</p>
        <p className="mt-1 text-xs text-muted">
          Found {new Date(alert.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
        {error ? <p className="mt-1 text-xs text-error-600">{error}</p> : null}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        loading={pending}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await resolveMoneyAlert(alert.id);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
      >
        Mark resolved
      </Button>
    </li>
  );
}
