"use client";

// Production → Product costs: what each product size costs to make at today's
// material prices, its selling price, the profit and the margin. Products
// whose cost depends on a detail (pages) show the cost per page instead of a
// margin. Cards on a phone, a table from the container's 3xl; tap a product
// for how it's doing (or, without a recipe yet, to add one).

import Link from "next/link";
import { useState } from "react";

import { TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { formatUnitCost, type ProductCost, type SizeCost } from "@repo/lib/production/core";

import { Tile } from "./MaterialsBoard";

export function ProductCostsBoard({ products, basePath }: { products: ProductCost[]; basePath: string }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);

  const q = query.trim().toLowerCase();
  const shown = products.filter((p) => (!missingOnly || !p.hasRecipe) && (!q || `${p.name} ${p.categoryName}`.toLowerCase().includes(q)));
  const withRecipe = products.filter((p) => p.hasRecipe).length;
  const margins = products.flatMap((p) => p.sizes.flatMap((s) => (s.margin ? [s.margin.percent] : [])));
  const lowLoss = products.flatMap((p) => p.sizes.filter((s) => s.margin && s.margin.profit < 0)).length;

  const costText = (s: SizeCost) => {
    const per = s.perDetail.map((d) => ` + ${formatUnitCost(d.perOne, symbol)} per ${d.name.toLowerCase().replace(/s$/, "")}`).join("");
    return `${money(s.cost.fixed)}${per}`;
  };
  const marginText = (s: SizeCost) =>
    s.margin ? (
      <span className={s.margin.profit < 0 ? "text-error-600 dark:text-error-400" : s.margin.percent < 20 ? "text-warning-600 dark:text-warning-500" : "text-success-600 dark:text-success-500"}>
        {s.margin.percent}%
      </span>
    ) : (
      <span className="text-muted">{s.price === null ? "priced on call" : s.perDetail.length ? `by ${s.perDetail[0].name.toLowerCase()}` : "—"}</span>
    );

  // Products by category, in catalog order.
  const categories = [...new Set(shown.map((p) => p.categoryName))];

  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        <Tile label="Products with a recipe" value={`${withRecipe} of ${products.length}`} wide />
        <Tile label="Average margin" value={margins.length ? `${Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10}%` : "—"} />
        <Tile label="Sold at a loss" value={String(lowLoss)} tone={lowLoss ? "error" : undefined} />
      </div>

      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center">
        <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="@2xl:max-w-xs" />
        <label className="flex min-h-11 items-center gap-2 text-sm @2xl:ml-auto">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="size-4 accent-brand-500" />
          Only those without a recipe ({products.length - withRecipe})
        </label>
      </div>

      {shown.length === 0 ? <p className="text-center text-sm text-muted">No product matches.</p> : null}
      {categories.map((category) => (
        <section key={category} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{category}</h3>
          <ul className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
            {shown
              .filter((p) => p.categoryName === category)
              .map((p) => (
                <li key={p.productId} className="border-b border-border last:border-b-0">
                  <Link href={`${basePath}/${p.productId}${p.hasRecipe ? "" : "/recipe"}`} className="block p-4 hover:bg-gray-50 active:bg-gray-50 dark:hover:bg-white/5 dark:active:bg-white/5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-medium">{p.name}</p>
                      {p.hasRecipe ? <span className="shrink-0 text-xs text-muted">How it&apos;s doing →</span> : <span className="shrink-0 text-xs font-medium text-brand-600">Add a recipe →</span>}
                    </div>
                    {p.hasRecipe ? (
                      <div className="mt-2 grid gap-1">
                        {/* Wider: one aligned row per size. */}
                        <div className="hidden grid-cols-[1fr_15rem_repeat(2,7rem)_8rem] gap-3 text-[0.7rem] font-semibold uppercase tracking-wide text-muted @3xl:grid">
                          <span>Size</span>
                          <span className="text-right">Cost</span>
                          <span className="text-right">Price</span>
                          <span className="text-right">Profit</span>
                          <span className="text-right">Margin</span>
                        </div>
                        {p.sizes.map((s) => (
                          <div key={s.variantId ?? "one"} className="grid grid-cols-[1fr_auto] gap-x-3 text-sm @3xl:grid-cols-[1fr_15rem_repeat(2,7rem)_8rem]">
                            <span className="truncate text-muted @3xl:text-foreground">{s.name ?? "Each"}</span>
                            <span className="text-right tnum @3xl:order-last">{marginText(s)}</span>
                            <span className="col-span-2 text-xs text-muted @3xl:col-span-1 @3xl:text-right @3xl:text-sm @3xl:text-foreground tnum">
                              <span className="@3xl:hidden">Costs </span>
                              {costText(s)}
                              <span className="@3xl:hidden">{s.price !== null ? ` · sells at ${money(s.price)}` : ""}</span>
                            </span>
                            <span className="hidden text-right tnum @3xl:block">{s.price !== null ? money(s.price) : "—"}</span>
                            <span className="hidden text-right tnum @3xl:block">{s.margin ? money(s.margin.profit) : "—"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted">No recipe yet: list what one takes to see its cost and margin.</p>
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
