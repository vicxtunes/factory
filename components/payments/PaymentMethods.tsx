"use client";

import { useState } from "react";

import { PAYMENT_METHODS } from "@/lib/payments/details";

// The business's payment details (lib/payments/details.ts) as cards with a
// copy button on the numbers people type into their banking / mobile money
// app. Shown on the client portal's Payment page and inside an order's
// drawer — there, `orderNo` is passed so the client sees which payment
// reference to use (the amount is shown once, at the top of the order).

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (insecure context / permissions) — the value is
          // still on screen and selectable, so nothing else to do.
        }
      }}
      className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-border px-2.5 text-xs font-medium text-muted hover:bg-gray-50 hover:text-foreground dark:hover:bg-white/5"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// Instructions only. Order screens show the amount once, at the top
// (components/order/OrderSummary.tsx's PriceHero), not in here.
export function PaymentMethods({ orderNo }: { orderNo?: string }) {
  return (
    <div className="space-y-3">
      {orderNo ? (
        <p className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm dark:border-brand-500/30 dark:bg-brand-500/10">
          Use <span className="font-semibold">{orderNo}</span> as the payment reference so we can match it to your order.
        </p>
      ) : null}

      {PAYMENT_METHODS.map((method) => (
        <section key={method.id} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
          <h3 className="text-sm font-semibold">{method.title}</h3>
          <dl className="mt-2 divide-y divide-border">
            {method.fields.map((field) => (
              <div key={field.label} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted">{field.label}</dt>
                  <dd className="break-words text-sm font-medium tabular-nums">{field.value}</dd>
                </div>
                {field.copyable ? <CopyButton value={field.value} label={field.label} /> : null}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
