"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PriceHero } from "@/components/order/OrderSummary";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import { getMyInvoiceLink } from "@/lib/invoices/actions";
import type { ClientOrderDocument } from "@/lib/invoices/types";

// What the client can open for their order: "View invoice" once staff have
// invoiced it, otherwise "View pro forma invoice" (an estimate). Both load
// their own data, so order screens only pass the order id.

function useOrderDocument(orderId: string): ClientOrderDocument | null {
  const [doc, setDoc] = useState<ClientOrderDocument | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMyInvoiceLink(orderId).then((res) => {
      if (!cancelled && res.ok) setDoc(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);
  return doc;
}

const LINK_CLASS =
  "inline-flex min-h-10 items-center rounded-[var(--radius)] border border-brand-300 bg-surface px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-400 dark:hover:bg-brand-500/10";

function DocumentLink({ doc }: { doc: ClientOrderDocument }) {
  if (doc.kind === "invoice") {
    return (
      <a href={doc.href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
        View invoice
      </a>
    );
  }
  return (
    <Link href={doc.href} className={LINK_CLASS}>
      View pro forma invoice
    </Link>
  );
}

/** Just the button (for screens that already show the price). */
export function ClientInvoiceLink({ orderId }: { orderId: string }) {
  const doc = useOrderDocument(orderId);
  return doc ? <DocumentLink doc={doc} /> : null;
}

/**
 * For an order that isn't confirmed yet: the estimated amount (catalog prices;
 * photo books are priced after the call) with a link to the pro forma.
 */
export function ClientOrderEstimate({ orderId }: { orderId: string }) {
  const symbol = useCurrencySymbol();
  const doc = useOrderDocument(orderId);
  if (!doc || doc.amount == null) return null;

  const hasPrice = doc.amount > 0;
  return (
    <PriceHero
      tone={doc.complete ? "firm" : "pending"}
      label={doc.complete ? "Amount to pay (estimate)" : "Estimate so far"}
      price={hasPrice ? formatMoney(doc.amount, symbol) : "To be confirmed"}
      note={
        doc.complete
          ? "Based on our current prices. It's final once we confirm your order."
          : "Photo books are priced after we call you to confirm the details."
      }
    >
      <DocumentLink doc={doc} />
    </PriceHero>
  );
}
