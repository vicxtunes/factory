"use client";

// Small building blocks shared by the client's and staff's wallet screens.
// Components in packages/ui/wallet talk only to packages/lib/wallet/{actions,types,policy}.

import type { ReactNode } from "react";

import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { ENTRY_LABELS, METHOD_LABELS, STATUS_LABELS } from "@repo/lib/wallet/policy";
import type { PaymentMethod, WalletEntry, WalletPayment } from "@repo/lib/wallet/types";

/** Formats shillings with the shop's currency symbol. */
export function useMoney(): (amount: number) => string {
  const symbol = useCurrencySymbol();
  return (amount) => formatMoney(amount, symbol);
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Parses what someone typed into a whole-shilling amount ("50,000" → 50000); NaN when it isn't one. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

/** The balance, as the most prominent thing on a wallet screen. */
export function BalanceCard({ balance, children }: { balance: number; children?: ReactNode }) {
  const money = useMoney();
  return (
    <section
      aria-label="Wallet balance"
      className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10"
    >
      <p className="text-xs uppercase tracking-wide text-muted">Wallet balance</p>
      <p className="text-3xl font-extrabold tabular-nums">{money(balance)}</p>
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </section>
  );
}

export function MethodOptions({ methods }: { methods: PaymentMethod[] }) {
  return (
    <>
      {methods.map((m) => (
        <option key={m} value={m}>
          {METHOD_LABELS[m]}
        </option>
      ))}
    </>
  );
}

/** One line of the wallet history: what happened, when, and the balance after. */
export function EntryLine({ entry }: { entry: WalletEntry }) {
  const money = useMoney();
  const credit = entry.amount > 0;
  const detail = [
    entry.orderNo ? `Order ${entry.orderNo}` : null,
    entry.method ? METHOD_LABELS[entry.method] : null,
    entry.reference ? `Ref ${entry.reference}` : null,
    entry.note,
  ].filter(Boolean);

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{ENTRY_LABELS[entry.kind]}</p>
        {detail.length ? <p className="break-words text-xs text-muted">{detail.join(" · ")}</p> : null}
        <p className="text-[11px] text-muted">
          {formatWhen(entry.createdAt)} · by {entry.actorName}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular-nums ${credit ? "text-success-600 dark:text-success-500" : ""}`}>
          {credit ? "+" : "−"}
          {money(Math.abs(entry.amount))}
        </p>
        <p className="text-[11px] text-muted tabular-nums">Balance {money(entry.balanceAfter)}</p>
      </div>
    </li>
  );
}

/** A deposit that isn't in the balance: waiting for confirmation, rejected, or withdrawn. */
export function PaymentLine({ payment, action }: { payment: WalletPayment; action?: ReactNode }) {
  const money = useMoney();
  const tone =
    payment.status === "pending"
      ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500"
      : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium tabular-nums">{money(payment.amount)}</p>
        <p className="break-words text-xs text-muted">
          {[METHOD_LABELS[payment.method], payment.reference ? `Ref ${payment.reference}` : null, payment.note]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {payment.failureReason && payment.status === "failed" ? (
          <p className="text-xs text-error-600 dark:text-error-500">{payment.failureReason}</p>
        ) : null}
        <p className="text-[11px] text-muted">{formatWhen(payment.createdAt)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{STATUS_LABELS[payment.status]}</span>
        {action}
      </div>
    </li>
  );
}

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
