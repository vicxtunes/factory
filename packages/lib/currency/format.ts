export const DEFAULT_CURRENCY_SYMBOL = "UGX";

// Every amount the business stores is in Ugandan shillings. formatMoney shows
// one as is (staff screens, messages, the books). A client can look at the app
// in another currency (DisplayCurrency, chosen in the top bar) and an invoice
// reads in the currency it was issued in: formatIn converts a UGX amount for
// showing, at that currency's rate. UGX has no minor unit in practice, so it
// renders as whole numbers with thousands separators.
export function formatMoney(amount: number | null | undefined, symbol: string = DEFAULT_CURRENCY_SYMBOL): string {
  return `${symbol} ${Math.round(amount ?? 0).toLocaleString("en-UG")}`;
}

/** A currency to show amounts in: its code (shown), units per 1 UGX, and decimal places. */
export interface DisplayCurrency {
  code: string;
  /** Units of this currency per 1 UGX. */
  rate: number;
  decimals: number;
}

export const BASE_CURRENCY: DisplayCurrency = { code: "UGX", rate: 1, decimals: 0 };

/** A UGX amount in another currency, rounded to its decimals. */
export function convert(ugx: number, currency: DisplayCurrency): number {
  const f = 10 ** currency.decimals;
  return Math.round(ugx * currency.rate * f) / f;
}

/** A UGX amount in a currency, as shown: "KES 4,250", "USD 32.43". */
export function formatIn(ugx: number | null | undefined, currency: DisplayCurrency): string {
  const n = convert(ugx ?? 0, currency);
  return `${currency.code} ${n.toLocaleString("en-UG", { minimumFractionDigits: currency.decimals, maximumFractionDigits: currency.decimals })}`;
}

/** A currency amount typed by someone, back in UGX (whole shillings). */
export function toUgx(amount: number, currency: DisplayCurrency): number {
  return Math.round(amount / currency.rate);
}

/** "1 KES = 28 UGX": a rate as people read it. */
export function rateText(currency: DisplayCurrency): string {
  const ugx = 1 / currency.rate;
  return `1 ${currency.code} = ${ugx.toLocaleString("en-UG", { maximumFractionDigits: ugx < 10 ? 4 : 2 })} UGX`;
}

/** The cookie the client app keeps the chosen currency in (its code). */
export const CURRENCY_COOKIE = "currency";
