// What an order costs the client ("Amount to pay"). One rule, used by the
// client portal and the staff dashboard alike:
//
//   1. A price staff set on the order (orders.quoted_price) wins. That's the
//      receptionist's quote for portal orders, or a manual override.
//   2. Otherwise it's calculated from the catalog: each item's unit price
//      (its variant's price, else its product's price, less any discount
//      running when the order was placed, less any discount a manager gave
//      on that line) × quantity, summed.
//   3. If any item has no catalog price, the amount is unknown rather than
//      a misleading partial total.
//
// The app doesn't track payments, so this is always the full order amount.

import type { DiscountKind, Offer } from "@repo/lib/discounts/core/model";
import { discountedPrice, lineDiscountOf } from "@repo/lib/discounts/core/rules";
import type { OrderItemWithOrder } from "@repo/lib/types";

import { isPhotobookCategory } from "./photobook";

export type OrderAmountSource = "quoted" | "catalog" | "unknown";

export interface OrderAmount {
  amount: number | null;
  source: OrderAmountSource;
}

type CatalogPriced = Pick<OrderItemWithOrder, "catalog_product" | "catalog_variant"> & {
  offer?: Offer | null;
  line_discount_kind?: DiscountKind | null;
  line_discount_value?: number | null;
};

type PricedItem = CatalogPriced &
  Pick<OrderItemWithOrder, "qty"> & {
    order: Pick<OrderItemWithOrder["order"], "quoted_price">;
  };

/** An item's catalog list price, before any discount: the variant's own price overrides the product's. */
export function catalogListPrice(item: CatalogPriced): number | null {
  const price = item.catalog_variant?.price ?? item.catalog_product?.price ?? null;
  return price == null ? null : Number(price);
}

/**
 * What one unit of the item costs from the catalog: the discounted price when
 * a discount was running as the order was placed (decided by the database,
 * see packages/lib/discounts), else the list price; then less the line's own
 * discount, if a manager gave one (same arithmetic as the database's
 * order_item_set_discount).
 */
export function catalogUnitPrice(item: CatalogPriced): number | null {
  const price = item.offer ? Number(item.offer.price) : catalogListPrice(item);
  const line = lineDiscountOf(item);
  if (price == null || !line) return price;
  return discountedPrice(price, line.kind, line.value);
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

// --- Estimates (before the order is confirmed / invoiced) --------------------
//
// What the client can expect to pay while the order is still being
// confirmed. One rule, used by the order cards (client portal) and the pro
// forma invoice (packages/lib/invoices), so the two always show the same number:
//
//   1. A price staff set on the order (quoted_price) wins, as above.
//   2. Otherwise each line: its agreed price (order_items.unit_price) if
//      set, else the catalog price — except photo books, which are only
//      priced after the receptionist has called the client.
//   3. Lines without a price leave the estimate incomplete ("+ photo books").

type EstimatedItem = CatalogPriced &
  Pick<OrderItemWithOrder, "qty"> & {
    unit_price?: number | null;
    category?: { name: string } | null;
  };

/** A line's estimated unit price, or null while it can't be priced (photo books, no catalog price). */
export function estimateUnitPrice(item: EstimatedItem): number | null {
  if (item.unit_price != null) return Number(item.unit_price);
  if (isPhotobookCategory(item.category?.name)) return null;
  return catalogUnitPrice(item);
}

export interface OrderEstimate {
  /** The quoted price, or the sum of the lines that can be priced; null when nothing can be. */
  amount: number | null;
  /** False while some lines still wait for a price. */
  complete: boolean;
}

export function orderEstimate(items: (EstimatedItem & { order: Pick<OrderItemWithOrder["order"], "quoted_price"> })[]): OrderEstimate {
  if (!items.length) return { amount: null, complete: false };
  const quoted = items[0].order.quoted_price;
  if (quoted != null) return { amount: Math.round(Number(quoted)), complete: true };

  let total = 0;
  let priced = 0;
  for (const item of items) {
    const unit = estimateUnitPrice(item);
    if (unit == null) continue;
    total += unit * item.qty;
    priced++;
  }
  return { amount: priced ? Math.round(total) : null, complete: priced === items.length };
}

// --- Breakdown (confirming an order) -----------------------------------------

export interface PriceBreakdown {
  /** Σ list price × qty over the lines with a catalog price. */
  list: number;
  /** Taken off by catalog-wide discounts (packages/lib/discounts). */
  offers: number;
  /** Taken off by the line discounts agreed with the client. */
  agreed: number;
  /** What the priced lines come to: list − offers − agreed. */
  total: number;
  /** Lines without a catalog price (photo books before their call). */
  unpriced: number;
}

/** How the catalog-priced lines of an order add up, discount by discount. */
export function priceBreakdown(items: (CatalogPriced & Pick<OrderItemWithOrder, "qty">)[]): PriceBreakdown {
  const out: PriceBreakdown = { list: 0, offers: 0, agreed: 0, total: 0, unpriced: 0 };
  for (const item of items) {
    const list = catalogListPrice(item);
    const final = catalogUnitPrice(item);
    if (list == null || final == null) {
      out.unpriced++;
      continue;
    }
    const offered = item.offer ? Number(item.offer.price) : list;
    out.list += list * item.qty;
    out.offers += (list - offered) * item.qty;
    out.agreed += (offered - final) * item.qty;
    out.total += final * item.qty;
  }
  const round = (n: number) => Math.round(n);
  return { list: round(out.list), offers: round(out.offers), agreed: round(out.agreed), total: round(out.total), unpriced: out.unpriced };
}
