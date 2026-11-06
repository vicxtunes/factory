"use client";

import { createContext, useContext } from "react";

import { BASE_CURRENCY, DEFAULT_CURRENCY_SYMBOL, formatIn, type DisplayCurrency } from "./format";

const CurrencySymbolContext = createContext<string>(DEFAULT_CURRENCY_SYMBOL);

// Mounted once in the root layout with the base currency's symbol: what staff
// screens show beside UGX amounts.
export function CurrencySymbolProvider({ symbol, children }: { symbol: string; children: React.ReactNode }) {
  return <CurrencySymbolContext.Provider value={symbol}>{children}</CurrencySymbolContext.Provider>;
}

export function useCurrencySymbol(): string {
  return useContext(CurrencySymbolContext);
}

const DisplayCurrencyContext = createContext<DisplayCurrency>(BASE_CURRENCY);

/**
 * The currency amounts are shown in below it: the client's choice (root
 * layout, from the top bar), or an invoice's own (around the invoice). UGX
 * when none is set, so staff screens are unchanged.
 */
export function DisplayCurrencyProvider({ currency, children }: { currency: DisplayCurrency; children: React.ReactNode }) {
  return <DisplayCurrencyContext.Provider value={currency}>{children}</DisplayCurrencyContext.Provider>;
}

export function useDisplayCurrency(): DisplayCurrency {
  return useContext(DisplayCurrencyContext);
}

/** Formats a UGX amount in the display currency: "KES 4,250". */
export function useFormatMoney(): (ugx: number | null | undefined) => string {
  const currency = useContext(DisplayCurrencyContext);
  return (ugx) => formatIn(ugx, currency);
}
