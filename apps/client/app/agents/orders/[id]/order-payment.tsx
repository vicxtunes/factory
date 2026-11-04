"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { checkClientPayment, promptClientToPay } from "@repo/lib/agents/actions";
import { localPhone } from "@repo/lib/wallet/policy";

const CHECK_EVERY_MS = 5_000;

/** The client pays Aming directly: a prompt on their phone, or the invoice link to share. */
export function OrderPayment({ orderId, phone, invoiceUrl }: { orderId: string; phone: string | null; invoiceUrl: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(phone ? localPhone(phone) : "");
  const [error, setError] = useState<string | null>(null);
  const [collection, setCollection] = useState<{ id: string; status: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const waiting = collection?.status === "pending";
  useEffect(() => {
    if (!collection || collection.status !== "pending") return;
    const timer = setInterval(async () => {
      const res = await checkClientPayment(collection.id);
      if (res.ok && res.data && res.data.status !== "pending") {
        setCollection({ id: collection.id, status: res.data.status });
        router.refresh();
      }
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [collection, router]);

  async function copy() {
    if (!invoiceUrl) return;
    const url = invoiceUrl.startsWith("/") ? `${window.location.origin}${invoiceUrl}` : invoiceUrl;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function close() {
    setOpen(false);
    setError(null);
    setCollection(null);
  }

  return (
    <div className="space-y-2">
      <Button type="button" className="w-full" onClick={() => setOpen(true)}>
        Send payment prompt
      </Button>
      {invoiceUrl ? (
        <Button type="button" variant="secondary" className="w-full" onClick={copy}>
          {copied ? "Copied" : "Copy invoice link"}
        </Button>
      ) : null}

      <FormSheet open={open} onClose={close} title="Send payment prompt">
        {collection ? (
          <div className="space-y-4">
            <p className="text-sm">
              {waiting
                ? "Waiting for your client to approve the prompt on their phone."
                : collection.status === "succeeded"
                  ? "Paid. Thank you."
                  : "The payment didn't go through, and no money was taken."}
            </p>
            {waiting ? null : (
              <Button type="button" className="w-full" onClick={close}>
                Done
              </Button>
            )}
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const res = await promptClientToPay(orderId, number);
                if (!res.ok) setError(res.error);
                else if (res.data) setCollection({ id: res.data.id, status: res.data.status });
              });
            }}
          >
            <p className="text-sm text-muted">The client approves it on their phone, and the money goes straight to Aming.</p>
            <Field label="Client's MTN or Airtel number">
              <TextInput type="tel" value={number} onChange={(e) => setNumber(e.target.value)} required />
            </Field>
            {error ? <p className="text-sm text-error-600">{error}</p> : null}
            <Button type="submit" className="w-full" loading={pending} disabled={pending}>
              Send prompt
            </Button>
          </form>
        )}
      </FormSheet>
    </div>
  );
}
