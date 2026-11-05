"use client";

// Production → Product costs: each product size's cost at the latest prices
// paid, its price, the profit and the margin, from its setup. A product whose
// cost depends on a number (pages, sheets) shows it per one; priced by its
// parts, its margin is per one too. Cards on a phone, aligned rows from the
// container's 3xl; tap a product for how it's doing (or, not set up yet, to
// set it up).

import Link from "next/link";
import { useState } from "react";

import { TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { PRICING, formatUnitCost, type ProductCost } from "@repo/lib/production/core";

import { Tile } from "./MaterialsBoard";

export function ProductCostsBoard({ products, basePath }: { products: ProductCost[]; basePath: string }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);

  const q = query.trim().toLowerCase();
  const shown = products.filter((p) => (!missingOnly || !p.isSetUp) && (!q || `${p.name} ${p.categoryName}`.toLowerCase().includes(q)));
  const setUp = products.filter((p) => p.isSetUp).length;
  const margins = products.flatMap((p) => p.rows.flatMap((r) => (r.margin ? [r.margin.percent] : [])));
  const lowLoss = products.flatMap((p) => p.rows.filter((r) => r.margin && r.margin.profit < 0)).length;

  type Row = ProductCost["rows"][number];
  const per = (name: string) => `per ${name.replace(/\s*\(.*\)\s*$/, "").toLowerCase().replace(/s$/, "")}`;
  const costText = (r: Row) => `${r.cost || !r.perDetail.length ? money(r.cost) : ""}${r.perDetail.map((d) => `${r.cost ? " + " : ""}${formatUnitCost(d.cost, symbol)} ${per(d.name)}`).join("")}`;
  const priceText = (r: Row) =>
    r.perDetail.length && r.perDetail.some((d) => d.price > 0)
      ? r.perDetail.map((d) => `${formatUnitCost(d.price, symbol)} ${per(d.name)}`).join(" + ") + (r.price ? ` + ${money(r.price)}` : "")
      : r.price !== null
        ? money(r.price)
        : "—";
  const marginText = (r: Row) =>
    r.margin ? (
      <span className={r.margin.profit < 0 ? "text-error-600 dark:text-error-400" : r.margin.percent < 20 ? "text-warning-600 dark:text-warning-500" : "text-success-600 dark:text-success-500"}>
        {r.margin.percent}%{r.margin.per ? ` ${per(r.margin.per)}` : ""}
      </span>
    ) : (
      <span className="text-muted">{r.price === null && !r.perDetail.length ? "priced on call" : r.perDetail.length ? `by ${r.perDetail[0].name.replace(/\s*\(.*\)\s*$/, "").toLowerCase()}` : "—"}</span>
    );

  // Products by category, in catalog order.
  const categories = [...new Set(shown.map((p) => p.categoryName))];

  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        <Tile label="Products set up" value={`${setUp} of ${products.length}`} wide />
        <Tile label="Average margin" value={margins.length ? `${Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10}%` : "—"} />
        <Tile label="Sold at a loss" value={String(lowLoss)} tone={lowLoss ? "error" : undefined} />
      </div>

      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center">
        <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="@2xl:max-w-xs" />
        <label className="flex min-h-11 items-center gap-2 text-sm @2xl:ml-auto">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="size-4 accent-brand-500" />
          Only those not set up ({products.length - setUp})
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
                  <Link href={`${basePath}/${p.productId}${p.isSetUp ? "" : "/setup"}`} className="block p-4 hover:bg-gray-50 active:bg-gray-50 dark:hover:bg-white/5 dark:active:bg-white/5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-medium">{p.name}</p>
                      {p.isSetUp ? (
                        <span className="shrink-0 text-xs text-muted">{PRICING[p.pricing].label} · How it&apos;s doing →</span>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-brand-600">Set it up →</span>
                      )}
                    </div>
                    {p.isSetUp ? (
                      <div className="mt-2 grid gap-1">
                        {/* Wider: one aligned row per size. */}
                        <div className="hidden grid-cols-[1fr_15rem_15rem_7rem_8rem] gap-3 text-[0.7rem] font-semibold uppercase tracking-wide text-muted @3xl:grid">
                          <span>Size</span>
                          <span className="text-right">Cost</span>
                          <span className="text-right">Price</span>
                          <span className="text-right">Profit</span>
                          <span className="text-right">Margin</span>
                        </div>
                        {p.rows.map((r) => (
                          <div key={r.key} className="grid grid-cols-[1fr_auto] gap-x-3 text-sm @3xl:grid-cols-[1fr_15rem_15rem_7rem_8rem]">
                            <span className="truncate text-muted @3xl:text-foreground">
                              {r.name ?? "Each"}
                              {r.unpriced.length ? <span className="ml-2 text-xs text-warning-600 dark:text-warning-500">cost short: {r.unpriced.length} not bought yet</span> : null}
                            </span>
                            <span className="text-right tnum @3xl:order-last">{marginText(r)}</span>
                            <span className="col-span-2 text-xs text-muted @3xl:col-span-1 @3xl:text-right @3xl:text-sm @3xl:text-foreground tnum">
                              <span className="@3xl:hidden">Costs </span>
                              {costText(r)}
                              <span className="@3xl:hidden">{priceText(r) !== "—" ? ` · sells at ${priceText(r)}` : ""}</span>
                            </span>
                            <span className="hidden text-right tnum @3xl:block">{priceText(r)}</span>
                            <span className="hidden text-right tnum @3xl:block">{r.margin ? `${money(r.margin.profit)}${r.margin.per ? ` ${per(r.margin.per)}` : ""}` : "—"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted">Not set up yet: list what it&apos;s made of to see its cost and margin.</p>
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
