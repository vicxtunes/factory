"use client";

import { useState } from "react";

import { Tabs } from "@/components/ui/Tabs";
import type { HistoryEntry } from "@/lib/accounting/core/figures";
import type { CustomerAccountView } from "@/lib/accounting/service";

import { SalesTable } from "./SalesTable";
import { CHANNEL_LABELS, EmptyState, FigureTile, formatDate, useMoney } from "./shared";

const HISTORY_LABELS: Record<HistoryEntry["kind"], string> = {
  received: "Payment received",
  spent: "Paid from wallet",
  refund: "Refunded to wallet",
  adjustment: "Wallet correction",
};

function HistoryList({ history }: { history: HistoryEntry[] }) {
  const money = useMoney();
  if (history.length === 0) return <EmptyState>No payments yet.</EmptyState>;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface text-sm shadow-theme-xs">
      {history.map((h) => {
        const label = h.kind === "received" && h.prepayment ? "Wallet top-up" : HISTORY_LABELS[h.kind];
        const detail = [
          h.channel ? CHANNEL_LABELS[h.channel] : null,
          h.orderNo ? `Order ${h.orderNo}` : null,
          h.detail ? (h.kind === "received" ? `Ref ${h.detail}` : h.detail) : null,
        ].filter(Boolean);
        // Received money is always in (+); movements of held money keep their sign.
        const negative = h.kind !== "received" && h.amount < 0;
        return (
          <li key={h.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">{label}</p>
              <p className="truncate text-xs text-muted">
                {formatDate(h.at)}
                {detail.length ? ` · ${detail.join(" · ")}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 tnum font-medium ${h.kind === "received" ? "text-success-700 dark:text-success-500" : negative ? "text-muted" : ""}`}
            >
              {negative ? "−" : "+"}
              {money(Math.abs(h.amount))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One client's account: totals, their invoices and their payment history. */
export function CustomerAccountDetail({ view }: { view: CustomerAccountView }) {
  const money = useMoney();
  const [tab, setTab] = useState<"invoices" | "history">("invoices");
  const a = view.account;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FigureTile label="Total orders" value={String(a.orderCount)} hint="Excluding cancelled" />
        <FigureTile label="Total invoiced" value={money(a.invoiced)} />
        <FigureTile label="Total paid" value={money(a.paid)} />
        <FigureTile label="Outstanding balance" value={money(a.outstanding)} />
        <FigureTile
          label="Overdue invoices"
          value={a.overdueCount > 0 ? money(a.overdue) : "None"}
          hint={a.overdueCount > 0 ? `${a.overdueCount} invoice${a.overdueCount === 1 ? "" : "s"} past due` : undefined}
          tone={a.overdueCount > 0 ? "warning" : undefined}
        />
        <FigureTile label="Wallet balance" value={money(a.held)} hint="Held for them, not yet spent" />
      </div>

      <Tabs
        label="Account"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "invoices", label: "Invoices", count: view.sales.length },
          { key: "history", label: "Payment history", count: view.history.length },
        ]}
      />

      {tab === "invoices" ? (
        <SalesTable lines={view.sales} showCustomer={false} exportName={`account-${a.name}`} />
      ) : (
        <HistoryList history={view.history} />
      )}
    </div>
  );
}
