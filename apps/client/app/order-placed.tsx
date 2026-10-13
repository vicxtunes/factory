"use client";

import Link from "next/link";

import { PriceHero } from "@repo/ui/order/OrderSummary";
import { PayLater } from "@repo/ui/payments/OrderPayButton";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";

// Shown in place of the order form once placeOrder succeeds: a big tick, the
// order number, then a nudge to pay. Two flavours:
// - Pay now: the catalog gave a full total and nothing needs a call first,
//   so we show the amount, and how it's paid (in the app once we've confirmed
//   and invoiced it, or by bank meanwhile).
// - Wait for confirmation: photo books (the receptionist phones first) or an
//   order with an unpriced item — the final price isn't known yet, so we ask
//   them not to pay yet. They pay later from the order's "Pay" button.

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

export function OrderPlaced({
  orderNo,
  total,
  needsReview,
  uploadWarnings,
}: {
  orderNo: string;
  total: number | null;
  needsReview: boolean;
  uploadWarnings: string[];
}) {
  const symbol = useCurrencySymbol();
  const payNow = total != null && !needsReview;
  const ref = <span className="font-semibold">{orderNo}</span>;
  // Laid out for phones: a compact "placed" line, the price front and
  // centre, then how it's paid.
  return (
    <div className="mx-auto w-full max-w-lg space-y-3">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success-600 text-white">
          <CheckIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold">Order {orderNo} placed!</p>
          <p className="text-xs text-muted">
            {needsReview
              ? "We'll call you shortly to confirm the details and final price."
              : "We've received it. Track its progress under Orders."}
          </p>
        </div>
      </div>

      {payNow ? (
        <PriceHero label="Amount to pay" price={formatMoney(total, symbol)} note={<>Use {ref} as your payment reference.</>} />
      ) : (
        <PriceHero
          tone="pending"
          label="Amount to pay"
          price="Being confirmed"
          note="Please don't pay yet. We'll confirm your order and final price first."
        />
      )}

      {uploadWarnings.length > 0 ? (
        <div className="rounded-[var(--radius)] border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700">
          <p className="font-medium">The order went through, but some photos didn&apos;t upload:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {uploadWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="mt-1 text-warning-600">You can add them again from Orders.</p>
        </div>
      ) : null}

      {payNow ? <PayLater orderNo={orderNo} /> : null}

      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <Link
          href="/orders"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Track my order
        </Link>
        <Link
          href="/new"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] border border-border bg-surface px-4 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5"
        >
          Place another order
        </Link>
      </div>
    </div>
  );
}
