import { ratePrice, type VendorRate } from "@repo/lib/vendors/core";

/** A vendor's rates: each service with its price. */
export function RateList({ rates }: { rates: VendorRate[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
      {rates.map((r, i) => (
        <li key={i} className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="min-w-0 truncate font-medium">{r.service}</span>
          <span className="shrink-0 tabular-nums text-muted">{ratePrice(r)}</span>
        </li>
      ))}
    </ul>
  );
}
