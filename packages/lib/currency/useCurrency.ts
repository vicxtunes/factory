"use client";

import { useFormatMoney } from "./CurrencySymbolProvider";

// Prices in the currency the client chose in the top bar (the client app's
// DisplayCurrencyProvider; UGX elsewhere). The choice itself lives in the top
// bar (apps/client/app/currency-switcher.tsx), so pages only format.
export function useCurrency() {
  const format = useFormatMoney();
  return { format: (baseAmount: number) => format(baseAmount) };
}
