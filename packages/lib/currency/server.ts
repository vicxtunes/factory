import "server-only";

import { cookies } from "next/headers";

import { fetchCurrencies } from "@repo/lib/queries";

import { BASE_CURRENCY, CURRENCY_COOKIE, formatIn, type DisplayCurrency } from "./format";

/** A currency row as amounts need it. */
export function toDisplay(c: { code: string; rate: number; decimals: number }): DisplayCurrency {
  return { code: c.code, rate: Number(c.rate), decimals: c.decimals };
}

/** The currency the client chose in the top bar (a cookie), if it's still on; else UGX. */
export async function clientCurrency(): Promise<DisplayCurrency> {
  const code = (await cookies()).get(CURRENCY_COOKIE)?.value;
  if (!code || code === BASE_CURRENCY.code) return BASE_CURRENCY;
  const found = (await fetchCurrencies(true)).find((c) => c.code === code);
  return found ? toDisplay(found) : BASE_CURRENCY;
}

/** For server-rendered client pages: a UGX amount in the client's chosen currency. */
export async function clientMoney(): Promise<(ugx: number | null | undefined) => string> {
  const currency = await clientCurrency();
  return (ugx) => formatIn(ugx, currency);
}

/** A currency by its code, at today's rate (UGX when it's unknown or off). */
export async function currencyByCode(code: string | null | undefined): Promise<DisplayCurrency> {
  if (!code || code === BASE_CURRENCY.code) return BASE_CURRENCY;
  const found = (await fetchCurrencies(true)).find((c) => c.code === code);
  return found ? toDisplay(found) : BASE_CURRENCY;
}
