// What an order costs the client ("Amount to pay"). One rule, used by the
// client portal and the staff dashboard alike:
//
//   1. A price staff set on the order (orders.quoted_price) wins. That's the
//      receptionist's quote for portal orders, or a manual override.
//   2. Otherwise it's calculated from the catalog: each item's unit price
//      (its variant's price, else its product's price) × quantity, summed.
//   3. If any item has no catalog price, the amount is unknown rather than
//      a misleading partial total.
//
// The app doesn't track payments, so this is always the full order amount.

import type { OrderItemWithOrder } from "@/lib/types";

export type OrderAmountSource = "quoted" | "catalog" | "unknown";

export interface OrderAmount {
  amount: number | null;
  source: OrderAmountSource;
}

type PricedItem = Pick<OrderItemWithOrder, "qty" | "catalog_product" | "catalog_variant"> & {
  order: Pick<OrderItemWithOrder["order"], "quoted_price">;
};

/** An item's catalog unit price: the variant's own price overrides the product's. */
export function catalogUnitPrice(item: Pick<PricedItem, "catalog_product" | "catalog_variant">): number | null {
  const price = item.catalog_variant?.price ?? item.catalog_product?.price ?? null;
  return price == null ? null : Number(price);
}

/** The amount to pay for one order, given all of its items. */
export function orderAmount(items: PricedItem[]): OrderAmount {
  if (!items.length) return { amount: null, source: "unknown" };

  const quoted = items[0].order.quoted_price;
  if (quoted != null) return { amount: Number(quoted), source: "quoted" };

  let total = 0;
  for (const item of items) {
    const unit = catalogUnitPrice(item);
    if (unit == null) return { amount: null, source: "unknown" };
    total += unit * item.qty;
  }
  // Cents-safe rounding (prices are numeric(10,2)).
  return { amount: Math.round(total * 100) / 100, source: "catalog" };
}
