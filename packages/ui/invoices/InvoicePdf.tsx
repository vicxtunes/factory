"use client";

import { useCallback } from "react";

import { PdfPreview } from "@repo/ui/pdf/PdfPreview";
import type { InvoiceView, ReceiptView } from "@repo/lib/invoices/types";

import { invoicePdf, receiptPdf } from "./pdf";

/**
 * The invoice (or pro forma) exactly as its PDF prints, page by page, with
 * a Download button. `download={false}`: a draft before it's issued, or a
 * viewer that has its own.
 */
export function InvoicePdf({ invoice, download = true }: { invoice: InvoiceView; download?: boolean }) {
  const build = useCallback(() => invoicePdf(invoice), [invoice]);
  const title = `${invoice.kind === "proforma" ? "Pro forma invoice" : "Invoice"} ${invoice.invoiceNo}`;
  return <PdfPreview build={build} title={title} fileName={download ? `${invoice.invoiceNo}.pdf` : undefined} />;
}

/** A payment's receipt as its PDF prints, with a Download button. */
export function ReceiptPdf({ receipt }: { receipt: ReceiptView }) {
  const build = useCallback(() => receiptPdf(receipt), [receipt]);
  return <PdfPreview build={build} title={`Receipt ${receipt.receiptNo}`} fileName={`${receipt.receiptNo}.pdf`} />;
}
