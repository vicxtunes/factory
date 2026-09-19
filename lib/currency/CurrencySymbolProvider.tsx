"use client";

import { createContext, useContext } from "react";

import { DEFAULT_CURRENCY_SYMBOL } from "./format";

const CurrencySymbolContext = createContext<string>(DEFAULT_CURRENCY_SYMBOL);

// Mounted once in the root layout with the base currency's symbol so every
// price display (client portal + dashboard) shows the same, adjustable one.
export function CurrencySymbolProvider({ symbol, children }: { symbol: string; children: React.ReactNode }) {
  return <CurrencySymbolContext.Provider value={symbol}>{children}</CurrencySymbolContext.Provider>;
}

export function useCurrencySymbol(): string {
  return useContext(CurrencySymbolContext);
}
