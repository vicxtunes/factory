"use client";

// Production → Materials: what products are made of, cost only, and (for
// photo books priced from their materials) a selling price. A material costs
// one amount, an amount for each size, or is built from other materials. Cards
// on a phone, a table from the container's 3xl; tap one to edit it in a form
// sheet.

import { useMemo, useState } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { Costing, fromPlainCostBook, type CostMaterial, type PlainCostBook } from "@repo/lib/production/core";

import { COST_BY_LABELS, MaterialSheet } from "./costing";

/** A material's cost, or each size's ("12x12 3,000 · 10x10 2,500"); sizes with a cost short are left out. */
export function costSummary(costing: Costing, m: CostMaterial, sizes: string[], money: (n: number) => string): string {
  const any = costing.rate(m, "");
  if (m.costBy === "one" || (m.costBy === "parts" && !any.missing)) return `${money(any.rate)} per ${m.unit}`;
  const known = sizes.flatMap((s) => {
    const r = costing.rate(m, s);
    return r.missing ? [] : [`${s} ${money(r.rate)}`];
  });
  return known.length ? known.join(" · ") : "not set";
}

function sellSummary(m: CostMaterial, money: (n: number) => string): string {
  const sizes = Object.entries(m.sizeSells);
  if (sizes.length) return sizes.map(([s, v]) => `${s} ${money(v)}`).join(" · ");
  return m.sellPrice === null ? "—" : money(m.sellPrice);
}

export function MaterialsBoard({ book: plain, sizes, setsPrices }: { book: PlainCostBook; sizes: string[]; setsPrices: boolean }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const costing = useMemo(() => new Costing(fromPlainCostBook(plain)), [plain]);
  const materials = plain.materials;
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  /** The material being edited; "new" to add one. */
  const [editing, setEditing] = useState<CostMaterial | "new" | null>(null);

  const productName = (id: string) => plain.products.find((p) => p.id === id)?.name ?? "a product";
  const uses = (m: CostMaterial) => {
    const u = costing.usedBy(m.id);
    return [...u.products.map(productName), ...u.materials.map((id) => costing.material(id)?.name ?? "a material")];
  };
  const q = query.trim().toLowerCase();
  const shown = materials.filter((m) => (showInactive || m.active) && (!q || m.name.toLowerCase().includes(q)));
  const inactive = materials.filter((m) => !m.active).length;

  const columns: DataTableColumn<CostMaterial>[] = [
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
    { key: "kind", header: "Cost", render: (m) => COST_BY_LABELS[m.costBy] },
    { key: "cost", header: "Costs us", align: "right", render: (m) => costSummary(costing, m, sizes, money) },
    ...(setsPrices ? [{ key: "sell", header: "Sells at", align: "right" as const, render: (m: CostMaterial) => sellSummary(m, money) }] : []),
    {
      key: "used",
      header: "Used in",
      render: (m) => {
        const u = uses(m);
        return u.length ? <span className="text-muted">{u.length > 2 ? `${u.slice(0, 2).join(", ")} +${u.length - 2}` : u.join(", ")}</span> : <span className="text-muted">nothing yet</span>;
      },
    },
  ];

  return (
    <div className="@container space-y-4">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center">
        <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search materials" className="@2xl:max-w-xs" />
        <Button type="button" className="@2xl:ml-auto" onClick={() => setEditing("new")}>
          Add material
        </Button>
      </div>

      {materials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No materials yet. Add what products are made of (paper, printing, wood, cloth), then what&apos;s built from them (a cover).
        </div>
      ) : (
        <>
          {/* Phones: one card per material. */}
          <ul className="space-y-2 @3xl:hidden">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  className="block w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs active:bg-gray-50 dark:active:bg-white/5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="shrink-0 text-xs text-muted">{COST_BY_LABELS[m.costBy]}</p>
                  </div>
                  <p className="mt-1 text-sm tnum">{costSummary(costing, m, sizes, money)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {setsPrices && sellSummary(m, money) !== "—" ? `Sells at ${sellSummary(m, money)} · ` : ""}
                    {uses(m).length ? `In ${uses(m).join(", ")}` : "Not used yet"}
                    {m.active ? "" : " · not in use"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <DataTable className="hidden @3xl:block" columns={columns} rows={shown} rowKey={(m) => m.id} onRowClick={(m) => setEditing(m)} emptyMessage="No material matches." />
          {shown.length === 0 ? <p className="text-center text-sm text-muted @3xl:hidden">No material matches.</p> : null}
          {inactive ? (
            <button type="button" onClick={() => setShowInactive((v) => !v)} className="text-sm font-medium text-brand-600 hover:underline">
              {showInactive ? "Hide" : "Show"} {inactive} not in use
            </button>
          ) : null}
        </>
      )}

      <MaterialSheet
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        open={editing !== null}
        onClose={() => setEditing(null)}
        material={editing === "new" ? null : editing}
        materials={materials}
        sizes={sizes}
        setsPrices={setsPrices}
        inUse={editing !== null && editing !== "new" && uses(editing).length > 0}
      />
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
