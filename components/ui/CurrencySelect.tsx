"use client";

import type { Currency } from "@/lib/types";

// Compact currency picker for wherever a price is shown — hidden entirely
// when the boss has only set up one currency (the base), since there'd be
// nothing to pick between.
export function CurrencySelect({
  currencies,
  selected,
  onChange,
}: {
  currencies: Currency[];
  selected: Currency | null;
  onChange: (code: string) => void;
}) {
  if (currencies.length <= 1 || !selected) return null;

  return (
    <select
      value={selected.code}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Currency"
      className="rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-xs font-medium outline-none focus:border-brand-300"
    >
      {currencies.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code}
        </option>
      ))}
    </select>
  );
}
