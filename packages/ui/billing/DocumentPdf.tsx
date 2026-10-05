"use client";

import { useCallback } from "react";

import { PdfPreview } from "@repo/ui/pdf/PdfPreview";
import type { Invoice, Issuer, Quotation, Receipt } from "@repo/lib/billing/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { invoicePdf, quotationPdf, receiptPdf } from "./pdf";

// A studio's documents exactly as their PDFs print (./pdf.ts), page by page,
// with a Download button: on the client's links and the studio's own pages.
// Pages pass only the printed details (no studio record, no tenant id), as
// these props are sent to the browser.

type Scope = Omit<TenantScope, "tenantId">;

export function QuotationPdf({ quotation, issuer, scope }: { quotation: Quotation; issuer: Issuer; scope: Scope }) {
  const build = useCallback(() => quotationPdf(quotation, issuer, scope), [quotation, issuer, scope]);
  return <PdfPreview build={build} title={`Quotation ${quotation.number}`} fileName={`${quotation.number}.pdf`} />;
}

export function InvoicePdf({ invoice, issuer, scope }: { invoice: Invoice; issuer: Issuer; scope: Scope }) {
  const build = useCallback(() => invoicePdf(invoice, issuer, scope), [invoice, issuer, scope]);
  return <PdfPreview build={build} title={`Invoice ${invoice.number}`} fileName={`${invoice.number}.pdf`} />;
}

export function ReceiptPdf({ receipt, issuer, scope }: { receipt: Receipt; issuer: Issuer; scope: Scope }) {
  const build = useCallback(() => receiptPdf(receipt, issuer, scope), [receipt, issuer, scope]);
  return <PdfPreview build={build} title={`Receipt ${receipt.payment.receiptNo}`} fileName={`${receipt.payment.receiptNo}.pdf`} />;
}
