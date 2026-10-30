"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ExportButtons } from "@repo/ui/ExportButtons";
import { TextInput } from "@repo/ui/Field";
import { CHANNELS } from "@repo/lib/accounting/core/model";
import { paymentsTotals, type PaymentLine } from "@repo/lib/accounting/core/figures";

import { CHANNEL_LABELS, Card, EmptyState, FigureTile, useMoney } from "./shared";

function time(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const forWhat = (l: PaymentLine) => (l.orderNo ? `Order ${l.orderNo}` : "Wallet top-up");

function matchesSearch(l: PaymentLine, query: string): boolean {
  if (!query) return true;
  return [l.customerName, l.orderNo ?? "", l.reference ?? "", l.recordedBy ?? "", CHANNEL_LABELS[l.channel]].some((f) =>
    f.toLowerCase().includes(query),
  );
}

/**
 * Every payment received in the period: totals per method and per person who
 * recorded it, then each payment with when, from whom, for what and its
 * reference. A card per payment on a phone, a table on wider screens.
 */
export function PaymentsTable({ lines, exportName }: { lines: PaymentLine[]; exportName: string }) {
  const money = useMoney();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const visible = useMemo(() => lines.filter((l) => matchesSearch(l, query)), [lines, query]);
  const totals = useMemo(() => paymentsTotals(visible), [visible]);
  const channels = CHANNELS.filter((c) => totals.byChannel[c] > 0);

  const exportRows = visible.map((l) => ({
    time: time(l.receivedAt),
    client: l.customerName,
    amount: l.amount,
    method: CHANNEL_LABELS[l.channel],
    for: forWhat(l),
    reference: l.reference ?? "",
    recordedBy: l.recordedBy ?? "",
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FigureTile
          label="Received"
          value={money(totals.total)}
          hint={`${totals.count} payment${totals.count === 1 ? "" : "s"}${query ? " matching the search" : ""}`}
        />
        <Card title="By method">
          {channels.length === 0 ? (
            <p className="text-sm text-muted">Nothing received.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {channels.map((c) => (
                <li key={c} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{CHANNEL_LABELS[c]}</span>
                  <span className="tnum font-medium">{money(totals.byChannel[c])}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="By who recorded it">
          {totals.byRecorder.length === 0 ? (
            <p className="text-sm text-muted">Nothing received.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {totals.byRecorder.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">
                    {r.name} <span className="text-xs text-muted">({r.count})</span>
                  </span>
                  <span className="tnum font-medium">{money(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client, order, reference, method or staff…"
          aria-label="Search payments"
          className="min-w-0 flex-1"
        />
        <ExportButtons
          filename={exportName}
          rows={exportRows}
          columns={[
            { key: "time", label: "When" },
            { key: "client", label: "Client" },
            { key: "amount", label: "Amount" },
            { key: "method", label: "Method" },
            { key: "for", label: "For" },
            { key: "reference", label: "Reference" },
            { key: "recordedBy", label: "Recorded by" },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState>{query ? `No payments match “${search.trim()}”.` : "No payments received in this period."}</EmptyState>
      ) : (
        <>
          {/* Phones: one card per payment. */}
          <ul className="space-y-2 sm:hidden">
            {visible.map((l) => (
              <li key={l.id} className="rounded-2xl border border-border bg-surface p-3 shadow-theme-xs">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/dashboard/accounts/clients/${l.customerId}`} className="min-w-0 truncate font-medium hover:underline">
                    {l.customerName}
                  </Link>
                  <span className="shrink-0 font-semibold tnum">{money(l.amount)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {time(l.receivedAt)} · {CHANNEL_LABELS[l.channel]} · {forWhat(l)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {l.reference ? <span className="tnum">{l.reference} · </span> : null}
                  Recorded by {l.recordedBy ?? "—"}
                </p>
              </li>
            ))}
          </ul>

          {/* Wider screens: a table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-theme-xs sm:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">For</th>
                  <th className="px-4 py-2 font-medium">Reference</th>
                  <th className="px-4 py-2 font-medium">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 tnum">{time(l.receivedAt)}</td>
                    <td className="px-4 py-2">
                      <Link href={`/dashboard/accounts/clients/${l.customerId}`} className="font-medium hover:underline">
                        {l.customerName}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-medium tnum">{money(l.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-2">{CHANNEL_LABELS[l.channel]}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{forWhat(l)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted tnum">{l.reference ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2">{l.recordedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-background font-semibold">
                  <td className="px-4 py-2" colSpan={2}>
                    Total ({totals.count} payment{totals.count === 1 ? "" : "s"})
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(totals.total)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
