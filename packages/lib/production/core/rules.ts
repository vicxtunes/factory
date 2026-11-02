// Production's small rules and words. Pure; safe on client and server.

import type { MaterialKind, MovementKind, PurchasePaidFrom } from "./model";

export const KIND_LABELS: Record<MaterialKind, string> = {
  material: "Material",
  packaging: "Packaging",
};

export const PAID_FROM_LABELS: Record<PurchasePaidFrom, string> = {
  cash: "Cash",
  bank_transfer: "Bank",
  mobile_money: "Mobile money",
  other: "Other",
  on_credit: "On credit",
};

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  purchase: "Bought",
  usage: "Used",
  adjustment: "Stock count",
  reversal: "Reversed",
};

/** A purchase's price per unit, as the database keeps it (4 decimal places). */
export function unitCostOf(total: number, qty: number): number {
  return Math.round((total / qty) * 10_000) / 10_000;
}

/** "1,250.5" / "40" — a quantity without trailing zeros, grouped. */
export function formatQty(qty: number): string {
  return qty.toLocaleString("en-UG", { maximumFractionDigits: 3 });
}

/** A unit price, which can carry decimals ("UGX 37.5") where money totals never do. */
export function formatUnitCost(cost: number, symbol: string): string {
  return `${symbol} ${cost.toLocaleString("en-UG", { maximumFractionDigits: 2 })}`;
}
