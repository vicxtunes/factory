// Line and document money. Pure; the browser shows the same totals the
// server stores, because both run this.

import { discountedPrice } from "@repo/lib/discounts/core";

import type { Line, LineInput, Totals } from "./model";

export function priceLine(input: LineInput): Line {
  const netUnitPrice = input.discount ? discountedPrice(input.unitPrice, input.discount.kind, input.discount.value) : input.unitPrice;
  return { ...input, netUnitPrice, total: netUnitPrice * input.quantity };
}

export function totalsOf(lines: Line[]): Totals {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + l.total, 0);
  return { subtotal, discount: subtotal - total, total };
}
