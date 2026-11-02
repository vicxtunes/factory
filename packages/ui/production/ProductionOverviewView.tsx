"use client";

// Production → Overview: for a period, what making what was sold cost, the
// gross profit and margin (each against the period before), and how the cost
// is known (recorded usage, recipe estimates, or no recipe at all); the
// a year of sales against the cost of making them, the margin month by month,
// a product map (sales against margin) that says what to do with each
// product; products by profit, with Excel/PDF export, each opening its own
// page; wastage by material and materials used; the stock's value now. Lays
// out by its own width.

import Link from "next/link";
import { useState } from "react";

import { ExportButtons } from "@repo/ui/ExportButtons";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { compactNumber, median, monthDate, monthLabel, percent } from "@repo/ui/charts/format";
import { BubbleMap, CalendarHeat, ChartCard, GroupedColumns, RankBars, SERIES, ShadeLegend, TimeLines, Treemap } from "@repo/ui/charts/kit";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { formatQty } from "@repo/lib/production/core";
import type { ProductionOverview } from "@repo/lib/production/service";

const TOP = 10;

function change(now: number, before: number | null | undefined): number | null {
  if (before === null || before === undefined || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}

function Card({ title, value, delta, hint, tone }: { title: string; value: string; delta?: number | null; hint?: string; tone?: "brand" }) {
  const surface = tone === "brand" ? "border-brand-400/40 bg-gradient-to-br from-brand-500 to-brand-600 text-white" : "border-border bg-surface";
  return (
    <div className={`flex min-w-[80%] snap-start flex-col rounded-2xl border p-4 shadow-theme-xs @xl:min-w-[45%] @4xl:min-w-0 ${surface}`}>
      <p className={`text-sm font-medium ${tone === "brand" ? "text-white/85" : "text-muted"}`}>{title}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="truncate text-2xl font-bold tnum">{value}</p>
        {delta !== null && delta !== undefined ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tone === "brand" ? "bg-white/20" : "bg-gray-100 dark:bg-white/10"}`}>
            {delta >= 0 ? "+" : ""}
            {delta}% {delta >= 0 ? "↑" : "↓"}
          </span>
        ) : null}
      </div>
      {hint ? <p className={`mt-1 text-xs ${tone === "brand" ? "text-white/75" : "text-muted"}`}>{hint}</p> : null}
    </div>
  );
}

export function ProductionOverviewView({ view, productHref }: { view: ProductionOverview; productHref?: string }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [all, setAll] = useState(false);
  const { figures: f, before, materialsUsed, wastage } = view;
  const used = materialsUsed.now.reduce((s, m) => s + m.value, 0);
  const wasted = wastage.reduce((s, m) => s + Math.max(m.value, 0), 0);
  const shown = all ? f.products : f.products.slice(0, TOP);
  const exportRows = f.products.map((p) => ({
    product: p.name,
    units: p.units,
    sales: p.revenue,
    cost: p.cost,
    profit: p.noRecipe ? "" : p.profit,
    margin: p.marginPercent === null ? "" : `${p.marginPercent}%`,
    costFrom: p.noRecipe ? "no recipe" : p.estimated ? "partly recipe estimate" : "recorded usage",
  }));

  return (
    <div className="@container space-y-6">
      <PeriodPicker period={view.period} />

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 @4xl:mx-0 @4xl:grid @4xl:grid-cols-2 @7xl:grid-cols-4 @4xl:overflow-visible @4xl:px-0">
        <Card
          tone="brand"
          title="Gross profit"
          value={money(f.profit)}
          delta={change(f.profit, before?.profit)}
          hint={f.revenueWithoutRecipe ? `on ${money(f.revenue - f.revenueWithoutRecipe)} of sales with a recipe` : `on ${money(f.revenue)} of sales`}
        />
        <Card title="Production cost" value={money(f.cost)} delta={change(f.cost, before?.cost)} hint="what making what was sold cost" />
        <Card
          title="Margin"
          value={f.marginPercent === null ? "—" : `${f.marginPercent}%`}
          hint={before?.marginPercent !== null && before?.marginPercent !== undefined ? `${before.marginPercent}% the period before` : undefined}
        />
        <Card title="Materials used" value={money(used)} delta={change(used, materialsUsed.before)} hint={`stock now worth ${money(view.stockValue)}`} />
      </div>

      {f.revenue > 0 ? (
        <p className="text-xs text-muted">
          Cost from recorded usage {money(f.costRecorded)}, estimated from recipes {money(f.costEstimated)}
          {f.revenueWithoutRecipe > 0 ? (
            <span className="text-warning-600 dark:text-warning-500">
              ; {money(f.revenueWithoutRecipe)} of sales have no recipe, so they&apos;re left out of the profit and margin until they get one
            </span>
          ) : null}
          .
        </p>
      ) : null}

      <YearCharts view={view} money={money} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Products by profit</h3>
          <ExportButtons
            rows={exportRows}
            filename="production-products"
            columns={[
              { key: "product", label: "Product" },
              { key: "units", label: "Units" },
              { key: "sales", label: "Sales" },
              { key: "cost", label: "Cost" },
              { key: "profit", label: "Profit" },
              { key: "margin", label: "Margin" },
              { key: "costFrom", label: "Cost from" },
            ]}
          />
        </div>
        {f.products.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing invoiced in this period.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
            <li className="hidden grid-cols-[1fr_4rem_repeat(3,8rem)_5rem] gap-3 px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted @3xl:grid">
              <span>Product</span>
              <span className="text-right">Units</span>
              <span className="text-right">Sales</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Profit</span>
              <span className="text-right">Margin</span>
            </li>
            {shown.map((p) => (
              <li key={p.key} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-3 text-sm @3xl:grid-cols-[1fr_4rem_repeat(3,8rem)_5rem] @3xl:items-center">
                <span className="min-w-0 truncate font-medium">
                  {productHref && !p.key.startsWith("name:") ? (
                    <Link href={`${productHref}/${p.key}`} className="hover:text-brand-600 hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    p.name
                  )}
                  {p.noRecipe ? <span className="ml-2 text-xs font-normal text-warning-600 dark:text-warning-500">no recipe</span> : p.estimated ? <span className="ml-2 text-xs font-normal text-muted">estimated</span> : null}
                </span>
                <span className={`text-right font-semibold tnum @3xl:order-last @3xl:font-normal ${p.profit < 0 ? "text-error-600 dark:text-error-400" : ""}`}>
                  {p.marginPercent === null ? "—" : `${p.marginPercent}%`}
                </span>
                <span className="col-span-2 text-xs text-muted tnum @3xl:col-span-1 @3xl:text-right @3xl:text-sm @3xl:text-foreground">
                  <span className="@3xl:hidden">
                    {p.units} sold · {money(p.revenue)} sales{p.noRecipe ? " · cost unknown" : ` · ${money(p.cost)} cost · ${money(p.profit)} profit`}
                  </span>
                  <span className="hidden @3xl:inline">{p.units}</span>
                </span>
                <span className="hidden text-right tnum @3xl:block">{money(p.revenue)}</span>
                <span className="hidden text-right tnum @3xl:block">{p.noRecipe ? "—" : money(p.cost)}</span>
                <span className={`hidden text-right tnum @3xl:block ${p.profit < 0 ? "text-error-600 dark:text-error-400" : ""}`}>{p.noRecipe ? "—" : money(p.profit)}</span>
              </li>
            ))}
          </ul>
        )}
        {f.products.length > TOP ? (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-sm font-medium text-brand-600 hover:underline">
            {all ? `Show the top ${TOP}` : `Show all ${f.products.length}`}
          </button>
        ) : null}
      </section>

      <div className="grid gap-4 @4xl:grid-cols-2">
        <ChartCard
          title="Wastage by material"
          subtitle={wasted ? `${money(wasted)} used beyond the recipes (from corrected records)` : "Recorded usage matched the recipes"}
          empty={wastage.length ? null : "No wastage recorded in this period."}
          table={{
            columns: [
              { key: "name", label: "Material" },
              { key: "qty", label: "Extra used", align: "right" },
              { key: "value", label: "Cost", align: "right" },
            ],
            rows: wastage.map((m) => ({ name: m.name, qty: `${formatQty(m.qty)} ${m.unit}`, value: money(m.value) })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              format={money}
              color={SERIES[1]}
              negative={SERIES[0]}
              rows={wastage.map((m) => ({ key: m.materialId, label: m.name, value: m.value, detail: `${m.qty > 0 ? "+" : ""}${formatQty(m.qty)} ${m.unit}` }))}
            />
          )}
        </ChartCard>
        <ChartCard
          title="Materials used"
          subtitle={`${money(used)} taken off stock by production`}
          empty={materialsUsed.now.length ? null : "Nothing taken off stock in this period."}
          table={{
            columns: [
              { key: "name", label: "Material" },
              { key: "qty", label: "Used", align: "right" },
              { key: "value", label: "Value", align: "right" },
            ],
            rows: materialsUsed.now.map((m) => ({ name: m.name, qty: `${formatQty(m.qty)} ${m.unit}`, value: money(m.value) })),
          }}
        >
          {(w) => <RankBars width={w} format={money} color={SERIES[1]} rows={materialsUsed.now.map((m) => ({ key: m.materialId, label: m.name, value: m.value, detail: `${formatQty(m.qty)} ${m.unit}` }))} />}
        </ChartCard>
      </div>
    </div>
  );
}

/** A year of sales against cost, the margin month by month, and the product map. */
function YearCharts({ view, money }: { view: ProductionOverview; money: (n: number) => string }) {
  const { months, figures, days, categories } = view;
  const dayValues = new Map(days.map((d) => [d.date, d.revenue]));
  const lastMonth = months[months.length - 1]?.month;
  // The calendar runs from the first of the oldest month to the end of the current one.
  const calendarTo = lastMonth ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10) : "";
  const sold = months.some((m) => m.revenue > 0);
  const mapped = figures.products.filter((p) => p.marginPercent !== null && p.revenue > 0);
  const monthRows = months.map((m) => ({
    month: monthLabel(m.month, true),
    sales: money(m.revenue),
    cost: money(m.cost),
    profit: money(m.profit),
    margin: m.marginPercent === null ? "—" : percent(m.marginPercent),
  }));
  return (
    <div className="grid items-start gap-4 @5xl:grid-cols-2">
      <div className="@5xl:col-span-2">
        <ChartCard
          title="Sales and what making them cost"
          subtitle="The last 12 months: the gap between the two is the gross profit"
          legend={[
            { label: "Sales", color: SERIES[0] },
            { label: "Production cost", color: SERIES[1] },
          ]}
          empty={sold ? null : "Nothing invoiced in the last 12 months."}
          table={{
            columns: [
              { key: "month", label: "Month" },
              { key: "sales", label: "Sales", align: "right" },
              { key: "cost", label: "Cost", align: "right" },
              { key: "profit", label: "Profit", align: "right" },
              { key: "margin", label: "Margin", align: "right" },
            ],
            rows: monthRows,
          }}
        >
          {(w) => (
            <GroupedColumns
              width={w}
              data={months.map((m, i) => ({ key: m.month, label: monthLabel(m.month, i === 0), values: [m.revenue, m.cost] }))}
              series={[
                { label: "Sales", color: SERIES[0] },
                { label: "Production cost", color: SERIES[1] },
              ]}
              format={money}
              axisFormat={compactNumber}
              extra={(i) => [
                { label: "Gross profit", value: money(months[i].profit) },
                { label: "Margin", value: months[i].marginPercent === null ? "—" : percent(months[i].marginPercent) },
              ]}
            />
          )}
        </ChartCard>
      </div>
      <ChartCard
        title="Margin by month"
        subtitle="Of every shilling of sales, what's left after making it"
        empty={sold ? null : "Nothing invoiced in the last 12 months."}
        table={{ columns: [{ key: "month", label: "Month" }, { key: "margin", label: "Margin", align: "right" }], rows: monthRows }}
      >
        {(w) => (
          <TimeLines
            width={w}
            series={[
              {
                label: "Margin",
                color: SERIES[0],
                points: months.filter((m) => m.marginPercent !== null).map((m) => ({ date: monthDate(m.month), value: m.marginPercent as number })),
              },
            ]}
            format={percent}
            axisFormat={(n) => `${n}%`}
            dateLabel={(d) => monthLabel(d.toISOString().slice(0, 7))}
          />
        )}
      </ChartCard>
      <ChartCard
        title="Product map"
        subtitle="Sales against margin in this period; a bubble's size is the units sold. The lines are the middle sales and the overall margin."
        empty={mapped.length >= 2 ? null : "Give at least two selling products a recipe to compare them here."}
        table={{
          columns: [
            { key: "name", label: "Product" },
            { key: "sales", label: "Sales", align: "right" },
            { key: "margin", label: "Margin", align: "right" },
            { key: "units", label: "Units", align: "right" },
          ],
          rows: mapped.map((p) => ({ name: p.name, sales: money(p.revenue), margin: percent(p.marginPercent as number), units: p.units })),
        }}
      >
        {(w) => (
          <BubbleMap
            width={w}
            points={mapped.map((p) => ({ key: p.key, label: p.name, x: p.revenue, y: p.marginPercent as number, size: p.units }))}
            xLabel="Sales"
            yLabel="Margin"
            xFormat={compactNumber}
            yFormat={(n) => `${Math.round(n)}%`}
            sizeLabel={(n) => `${n} sold`}
            guides={{ x: median(mapped.map((p) => p.revenue)), y: figures.marginPercent ?? 0 }}
            quadrants={["Stars: keep them selling", "Earn well, sell little: promote", "Sell well, earn little: check prices", "Neither: rethink"]}
          />
        )}
      </ChartCard>
      <div className="@5xl:col-span-2">
        <ChartCard
          title="Where the sales come from"
          subtitle="This period, by category and product: a tile's size is its sales, its shade the margin (pale earns little)"
          empty={categories.length ? null : "Nothing invoiced in this period."}
          table={{
            columns: [
              { key: "category", label: "Category" },
              { key: "name", label: "Product" },
              { key: "sales", label: "Sales", align: "right" },
              { key: "margin", label: "Margin", align: "right" },
            ],
            rows: categories.flatMap((c) =>
              c.products.map((p) => ({ category: c.name, name: p.name, sales: money(p.revenue), margin: p.marginPercent === null ? "no recipe" : percent(p.marginPercent) })),
            ),
          }}
        >
          {(w) => (
            <>
              <Treemap
                width={w}
                groups={categories.map((c) => ({ key: c.name, label: c.name, items: c.products.map((p) => ({ key: p.key, label: p.name, value: p.revenue, shade: p.marginPercent })) }))}
                format={money}
                shadeOf={(m) => m / 100}
                shadeLabel={(m) => (m === null ? "no recipe: margin unknown" : `${percent(m)} margin`)}
              />
              <ShadeLegend low="Low margin" high="High margin" none="No recipe" />
            </>
          )}
        </ChartCard>
      </div>
      <div className="@5xl:col-span-2">
        <ChartCard
          title="Sales by day"
          subtitle="The last 12 months, one square a day, by invoice date: busy seasons and quiet weeks"
          empty={days.length ? null : "Nothing invoiced in the last 12 months."}
          table={{
            columns: [
              { key: "date", label: "Day" },
              { key: "sales", label: "Sales", align: "right" },
            ],
            rows: [...days].reverse().map((d) => ({ date: d.date, sales: money(d.revenue) })),
          }}
        >
          {(w) => <CalendarHeat width={w} from={`${months[0]?.month}-01`} to={calendarTo} values={dayValues} format={money} />}
        </ChartCard>
      </div>
    </div>
  );
}
