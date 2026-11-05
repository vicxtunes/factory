"use client";

// One material: its stock, price and value; its price at every purchase (a
// supplier raising prices shows here first) and its stock over time; what's
// been bought (each can be voided with a reason), and every movement of its
// stock. Phones stack it;
// from lg the purchases and the history sit side by side.

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { compactNumber, dayLabel } from "@repo/ui/charts/format";
import { ChartCard, SERIES, TimeLines } from "@repo/ui/charts/kit";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { voidPurchase } from "@repo/lib/production/actions";
import { KIND_LABELS, MOVEMENT_LABELS, PAID_FROM_LABELS, formatQty, formatUnitCost, type MaterialDetail, type MaterialPurchase } from "@repo/lib/production/core";

import { Tile } from "./MaterialsBoard";
import { MaterialSheet, PurchaseSheet, StockCountSheet, VoidSheet } from "./sheets";

/** A calendar date ("28 Nov 2026"), the same on the server and in the browser. */
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function MaterialDetailView({ detail, today, products }: { detail: MaterialDetail; today: string; products: { id: string; name: string }[] }) {
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
            Bought · {KIND_LABELS[material.kind]} · counted in {material.unit}
            {material.clientPrice !== null && !material.productId ? ` · client price ${money(material.clientPrice)}` : ""}
            {material.productName ? ` · sold as ${material.productName}` : ""}
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

      <MaterialCharts detail={detail} />

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

      <MaterialSheet key={`edit-${sheet === "edit"}`} open={sheet === "edit"} onClose={() => setSheet(null)} material={material} products={products} />
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

/** The price paid at each purchase, and the stock level after each movement. */
function MaterialCharts({ detail }: { detail: MaterialDetail }) {
  const symbol = useCurrencySymbol();
  const { material, movements, purchases } = detail;
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const prices = purchases
    .filter((p) => !p.voidedAt)
    .sort((a, b) => a.purchasedOn.localeCompare(b.purchasedOn) || a.createdAt.localeCompare(b.createdAt))
    .map((p) => ({ date: at(p.purchasedOn), value: p.unitCost }));
  // Walk back from today's stock through the movements (newest first) to get the level after each.
  const levels: { date: Date; value: number }[] = [];
  let level = material.stock;
  for (const m of movements) {
    levels.push({ date: at(m.occurredOn), value: Math.round(level * 1000) / 1000 });
    level -= m.qty;
  }
  // One point per day (the day's closing level), oldest first.
  const byDay = new Map<number, number>();
  for (const l of [...levels].reverse()) byDay.set(l.date.getTime(), l.value);
  const stock = [...byDay].map(([t, value]) => ({ date: new Date(t), value }));
  const change = prices.length >= 2 ? Math.round(((prices[prices.length - 1].value - prices[0].value) / prices[0].value) * 1000) / 10 : null;

  return (
    <div className="grid items-start gap-4 @5xl:grid-cols-2">
      <ChartCard
        title={`Price per ${material.unit}`}
        subtitle={change === null ? "At each purchase" : `At each purchase: ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% since the first`}
        empty={prices.length ? null : "Record a purchase to see its price."}
        table={{
          columns: [
            { key: "date", label: "Bought" },
            { key: "price", label: `Per ${material.unit}`, align: "right" },
          ],
          rows: [...prices].reverse().map((p) => ({ date: dayLabel(p.date), price: formatUnitCost(p.value, symbol) })),
        }}
      >
        {(w) => (
          <TimeLines
            width={w}
            height={180}
            step
            zeroBased={false}
            series={[{ label: `Per ${material.unit}`, color: SERIES[1], points: prices }]}
            format={(n) => formatUnitCost(n, symbol)}
            axisFormat={compactNumber}
            dateLabel={dayLabel}
          />
        )}
      </ChartCard>
      <ChartCard
        title="Stock"
        subtitle={`In ${material.unit}, after each day's movements`}
        empty={stock.length ? null : "No movements yet."}
        table={{
          columns: [
            { key: "date", label: "Day" },
            { key: "level", label: `Stock (${material.unit})`, align: "right" },
          ],
          rows: [...stock].reverse().map((l) => ({ date: dayLabel(l.date), level: formatQty(l.value) })),
        }}
      >
        {(w) => (
          <TimeLines
            width={w}
            height={180}
            step
            series={[{ label: `Stock (${material.unit})`, color: SERIES[1], points: stock }]}
            format={(n) => `${formatQty(n)} ${material.unit}`}
            axisFormat={compactNumber}
            dateLabel={dayLabel}
          />
        )}
      </ChartCard>
    </div>
  );
}
