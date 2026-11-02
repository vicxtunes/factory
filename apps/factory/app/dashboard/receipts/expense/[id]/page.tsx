import { notFound } from "next/navigation";

import { PrintButton } from "@repo/ui/books/PrintButton";
import { requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { receipt } from "@repo/lib/books/expenses-server";
import { formatMoney } from "@repo/lib/currency/format";

export const dynamic = "force-dynamic";

const METHODS: Record<string, string> = { cash: "Cash", mobile_money: "Mobile money", bank_transfer: "Bank transfer", other: "Other" };

// A payment's receipt: a page of its own, with no menu, so it prints clean.
export default async function ExpenseReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccountsAccess();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await receipt(id);
  if (!r) notFound();
  const left = Math.max(r.expenseTotal - r.expensePaid, 0);
  const rows: [string, string][] = [
    ["Paid to", r.recipient ?? "—"],
    ["For", r.expenseName],
    ["Category", r.categoryName],
    ["Date paid", r.paidOn],
    ["Paid by", METHODS[r.method] ?? r.method],
    ["From account", r.accountName],
    ...(r.phone ? ([["Phone", r.phone]] as [string, string][]) : []),
    ...(r.reference ? ([["Reference", r.reference]] as [string, string][]) : []),
    ...(r.note ? ([["Note", r.note]] as [string, string][]) : []),
    ["Expense total", formatMoney(r.expenseTotal)],
    ["Still to pay", formatMoney(left)],
    ["Recorded by", r.recordedBy],
  ];
  return (
    <main className="mx-auto max-w-xl p-6 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Payment receipt</h1>
          <p className="mt-1 text-muted">{r.companyName}</p>
          <p className="mt-1 text-xs text-muted">No. {r.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <PrintButton />
      </div>
      {r.voidedAt ? (
        <p className="mt-4 rounded-xl border border-error-500 p-3 font-semibold text-error-600">VOIDED: this payment was cancelled. {r.voidReason}</p>
      ) : null}
      <p className="mt-6 text-3xl font-bold tnum">{formatMoney(r.amount)}</p>
      <dl className="mt-4 divide-y divide-border border-y border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-16 grid grid-cols-2 gap-8 text-xs text-muted">
        <p className="border-t border-border pt-1">Received by (name and signature)</p>
        <p className="border-t border-border pt-1">Paid by (name and signature)</p>
      </div>
    </main>
  );
}
