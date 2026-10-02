"use client";

import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";
import { Field, TextInput } from "@repo/ui/Field";
import { LineDiscountEditor } from "@repo/ui/order/LineDiscountEditor";
import { LinePrice } from "@repo/ui/order/LinePrice";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { lineDiscountOf, offerBadge } from "@repo/lib/discounts/core/rules";
import { catalogUnitPrice, priceBreakdown } from "@repo/lib/orders/pricing";
import type { OrderItemWithOrder } from "@repo/lib/types";

import { receiveClientOrder, setLineDiscount } from "./actions";

// Confirming a client order: the receptionist goes through its prices, agrees
// any discounts with the client (this is the only time a new one can be
// given), then confirms from a summary of what the client will pay. After
// confirmation discounts can still be changed or removed until the invoice
// is issued, but not added.

export function OrderConfirmation({
  orderId,
  orderNo,
  clientName,
  items,
  call,
  onChanged,
}: {
  orderId: string;
  orderNo: string;
  clientName: string;
  items: OrderItemWithOrder[];
  /** The order has a photo book: its price is agreed on a call and entered as the order's total. */
  call: boolean;
  /** After a discount is saved or the order confirmed: reload the queue. */
  onChanged: () => void;
}) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [editing, setEditing] = useState<string | null>(null);
  const [agreedTotal, setAgreedTotal] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const breakdown = priceBreakdown(items);
  const agreedValue = Number(agreedTotal);
  const agreedValid = agreedTotal.trim() !== "" && Number.isInteger(agreedValue) && agreedValue > 0;
  // Photo-book orders: the price agreed on the call is the whole order's;
  // otherwise it's what the catalog lines come to after discounts.
  const toPay = call ? (agreedValid ? agreedValue : null) : breakdown.unpriced ? null : breakdown.total;
  const discounted = items.filter((i) => lineDiscountOf(i));

  function confirm() {
    setError(null);
    start(async () => {
      const res = await receiveClientOrder(orderId, call ? agreedValue : undefined);
      if (!res.ok) return setError(res.error ?? "Couldn't confirm the order.");
      setReviewing(false);
      onChanged();
    });
  }

  return (
    <section aria-label="Prices and discounts" className="space-y-3">
      <div className="rounded-[var(--radius)] border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Prices &amp; discounts</p>
          <p className="text-[11px] text-muted">Agree any discount with the client before confirming.</p>
        </div>
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const priced = catalogUnitPrice(item) != null;
            const current = lineDiscountOf(item);
            const unit = catalogUnitPrice(item);
            return (
              <li key={item.id} className="space-y-2 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.product}</p>
                    {item.product_type ? <p className="text-[11px] text-muted">{item.product_type}</p> : null}
                  </div>
                  <div className="text-right text-sm">
                    {priced ? (
                      <>
                        <LinePrice item={item} />
                        <p className="font-semibold tabular-nums">{money((unit ?? 0) * item.qty)}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted">Qty {item.qty} · priced on the call</p>
                    )}
                  </div>
                </div>
                {priced && editing !== item.id ? (
                  <div className="flex items-center gap-3 text-xs">
                    {current ? (
                      <span className="text-muted">
                        Agreed discount: <span className="font-semibold text-foreground">{offerBadge(current, (n) => money(n))}</span>
                      </span>
                    ) : null}
                    <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => setEditing(item.id)}>
                      {current ? "Change" : "Add discount"}
                    </button>
                  </div>
                ) : null}
                {editing === item.id ? (
                  <LineDiscountEditor
                    current={current}
                    save={(next) => setLineDiscount(item.id, next)}
                    onDone={() => {
                      setEditing(null);
                      onChanged();
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        <Totals breakdown={breakdown} money={money} />
      </div>

      {call ? (
        <div className="rounded-[var(--radius)] border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-500/30 dark:bg-brand-500/10">
          <p className="mb-2 text-xs text-muted">
            This order has a photo book — call {clientName} to agree its details and price.
          </p>
          {items[0].order.client_phone ? (
            <a href={`tel:${items[0].order.client_phone}`}>
              <Button variant="secondary" type="button" className="min-h-9 text-xs">
                Call {items[0].order.client_phone}
              </Button>
            </a>
          ) : (
            <p className="text-xs text-muted">No phone number on file for this client.</p>
          )}
          <div className="mt-3">
            <Field
              label={`Agreed total for the whole order (${symbol})`}
              hint={breakdown.total ? `The other items come to ${money(breakdown.total)} after discounts; include them.` : undefined}
            >
              <TextInput
                type="number"
                inputMode="numeric"
                min={1}
                step="1"
                className="tnum w-44"
                value={agreedTotal}
                onChange={(e) => setAgreedTotal(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
        </div>
      ) : null}

      <Button variant="primary" disabled={toPay == null || editing !== null} onClick={() => setReviewing(true)}>
        Review &amp; confirm
      </Button>
      {editing !== null ? <p className="text-xs text-muted">Save or cancel the discount you&apos;re editing first.</p> : null}

      <Drawer
        open={reviewing}
        onClose={() => !pending && setReviewing(false)}
        title={`Confirm order ${orderNo}`}
        footer={
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" loading={pending} disabled={pending} onClick={confirm}>
              Confirm order
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setReviewing(false)}>
              Back
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs text-muted">Client</p>
            <p className="font-medium">{clientName}</p>
          </div>
          <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
            {items.map((item) => {
              const unit = catalogUnitPrice(item);
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.product} <span className="font-normal text-muted">× {item.qty}</span>
                    </p>
                    {unit != null ? <LinePrice item={item} /> : <p className="text-xs text-muted">Priced on the call</p>}
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{unit != null ? money(unit * item.qty) : "—"}</p>
                </li>
              );
            })}
          </ul>
          <div className="rounded-[var(--radius)] border border-border">
            <Totals breakdown={breakdown} money={money} />
            <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
              <span className="font-semibold">Amount to pay</span>
              <span className="text-lg font-extrabold tabular-nums">{toPay == null ? "—" : money(toPay)}</span>
            </div>
          </div>
          <div className="rounded-[var(--radius)] bg-gray-50 p-3 text-xs text-muted dark:bg-white/5">
            <p className="font-semibold text-foreground">After you confirm</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                {discounted.length
                  ? `The ${discounted.length === 1 ? "discount" : `${discounted.length} discounts`} above can still be changed or removed until the invoice is issued.`
                  : "No discounts were agreed. New discounts can't be added once the order is confirmed."}
              </li>
              {discounted.length ? <li>New discounts can&apos;t be added once the order is confirmed.</li> : null}
              <li>Next: generate the invoice, then route the order to production.</li>
            </ul>
          </div>
          {error ? <p className="text-sm text-error-600">{error}</p> : null}
        </div>
      </Drawer>

      {error && !reviewing ? <p className="text-sm text-error-600">{error}</p> : null}
    </section>
  );
}

/** List total, then each kind of discount, then what the priced lines come to. */
function Totals({ breakdown, money }: { breakdown: ReturnType<typeof priceBreakdown>; money: (n: number) => string }) {
  const rows: [string, string][] = [];
  if (breakdown.offers || breakdown.agreed) rows.push(["List price", money(breakdown.list)]);
  if (breakdown.offers) rows.push(["Catalog offers", `−${money(breakdown.offers)}`]);
  if (breakdown.agreed) rows.push(["Agreed discounts", `−${money(breakdown.agreed)}`]);
  return (
    <dl className="space-y-1 border-t border-border px-3 py-2 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between">
          <dt className="text-muted">{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
      <div className="flex justify-between text-sm font-semibold">
        <dt>{breakdown.unpriced ? "Priced items" : "Total"}</dt>
        <dd className="tabular-nums">{money(breakdown.total)}</dd>
      </div>
    </dl>
  );
}

/**
 * A confirmed order's agreed prices, read-only except that a line's agreed
 * discount can be changed or removed until the invoice is issued.
 */
export function AgreedPrices({
  items,
  invoiced,
  onChanged,
}: {
  items: OrderItemWithOrder[];
  invoiced: boolean;
  onChanged: () => void;
}) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="rounded-[var(--radius)] border border-border">
      <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Agreed prices</p>
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const unit = catalogUnitPrice(item);
          const current = lineDiscountOf(item);
          return (
            <li key={item.id} className="space-y-2 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-sm">
                <p className="font-medium">{item.product}</p>
                {unit != null ? <LinePrice item={item} /> : <p className="text-xs text-muted">Qty {item.qty} · priced on the call</p>}
              </div>
              {current && !invoiced && editing !== item.id ? (
                <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setEditing(item.id)}>
                  Change discount
                </button>
              ) : null}
              {editing === item.id ? (
                <LineDiscountEditor
                  current={current}
                  save={(next) => setLineDiscount(item.id, next)}
                  onDone={() => {
                    setEditing(null);
                    onChanged();
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <Totals breakdown={priceBreakdown(items)} money={money} />
    </div>
  );
}
