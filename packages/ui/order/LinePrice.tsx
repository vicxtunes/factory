"use client";

import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { lineDiscountOf, offerBadge } from "@repo/lib/discounts/core/rules";
import { catalogListPrice, catalogUnitPrice } from "@repo/lib/orders/pricing";
import type { OrderItemWithOrder } from "@repo/lib/types";

type PricedItem = Pick<
  OrderItemWithOrder,
  "qty" | "catalog_product" | "catalog_variant" | "offer" | "line_discount_kind" | "line_discount_value"
>;

/**
 * One line's catalog price per unit, with the list price struck through and
 * a badge for each discount on it (a running campaign, a manager's line
 * discount). Same on the staff and client screens; nothing when the line has
 * no catalog price.
 */
export function LinePrice({ item }: { item: PricedItem }) {
  const symbol = useCurrencySymbol();
  const list = catalogListPrice(item);
  const price = catalogUnitPrice(item);
  if (price == null) return null;

  const money = (n: number) => formatMoney(n, symbol);
  const amount = (n: number) => Math.round(n).toLocaleString("en-UG");
  const line = lineDiscountOf(item);
  const badges = [item.offer ? offerBadge(item.offer, amount) : null, line ? offerBadge(line, amount) : null].filter(Boolean);

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
      {list != null && list > price ? <span className="text-muted line-through">{money(list)}</span> : null}
      <span className="font-semibold">{money(price)}</span>
      {item.qty > 1 ? <span className="text-muted">× {item.qty}</span> : null}
      {badges.map((b, i) => (
        <span key={i} className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-500">
          {b}
        </span>
      ))}
    </span>
  );
}
