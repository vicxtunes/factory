"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import { bizDocuments, bizSendDocument } from "@repo/lib/business-messages/actions";
import type { ChatDocument } from "@repo/lib/business-messages/core";

/**
 * The business sends a quotation or invoice into the chat (Leads, owner
 * 2026-11-27): its link goes as a message, and the client looks, accepts and
 * pays there. No open one yet: make a quotation for this client.
 */
export function SendDocument({ chatId, onSent }: { chatId: string; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5">
        <span aria-hidden>📄</span>
        <span className="hidden sm:inline">Send quote</span>
      </button>
      {open ? <Picker chatId={chatId} onClose={() => setOpen(false)} onSent={onSent} /> : null}
    </>
  );
}

function Picker({ chatId, onClose, onSent }: { chatId: string; onClose: () => void; onSent: () => void }) {
  const [data, setData] = useState<{ customerId: string; documents: ChatDocument[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    void bizDocuments(chatId).then((res) => (res.ok ? setData(res.data) : setError(res.error)));
  }, [chatId]);

  async function send(d: ChatDocument) {
    setSending(d.id);
    const res = await bizSendDocument(chatId, d.kind, d.id);
    setSending(null);
    if (!res.ok) return setError(res.error);
    onSent();
    onClose();
  }

  return (
    <FormSheet open onClose={onClose} title="Send a quotation or invoice">
      <div className="space-y-3">
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
        {!data && !error ? <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" /> : null}
        {data?.documents.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {data.documents.map((d) => (
              <li key={d.id}>
                <button type="button" disabled={!!sending} onClick={() => send(d)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 disabled:opacity-60 dark:hover:bg-white/5">
                  <span className="text-xl" aria-hidden>
                    {d.kind === "quotation" ? "📝" : "🧾"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {d.kind === "quotation" ? "Quotation" : "Invoice"} {d.number}
                    </span>
                    <span className="block text-xs text-muted capitalize">{d.status.replace("_", " ")}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tnum">{d.total}</span>
                  <span className="shrink-0 text-sm font-medium text-brand-600">{sending === d.id ? "Sending…" : "Send"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : data ? (
          <p className="py-4 text-center text-sm text-muted">No open quotation or invoice for this client yet.</p>
        ) : null}
        {data ? (
          <Link href={`/studio/quotations/new?client=${data.customerId}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
            + New quotation
          </Link>
        ) : null}
      </div>
    </FormSheet>
  );
}
