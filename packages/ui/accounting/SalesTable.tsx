"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ExportButtons } from "@repo/ui/ExportButtons";
import { TextInput } from "@repo/ui/Field";
import { Tabs } from "@repo/ui/Tabs";
import type { SaleLine } from "@repo/lib/accounting/core/figures";

import { STATUS_LABELS, StatusBadge, formatDate, useMoney } from "./shared";

export type SalesFilter = "all" | "unpaid" | "partially_paid" | "paid" | "overdue" | "cancelled";

const FILTERS: { key: SalesFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "partially_paid", label: "Partially paid" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
  { key: "cancelled", label: "Cancelled" },
];

function matches(line: SaleLine, filter: SalesFilter): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return line.overdue;
  return line.status === filter;
}

function matchesSearch(line: SaleLine, query: string): boolean {
  if (!query) return true;
  return [line.number, line.orderNo, line.customerName, line.products].some((f) => f.toLowerCase().includes(query));
}

/** Sales (invoiced orders) with status filters, search, totals and export. */
export function SalesTable({
  lines,
  initialFilter = "all",
  showCustomer = true,
  exportName,
}: {
  lines: SaleLine[];
  initialFilter?: SalesFilter;
  /** Off on a single client's account, where every row is theirs. */
  showCustomer?: boolean;
  exportName: string;
}) {
  const money = useMoney();
  const [filter, setFilter] = useState<SalesFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const searched = useMemo(() => lines.filter((l) => matchesSearch(l, query)), [lines, query]);
  const visible = useMemo(() => searched.filter((l) => matches(l, filter)), [searched, filter]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, searched.filter((l) => matches(l, f.key)).length])) as Record<SalesFilter, number>,
    [searched],
  );

  // Totals over what's shown; cancelled sales owe nothing and aren't revenue.
  const live = visible.filter((l) => l.status !== "cancelled");
  const totals = {
    total: live.reduce((s, l) => s + l.total, 0),
    discount: live.reduce((s, l) => s + l.discount, 0),
    paid: live.reduce((s, l) => s + l.paid, 0),
    outstanding: live.reduce((s, l) => s + l.outstanding, 0),
  };

  const exportRows = visible.map((l) => ({
    date: formatDate(l.issuedAt),
    invoice: l.number,
    order: l.orderNo,
    client: l.customerName,
    products: l.products,
    value: l.total,
    discount: l.discount,
    paid: l.paid,
    outstanding: l.outstanding,
    status: l.overdue ? `${STATUS_LABELS[l.status]} (overdue)` : STATUS_LABELS[l.status],
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={showCustomer ? "Search invoice, order, client or product…" : "Search invoice, order or product…"}
          aria-label="Search sales"
          className="min-w-0 flex-1"
        />
        <ExportButtons
          filename={exportName}
          rows={exportRows}
          columns={[
            { key: "date", label: "Date" },
            { key: "invoice", label: "Invoice" },
            { key: "order", label: "Order" },
            ...(showCustomer ? [{ key: "client" as const, label: "Client" }] : []),
            { key: "products", label: "Products" },
            { key: "value", label: "Order value" },
            { key: "discount", label: "Discount" },
            { key: "paid", label: "Paid" },
            { key: "outstanding", label: "Outstanding" },
            { key: "status", label: "Status" },
          ]}
        />
      </div>

      <Tabs
        label="Payment status"
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          count: f.key === "all" ? undefined : counts[f.key],
          tone: f.key === "overdue" ? ("warning" as const) : undefined,
        }))}
      />

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {query ? `No sales match “${search.trim()}”.` : "No sales here for this period."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-theme-xs">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Invoice</th>
                {showCustomer ? <th className="px-4 py-2 font-medium">Client</th> : null}
                <th className="px-4 py-2 font-medium">Products</th>
                <th className="px-4 py-2 text-right font-medium">Order value</th>
                <th className="px-4 py-2 text-right font-medium">Discount</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id} className={`border-b border-border last:border-0 ${l.status === "cancelled" ? "text-muted" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-2 tnum">{formatDate(l.issuedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <p className="font-medium tnum">{l.number}</p>
                    <p className="text-xs text-muted tnum">Order {l.orderNo}</p>
                  </td>
                  {showCustomer ? (
                    <td className="px-4 py-2">
                      {l.customerId ? (
                        <Link href={`/dashboard/accounts/clients/${l.customerId}`} className="font-medium hover:underline">
                          {l.customerName}
                        </Link>
                      ) : (
                        <span>
                          {l.customerName} <span className="text-xs text-muted">(walk-in)</span>
                        </span>
                      )}
                    </td>
                  ) : null}
                  <td className="max-w-56 truncate px-4 py-2 text-muted" title={l.products}>
                    {l.products || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(l.total)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum">{l.discount ? money(l.discount) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(l.paid)}</td>
                  <td className={`whitespace-nowrap px-4 py-2 text-right tnum font-medium ${l.overdue ? "text-error-600 dark:text-error-400" : ""}`}>
                    {money(l.outstanding)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={l.status} overdue={l.overdue} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-background font-semibold">
                <td className="px-4 py-2" colSpan={showCustomer ? 4 : 3}>
                  Total ({live.length} sale{live.length === 1 ? "" : "s"}, excl. cancelled)
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(totals.total)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(totals.discount)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(totals.paid)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(totals.outstanding)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
