// The discounts module's records. Pure; safe on client and server.
//
// Which discount applies to a price is decided in the database (one function,
// discount_offer, see supabase/migrations/20261001170000_discounts.sql) so
// every screen agrees. Code here describes discounts, validates new ones and
// presents offers.

export type DiscountKind = "percent" | "amount";
export type DiscountScope = "all" | "products";

export interface Discount {
  id: string;
  name: string;
  kind: DiscountKind;
  /** Percent (1–100), or whole currency units off each unit. */
  value: number;
  appliesTo: DiscountScope;
  /** Empty when it applies to all products. */
  productIds: string[];
  startsAt: string;
  /** Null = runs until ended. */
  endsAt: string | null;
  createdByName: string;
  createdAt: string;
}

export type DiscountStatus = "scheduled" | "running" | "ended";

/** The discount on one price: what the database returns as `offer`. */
export interface Offer {
  discountId: string;
  name: string;
  kind: DiscountKind;
  value: number;
  listPrice: number;
  price: number;
}

/** What someone fills in to create a discount. */
export interface DiscountInput {
  name: string;
  kind: DiscountKind;
  value: number;
  appliesTo: DiscountScope;
  productIds: string[];
  /** ISO instant; null = now. */
  startsAt: string | null;
  endsAt: string | null;
}

/** A manager's discount on one line of an order, on top of its catalog price (packages/lib/orders/pricing.ts). */
export interface LineDiscount {
  kind: DiscountKind;
  /** Percent (1–100), or whole currency units off each unit. */
  value: number;
}

/** When a line discount was agreed or changed, for the discount history. */
export type LineDiscountStage = "order_created" | "confirmation" | "after_confirmation";

/** One line discount change, as the order's audit log records it (action "line_discount"). */
export interface LineDiscountChange {
  /** The line's product name when it changed. */
  product: string;
  from: LineDiscount | null;
  to: LineDiscount | null;
  stage: LineDiscountStage;
}
