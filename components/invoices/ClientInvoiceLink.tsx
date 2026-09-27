"use client";

import { useEffect, useState } from "react";

import { getMyInvoiceLink } from "@/lib/invoices/actions";

// "View invoice" on the client's own order, once staff have invoiced it.
// Renders nothing until then.
export function ClientInvoiceLink({ orderId }: { orderId: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyInvoiceLink(orderId).then((res) => {
      if (!cancelled && res.ok) setHref(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-10 items-center rounded-[var(--radius)] border border-brand-300 bg-surface px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-400 dark:hover:bg-brand-500/10"
    >
      View invoice
    </a>
  );
}
