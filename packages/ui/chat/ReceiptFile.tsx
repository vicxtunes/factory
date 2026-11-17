"use client";

import { useEffect, useState } from "react";

import { formatIn } from "@repo/lib/currency/format";
import { receiptByLink } from "@repo/lib/invoices/actions";
import type { ReceiptView } from "@repo/lib/invoices/types";
import { receiptPdf } from "@repo/ui/invoices/pdf";
import { savePdf } from "@repo/ui/pdf/files";

import { FileIcon } from "./icons";

/** A receipt shows as its file for a week after it was sent; after that only its link is left (owner, 2026-11-17). */
export function receiptFileShown(sentAt: string): boolean {
  return Date.now() - Date.parse(sentAt) < 7 * 24 * 60 * 60_000;
}

/** The receipt tokens in a message's text (its /receipt/<token> links). */
export function receiptTokens(text: string): string[] {
  return [...new Set([...text.matchAll(/\/receipt\/([A-Za-z0-9_-]{16,128})/g)].map((m) => m[1]))];
}

/** Makes the receipt's PDF here and saves it: no new tab (owner, 2026-11-17). */
export async function downloadReceipt(receipt: ReceiptView): Promise<void> {
  savePdf(await receiptPdf(receipt), `${receipt.receiptNo}.pdf`);
}

/**
 * A receipt in a chat message, shown as its PDF file to download right there.
 * The link stays in the text, for later.
 */
export function ReceiptFile({ token, mine }: { token: string; mine: boolean }) {
  const [receipt, setReceipt] = useState<ReceiptView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    receiptByLink(token)
      .then((r) => live && setReceipt(r))
      .catch(() => live && setReceipt(null));
    return () => {
      live = false;
    };
  }, [token]);

  if (receipt === null) return null;
  return (
    <button
      type="button"
      disabled={!receipt || busy}
      onClick={async () => {
        if (!receipt) return;
        setBusy(true);
        try {
          await downloadReceipt(receipt);
        } finally {
          setBusy(false);
        }
      }}
      className={`flex w-full min-h-11 items-center gap-2 rounded-lg px-2.5 py-2 text-left disabled:opacity-70 ${
        mine ? "bg-white/15 hover:bg-white/25" : "bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10"
      }`}
    >
      <FileIcon className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{receipt ? `${receipt.receiptNo}.pdf` : "Receipt.pdf"}</span>
        <span className="block text-[11px] opacity-70">
          {busy ? "Preparing…" : receipt ? `Receipt · ${formatIn(receipt.amount, receipt.currency)} · tap to download` : "Loading…"}
        </span>
      </span>
    </button>
  );
}
