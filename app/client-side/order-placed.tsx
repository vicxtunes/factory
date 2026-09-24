"use client";

import Link from "next/link";

import { PaymentMethods } from "@/components/payments/PaymentMethods";
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
  const payNow = total != null && !needsReview;
  const ref = <span className="font-semibold">{orderNo}</span>;

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-theme-sm">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-600 text-white shadow-theme-md">
          <CheckIcon className="h-11 w-11" />
        </span>
        <p className="mt-4 text-xl font-bold">Order {orderNo} placed!</p>
        <p className="mt-1 text-sm text-muted">
          {needsReview
            ? "We'll call you shortly to confirm the details and final price."
            : "We've received it — track its progress under Orders."}
        </p>

        {uploadWarnings.length > 0 ? (
          <div className="mt-4 rounded-[var(--radius)] border border-warning-100 bg-warning-50 p-3 text-left text-sm text-warning-700">
            <p className="font-medium">The order went through, but some photos didn&apos;t upload:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {uploadWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="mt-1 text-warning-600">You can add them again from Orders.</p>
          </div>
        ) : null}
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
        <div>
          <h2 className="text-base font-semibold">{payNow ? "Next: make your payment" : "Payment"}</h2>
          {payNow ? null : (
            <p className="mt-1 rounded-[var(--radius)] bg-warning-50 px-3 py-2 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
              Please don&apos;t pay yet — wait until we confirm your order and final price. You&apos;ll find these
              details again on the order under Orders.
            </p>
          )}
        </div>

        <Steps
          steps={
            payNow
              ? [
                  <>Send the amount below by bank or mobile money.</>,
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

        <PaymentMethods orderNo={orderNo} amount={payNow ? total : undefined} />
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
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
