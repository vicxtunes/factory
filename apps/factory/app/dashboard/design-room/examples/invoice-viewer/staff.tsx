"use client";

import { useState } from "react";

import { ActionMenu } from "@repo/ui/ActionMenu";
import { Button } from "@repo/ui/Button";
import { InvoiceStatusBadge } from "@repo/ui/invoices/InvoiceStatusBadge";
import { InvoiceViewer, ViewerAction } from "@repo/ui/invoices/InvoiceViewer";
import { DownloadIcon, LinkIcon } from "@repo/ui/media/icons";

import { SAMPLE_INVOICE as inv } from "../_data/invoice";

// Opening an invoice: the invoice itself, large, on a dark backdrop; share
// actions as icons on top; what's owed and taking money on the side (under
// the pages on a phone). Escape or ✕ closes. The real side panel is
// StaffInvoicePanel's; this one is a static stand-in.
export default function InvoiceViewerStaff() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open invoice</Button>
      {open ? (
        <InvoiceViewer
          invoice={inv}
          onClose={() => setOpen(false)}
          heading={
            <div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
              <p className="max-w-full truncate text-sm font-semibold">{inv.invoiceNo}</p>
              <span className="whitespace-nowrap">
                <InvoiceStatusBadge status={inv.status} />
              </span>
              <p className="hidden truncate text-sm text-white/60 md:block">· {inv.client.name}</p>
            </div>
          }
          actions={
            <>
              <ViewerAction label="Download PDF" onClick={() => {}}>
                <DownloadIcon className="size-5" />
              </ViewerAction>
              <ViewerAction label="Copy link" onClick={() => {}}>
                <LinkIcon className="size-5" />
              </ViewerAction>
              <ActionMenu
                label="More invoice actions"
                focusKey="sample-invoice"
                items={[
                  { label: "Edit invoice", onSelect: () => {} },
                  { label: "Make a new link", onSelect: () => {} },
                ]}
                triggerClassName="inline-flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
              />
            </>
          }
          aside={
            <div className="space-y-4">
              <dl className="divide-y divide-border rounded-xl border border-border text-sm">
                <div className="flex justify-between gap-3 px-3 py-2">
                  <dt className="text-muted">Total</dt>
                  <dd className="tabular-nums">UGX 1,215,000</dd>
                </div>
                <div className="flex justify-between gap-3 px-3 py-2">
                  <dt className="text-muted">Paid</dt>
                  <dd className="tabular-nums">UGX 500,000</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                  <dt className="font-semibold">Balance due</dt>
                  <dd className="text-lg font-bold tabular-nums">UGX 715,000</dd>
                </div>
              </dl>
              <Button className="w-full">Record payment</Button>
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Payments</h3>
                <p className="flex justify-between gap-2 text-xs text-muted">
                  <span>3 Oct 2026 · Mobile money · MM9981 · Grace</span>
                  <span className="font-medium tabular-nums text-foreground">UGX 500,000</span>
                </p>
              </section>
            </div>
          }
        />
      ) : null}
    </>
  );
}
