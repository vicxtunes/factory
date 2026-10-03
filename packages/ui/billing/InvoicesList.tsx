"use client";

import Link from "next/link";
import { useState } from "react";

import { Tabs } from "@repo/ui/Tabs";
import type { InvoiceStatus, InvoiceSummary } from "@repo/lib/billing/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { InvoiceStatusBadge } from "./StatusBadges";

type View = "all" | InvoiceStatus;

/** Invoices, newest first, by status, with what's left on each. `basePath` null = read-only. */
export function InvoicesList({
  invoices,
  scope,
  basePath,
  showClient = true,
}: {
  invoices: InvoiceSummary[];
  scope: Omit<TenantScope, "tenantId">;
  basePath: string | null;
  showClient?: boolean;
}) {
  const [view, setView] = useState<View>("all");
  const count = (s: InvoiceStatus) => invoices.filter((i) => i.status === s).length;
  const shown = view === "all" ? invoices : invoices.filter((i) => i.status === view);
  const money = (n: number) => formatAmount(scope, n);

  return (
    <div className="space-y-4">
      <Tabs
        label="Show"
        value={view}
        onChange={setView}
        tabs={[
          { key: "all", label: "All", count: invoices.length },
          { key: "unpaid", label: "Unpaid", count: count("unpaid") },
          { key: "partially_paid", label: "Partially paid", count: count("partially_paid") },
          { key: "overdue", label: "Overdue", count: count("overdue"), tone: "warning" },
          { key: "paid", label: "Paid", count: count("paid") },
          { key: "void", label: "Void", count: count("void") },
        ]}
      />
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No invoices here.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
          {shown.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {basePath ? (
                    <Link href={`${basePath}/${i.id}`} className="hover:underline">
                      {i.number}
                    </Link>
                  ) : (
                    i.number
                  )}
                  {showClient ? <span className="font-normal text-muted"> · {i.billTo.name}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {formatDay(scope, i.issuedAt)}
                  {i.dueDate ? ` · due ${formatDay(scope, i.dueDate)}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium tnum">{money(i.total)}</p>
                {i.balance > 0 && i.balance < i.total ? <p className="text-xs text-muted tnum">{money(i.balance)} left</p> : null}
                <InvoiceStatusBadge status={i.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
