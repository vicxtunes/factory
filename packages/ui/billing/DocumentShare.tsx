"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { resetInvoiceLink, resetQuotationLink } from "@repo/lib/billing/actions";
import { whatsappNumber } from "@repo/lib/kernel/core/phone";

const KINDS = {
  quotation: { reset: resetQuotationLink, message: (n: string, studio: string, url: string) => `Hello, here is your quotation ${n} from ${studio}. You can view and accept it here: ${url}` },
  invoice: { reset: resetInvoiceLink, message: (n: string, studio: string, url: string) => `Hello, here is your invoice ${n} from ${studio}. You can view it here: ${url}` },
};

/** The studio shares a quotation or invoice: copy the link, send it on WhatsApp, or replace the link. */
export function DocumentShare({
  kind,
  documentId,
  url,
  number,
  studioName,
  clientPhone,
}: {
  kind: keyof typeof KINDS;
  documentId: string;
  url: string;
  number: string;
  studioName: string;
  clientPhone: string | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const text = KINDS[kind].message(number, studioName, url);
  const waHref = `https://wa.me/${whatsappNumber(clientPhone)}?text=${encodeURIComponent(text)}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  function reset() {
    if (!window.confirm("Make a new link? The old one will stop working.")) return;
    setError(null);
    start(async () => {
      const res = await KINDS[kind].reset(documentId);
      if (!res.ok) return setError(res.error);
      setCopied(false);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs print:hidden">
      <p className="text-sm font-semibold">Share with the client</p>
      <p className="break-all rounded-[var(--radius)] bg-background px-3 py-2 text-xs text-muted">{url}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          Send on WhatsApp
        </a>
        <Button type="button" variant="ghost" onClick={reset} loading={pending}>
          Reset link
        </Button>
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </section>
  );
}
