"use client";

import { useState, type ReactNode } from "react";

import { PAYMENT_METHODS } from "@repo/lib/payments/details";

import { MobileMoneyTopUp } from "../wallet/MobileMoneyTopUp";
import { OrderMobileMoney } from "../wallet/OrderMobileMoney";

// "How to pay": pick MTN, Airtel or Bank.
//
//   MTN / Airtel   the in-app phone prompt for `pay` — an order (its id) or a
//                  wallet top-up; without `pay`, a line saying when.
//   Bank           the business's account (packages/lib/payments/details.ts)
//                  with copy buttons, then `bankExtra` if any.
//
// Inside an order, `orderNo` is the reference to use for a bank transfer
// (the amount is shown once, at the top of the order).

type Choice = "mtn" | "airtel" | "bank";

const CHOICES: { key: Choice; label: string }[] = [
  { key: "mtn", label: "MTN" },
  { key: "airtel", label: "Airtel" },
  { key: "bank", label: "Bank" },
];

const BANK = PAYMENT_METHODS.find((m) => m.id === "bank")!;

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
      className="inline-flex min-h-9 shrink-0 items-center rounded-lg border print:hidden border-border px-2.5 text-xs font-medium text-muted hover:bg-gray-50 hover:text-foreground dark:hover:bg-white/5"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function PaymentMethods({
  orderNo,
  pay,
  bankExtra,
}: {
  orderNo?: string;
  /** What MTN / Airtel pays: an order, or a wallet top-up. */
  pay?: { orderId: string } | "top-up";
  bankExtra?: ReactNode;
}) {
  const [choice, setChoice] = useState<Choice>("mtn");

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => {
          const selected = c.key === choice;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(c.key)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
                selected
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-border bg-surface text-foreground hover:bg-gray-50 dark:hover:bg-white/5"
              }`}
            >
              <span
                aria-hidden
                className={`size-4 shrink-0 rounded-full ${selected ? "border-[5px] border-brand-500" : "border-2 border-gray-300 dark:border-gray-600"}`}
              />
              {c.label}
            </button>
          );
        })}
      </div>

      {choice === "bank" ? (
        <div className="space-y-3">
          {orderNo ? (
            <p className="text-sm">
              Reference: <span className="font-semibold">{orderNo}</span>
            </p>
          ) : null}
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
            <h3 className="text-sm font-semibold">{BANK.title}</h3>
            <dl className="mt-2 divide-y divide-border">
              {BANK.fields.map((field) => (
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
          {bankExtra}
        </div>
      ) : pay === "top-up" ? (
        <MobileMoneyTopUp key={choice} network={choice} />
      ) : pay ? (
        <OrderMobileMoney key={choice} orderId={pay.orderId} network={choice} />
      ) : (
        <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted">Pay here once we confirm your order.</p>
      )}
    </div>
  );
}
