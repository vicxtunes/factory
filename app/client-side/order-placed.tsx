"use client";

import { useRef } from "react";
import Link from "next/link";

import { Collapsible, PriceHero } from "@/components/order/OrderSummary";
import { PaymentMethods } from "@/components/payments/PaymentMethods";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import { SUPPORT_PHONE_DISPLAY } from "@/lib/support/constants";

// Shown in place of the order form once placeOrder succeeds: a big tick, the
// order number, then a nudge to pay. Two flavours:
// - Pay now: the catalog gave a full total and nothing needs a call first,
//   so we show the amount and step-by-step instructions.
// - Wait for confirmation: photo books (the receptionist phones first) or an
//   order with an unpriced item — the final price isn't known yet, so the
//   details are shown for reference but we ask them not to pay yet. They pay
//   later from the order's "How to pay" section (item-detail / quote-review).

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-2 text-left text-sm">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {i + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
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
  const howToPayRef = useRef<HTMLDetailsElement>(null);

  function openHowToPay() {
    const el = howToPayRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Laid out for phones: a compact "placed" line, the price front and
  // centre, and the payment steps folded away until wanted.
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
        <PriceHero
          label="Amount to pay"
          price={formatMoney(total, symbol)}
          note={<>Use {ref} as your payment reference.</>}
        >
          <button
            type="button"
            onClick={openHowToPay}
            className="inline-flex min-h-10 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
          >
            How to pay
          </button>
        </PriceHero>
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

      <Collapsible
        ref={howToPayRef}
        title="How to pay"
        summary={payNow ? "Bank or mobile money · 4 steps" : "For later, once we confirm the price"}
      >
        <div className="space-y-4">
          <Steps
            steps={
              payNow
                ? [
                    <>Send the amount above by bank or mobile money.</>,
                    <>Use {ref} as the payment reference.</>,
                    <>Send your receipt or a screenshot to {SUPPORT_PHONE_DISPLAY} (WhatsApp or SMS).</>,
                    <>We&apos;ll confirm your payment and get your order moving.</>,
                  ]
                : [
                    <>Wait for our call or message confirming the final price.</>,
                    <>Pay by bank or mobile money, using {ref} as the reference.</>,
                    <>Send your receipt or a screenshot to {SUPPORT_PHONE_DISPLAY} (WhatsApp or SMS).</>,
                  ]
            }
          />
          <PaymentMethods orderNo={orderNo} />
        </div>
      </Collapsible>

      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <Link
          href="/client-side/orders"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Track my order
        </Link>
        <Link
          href="/client-side/new"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius)] border border-border bg-surface px-4 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5"
        >
          Place another order
        </Link>
      </div>
    </div>
  );
}
