"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { invoiceFromQuotation, voidInvoice } from "@repo/lib/billing/actions";

/** On an accepted quotation: make its invoice (or open the one already made) and go there. */
export function CreateInvoiceButton({ quotationId, basePath }: { quotationId: string; basePath: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    setError(null);
    start(async () => {
      const res = await invoiceFromQuotation(quotationId);
      if (!res.ok) return setError(res.error);
      router.push(`${basePath}/${res.data}`);
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" onClick={create} loading={pending}>
        Create invoice
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}

/** Cancels an invoice with no payments, keeping it (and the reason) in the history. */
export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function cancel() {
    const reason = window.prompt("Why void this invoice? (kept with the record)");
    if (!reason) return;
    setError(null);
    start(async () => {
      const res = await voidInvoice(invoiceId, reason);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1 print:hidden">
      <Button type="button" variant="ghost" onClick={cancel} loading={pending}>
        Void invoice
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
