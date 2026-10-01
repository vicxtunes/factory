"use client";

// Small building blocks shared by the Accounts screens. Components in
// components/accounting talk only to lib/accounting's core types and the
// view models from its service.

import Link from "next/link";
import type { ReactNode } from "react";

import type { Channel, DocumentStatus } from "@/lib/accounting/core/model";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";

export const CHANNEL_LABELS: Record<Channel, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  card: "Card",
  other: "Other",
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

/** Formats amounts with the shop's currency symbol. */
export function useMoney(): (amount: number) => string {
  const symbol = useCurrencySymbol();
  return (amount) => formatMoney(amount, symbol);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  // Calendar dates ("yyyy-mm-dd") are shown as-is in local terms; instants in the viewer's zone.
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** One headline figure. */
export function FigureTile({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "warning";
  href?: string;
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p
        className={`mt-1 truncate text-2xl font-bold tnum ${tone === "warning" ? "text-warning-700 dark:text-warning-500" : ""}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </>
  );
  const className = `block rounded-2xl border bg-surface p-4 shadow-theme-xs ${
    tone === "warning" ? "border-warning-500/40" : "border-border"
  }`;
  return href ? (
    <Link href={href} className={`${className} transition-shadow hover:shadow-theme-md`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

const STATUS_STYLES: Record<DocumentStatus, string> = {
  unpaid: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
  partially_paid: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  paid: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  cancelled: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
};

export function StatusBadge({ status, overdue }: { status: DocumentStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
        {STATUS_LABELS[status]}
      </span>
      {overdue ? (
        <span className="whitespace-nowrap rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700 dark:bg-error-500/15 dark:text-error-400">
          Overdue
        </span>
      ) : null}
    </span>
  );
}

/** A titled card section. */
export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{children}</p>
  );
}
