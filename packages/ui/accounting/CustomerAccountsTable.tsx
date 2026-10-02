"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ExportButtons } from "@repo/ui/ExportButtons";
import { TextInput } from "@repo/ui/Field";
import { Tabs } from "@repo/ui/Tabs";
import type { CustomerAccount } from "@repo/lib/accounting/core/figures";

import { useMoney } from "./shared";

type AccountsFilter = "owing" | "overdue" | "held" | "all";

const FILTERS: Record<AccountsFilter, (a: CustomerAccount) => boolean> = {
  owing: (a) => a.outstanding > 0,
  overdue: (a) => a.overdueCount > 0,
  held: (a) => a.held > 0,
  all: () => true,
};

/** Every client's account (receivables), most owed first. */
export function CustomerAccountsTable({ accounts }: { accounts: CustomerAccount[] }) {
  const money = useMoney();
  const [filter, setFilter] = useState<AccountsFilter>("owing");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const searched = useMemo(
    () =>
      accounts
        .filter((a) => !query || a.name.toLowerCase().includes(query) || (a.phone ?? "").includes(query))
        .sort((a, b) => b.outstanding - a.outstanding || b.invoiced - a.invoiced || a.name.localeCompare(b.name)),
    [accounts, query],
  );
  const visible = searched.filter(FILTERS[filter]);
  const count = (f: AccountsFilter) => searched.filter(FILTERS[f]).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client name or phone…"
          aria-label="Search clients"
          className="min-w-0 flex-1"
        />
        <ExportButtons
          filename="client-accounts"
          rows={visible.map((a) => ({
            client: a.name,
            phone: a.phone ?? "",
            orders: a.orderCount,
            invoiced: a.invoiced,
            paid: a.paid,
            outstanding: a.outstanding,
            overdue: a.overdue,
            wallet: a.held,
          }))}
          columns={[
            { key: "client", label: "Client" },
            { key: "phone", label: "Phone" },
            { key: "orders", label: "Orders" },
            { key: "invoiced", label: "Invoiced" },
            { key: "paid", label: "Paid" },
            { key: "outstanding", label: "Outstanding" },
            { key: "overdue", label: "Overdue" },
            { key: "wallet", label: "Wallet balance" },
          ]}
        />
      </div>

      <Tabs
        label="Show"
        value={filter}
        onChange={setFilter}
        tabs={[
          { key: "owing", label: "Owing", count: count("owing") },
          { key: "overdue", label: "Overdue", count: count("overdue"), tone: "warning" },
          { key: "held", label: "Wallet credit", count: count("held") },
          { key: "all", label: "All clients" },
        ]}
      />

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {query ? `No clients match “${search.trim()}”.` : "No clients here."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-theme-xs">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 text-right font-medium">Orders</th>
                <th className="px-4 py-2 text-right font-medium">Invoiced</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                <th className="px-4 py-2 text-right font-medium">Overdue</th>
                <th className="px-4 py-2 text-right font-medium">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.customerId} className="border-b border-border last:border-0 hover:bg-background">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/accounts/clients/${a.customerId}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    {!a.active ? <span className="ml-1 text-xs text-muted">(inactive)</span> : null}
                    {a.phone ? <p className="text-xs text-muted tnum">{a.phone}</p> : null}
                  </td>
                  <td className="px-4 py-2 text-right tnum">{a.orderCount}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(a.invoiced)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(a.paid)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum font-medium">{money(a.outstanding)}</td>
                  <td
                    className={`whitespace-nowrap px-4 py-2 text-right tnum ${a.overdueCount > 0 ? "font-medium text-error-600 dark:text-error-400" : "text-muted"}`}
                  >
                    {a.overdueCount > 0 ? `${money(a.overdue)} (${a.overdueCount})` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum">{a.held ? money(a.held) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
