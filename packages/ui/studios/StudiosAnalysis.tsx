"use client";

import { ChartCard, GroupedColumns, RankBars, SERIES } from "@repo/ui/charts/kit";
import type { StudioActivity, StudioListing } from "@repo/lib/studios/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

const whole = (n: number) => Math.round(n).toLocaleString("en");

/**
 * The Businesses page at a glance (owner, 2026-11-14): how many there are and
 * how many are open, how fast new ones come and how many of them get opened,
 * and which ones actually use the system (customers, bookings and invoices in
 * the last 30 days, counted: each business has its own currency).
 */
export function StudiosAnalysis({
  studios,
  activity,
  scope,
}: {
  studios: StudioListing[];
  /** By business id, the last 30 days; businesses that did nothing are missing. */
  activity: Record<string, StudioActivity>;
  scope: Pick<TenantScope, "locale" | "timeZone">;
}) {
  const monthOf = new Intl.DateTimeFormat("en-CA", { timeZone: scope.timeZone, year: "numeric", month: "2-digit" });
  const key = (d: Date) => monthOf.format(d).slice(0, 7);
  const label = new Intl.DateTimeFormat(scope.locale, { month: "short", year: "2-digit", timeZone: "UTC" });

  // The last 12 months, oldest first.
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 15));
    return { key: key(d), label: label.format(d) };
  });
  const thisMonth = key(now);
  const lastMonth = months[10].key;

  const active = studios.filter((s) => s.status === "active");
  const settingUp = studios.filter((s) => s.status === "onboarding" || s.status === "changes_requested").length;
  const opened = (m: string) => studios.filter((s) => key(new Date(s.createdAt)) === m);
  const newThis = opened(thisMonth).length;
  const newLast = opened(lastMonth).length;
  const busy = active.filter((s) => activity[s.id]).length;

  const byMonth = months.map((m) => {
    const list = opened(m.key);
    return { key: m.key, label: m.label, values: [list.length, list.filter((s) => s.status === "active").length] };
  });
  const series = [
    { label: "Signed up", color: SERIES[0] },
    { label: "Open now", color: SERIES[1] },
  ];

  const ranked = studios
    .filter((s) => activity[s.id])
    .map((s) => {
      const a = activity[s.id];
      return { s, a, total: a.customers + a.bookings + a.invoices };
    })
    .sort((x, y) => y.total - x.total);
  const detail = (a: StudioActivity) => `${a.customers} customers · ${a.bookings} bookings · ${a.invoices} invoices`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile value={whole(studios.length)} label="Businesses signed up" />
        <Tile value={whole(active.length)} label={`Open for business${studios.length ? ` (${Math.round((active.length / studios.length) * 100)}%)` : ""}`} />
        <Tile value={whole(settingUp)} label="Still setting up" />
        <Tile value={whole(newThis)} label={`New this month (last month ${whole(newLast)})`} />
      </div>
      <p className="text-sm text-muted">
        {active.length === 0
          ? "No business is open yet."
          : `${whole(busy)} of ${whole(active.length)} open businesses added a customer, a booking or an invoice in the last 30 days.`}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="New businesses by month"
          subtitle="Signed up each month, and how many of them are open now"
          legend={series.map((s) => ({ label: s.label, color: s.color }))}
          table={{
            columns: [
              { key: "month", label: "Month" },
              { key: "signed", label: "Signed up", align: "right" },
              { key: "open", label: "Open now", align: "right" },
            ],
            rows: byMonth.map((m) => ({ month: m.label, signed: whole(m.values[0]), open: whole(m.values[1]) })),
          }}
          empty={byMonth.every((m) => m.values[0] === 0) ? "No businesses signed up in the last 12 months." : null}
        >
          {(width) => <GroupedColumns width={width} data={byMonth} series={series} format={whole} axisFormat={whole} />}
        </ChartCard>
        <ChartCard
          title="Busiest businesses"
          subtitle="Customers, bookings and invoices added in the last 30 days"
          table={{
            columns: [
              { key: "name", label: "Business" },
              { key: "customers", label: "Customers", align: "right" },
              { key: "bookings", label: "Bookings", align: "right" },
              { key: "invoices", label: "Invoices", align: "right" },
            ],
            rows: ranked.map(({ s, a }) => ({ name: s.name, customers: whole(a.customers), bookings: whole(a.bookings), invoices: whole(a.invoices) })),
          }}
          empty={ranked.length === 0 ? "No business added customers, bookings or invoices in the last 30 days." : null}
        >
          {(width) => <RankBars width={width} rows={ranked.map(({ s, a, total }) => ({ key: s.id, label: s.name, value: total, detail: detail(a) }))} format={whole} />}
        </ChartCard>
      </div>
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <p className="text-2xl font-bold tnum">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}
