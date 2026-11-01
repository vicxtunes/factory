"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { TextInput } from "@repo/ui/Field";
import type { MonthPoint, PaymentLine } from "@repo/lib/accounting/core/figures";
import type { Channel } from "@repo/lib/accounting/core/model";
import { DAY_PERIOD_PRESETS, type Period } from "@repo/lib/accounting/core/period";
import type { Compared, DashboardView } from "@repo/lib/accounting/service";

import { CHANNEL_LABELS, useMoney } from "../accounting/shared";

// The bosses' money dashboard: three headline cards, money in by channel,
// cash flow over the last 12 months and the latest payments, from the
// Accounts service's dashboard view (accounting.dashboard).

const SHOWN_CHANNELS: Channel[] = ["cash", "mobile_money", "bank_transfer", "card"];

/** Percent change, or null when there's nothing to compare with. */
function change({ now, before }: Compared): number | null {
  if (!before) return null;
  return ((now - before) / before) * 100;
}

// Compact axis ticks: 1.2M, 350K.
function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** `timeZone`: the business's; payment times show as its local time, the same on the server and in the browser. */
export function MoneyDashboard({ view, timeZone }: { view: DashboardView; timeZone: string }) {
  const money = useMoney();
  const { received, sales, owed } = view;
  // Payments and Sales open on the same period, so the figure can be traced to its lines.
  const periodQuery = new URLSearchParams(
    view.period.preset === "custom"
      ? { period: "custom", from: view.period.fromDate ?? "", to: view.period.toDate ?? "" }
      : { period: view.period.preset },
  ).toString();

  // Lays out by its own width (container queries), not the screen's: it sits beside the sidebar.
  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-muted">Money in, money owed, and how it&apos;s moving</p>
        </div>
        <PeriodSelect period={view.period} />
      </div>

      {/* A swipe rail on a phone, three across on a desktop. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 @4xl:mx-0 @4xl:grid @4xl:grid-cols-3 @4xl:overflow-visible @4xl:px-0">
        <HeadlineCard
          tone="brand"
          icon={ICONS.wallet}
          title="Money received"
          subtitle="All channels, top-ups included"
          value={money(received.now)}
          change={change(received)}
          link={{ label: "See payments", href: `/dashboard/accounts/payments?${periodQuery}` }}
        />
        <HeadlineCard
          icon={ICONS.receipt}
          title="Sales"
          subtitle="Invoices issued"
          value={money(sales.now)}
          change={change(sales)}
          link={{ label: "See sales", href: `/dashboard/accounts/sales?${periodQuery}` }}
        />
        <HeadlineCard
          icon={ICONS.clock}
          title="Owed to us"
          subtitle={
            owed.overdueCount > 0
              ? `${money(owed.overdue)} overdue on ${owed.overdueCount} invoice${owed.overdueCount === 1 ? "" : "s"}`
              : "Nothing overdue"
          }
          value={money(owed.outstanding)}
          link={{ label: "See clients", href: "/dashboard/accounts/clients" }}
        />
      </div>

      <div className="grid gap-4 @4xl:grid-cols-5">
        <ChannelGrid byChannel={view.byChannel} total={received.now} />
        <CashFlow series={view.series} />
      </div>

      <RecentPayments payments={view.payments} timeZone={timeZone} />
    </div>
  );
}

function PeriodSelect({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      aria-label="Period"
      value={period.preset}
      onChange={(e) => router.push(`${pathname}?period=${e.target.value}`)}
      className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-theme-xs"
    >
      {DAY_PERIOD_PRESETS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
      {/* A custom range arrives from a link; it can be shown, not picked here. */}
      {period.preset === "custom" ? (
        <option value="custom" disabled>
          {period.fromDate} – {period.toDate}
        </option>
      ) : null}
    </select>
  );
}

function HeadlineCard({
  tone,
  icon,
  title,
  subtitle,
  value,
  change,
  link,
}: {
  tone?: "brand";
  icon: ReactNode;
  title: string;
  subtitle: string;
  value: string;
  change?: number | null;
  link: { label: string; href: string };
}) {
  // Dark in both themes, like the money cards they're modelled on; the first one orange.
  const surface =
    tone === "brand"
      ? "from-brand-500 to-brand-600 border-brand-400/40"
      : "from-gray-800 to-gray-950 border-white/10";
  return (
    <div
      className={`flex min-w-[85%] snap-start flex-col overflow-hidden rounded-2xl border bg-gradient-to-br text-white shadow-theme-xs @xl:min-w-[60%] @4xl:min-w-0 ${surface}`}
    >
      <div className="flex-1 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-gray-900">{icon}</span>
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            <p className="truncate text-xs text-white/70">{subtitle}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <p className="truncate text-2xl font-bold tnum">{value}</p>
          <ChangeBadge change={change ?? null} onBrand={tone === "brand"} />
        </div>
      </div>
      <Link
        href={link.href}
        className="flex items-center justify-between bg-white/10 px-4 py-2.5 text-sm text-white/90 transition-colors hover:bg-white/20"
      >
        {link.label}
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function ChangeBadge({ change, onBrand }: { change: number | null; onBrand: boolean }) {
  if (change === null) return null;
  const up = change >= 0;
  const text = `${up ? "+" : ""}${change.toFixed(1)}% ${up ? "↑" : "↓"}`;
  if (onBrand) {
    return <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-900 tnum">{text}</span>;
  }
  return <span className={`shrink-0 text-xs font-semibold tnum ${up ? "text-success-500" : "text-error-500"}`}>{text}</span>;
}

function ChannelGrid({ byChannel, total }: { byChannel: Record<Channel, number>; total: number }) {
  const money = useMoney();
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs @4xl:col-span-2">
      <h2 className="font-semibold">Received by channel</h2>
      <p className="text-xs text-muted">Where this period&apos;s money came in</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {SHOWN_CHANNELS.map((c) => {
          const amount = byChannel[c];
          return (
            <div key={c} className="rounded-xl border border-border bg-background p-3">
              <p className="text-sm font-medium">{CHANNEL_LABELS[c]}</p>
              <p className="mt-2 text-base font-bold tnum @lg:text-lg">{money(amount)}</p>
              <p className="text-xs text-muted tnum">{total > 0 ? `${Math.round((amount / total) * 100)}% of money in` : "—"}</p>
              <p className={`mt-1 text-xs font-medium ${amount > 0 ? "text-brand-600 dark:text-brand-400" : "text-muted"}`}>
                {amount > 0 ? "Active" : "None this period"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function monthLabel(month: string, length: "short" | "long" = "short"): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: length, ...(length === "long" ? { year: "numeric" } : {}) });
}

function CashFlow({ series }: { series: MonthPoint[] }) {
  const money = useMoney();
  const [metric, setMetric] = useState<"received" | "sales">("received");
  // The highlighted bar: the current month until another is hovered or tapped.
  const [active, setActive] = useState(series.length - 1);
  const data = series.map((p) => ({ ...p, label: monthLabel(p.month) }));
  const total = series.reduce((sum, p) => sum + p[metric], 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-gray-800 to-gray-950 p-4 text-white shadow-theme-xs @4xl:col-span-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm text-white/70">Cash flow, last 12 months</h2>
          <p className="mt-1 text-2xl font-bold tnum">{money(total)}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-white/10 p-1 text-sm">
          {(["received", "sales"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`rounded-full px-3 py-1 ${metric === m ? "bg-white text-gray-900" : "text-white/80 hover:text-white"}`}
            >
              {m === "received" ? "Received" : "Sales"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 0, left: -8, bottom: 0 }}
            onMouseMove={(state) => {
              if (state.activeTooltipIndex != null) setActive(Number(state.activeTooltipIndex));
            }}
            onClick={(state) => {
              if (state.activeTooltipIndex != null) setActive(Number(state.activeTooltipIndex));
            }}
          >
            <defs>
              <linearGradient id="cash-flow-active" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f67413" />
                <stop offset="100%" stopColor="#ffffff" />
              </linearGradient>
              <linearGradient id="cash-flow-rest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.6)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: "rgba(255,255,255,0.6)" }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={false}
              content={({ active: shown, payload }) => {
                const p = shown ? (payload?.[0]?.payload as MonthPoint | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-white/10 bg-gray-900/95 px-3 py-2 text-xs text-white shadow-lg">
                    <p className="mb-1 font-medium">{monthLabel(p.month, "long")}</p>
                    <p className="flex justify-between gap-4">
                      <span className="text-white/60">Received</span>
                      <span className="tnum">{money(p.received)}</span>
                    </p>
                    <p className="flex justify-between gap-4">
                      <span className="text-white/60">Sales</span>
                      <span className="tnum">{money(p.sales)}</span>
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey={metric} radius={[10, 10, 10, 10]} maxBarSize={44} isAnimationActive={false}>
              {data.map((p, i) => (
                <Cell key={p.month} fill={i === active ? "url(#cash-flow-active)" : "url(#cash-flow-rest)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function RecentPayments({ payments, timeZone }: { payments: PaymentLine[]; timeZone: string }) {
  const money = useMoney();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? payments.filter((p) => [p.customerName, p.orderNo, p.reference].some((v) => v?.toLowerCase().includes(q)))
    : payments;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Recent payments</h2>
        <div className="flex items-center gap-3">
          <div className="w-full @xl:w-56">
            <TextInput type="search" placeholder="Search client or ref" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Link href="/dashboard/accounts/payments" className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
            All payments
          </Link>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{q ? "No payments match." : "No payments in this period."}</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-border @xl:hidden">
            {shown.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.customerName}</p>
                  <p className="text-xs text-muted">
                    {day(p.receivedAt)} · {time(p.receivedAt)} · {CHANNEL_LABELS[p.channel]}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tnum">{money(p.amount)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto @xl:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-background text-left text-xs text-muted">
                  <th className="rounded-l-lg px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="rounded-r-lg px-3 py-2 font-medium">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-3 font-medium">{p.customerName}</td>
                    <td className="px-3 py-3 text-muted">{p.orderNo ?? p.reference ?? "—"}</td>
                    <td className="px-3 py-3 tnum">{day(p.receivedAt)}</td>
                    <td className="px-3 py-3 tnum">{time(p.receivedAt)}</td>
                    <td className="px-3 py-3 text-right font-semibold tnum">{money(p.amount)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                        {CHANNEL_LABELS[p.channel]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

const ICONS = {
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3M3 7.5v10A2.5 2.5 0 0 0 5.5 20H21V8H5.5A2.5 2.5 0 0 1 3 7.5ZM16.5 14h.01" />
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
};
