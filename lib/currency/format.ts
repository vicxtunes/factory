export const DEFAULT_CURRENCY_SYMBOL = "UGX";

// The business prices in a single currency (Ugandan shillings). The symbol
// shown is boss-adjustable (Dashboard → Products), so callers pass it in —
// client components get it from useCurrencySymbol(). UGX has no minor unit
// in practice, so amounts render as whole numbers with thousands separators.
export function formatMoney(amount: number | null | undefined, symbol: string = DEFAULT_CURRENCY_SYMBOL): string {
  return `${symbol} ${Math.round(amount ?? 0).toLocaleString("en-UG")}`;
}
