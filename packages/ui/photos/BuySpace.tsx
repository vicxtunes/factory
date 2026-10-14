"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { buyStorageSpace } from "@repo/lib/photos/actions";
import { SPACE_PACKS_GB } from "@repo/lib/photos/core";
import { formatAmount } from "@repo/lib/tenancy/format";

/**
 * The studio's owner buys extra storage from their Aming card: pick a size, see
 * its price against the balance, buy. Short of funds, it points to the wallet.
 * The card is in shillings, whatever currency the studio bills in.
 */
export function BuySpace({ pricePerGb, balance, locale }: { pricePerGb: number; balance: number; locale: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gb, setGb] = useState<number>(SPACE_PACKS_GB[1]);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const money = (amount: number) => formatAmount({ currency: "UGX", locale }, amount);
  const amount = gb * pricePerGb;
  const short = amount > balance;

  function close() {
    setOpen(false);
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
            <p className="flex justify-between text-sm">
              <span className="text-muted">On your Aming card</span>
              <span className="tnum">{money(balance)}</span>
            </p>
            {short ? (
              <p className="text-sm text-warning-700 dark:text-warning-400">
                That&apos;s {money(amount - balance)} more than is on your Aming card.{" "}
                <Link href="/payment" className="font-medium underline">
                  Add funds
                </Link>
              </p>
            ) : null}
            {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
            <Button
              type="button"
              className="w-full"
              loading={pending}
              disabled={pending || short}
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await buyStorageSpace({ gb, amount });
                  if (!res.ok) return setError(res.error);
                  setBought(gb);
                  router.refresh();
                });
              }}
            >
              Buy {gb} GB for {money(amount)}
            </Button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
