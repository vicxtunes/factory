// Production's small rules and words. Pure; safe on client and server.

/** "1,250.5" / "40" — a quantity without trailing zeros, grouped. */
export function formatQty(qty: number): string {
  return qty.toLocaleString("en-UG", { maximumFractionDigits: 3 });
}

/** A unit price, which can carry decimals ("UGX 37.5") where money totals never do. */
export function formatUnitCost(cost: number, symbol: string): string {
  return `${symbol} ${cost.toLocaleString("en-UG", { maximumFractionDigits: 2 })}`;
}
