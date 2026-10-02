"use client";

import { useEffect, useState } from "react";

import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import type { LineDiscount, LineDiscountStage } from "@repo/lib/discounts/core/model";
import { offerBadge } from "@repo/lib/discounts/core/rules";
import { getDiscountHistory } from "@repo/lib/invoices/actions";
import type { DiscountHistoryEntry } from "@repo/lib/invoices/types";

const STAGE_LABELS: Record<LineDiscountStage, string> = {
  order_created: "when the order was created",
  confirmation: "at confirmation",
  after_confirmation: "after confirmation",
};

/**
 * Every line discount given, changed or removed on an order, with who and
 * when — for staff auditing what the invoice's discounts are made of. Loads
 * its own data; renders nothing when the order never had a line discount.
 */
export function DiscountHistory({ orderId }: { orderId: string }) {
  const symbol = useCurrencySymbol();
  const [entries, setEntries] = useState<DiscountHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDiscountHistory(orderId).then((res) => {
      if (!cancelled && res.ok) setEntries(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!entries?.length) return null;
  const label = (d: LineDiscount | null) => (d ? offerBadge(d, (n) => formatMoney(n, symbol)) : "none");

  return (
    <details className="rounded-xl border border-border text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium">
        Discount history <span className="text-muted">({entries.length})</span>
      </summary>
      <ol className="divide-y divide-border border-t border-border">
        {entries.map((e, i) => (
          <li key={i} className="space-y-0.5 px-3 py-2">
            <p>
              <span className="font-medium">{e.product}</span>: {label(e.from)} → <span className="font-semibold">{label(e.to)}</span>
            </p>
            <p className="text-muted">
              {e.actorName} · {STAGE_LABELS[e.stage] ?? e.stage} · {new Date(e.at).toLocaleString()}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}
