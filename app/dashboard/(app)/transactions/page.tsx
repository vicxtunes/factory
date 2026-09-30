import Link from "next/link";
import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { getDashboardSession } from "@/lib/auth/session";
import { METHOD_LABELS } from "@/lib/wallet/policy";
import { getAllTransactionHistory } from "@/lib/wallet/actions";
import { isManagerRole } from "@/lib/types";
import type { PaymentStatus, TransactionHistoryKind } from "@/lib/wallet/types";

export const dynamic = "force-dynamic";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(Math.abs(value));
}

function getQueryParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildPageHref(base: string, params: Record<string, string | undefined>) {
  const url = new URL(base, "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[]; kind?: string | string[]; status?: string | string[]; page?: string | string[] }>;
}) {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const params = searchParams ? await searchParams : {};
  const q = getQueryParam(params.q);
  const kind = getQueryParam(params.kind) || "all";
  const status = getQueryParam(params.status) || "all";
  const page = Math.max(1, Number(getQueryParam(params.page) || "1"));

  const kindValue: TransactionHistoryKind | "all" = kind === "all" ? "all" : (kind as TransactionHistoryKind);
  const statusValue: PaymentStatus | "all" = status === "all" ? "all" : (status as PaymentStatus);

  const result = await getAllTransactionHistory({ page, search: q || undefined, kind: kindValue, status: statusValue });
  if (!result.ok) return <p className="text-sm text-error-600">{result.error}</p>;

  const kindOptions = [
    { value: "all", label: "All types" },
    { value: "deposit", label: "Deposits" },
    { value: "deposit_report", label: "Deposit reports" },
    { value: "order_payment_report", label: "Unconfirmed order payments" },
    { value: "order_payment", label: "Order payments" },
    { value: "refund", label: "Refunds" },
    { value: "adjustment", label: "Adjustments" },
  ];

  const statusOptions = [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "succeeded", label: "Succeeded" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const filters = { q: q || undefined, kind: kind === "all" ? undefined : kind, status: status === "all" ? undefined : status };

  return (
    <div className="space-y-6">
      <SectionLabel>Transactions</SectionLabel>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">All money activity</h2>
            <p className="text-xs text-muted">Search clients, orders, references, and payment notes.</p>
          </div>
          <span className="text-xs text-muted">{result.data.items.length} shown</span>
        </div>

        <form method="GET" className="mb-4 grid gap-3 md:grid-cols-[1.6fr_0.9fr_0.9fr_auto]">
          <label className="block text-xs font-medium text-muted">
            Search
            <input
              name="q"
              defaultValue={q}
              placeholder="Client, order, ref, note..."
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-muted focus:border-brand-500"
            />
          </label>

          <label className="block text-xs font-medium text-muted">
            Type
            <select
              name="kind"
              defaultValue={kind}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
            >
              {kindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-muted">
            Status
            <select
              name="status"
              defaultValue={status}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button type="submit" className="min-h-10 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white">
              Search
            </button>
            <Link
              href="/dashboard/transactions"
              className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 py-2 text-sm text-foreground"
            >
              Reset
            </Link>
          </div>
        </form>

        {result.data.items.length ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((item) => {
                    const source = item.method && item.method !== "wallet" ? METHOD_LABELS[item.method] : item.method === "wallet" ? "Wallet" : "—";
                    const label =
                      item.kind === "deposit_report"
                        ? "Deposit report"
                        : item.kind === "order_payment_report"
                          ? "Unconfirmed order payment"
                        : item.kind === "order_payment"
                          ? "Order payment"
                          : item.kind === "refund"
                            ? "Refund"
                            : item.kind === "adjustment"
                              ? "Adjustment"
                              : "Deposit";
                    const sign = item.amount < 0 ? "−" : "+";

                    return (
                      <tr key={item.id} className="border-t border-border align-top">
                        <td className="px-3 py-2 text-xs text-muted">{new Date(item.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{item.clientName}</div>
                          {item.clientPhone ? <div className="text-xs text-muted">{item.clientPhone}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {item.orderNo ? <span className="font-medium">{item.orderNo}</span> : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">{label}</td>
                        <td className="px-3 py-2 text-xs">{source}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className="inline-flex rounded-full bg-muted/40 px-2 py-0.5 capitalize">{item.status}</span>
                        </td>
                        <td className={`px-3 py-2 text-right text-sm font-semibold tabular-nums ${item.amount < 0 ? "text-foreground" : "text-success-600 dark:text-success-500"}`}>
                          {sign}
                          {formatMoney(item.amount)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">{item.reference || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted">{item.note || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="py-2 text-sm text-muted">No transaction history matched your filters.</p>
        )}

        {result.data.hasMore || result.data.page > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <Link
              href={buildPageHref("/dashboard/transactions", {
                q: filters.q,
                kind: filters.kind,
                status: filters.status,
                page: result.data.page > 1 ? String(result.data.page - 1) : undefined,
              })}
              aria-disabled={result.data.page <= 1}
              className={`inline-flex items-center rounded-xl border border-border px-3 py-2 text-sm ${result.data.page <= 1 ? "pointer-events-none opacity-50" : ""}`}
            >
              Previous
            </Link>

            <span className="text-xs text-muted">Page {result.data.page}</span>

            <Link
              href={buildPageHref("/dashboard/transactions", {
                q: filters.q,
                kind: filters.kind,
                status: filters.status,
                page: result.data.hasMore ? String(result.data.page + 1) : undefined,
              })}
              aria-disabled={!result.data.hasMore}
              className={`inline-flex items-center rounded-xl border border-border px-3 py-2 text-sm ${!result.data.hasMore ? "pointer-events-none opacity-50" : ""}`}
            >
              Next
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
