// Discount rules that don't need the database: status, input checks, and
// reading/presenting an offer. Pure.

import type { Discount, DiscountInput, DiscountStatus, LineDiscount, Offer } from "./model";

export function discountStatus(d: Pick<Discount, "startsAt" | "endsAt">, now: Date): DiscountStatus {
  const t = now.getTime();
  if (Date.parse(d.startsAt) > t) return "scheduled";
  if (d.endsAt && Date.parse(d.endsAt) <= t) return "ended";
  return "running";
}

/** Problems with a new discount, as sentences; empty when it's fine. */
export function validateDiscount(input: DiscountInput, now: Date): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Give the discount a name.");
  if (!Number.isInteger(input.value) || input.value <= 0) errors.push("The discount must be a whole number above 0.");
  else if (input.kind === "percent" && input.value > 100) errors.push("A percentage can't be more than 100.");
  if (input.appliesTo === "products" && input.productIds.length === 0) errors.push("Choose at least one product.");

  const starts = input.startsAt ? Date.parse(input.startsAt) : now.getTime();
  if (Number.isNaN(starts)) errors.push("The start date isn't a valid date.");
  if (input.endsAt) {
    const ends = Date.parse(input.endsAt);
    if (Number.isNaN(ends)) errors.push("The end date isn't a valid date.");
    else if (ends <= starts) errors.push("It has to end after it starts.");
    else if (ends <= now.getTime()) errors.push("The end date is already past.");
  }
  return errors;
}

/** The discounted price of one unit (same arithmetic as the database's discount_offer). */
export function discountedPrice(listPrice: number, kind: Discount["kind"], value: number): number {
  const list = Math.round(listPrice);
  const price = kind === "percent" ? Math.round((list * (100 - value)) / 100) : list - value;
  return Math.max(price, 0);
}

/** Problems with a line discount, as sentences; empty when it's fine. */
export function validateLineDiscount(d: LineDiscount): string[] {
  if (!Number.isInteger(d.value) || d.value <= 0) return ["The discount must be a whole number above 0."];
  if (d.kind === "percent" && d.value > 100) return ["A percentage can't be more than 100."];
  return [];
}

/** A line's stored discount columns as a LineDiscount; null when it has none. */
export function lineDiscountOf(item: { line_discount_kind?: Discount["kind"] | null; line_discount_value?: number | string | null }): LineDiscount | null {
  if (!item.line_discount_kind || item.line_discount_value == null) return null;
  return { kind: item.line_discount_kind, value: Number(item.line_discount_value) };
}

/** Checks an `offer` the database returned (bigints may arrive as strings); null when there's no valid offer. */
export function parseOffer(raw: unknown): Offer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const price = Number(o.price);
  const listPrice = Number(o.listPrice);
  if (typeof o.discountId !== "string" || !Number.isFinite(price) || !Number.isFinite(listPrice)) return null;
  if (o.kind !== "percent" && o.kind !== "amount") return null;
  return { discountId: o.discountId, name: String(o.name ?? ""), kind: o.kind, value: Number(o.value), listPrice, price };
}

/** Short badge text: "−10%", or "−5,000" for an amount (the caller adds the currency if it wants). */
export function offerBadge(offer: Pick<Offer, "kind" | "value">, formatAmount: (n: number) => string): string {
  return offer.kind === "percent" ? `−${offer.value}%` : `−${formatAmount(offer.value)}`;
}
