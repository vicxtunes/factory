"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { ChoiceGroup } from "@repo/ui/StepForm";
import { MobileMoneyPay } from "@repo/ui/wallet/MobileMoneyPay";
import type { Result } from "@repo/lib/kernel/core";
import { topUpWithMobileMoney } from "@repo/lib/wallet/actions";
import type { MobileNetwork } from "@repo/lib/wallet/policy";

export const ugx = (n: number) => `UGX ${n.toLocaleString("en-UG")}`;
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/**
 * Paying a month of Pro: from the Aming card, or by
 * MTN / Airtel onto the card first and then from it (as with extra storage),
 * with "renew by itself" ticked unless they untick it.
 */
export function PayMonthSheet({
  what,
  price,
  balance,
  from,
  pay,
  doneText,
  onClose,
}: {
  /** "One month of Pro", "One month of the Showcase look". */
  what: string;
  price: number;
  balance: number;
  /** When the current month ends, if one is running: the new one starts then. */
  from: string | null;
  pay: (renew: boolean) => Promise<Result<string>>;
  /** Said once paid, with the new end. */
  doneText: (until: string) => string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"card" | MobileNetwork>("card");
  const [renew, setRenew] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const short = price > balance;

  function payNow() {
    setError(null);
    start(async () => {
      const res = await pay(renew);
      if (!res.ok) return setError(res.error);
      setUntil(res.data);
      router.refresh();
    });
  }

  if (until) {
    return (
      <div className="space-y-4">
        <p className="text-sm">{doneText(until)}</p>
        <Button type="button" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {what} for <strong className="text-foreground">{ugx(price)}</strong>
        {from ? `, starting when the current month ends (${day(from)})` : ", starting now"}.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={renew} onChange={(e) => setRenew(e.target.checked)} />
        <span>
          Renew by itself each month from my Aming card
          <span className="block text-xs text-muted">We remind you 3 days before. Turn it off any time.</span>
        </span>
      </label>
      <ChoiceGroup
        label="Pay with"
        layout="tiles"
        value={method}
        onChange={setMethod}
        options={[
          { value: "card", title: "Aming card", hint: ugx(balance) },
          { value: "mtn", title: "MTN" },
          { value: "airtel", title: "Airtel" },
        ]}
      />
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {method === "card" ? (
        <>
          {short ? (
            <p className="text-sm text-warning-700 dark:text-warning-400">
              That&apos;s {ugx(price - balance)} more than is on your Aming card. Pay with MTN or Airtel instead, or{" "}
              <Link href="/payment" className="font-medium underline">
                add funds
              </Link>
              .
            </p>
          ) : null}
          <Button type="button" className="w-full" loading={pending} disabled={pending || short} onClick={payNow}>
            Pay {ugx(price)}
          </Button>
        </>
      ) : (
        <MobileMoneyPay key={method} amount={price} network={method} start={(phone) => topUpWithMobileMoney(price, phone)} onDone={payNow} />
      )}
    </div>
  );
}
