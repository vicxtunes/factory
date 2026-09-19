"use client";

import { useSyncExternalStore } from "react";

import { formatMoney } from "@/lib/currency/format";
import type { Currency } from "@/lib/types";

const STORAGE_KEY = "client-currency-code";

// localStorage's own "storage" event only fires in *other* tabs/documents,
// never the one that called setItem — select() below dispatches this
// synthetic one manually so this hook's own subscribers re-render too.
function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing / blocked storage — no persisted choice, falls back
    // to the base currency below, same as if nothing had ever been picked.
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

// Lets a client pick which currency to view prices in, persisted across
// page navigations (showroom <-> order form) via localStorage — no server
// round trip needed since it's purely a display preference, not something
// that changes what's recorded on an order. useSyncExternalStore (not a
// useState+useEffect read) so the very first client render already
// reflects a stored choice with no flash of the base currency, and two
// independent mounts of this hook stay in sync without a shared context.
export function useCurrency(currencies: Currency[]) {
  const base = currencies.find((c) => c.is_base) ?? currencies[0] ?? null;
  const code = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selected = currencies.find((c) => c.code === code && c.active) ?? base;

  function select(nextCode: string) {
    try {
      localStorage.setItem(STORAGE_KEY, nextCode);
    } catch {
      // Selection still works for the rest of this session via the
      // dispatched event below; it just won't survive a reload.
    }
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: nextCode }));
  }

  // Prices are UGX only, so the base currency's rate is 1 and no other
  // currencies exist — format() is a plain UGX format. The picker
  // (CurrencySelect) hides itself when there is just one currency.
  function format(baseAmount: number): string {
    if (!selected || !base || selected.code === base.code) return formatMoney(baseAmount, base?.symbol);
    const converted = baseAmount * (selected.rate / base.rate);
    return `${selected.symbol}${converted.toFixed(2)}`;
  }

  return { selected, base, select, format };
}
