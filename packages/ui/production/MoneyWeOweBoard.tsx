"use client";

// Accounts → Money we owe: everyone the business has borrowed from (the
// owners, suppliers' credit, banks / SACCOs / mobile loans, other projects),
// what's still owed and what's overdue, most owed first. Cards on a phone, a
// table from md up; a tab per kind of lender.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { LENDER_KIND_LABELS, LENDER_KIND_ONE, type Lender, type LenderAccount, type LenderKind, type Loan } from "@repo/lib/production/core";

import { Tile } from "./MaterialsBoard";
import { LoanSheet, RepaymentSheet } from "./sheets";

/** A calendar date ("28 Nov 2026"), the same on the server and in the browser. */
export const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function MoneyWeOweBoard({
  accounts,
  totals,
  open,
  today,
  basePath,
}: {
  accounts: LenderAccount[];
  totals: { owed: number; overdue: number; overdueCount: number };
  open: Loan[];
  today: string;
  basePath: string;
}) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [tab, setTab] = useState<LenderKind | "all">("all");
  const [sheet, setSheet] = useState<"loan" | "repay" | null>(null);

  const kinds = (Object.keys(LENDER_KIND_LABELS) as LenderKind[]).filter((k) => accounts.some((a) => a.kind === k));
  const shown = tab === "all" ? accounts : accounts.filter((a) => a.kind === tab);
  const interest = accounts.reduce((s, a) => s + a.interestPaid, 0);
  const lenders: Lender[] = accounts.map(({ id, name, phone, kind }) => ({ id, name, phone, kind }));

  const due = (a: LenderAccount) =>
    a.overdue > 0 ? (
      <span className="text-error-600 dark:text-error-400">{money(a.overdue)} overdue</span>
    ) : a.nextDue ? (
      `by ${shortDay(a.nextDue)}`
    ) : (
      <span className="text-muted">—</span>
    );

  const columns: DataTableColumn<LenderAccount>[] = [
    { key: "name", header: "Lender", render: (a) => <span className="font-medium">{a.name}</span> },
    { key: "kind", header: "Who", render: (a) => LENDER_KIND_ONE[a.kind] },
    { key: "borrowed", header: "Borrowed", align: "right", render: (a) => money(a.borrowed) },
    { key: "repaid", header: "Paid back", align: "right", render: (a) => money(a.repaid) },
    { key: "interest", header: "Interest paid", align: "right", render: (a) => money(a.interestPaid) },
    { key: "owed", header: "Still owed", align: "right", render: (a) => <span className="font-semibold">{money(a.owed)}</span> },
    { key: "due", header: "Due", align: "right", render: due },
  ];

  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        <Tile label="We owe" value={money(totals.owed)} wide />
        <Tile label={totals.overdueCount ? `Overdue (${totals.overdueCount} ${totals.overdueCount === 1 ? "lender" : "lenders"})` : "Overdue"} value={money(totals.overdue)} tone={totals.overdue ? "error" : undefined} />
        <Tile label="Interest paid so far" value={money(interest)} />
      </div>

      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center">
        {kinds.length > 1 ? (
          <div role="tablist" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] @2xl:mx-0 @2xl:px-0">
            {(["all", ...kinds] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`min-h-9 shrink-0 rounded-full border px-4 text-sm font-medium ${
                  tab === k ? "border-brand-500 bg-brand-500 text-white" : "border-border bg-surface hover:bg-gray-50 dark:hover:bg-white/5"
                }`}
              >
                {k === "all" ? "All" : LENDER_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2 @2xl:ml-auto">
          <Button type="button" variant="secondary" className="flex-1 @2xl:flex-none" onClick={() => setSheet("loan")}>
            Record money borrowed
          </Button>
          <Button type="button" className="flex-1 @2xl:flex-none" onClick={() => setSheet("repay")} disabled={open.length === 0}>
            Record repayment
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Nothing borrowed yet. Record money the owners put in, loans from banks or SACCOs, or money from other projects; materials bought on credit show here by themselves.
        </div>
      ) : (
        <>
          <ul className="space-y-2 @3xl:hidden">
            {shown.map((a) => (
              <li key={a.id}>
                <Link href={`${basePath}/${a.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-theme-xs active:bg-gray-50 dark:active:bg-white/5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className={`shrink-0 font-semibold tnum ${a.owed === 0 ? "text-muted" : ""}`}>{a.owed === 0 ? "Paid back" : money(a.owed)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {LENDER_KIND_ONE[a.kind]} · borrowed {money(a.borrowed)}
                    {a.interestPaid ? ` · ${money(a.interestPaid)} interest` : ""}
                  </p>
                  {a.owed > 0 && (a.overdue > 0 || a.nextDue) ? <p className="mt-1 text-xs">{due(a)}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
          <DataTable className="hidden @3xl:block" columns={columns} rows={shown} rowKey={(a) => a.id} onRowClick={(a) => router.push(`${basePath}/${a.id}`)} />
        </>
      )}

      <LoanSheet key={`loan-${sheet === "loan"}`} open={sheet === "loan"} onClose={() => setSheet(null)} lenders={lenders.filter((l) => l.kind !== "supplier")} today={today} />
      <RepaymentSheet key={`repay-${sheet === "repay"}`} open={sheet === "repay"} onClose={() => setSheet(null)} loans={open} today={today} />
    </div>
  );
}
