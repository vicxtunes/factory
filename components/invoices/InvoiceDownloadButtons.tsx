"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import type { InvoiceView } from "@/lib/invoices/types";

import { downloadInvoicePdf } from "./pdf";

/** "Download PDF" (an A4 invoice file) and "Print" (the browser's print dialog). */
export function InvoiceDownloadButtons({ invoice }: { invoice: InvoiceView }) {
  const symbol = useCurrencySymbol();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await downloadInvoicePdf(invoice, symbol);
    } catch (err) {
      console.error("invoice pdf failed:", err);
      setError("Couldn't make the PDF. Try Print → Save as PDF instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button className="min-h-9 text-xs" loading={busy} onClick={download}>
        Download PDF
      </Button>
      <Button variant="secondary" className="min-h-9 text-xs" onClick={() => window.print()}>
        Print
      </Button>
      {error ? <p className="w-full text-xs text-error-600">{error}</p> : null}
    </div>
  );
}
