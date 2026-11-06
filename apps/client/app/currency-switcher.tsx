"use client";

// The currency the client sees the app in, chosen in the top bar: kept in a
// cookie so pages built on the server use it too, and the page redraws in
// place on a change. The choices are the currencies the boss has turned on.

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition } from "react";

import { useDisplayCurrency } from "@repo/lib/currency/CurrencySymbolProvider";
import { CURRENCY_COOKIE } from "@repo/lib/currency/format";

const ChoicesContext = createContext<{ code: string; label: string }[]>([]);

export function CurrencyChoices({ choices, children }: { choices: { code: string; label: string }[]; children: React.ReactNode }) {
  return <ChoicesContext.Provider value={choices}>{children}</ChoicesContext.Provider>;
}

export function CurrencySwitcher() {
  const choices = useContext(ChoicesContext);
  const current = useDisplayCurrency();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (choices.length <= 1) return null;

  return (
    <select
      value={current.code}
      aria-label="Currency"
      title="Show amounts in"
      disabled={pending}
      onChange={(e) => {
        document.cookie = `${CURRENCY_COOKIE}=${encodeURIComponent(e.target.value)}; path=/; max-age=31536000; samesite=lax`;
        start(() => router.refresh());
      }}
      className={`min-h-11 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm font-medium outline-none focus:border-brand-300 ${pending ? "opacity-60" : ""}`}
    >
      {choices.map((c) => (
        <option key={c.code} value={c.code} title={c.label}>
          {c.code}
        </option>
      ))}
    </select>
  );
}
