"use client";

// Production → Materials: every material with its stock, price and value.
// Cards on a phone, a table from md up; tap one for its history. Below-zero
// stock (usage recorded before the purchase) shows in red.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { KIND_LABELS, formatQty, formatUnitCost, type Material } from "@repo/lib/production/core";

import { MaterialSheet, PurchaseSheet } from "./sheets";

const stockTone = (m: Material) => (m.stock < 0 ? "text-error-600 dark:text-error-400" : m.stock === 0 ? "text-muted" : "");

export function MaterialsBoard({ materials, today, basePath }: { materials: Material[]; today: string; basePath: string }) {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sheet, setSheet] = useState<"add" | "purchase" | null>(null);

  const q = query.trim().toLowerCase();
  const shown = materials.filter((m) => (showInactive || m.active) && (!q || m.name.toLowerCase().includes(q)));
  const inactive = materials.filter((m) => !m.active).length;
  const value = materials.reduce((sum, m) => sum + Math.max(m.stockValue, 0), 0);
  const belowZero = materials.filter((m) => m.active && m.stock < 0).length;

  const columns: DataTableColumn<Material>[] = [
    {
      key: "name",
      header: "Material",
      render: (m) => (
        <span className="font-medium">
          {m.name}
          {m.active ? null : <span className="ml-2 text-xs font-normal text-muted">not in use</span>}
        </span>
      ),
    },
    { key: "kind", header: "Kind", render: (m) => KIND_LABELS[m.kind] },
    { key: "stock", header: "Stock", align: "right", render: (m) => <span className={stockTone(m)}>{`${formatQty(m.stock)} ${m.unit}`}</span> },
    { key: "price", header: "Price per unit", align: "right", render: (m) => formatUnitCost(m.unitCost, symbol) },
    { key: "value", header: "Value", align: "right", render: (m) => money(m.stockValue) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Stock value" value={money(value)} />
        <Tile label="Materials" value={String(materials.length - inactive)} />
        {belowZero ? <Tile label="Below zero" value={String(belowZero)} tone="error" /> : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search materials" className="sm:max-w-xs" />
        <div className="flex gap-2 sm:ml-auto">
          <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => setSheet("add")}>
            Add material
          </Button>
          <Button type="button" className="flex-1 sm:flex-none" onClick={() => setSheet("purchase")} disabled={materials.length === 0}>
            Record purchase
          </Button>
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No materials yet. Add the paper, covers, frames, boxes and other things production uses, then record what you buy.
        </div>
      ) : (
        <>
          {/* Phones: one card per material. */}
          <ul className="space-y-2 md:hidden">
            {shown.map((m) => (
              <li key={m.id}>
                <Link href={`${basePath}/${m.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-theme-xs active:bg-gray-50 dark:active:bg-white/5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className={`shrink-0 text-sm font-semibold tnum ${stockTone(m)}`}>
                      {formatQty(m.stock)} {m.unit}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {KIND_LABELS[m.kind]} · {formatUnitCost(m.unitCost, symbol)} per {m.unit} · {money(m.stockValue)}
                    {m.active ? "" : " · not in use"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <DataTable className="hidden md:block" columns={columns} rows={shown} rowKey={(m) => m.id} onRowClick={(m) => router.push(`${basePath}/${m.id}`)} emptyMessage="No material matches." />
          {shown.length === 0 ? <p className="text-center text-sm text-muted md:hidden">No material matches.</p> : null}
          {inactive ? (
            <button type="button" onClick={() => setShowInactive((v) => !v)} className="text-sm font-medium text-brand-600 hover:underline">
              {showInactive ? "Hide" : "Show"} {inactive} not in use
            </button>
          ) : null}
        </>
      )}

      <MaterialSheet key={sheet === "add" ? "open" : "closed"} open={sheet === "add"} onClose={() => setSheet(null)} />
      <PurchaseSheet open={sheet === "purchase"} onClose={() => setSheet(null)} materials={materials} today={today} />
    </div>
  );
}

export function Tile({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <p className={`text-xl font-bold tnum sm:text-2xl ${tone === "error" ? "text-error-600 dark:text-error-400" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}
