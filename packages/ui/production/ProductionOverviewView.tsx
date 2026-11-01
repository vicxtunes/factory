"use client";

// Production → Overview: for a period, what making what was sold cost, the
// gross profit and margin (each against the period before), and how the cost
// is known (recorded usage, recipe estimates, or no recipe at all); the
// products by profit, with Excel/PDF export; materials used and wastage by
// material; and the stock's value now. Lays out by its own width.

import { useState } from "react";

import { ExportButtons } from "@repo/ui/ExportButtons";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { formatQty, type MaterialFigure } from "@repo/lib/production/core";
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

export function ProductionOverviewView({ view }: { view: ProductionOverview }) {
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
    profit: p.profit,
    margin: p.marginPercent === null ? "" : `${p.marginPercent}%`,
    costFrom: p.noRecipe ? "no recipe" : p.estimated ? "partly recipe estimate" : "recorded usage",
  }));

  return (
    <div className="@container space-y-6">
      <PeriodPicker period={view.period} />

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 @4xl:mx-0 @4xl:grid @4xl:grid-cols-2 @7xl:grid-cols-4 @4xl:overflow-visible @4xl:px-0">
        <Card tone="brand" title="Gross profit" value={money(f.profit)} delta={change(f.profit, before?.profit)} hint={`on ${money(f.revenue)} of sales`} />
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
              ; {money(f.revenueWithoutRecipe)} of sales have no recipe, so their cost isn&apos;t counted and the profit reads high
            </span>
          ) : null}
          .
        </p>
      ) : null}

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
                  {p.name}
                  {p.noRecipe ? <span className="ml-2 text-xs font-normal text-warning-600 dark:text-warning-500">no recipe</span> : p.estimated ? <span className="ml-2 text-xs font-normal text-muted">estimated</span> : null}
                </span>
                <span className={`text-right font-semibold tnum @3xl:order-last @3xl:font-normal ${p.profit < 0 ? "text-error-600 dark:text-error-400" : ""}`}>
                  {p.marginPercent === null ? "—" : `${p.marginPercent}%`}
                </span>
                <span className="col-span-2 text-xs text-muted tnum @3xl:col-span-1 @3xl:text-right @3xl:text-sm @3xl:text-foreground">
                  <span className="@3xl:hidden">{p.units} sold · {money(p.revenue)} sales · {money(p.cost)} cost · {money(p.profit)} profit</span>
                  <span className="hidden @3xl:inline">{p.units}</span>
                </span>
                <span className="hidden text-right tnum @3xl:block">{money(p.revenue)}</span>
                <span className="hidden text-right tnum @3xl:block">{money(p.cost)}</span>
                <span className={`hidden text-right tnum @3xl:block ${p.profit < 0 ? "text-error-600 dark:text-error-400" : ""}`}>{money(p.profit)}</span>
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

      <div className="grid gap-6 @4xl:grid-cols-2">
        <MaterialList
          title="Wastage by material"
          hint={wasted ? `${money(wasted)} used beyond the recipes, from recorded usage.` : "Recorded usage matched the recipes."}
          rows={wastage}
          money={money}
          tone
        />
        <MaterialList title="Materials used" hint="Taken off stock by recorded production." rows={materialsUsed.now} money={money} />
      </div>
    </div>
  );
}

function MaterialList({ title, hint, rows, money, tone }: { title: string; hint: string; rows: MaterialFigure[]; money: (n: number) => string; tone?: boolean }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted">{hint}</p>
      {rows.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
          {rows.map((m) => (
            <li key={m.materialId} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">{m.name}</span>
              <span className="shrink-0 text-xs text-muted tnum">
                {tone && m.qty > 0 ? "+" : ""}
                {formatQty(m.qty)} {m.unit}
              </span>
              <span className={`w-28 shrink-0 text-right font-medium tnum ${tone && m.value > 0 ? "text-error-600 dark:text-error-400" : tone && m.value < 0 ? "text-success-600 dark:text-success-500" : ""}`}>
                {money(m.value)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
