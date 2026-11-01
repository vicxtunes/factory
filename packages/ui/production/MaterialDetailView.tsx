"use client";

// One material: its stock, price and value, what's been bought (each can be
// voided with a reason), and every movement of its stock. Phones stack it;
// from lg the purchases and the history sit side by side.

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { voidPurchase } from "@repo/lib/production/actions";
import { KIND_LABELS, MOVEMENT_LABELS, PAID_FROM_LABELS, formatQty, formatUnitCost, type MaterialDetail, type MaterialPurchase } from "@repo/lib/production/core";

import { Tile } from "./MaterialsBoard";
import { MaterialSheet, PurchaseSheet, StockCountSheet, VoidSheet } from "./sheets";

/** A calendar date ("28 Nov 2026"), the same on the server and in the browser. */
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function MaterialDetailView({ detail, today }: { detail: MaterialDetail; today: string }) {
  const { material, movements, purchases } = detail;
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [sheet, setSheet] = useState<"edit" | "purchase" | "count" | null>(null);
  const [voiding, setVoiding] = useState<MaterialPurchase | null>(null);

  return (
    <div className="@container space-y-6">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{material.name}</h2>
          <p className="text-sm text-muted">
            {KIND_LABELS[material.kind]} · counted in {material.unit}
            {material.active ? "" : " · not in use"}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 @2xl:flex">
          <Button type="button" variant="secondary" size="sm" onClick={() => setSheet("edit")}>
            Edit
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSheet("count")}>
            Stock count
          </Button>
          <Button type="button" size="sm" onClick={() => setSheet("purchase")} disabled={!material.active}>
            Record purchase
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="In stock" value={`${formatQty(material.stock)} ${material.unit}`} tone={material.stock < 0 ? "error" : undefined} />
        <Tile label={`Price per ${material.unit}`} value={formatUnitCost(material.unitCost, symbol)} />
        <Tile label="Value" value={money(material.stockValue)} />
      </div>
      {material.stock < 0 ? (
        <p className="text-sm text-error-600 dark:text-error-400">
          More has been used than bought: a purchase hasn&apos;t been recorded yet, or the stock needs counting.
        </p>
      ) : null}

      <div className="grid gap-6 @5xl:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Purchases</h3>
          {purchases.length === 0 ? (
            <p className="text-sm text-muted">Nothing bought yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
              {purchases.map((p) => (
                <li key={p.id} className={`flex items-start justify-between gap-3 p-4 ${p.voidedAt ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className={`font-medium tnum ${p.voidedAt ? "line-through" : ""}`}>
                      {formatQty(p.qty)} {material.unit} for {money(p.total)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {day(p.purchasedOn)} · {formatUnitCost(p.unitCost, symbol)} each · {PAID_FROM_LABELS[p.paidFrom]}
                      {p.supplier ? ` · ${p.supplier}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                    {p.voidedAt ? <p className="mt-0.5 text-xs text-error-600 dark:text-error-400">Void: {p.voidReason}</p> : null}
                    {p.note ? <p className="mt-0.5 text-xs text-muted">{p.note}</p> : null}
                  </div>
                  {p.voidedAt ? null : (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(p)}>
                      Void
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Stock history</h3>
          {movements.length === 0 ? (
            <p className="text-sm text-muted">No movements yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
              {movements.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{MOVEMENT_LABELS[m.kind]}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {day(m.occurredOn)} · {m.actorName}
                      {m.reason ? ` · ${m.reason}` : ""}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold tnum ${m.qty < 0 ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-500"}`}>
                    {m.qty > 0 ? "+" : ""}
                    {formatQty(m.qty)} {material.unit}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <MaterialSheet key={`edit-${sheet === "edit"}`} open={sheet === "edit"} onClose={() => setSheet(null)} material={material} />
      <PurchaseSheet open={sheet === "purchase"} onClose={() => setSheet(null)} materials={[material]} materialId={material.id} today={today} />
      <StockCountSheet open={sheet === "count"} onClose={() => setSheet(null)} material={material} />
      {voiding ? (
        <VoidSheet
          open
          onClose={() => setVoiding(null)}
          title="Void purchase"
          explain={`${formatQty(voiding.qty)} ${material.unit} for ${money(voiding.total)} on ${day(voiding.purchasedOn)}. It stays in the history, marked void: its stock comes back off, its expense stops counting, and if it was on credit, we no longer owe it.`}
          run={(reason) => voidPurchase({ id: voiding.id, reason })}
        />
      ) : null}
    </div>
  );
}
