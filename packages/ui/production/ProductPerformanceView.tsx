"use client";

// How one product is doing: for a period, its sales, gross profit, units and
// margin against the period before; a year of sales against cost, units
// month by month, and what one cost to make each month (material prices
// creeping up show here first); which sizes sell and earn; who buys it; its
// wastage. Lays out by its own width.

import Link from "next/link";

import { buttonClass } from "@repo/ui/Button";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { compactNumber, monthDate, monthLabel, percent } from "@repo/ui/charts/format";
import { ChartCard, GroupedColumns, RankBars, SERIES, TimeLines } from "@repo/ui/charts/kit";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { formatQty } from "@repo/lib/production/core";
import type { ProductPerformance } from "@repo/lib/production/service";

function change(now: number, before: number | null | undefined): number | null {
  if (before === null || before === undefined || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}

function Stat({ label, value, delta, hint, tone }: { label: string; value: string; delta?: number | null; hint?: string; tone?: "brand" }) {
  const surface = tone === "brand" ? "border-brand-400/40 bg-gradient-to-br from-brand-500 to-brand-600 text-white" : "border-border bg-surface";
  return (
    <div className={`rounded-2xl border p-4 shadow-theme-xs ${surface}`}>
      <p className={`text-sm font-medium ${tone === "brand" ? "text-white/85" : "text-muted"}`}>{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <p className="text-2xl font-bold">{value}</p>
        {delta !== null && delta !== undefined ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone === "brand" ? "bg-white/20" : "bg-gray-100 dark:bg-white/10"}`}>
            {delta >= 0 ? "+" : ""}
            {delta}% {delta >= 0 ? "↑" : "↓"}
          </span>
        ) : null}
      </div>
      {hint ? <p className={`mt-1 text-xs ${tone === "brand" ? "text-white/75" : "text-muted"}`}>{hint}</p> : null}
    </div>
  );
}

export function ProductPerformanceView({ view, setupHref }: { view: ProductPerformance; setupHref: string }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const { product, figures: f, before, months, sizes, clients, wastage } = view;
  const sold = months.some((m) => m.units > 0);
  const unitCost = months.filter((m) => m.units > 0 && m.cost > 0).map((m) => ({ date: monthDate(m.month), value: Math.round(m.cost / m.units) }));
  const monthRows = months.map((m) => ({
    month: monthLabel(m.month, true),
    units: m.units,
    sales: money(m.revenue),
    cost: money(m.cost),
    profit: money(m.profit),
    each: m.units ? money(Math.round(m.cost / m.units)) : "—",
  }));

  return (
    <div className="@container space-y-6">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{product.name}</h2>
          <p className="text-sm text-muted">
            {product.categoryName} · {f.orders} {f.orders === 1 ? "order" : "orders"} in this period
          </p>
        </div>
        <Link href={setupHref} className={buttonClass("secondary", "sm")}>
          {f.notSetUp ? "Write its recipe" : "Edit recipe"}
        </Link>
      </div>

      <PeriodPicker period={view.period} />

      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        <Stat tone="brand" label="Gross profit" value={f.notSetUp ? "—" : money(f.profit)} delta={f.notSetUp ? null : change(f.profit, before?.profit)} hint={f.notSetUp ? "needs its recipe" : `on ${money(f.revenue)} of sales`} />
        <Stat label="Sales" value={money(f.revenue)} delta={change(f.revenue, before?.revenue)} />
        <Stat label="Units sold" value={String(f.units)} delta={change(f.units, before?.units)} hint={product.unit ? `in ${product.unit.toLowerCase()}` : undefined} />
        <Stat
          label="Margin"
          value={f.marginPercent === null ? "—" : percent(f.marginPercent)}
          hint={before?.marginPercent !== null && before?.marginPercent !== undefined ? `${percent(before.marginPercent)} the period before` : undefined}
        />
      </div>
      {f.notSetUp ? (
        <p className="text-sm text-warning-600 dark:text-warning-500">
          This product isn&apos;t set up, so what it costs to make isn&apos;t known and its profit can&apos;t be shown. Set it up to see it.
        </p>
      ) : f.revenue > 0 ? (
        <p className="text-xs text-muted">
          Cost from recorded usage {money(f.costRecorded)}
          {f.costEstimated ? `, estimated from its recipe ${money(f.costEstimated)}` : ""}.
        </p>
      ) : null}

      <div className="grid items-start gap-4 @5xl:grid-cols-2">
        <div className="@5xl:col-span-2">
          <ChartCard
            title="Sales and what making it cost"
            subtitle="The last 12 months"
            legend={[
              { label: "Sales", color: SERIES[0] },
              { label: "Production cost", color: SERIES[1] },
            ]}
            empty={sold ? null : "Not invoiced in the last 12 months."}
            table={{
              columns: [
                { key: "month", label: "Month" },
                { key: "units", label: "Units", align: "right" },
                { key: "sales", label: "Sales", align: "right" },
                { key: "cost", label: "Cost", align: "right" },
                { key: "profit", label: "Profit", align: "right" },
              ],
              rows: monthRows,
            }}
          >
            {(w) => (
              <GroupedColumns
                width={w}
                data={months.map((m, i) => ({ key: m.month, label: monthLabel(m.month, i === 0), values: f.notSetUp ? [m.revenue] : [m.revenue, m.cost] }))}
                series={f.notSetUp ? [{ label: "Sales", color: SERIES[0] }] : [
                  { label: "Sales", color: SERIES[0] },
                  { label: "Production cost", color: SERIES[1] },
                ]}
                format={money}
                axisFormat={compactNumber}
                extra={(i) => [
                  { label: "Units", value: String(months[i].units) },
                  ...(f.notSetUp ? [] : [{ label: "Gross profit", value: money(months[i].profit) }]),
                ]}
              />
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Units sold by month"
          empty={sold ? null : "Not invoiced in the last 12 months."}
          table={{ columns: [{ key: "month", label: "Month" }, { key: "units", label: "Units", align: "right" }], rows: monthRows }}
        >
          {(w) => (
            <GroupedColumns
              width={w}
              height={200}
              data={months.map((m, i) => ({ key: m.month, label: monthLabel(m.month, i === 0), values: [m.units] }))}
              series={[{ label: "Units", color: SERIES[0] }]}
              format={(n) => `${n} sold`}
              axisFormat={compactNumber}
            />
          )}
        </ChartCard>

        <ChartCard
          title="What one cost to make"
          subtitle="By month; rising when materials cost more or more is wasted"
          empty={unitCost.length >= 2 ? null : f.notSetUp ? "Needs its recipe." : "Needs at least two months of sales."}
          table={{ columns: [{ key: "month", label: "Month" }, { key: "each", label: "Cost of one", align: "right" }], rows: monthRows }}
        >
          {(w) => (
            <TimeLines
              width={w}
              height={200}
              zeroBased={false}
              series={[{ label: "Cost of one", color: SERIES[1], points: unitCost }]}
              format={money}
              axisFormat={compactNumber}
              dateLabel={(d) => monthLabel(d.toISOString().slice(0, 7))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Sizes"
          subtitle="Sales by size in this period"
          empty={sizes.length ? null : "Nothing sold in this period."}
          table={{
            columns: [
              { key: "name", label: "Size" },
              { key: "units", label: "Units", align: "right" },
              { key: "sales", label: "Sales", align: "right" },
              { key: "profit", label: "Profit", align: "right" },
              { key: "margin", label: "Margin", align: "right" },
            ],
            rows: sizes.map((s) => ({
              name: s.name,
              units: s.units,
              sales: money(s.revenue),
              profit: s.marginPercent === null ? "—" : money(s.profit),
              margin: s.marginPercent === null ? "—" : percent(s.marginPercent),
            })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              format={money}
              rows={sizes.map((s) => ({
                key: s.key,
                label: s.name,
                value: s.revenue,
                detail: `${s.units} sold${s.marginPercent === null ? "" : ` · ${percent(s.marginPercent)} margin`}`,
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Who buys it"
          subtitle="What each client spent on it in this period"
          empty={clients.length ? null : "Nothing sold in this period."}
          table={{
            columns: [
              { key: "name", label: "Client" },
              { key: "orders", label: "Orders", align: "right" },
              { key: "units", label: "Units", align: "right" },
              { key: "revenue", label: "Spent", align: "right" },
            ],
            rows: clients.map((c) => ({ name: c.name, orders: c.orders, units: c.units, revenue: money(c.revenue) })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              format={money}
              rows={clients.map((c) => ({ key: c.name, label: c.name, value: c.revenue, detail: `${c.orders} ${c.orders === 1 ? "order" : "orders"}, ${c.units} units` }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Wastage"
          subtitle="Used beyond its recipe in this period (from corrected records)"
          empty={wastage.length ? null : "No wastage recorded for it in this period."}
          table={{
            columns: [
              { key: "name", label: "Material" },
              { key: "qty", label: "Extra used", align: "right" },
              { key: "value", label: "Cost", align: "right" },
            ],
            rows: wastage.map((m) => ({ name: m.name, qty: `${formatQty(m.qty)} ${m.unit}`, value: money(m.value) })),
          }}
        >
          {(w) => <RankBars width={w} format={money} color={SERIES[1]} rows={wastage.map((m) => ({ key: m.materialId, label: m.name, value: m.value, detail: `${formatQty(m.qty)} ${m.unit}` }))} />}
        </ChartCard>
      </div>
    </div>
  );
}
