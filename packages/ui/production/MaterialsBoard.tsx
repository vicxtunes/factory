"use client";

// Production → Parts: everything production buys or makes. Bought parts with
// their stock, price and value; made parts with what one costs from its parts.
// Tabs split them; cards on a phone, a table from the container's 3xl; tap one
// for its page. Below-zero stock (usage recorded before the purchase) shows in red.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { TextInput } from "@repo/ui/Field";
import { Tabs } from "@repo/ui/Tabs";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { KIND_LABELS, formatQty, formatUnitCost, type Material } from "@repo/lib/production/core";

import { MaterialSheet, PurchaseSheet } from "./sheets";

const stockTone = (m: Material) => (m.stock < 0 ? "text-error-600 dark:text-error-400" : m.stock === 0 ? "text-muted" : "");

type View = "all" | "bought" | "made";

export function MaterialsBoard({
  materials,
  today,
  basePath,
  madeCosts,
  productNames,
  products,
}: {
  materials: Material[];
  today: string;
  basePath: string;
  /** One made part's cost from its parts, by its id. */
  madeCosts: Record<string, number>;
  /** Product names by id, for parts only one product uses. */
  productNames: Record<string, string>;
  /** The catalog, for a part that's also sold on its own. */
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sheet, setSheet] = useState<"add" | "purchase" | null>(null);
  const [view, setView] = useState<View>("all");

  const q = query.trim().toLowerCase();
  const inView = materials.filter((m) => view === "all" || (view === "made") === m.made);
  const shown = inView.filter((m) => (showInactive || m.active) && (!q || m.name.toLowerCase().includes(q)));
  const inactive = inView.filter((m) => !m.active).length;
  const value = materials.reduce((sum, m) => sum + Math.max(m.stockValue, 0), 0);
  const belowZero = materials.filter((m) => m.active && !m.made && m.stock < 0).length;
  const bought = materials.filter((m) => !m.made);
  const count = (made: boolean) => materials.filter((m) => m.active && m.made === made).length;

  const owner = (m: Material) => (m.ownerProductId ? `only ${productNames[m.ownerProductId] ?? "one product"}` : null);
  const sold = (m: Material) => (m.productName ? `sold as ${m.productName}` : null);
  const notes = (m: Material) => [owner(m), sold(m), m.active ? null : "not in use"].filter(Boolean).join(" · ");

  const clientText = (m: Material) => {
    const own = m.productId ? m.productPrice : m.clientPrice;
    return own === null ? <span className="text-muted">{m.made ? "from its parts" : "—"}</span> : money(own);
  };

  const columns: DataTableColumn<Material>[] = [
    {
      key: "name",
      header: "Part",
      render: (m) => (
        <span className="font-medium">
          {m.name}
          {notes(m) ? <span className="ml-2 text-xs font-normal text-muted">{notes(m)}</span> : null}
        </span>
      ),
    },
    { key: "kind", header: "Kind", render: (m) => `${m.made ? "Made" : "Bought"} · ${KIND_LABELS[m.kind]}` },
    { key: "stock", header: "Stock", align: "right", render: (m) => (m.made ? <span className="text-muted">made to order</span> : <span className={stockTone(m)}>{`${formatQty(m.stock)} ${m.unit}`}</span>) },
    { key: "price", header: "Costs us per unit", align: "right", render: (m) => formatUnitCost(m.made ? (madeCosts[m.id] ?? 0) : m.unitCost, symbol) },
    { key: "client", header: "Client price", align: "right", render: (m) => clientText(m) },
    { key: "value", header: "Value", align: "right", render: (m) => (m.made ? "—" : money(m.stockValue)) },
  ];
  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        <Tile label="Stock value" value={money(value)} wide />
        <Tile label="Bought · made" value={`${count(false)} · ${count(true)}`} />
        {belowZero ? <Tile label="Below zero" value={String(belowZero)} tone="error" /> : null}
      </div>

      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center">
        <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search materials" className="@2xl:max-w-xs" />
        <div className="flex gap-2 @2xl:ml-auto">
          <Button type="button" variant="secondary" className="flex-1 @2xl:flex-none" onClick={() => setSheet("add")}>
            Add part
          </Button>
          <Button type="button" className="flex-1 @2xl:flex-none" onClick={() => setSheet("purchase")} disabled={bought.length === 0}>
            Record purchase
          </Button>
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No parts yet. Add what you buy (PVC, paper, ink, film, boxes), then what you make from them (a sheet, a cover).
        </div>
      ) : (
        <>
          <Tabs
            label="Parts"
            value={view}
            onChange={setView}
            tabs={[
              { key: "all", label: "All", count: materials.filter((m) => m.active).length },
              { key: "bought", label: "Bought", count: count(false) },
              { key: "made", label: "Made", count: count(true) },
            ]}
          />
          {/* Phones: one card per part. */}
          <ul className="space-y-2 @3xl:hidden">
            {shown.map((m) => (
              <li key={m.id}>
                <Link href={`${basePath}/${m.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-theme-xs active:bg-gray-50 dark:active:bg-white/5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium">{m.name}</p>
                    {m.made ? (
                      <p className="shrink-0 text-sm font-semibold tnum">{formatUnitCost(madeCosts[m.id] ?? 0, symbol)}</p>
                    ) : (
                      <p className={`shrink-0 text-sm font-semibold tnum ${stockTone(m)}`}>
                        {formatQty(m.stock)} {m.unit}
                      </p>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {m.made ? "Made" : `${formatUnitCost(m.unitCost, symbol)} per ${m.unit} · ${money(m.stockValue)}`} · {KIND_LABELS[m.kind]}
                    {notes(m) ? ` · ${notes(m)}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <DataTable className="hidden @3xl:block" columns={columns} rows={shown} rowKey={(m) => m.id} onRowClick={(m) => router.push(`${basePath}/${m.id}`)} emptyMessage="No part matches." />
          {shown.length === 0 ? <p className="text-center text-sm text-muted @3xl:hidden">No part matches.</p> : null}
          {inactive ? (
            <button type="button" onClick={() => setShowInactive((v) => !v)} className="text-sm font-medium text-brand-600 hover:underline">
              {showInactive ? "Hide" : "Show"} {inactive} not in use
            </button>
          ) : null}
        </>
      )}

      <MaterialSheet
        key={sheet === "add" ? "open" : "closed"}
        open={sheet === "add"}
        onClose={() => setSheet(null)}
        products={products}
        onAdded={(id) => router.push(`${basePath}/${id}`)}
      />
      <PurchaseSheet open={sheet === "purchase"} onClose={() => setSheet(null)} materials={bought} today={today} />
    </div>
  );
}

/** `wide`: the row's headline figure, the full width on a phone so it never wraps. */
export function Tile({ label, value, tone, wide }: { label: string; value: string; tone?: "error"; wide?: boolean }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-4 shadow-theme-xs ${wide ? "col-span-2 @2xl:col-span-1" : ""}`}>
      <p className={`text-lg font-bold tnum @2xl:text-2xl ${tone === "error" ? "text-error-600 dark:text-error-400" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}
