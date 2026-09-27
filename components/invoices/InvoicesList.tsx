"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Drawer } from "@/components/ui/Drawer";
import { TextInput } from "@/components/ui/Field";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import { STATUS_LABELS } from "@/lib/invoices/policy";
import type { InvoiceListRow, InvoiceStatus } from "@/lib/invoices/types";

import { InvoiceStatusBadge } from "./InvoiceDocument";
import { StaffInvoicePanel } from "./StaffInvoicePanel";

// Staff's Invoices page: every invoice with what's paid and outstanding,
// filterable by status. Opening one shows the same invoice panel as the
// order screen (record a payment, share the link…).

type Filter = "all" | InvoiceStatus;
const FILTERS: Filter[] = ["all", "unpaid", "partially_paid", "paid", "cancelled"];

export function InvoicesList({ invoices }: { invoices: InvoiceListRow[] }) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<InvoiceListRow | null>(null);

  const q = search.trim().toLowerCase();
  const visible = invoices.filter(
    (i) =>
      (filter === "all" || i.status === filter) &&
      (!q || [i.invoiceNo, i.orderNo, i.clientName].some((v) => v.toLowerCase().includes(q))),
  );
  const outstanding = invoices.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + i.balance, 0);
  const count = (f: Filter) => (f === "all" ? invoices.length : invoices.filter((i) => i.status === f).length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="rounded-2xl border border-border bg-surface px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">Outstanding</p>
          <p className="text-xl font-extrabold tabular-nums">{money(outstanding)}</p>
        </div>
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice, order or client"
          className="max-w-xs"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
              filter === f ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400" : "border-border text-muted hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]} ({count(f)})
          </button>
        ))}
      </div>

      {visible.length ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Invoice</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Issued</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => setOpen(i)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-2">
                    <button type="button" className="font-medium text-left" onClick={() => setOpen(i)}>
                      {i.invoiceNo}
                    </button>
                    <p className="text-xs text-muted">Order {i.orderNo}</p>
                  </td>
                  <td className="px-4 py-2">{i.clientName}</td>
                  <td className="px-4 py-2 tabular-nums text-muted">
                    {new Date(i.issuedAt).toLocaleDateString()}
                    {i.dueDate ? <p className="text-xs">Due {new Date(`${i.dueDate}T00:00:00`).toLocaleDateString()}</p> : null}
                  </td>
                  <td className="px-4 py-2">
                    <InvoiceStatusBadge status={i.status} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(i.amount)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(i.paid)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(i.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {invoices.length ? "No invoice matches." : "No invoices yet. Generate one from an order's detail screen."}
        </p>
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `${open.invoiceNo} · ${open.clientName}` : "Invoice"}>
        {open ? <StaffInvoicePanel key={open.orderId} orderId={open.orderId} onChanged={() => router.refresh()} /> : null}
      </Drawer>
    </div>
  );
}
