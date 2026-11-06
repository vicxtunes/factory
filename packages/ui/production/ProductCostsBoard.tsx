"use client";

// Production → Product costs: each product size's cost at today's material
// costs (from its recipe), its catalog price, the profit and the margin. A
// photo book shows its cost with no sheets and what each sheet adds, and how
// it's priced (the catalog's, from the margin, or from its materials). Cards on
// a phone, aligned rows from the container's 3xl; tap a product for how it's
// doing (or, with no recipe yet, to write one).

import Link from "next/link";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import type { ProductCost } from "@repo/lib/production/core";

import { MarginSheet } from "./costing";
import { Tile } from "./MaterialsBoard";

export const pct = (m: number) => `${Math.round(m * 1000) / 10}%`;

/** "From the margin (40%)", "From its materials", "Catalog price". */
export function pricingText(p: Pick<ProductCost, "isPhotoBook" | "autoPrice" | "margin">): string {
  if (p.autoPrice === "margin") return `From the margin (${pct(p.margin ?? 0)})`;
  if (p.autoPrice === "materials") return "From its materials";
  return "Catalog price";
}

export function ProductCostsBoard({ products, basePath, margin, setsPrices }: { products: ProductCost[]; basePath: string; margin: number; setsPrices: boolean }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [marginOpen, setMarginOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const shown = products.filter((p) => (!missingOnly || !p.hasRecipe) && (!q || `${p.name} ${p.categoryName}`.toLowerCase().includes(q)));
  const withRecipe = products.filter((p) => p.hasRecipe).length;
  const margins = products.flatMap((p) => p.rows.flatMap((r) => (r.margin ? [r.margin.percent] : [])));
  const atLoss = products.flatMap((p) => p.rows.filter((r) => r.margin && r.margin.profit < 0)).length;

  type Row = ProductCost["rows"][number];
  const costText = (p: ProductCost, r: Row) => `${money(r.cost)}${p.isPhotoBook && r.perSheet ? ` + ${money(r.perSheet)} per sheet` : ""}`;
  const priceText = (p: ProductCost, r: Row) => (p.isPhotoBook && p.autoPrice ? pricingText(p) : r.price !== null ? money(r.price) : "priced on call");
  const marginText = (r: Row) =>
    r.margin ? (
      <span className={r.margin.profit < 0 ? "text-error-600 dark:text-error-400" : r.margin.percent < 25 ? "text-warning-600 dark:text-warning-500" : "text-success-600 dark:text-success-500"}>
        {r.margin.percent}%
      </span>
    ) : (
      <span className="text-muted">—</span>
    );

  // Products by category, in catalog order.
  const categories = [...new Set(shown.map((p) => p.categoryName))];

  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <Tile label="Products with a recipe" value={`${withRecipe} of ${products.length}`} wide />
        <Tile label="Average margin" value={margins.length ? `${Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10}%` : "—"} />
        <Tile label="Sold at a loss" value={String(atLoss)} tone={atLoss ? "error" : undefined} />
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-bold tnum @2xl:text-2xl">{pct(margin)}</p>
            {setsPrices ? (
              <Button type="button" variant="secondary" className="min-h-8 text-xs" onClick={() => setMarginOpen(true)}>
                Change
              </Button>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">Photo book margin</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center">
        <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="@2xl:max-w-xs" />
        <label className="flex min-h-11 items-center gap-2 text-sm @2xl:ml-auto">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="size-4 accent-brand-500" />
          Only those with no recipe ({products.length - withRecipe})
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
                  <Link href={`${basePath}/${p.productId}${p.hasRecipe ? "" : "/setup"}`} className="block p-4 hover:bg-gray-50 active:bg-gray-50 dark:hover:bg-white/5 dark:active:bg-white/5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-medium">{p.name}</p>
                      {p.hasRecipe ? (
                        <span className="shrink-0 text-xs text-muted">{pricingText(p)} · How it&apos;s doing →</span>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-brand-600">Write its recipe →</span>
                      )}
                    </div>
                    {p.hasRecipe ? (
                      <div className="mt-2 grid gap-1">
                        {/* Wider: one aligned row per size. */}
                        <div className="hidden grid-cols-[1fr_15rem_13rem_7rem_6rem] gap-3 text-[0.7rem] font-semibold uppercase tracking-wide text-muted @3xl:grid">
                          <span>Size</span>
                          <span className="text-right">Cost</span>
                          <span className="text-right">Price</span>
                          <span className="text-right">Profit</span>
                          <span className="text-right">Margin</span>
                        </div>
                        {p.rows.map((r) => (
                          <div key={r.size ?? "each"} className="grid grid-cols-[1fr_auto] gap-x-3 text-sm @3xl:grid-cols-[1fr_15rem_13rem_7rem_6rem]">
                            <span className="truncate text-muted @3xl:text-foreground">
                              {r.size ?? "Each"}
                              {r.missing.length ? <span className="ml-2 text-xs text-warning-600 dark:text-warning-500">cost short: no {r.missing.join(", no ")}</span> : null}
                            </span>
                            <span className="text-right tnum @3xl:order-last">{marginText(r)}</span>
                            <span className="col-span-2 text-xs text-muted @3xl:col-span-1 @3xl:text-right @3xl:text-sm @3xl:text-foreground tnum">
                              <span className="@3xl:hidden">Costs </span>
                              {costText(p, r)}
                              <span className="@3xl:hidden"> · {priceText(p, r)}</span>
                            </span>
                            <span className="hidden text-right tnum @3xl:block">{priceText(p, r)}</span>
                            <span className="hidden text-right tnum @3xl:block">{r.margin ? money(r.margin.profit) : "—"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted">No recipe yet: list what it&apos;s made of to see its cost and margin.</p>
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {setsPrices ? <MarginSheet key={marginOpen ? "open" : "closed"} open={marginOpen} onClose={() => setMarginOpen(false)} margin={margin} /> : null}
    </div>
  );
}
