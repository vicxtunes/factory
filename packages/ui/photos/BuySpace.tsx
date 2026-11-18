"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { ChoiceGroup } from "@repo/ui/StepForm";
import { MobileMoneyPay } from "@repo/ui/wallet/MobileMoneyPay";
import { buyStorageSpace } from "@repo/lib/photos/actions";
import { topUpWithMobileMoney } from "@repo/lib/wallet/actions";
import type { MobileNetwork } from "@repo/lib/wallet/policy";
import { SPACE_PACKS_GB } from "@repo/lib/photos/core";
import { formatAmount } from "@repo/lib/tenancy/format";

/**
 * The studio's owner buys extra storage from their Aming card: pick a size, see
 * its price against the balance, buy. Short of funds, it points to the wallet.
 * The card is in shillings, whatever currency the studio bills in.
 * Or by mobile money (owner, 2026-11-19): the price is paid onto the card
 * from their phone and the space bought from it at once; closed before it
 * confirms, the money stays on the card for the next try.
 */
export function BuySpace({ pricePerGb, balance, locale }: { pricePerGb: number; balance: number; locale: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gb, setGb] = useState<number>(SPACE_PACKS_GB[1]);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<"card" | MobileNetwork>("card");
  const money = (amount: number) => formatAmount({ currency: "UGX", locale }, amount);
  const amount = gb * pricePerGb;
  const short = amount > balance;

  function buy() {
    setError(null);
    start(async () => {
      const res = await buyStorageSpace({ gb, amount });
      if (!res.ok) return setError(res.error);
      setBought(gb);
      router.refresh();
    });
  }

  function close() {
    setOpen(false);
    setMethod("card");
    setError(null);
    setBought(null);
  }

  return (
    <>
      <Button type="button" variant="secondary" className="min-h-8 text-xs" onClick={() => setOpen(true)}>
        Get more space
      </Button>
      <BottomSheet open={open} onClose={close} title="Get more space">
        {bought ? (
          <div className="space-y-4">
            <p className="text-sm">{bought} GB added to your storage. It&apos;s yours to keep.</p>
            <Button type="button" className="w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">Extra storage for your files and photos, paid once from your Aming card and yours to keep.</p>
            <div role="radiogroup" aria-label="How much" className="grid grid-cols-2 gap-2">
              {SPACE_PACKS_GB.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={gb === size}
                  onClick={() => setGb(size)}
                  className={`rounded-xl border p-3 text-left ${gb === size ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-border bg-background"}`}
                >
                  <span className="block font-medium">{size} GB</span>
                  <span className="block text-xs text-muted tnum">{money(size * pricePerGb)}</span>
                </button>
              ))}
            </div>
            <ChoiceGroup
              label="Pay with"
              layout="tiles"
              value={method}
              onChange={setMethod}
              options={[
                { value: "card", title: "Aming card", hint: money(balance) },
                { value: "mtn", title: "MTN" },
                { value: "airtel", title: "Airtel" },
              ]}
            />
            {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
            {method === "card" ? (
              <>
                {short ? (
                  <p className="text-sm text-warning-700 dark:text-warning-400">
                    That&apos;s {money(amount - balance)} more than is on your Aming card. Pay with MTN or Airtel instead, or{" "}
                    <Link href="/payment" className="font-medium underline">
                      add funds
                    </Link>
                    .
                  </p>
                ) : null}
                <Button type="button" className="w-full" loading={pending} disabled={pending || short} onClick={buy}>
                  Buy {gb} GB for {money(amount)}
                </Button>
              </>
            ) : (
              <MobileMoneyPay key={`${method}-${gb}`} amount={amount} network={method} start={(phone) => topUpWithMobileMoney(amount, phone)} onDone={buy} />
            )}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
