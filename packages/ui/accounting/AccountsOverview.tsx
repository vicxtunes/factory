"use client";

import Link from "next/link";

import { InfoTip } from "@repo/ui/InfoTip";
import { CHANNELS } from "@repo/lib/accounting/core/model";
import type { OverviewView } from "@repo/lib/accounting/service";

import { SalesChart } from "./SalesChart";
import { CHANNEL_LABELS, Card, EmptyState, FigureTile, useMoney } from "./shared";

export function AccountsOverview({ view }: { view: OverviewView }) {
  const money = useMoney();
  const o = view.overview;
  const channels = CHANNELS.filter((c) => o.receivedByChannel[c] > 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">In this period</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <FigureTile
            label="Total sales"
            value={money(o.sales)}
            hint={`${o.salesCount} invoice${o.salesCount === 1 ? "" : "s"} issued`}
            href="/dashboard/accounts/sales"
          />
          <FigureTile
            label="Payments received"
            value={money(o.received)}
            hint={o.receivedAsPrepayment > 0 ? `incl. ${money(o.receivedAsPrepayment)} wallet top-ups` : "All channels"}
          />
          <FigureTile label="Discounts given" value={money(o.discounts)} hint="On invoices issued in the period" />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">As of today</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <FigureTile
            label="Outstanding client balances"
            value={money(o.outstanding)}
            hint="Owed on invoices"
            href="/dashboard/accounts/clients"
          />
          <FigureTile
            label="Overdue"
            value={money(o.overdue)}
            hint={`${o.overdueCount} invoice${o.overdueCount === 1 ? "" : "s"} past due`}
            tone={o.overdueCount > 0 ? "warning" : undefined}
            href="/dashboard/accounts/sales?status=overdue&period=all"
          />
          <FigureTile
            label="Client wallet balance"
            value={money(o.held)}
            hint={
              <span className="inline-flex items-center gap-1">
                Held for clients, not yet a sale
                <InfoTip label="About client wallet balance">
                  Wallet top-ups are money received, but they only become sales when a client spends them on an
                  invoice. So they count in Payments received and here, never twice in sales.
                </InfoTip>
              </span>
            }
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Sales vs received, last 12 months">
            <SalesChart series={view.series} />
          </Card>
        </div>
        <Card title="Received by channel">
          {channels.length === 0 ? (
            <p className="text-sm text-muted">Nothing received in this period.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {channels.map((c) => (
                <li key={c} className="flex items-center justify-between gap-2 py-2">
                  <span>{CHANNEL_LABELS[c]}</span>
                  <span className="tnum font-medium">{money(o.receivedByChannel[c])}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2 pt-2 font-semibold">
                <span>Total</span>
                <span className="tnum">{money(o.received)}</span>
              </li>
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Money in only. Expenses and transfers aren&apos;t recorded in the app.</p>
        </Card>
      </div>

      <Card
        title="Clients owing the most"
        aside={
          <Link href="/dashboard/accounts/clients" className="text-xs font-medium text-brand-600 hover:underline">
            All client accounts
          </Link>
        }
      >
        {o.topOwing.length === 0 ? (
          <EmptyState>No one owes anything right now.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {o.topOwing.map((row) => (
              <li key={row.customerId ?? row.name} className="flex items-center justify-between gap-2 py-2">
                {row.customerId ? (
                  <Link href={`/dashboard/accounts/clients/${row.customerId}`} className="truncate font-medium hover:underline">
                    {row.name}
                  </Link>
                ) : (
                  <span className="truncate">
                    {row.name} <span className="text-xs text-muted">(walk-in)</span>
                  </span>
                )}
                <span className="tnum font-medium">{money(row.outstanding)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
