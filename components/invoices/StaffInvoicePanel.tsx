"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import {
  applyWalletToInvoice,
  generateInvoice,
  getInvoiceForOrder,
  recordInvoicePayment,
  resetInvoiceLink,
  updateInvoice,
} from "@/lib/invoices/actions";
import type { StaffInvoiceView } from "@/lib/invoices/types";
import { MANUAL_METHODS, METHOD_LABELS } from "@/lib/wallet/policy";
import type { PaymentMethod } from "@/lib/wallet/types";

import { InvoiceStatusBadge } from "./InvoiceDocument";

// The invoice section of an order, for staff: generate it, share its link,
// record installments, apply the client's wallet balance. Dropped into the
// order detail (and the Invoices list's drawer) by order id; loads its own data.

type Mode = "idle" | "pay" | "edit";

function parseAmount(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

/** wa.me wants the number in international form without "+": 0700… → 256700… */
function whatsappNumber(phone: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `256${digits.slice(1)}`;
  return digits;
}

export function StaffInvoicePanel({ orderId, onChanged }: { orderId: string; onChanged?: () => void }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [invoice, setInvoice] = useState<StaffInvoiceView | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getInvoiceForOrder(orderId).then((res) => {
      if (cancelled) return;
      if (res.ok) setInvoice(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  function act<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, then: (data: T) => void) {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error);
      then(res.data);
      onChanged?.();
    });
  }

  if (invoice === undefined) {
    return error ? <p className="text-xs text-error-600">{error}</p> : null;
  }

  if (invoice === null) {
    return <GeneratePanel pending={pending} error={error} onGenerate={(input) => act(() => generateInvoice(orderId, input), setInvoice)} />;
  }

  const inv = invoice;
  const canTakeMoney = !inv.order.cancelled && inv.balance > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(inv.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy the invoice link:", inv.shareUrl);
    }
  }

  const waText = `Hello ${inv.client.name}, here is your invoice ${inv.invoiceNo} for order ${inv.order.orderNo}: ${inv.shareUrl}`;
  const waHref = `https://wa.me/${whatsappNumber(inv.client.phone)}?text=${encodeURIComponent(waText)}`;

  return (
    <section aria-label="Invoice" className="space-y-3 rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Invoice</p>
          <p className="flex items-center gap-2 text-sm font-semibold">
            {inv.invoiceNo} <InvoiceStatusBadge status={inv.status} />
          </p>
          <p className="text-xs text-muted tabular-nums">
            Total {money(inv.amount)} · Paid {money(inv.paid)} · <span className="font-semibold text-foreground">Balance {money(inv.balance)}</span>
          </p>
          {inv.dueDate ? <p className="text-xs text-muted">Due {new Date(`${inv.dueDate}T00:00:00`).toLocaleDateString()}</p> : null}
        </div>
        <a
          href={inv.shareUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-brand-600 underline"
        >
          Open invoice ↗
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="min-h-9 text-xs" onClick={copy}>
          {copied ? "Link copied" : "Copy link"}
        </Button>
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center rounded-[var(--radius)] border border-gray-300 px-3 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/[0.03]"
        >
          Send on WhatsApp
        </a>
        {canTakeMoney ? (
          <Button className="min-h-9 text-xs" onClick={() => setMode(mode === "pay" ? "idle" : "pay")}>
            Record payment
          </Button>
        ) : null}
        {canTakeMoney && (inv.walletBalance ?? 0) > 0 ? (
          <Button
            variant="secondary"
            className="min-h-9 text-xs"
            loading={pending && mode === "idle"}
            onClick={() => {
              const take = Math.min(inv.walletBalance ?? 0, inv.balance);
              if (!window.confirm(`Take ${money(take)} from ${inv.client.name}'s wallet for this invoice?`)) return;
              act(
                () => applyWalletToInvoice(inv.id),
                (d) => {
                  setInvoice(d.invoice);
                  setNotice(`${money(d.applied)} paid from the wallet.`);
                },
              );
            }}
          >
            Use wallet ({money(inv.walletBalance ?? 0)})
          </Button>
        ) : null}
        <Button variant="ghost" className="min-h-9 text-xs" onClick={() => setMode(mode === "edit" ? "idle" : "edit")}>
          Edit
        </Button>
      </div>

      {mode === "pay" ? (
        <PaymentForm
          balance={inv.balance}
          money={money}
          pending={pending}
          onCancel={() => setMode("idle")}
          onSubmit={(input) =>
            act(
              () => recordInvoicePayment(inv.id, input),
              (d) => {
                setInvoice(d.invoice);
                setMode("idle");
                setNotice(
                  d.toWallet > 0
                    ? `${money(d.applied)} recorded on the invoice; ${money(d.toWallet)} added to the client's wallet as credit.`
                    : `${money(d.applied)} recorded.`,
                );
              },
            )
          }
        />
      ) : null}

      {mode === "edit" ? (
        <EditForm
          invoice={inv}
          pending={pending}
          onCancel={() => setMode("idle")}
          onSave={(input) =>
            act(
              () => updateInvoice(inv.id, input),
              (d) => {
                setInvoice(d);
                setMode("idle");
              },
            )
          }
          onResetLink={() => {
            if (!window.confirm("Make a new link? The old link will stop working — send the new one to the client.")) return;
            act(
              () => resetInvoiceLink(inv.id),
              (d) => {
                setInvoice(d);
                setMode("idle");
                setNotice("New link created. The old one no longer works.");
              },
            );
          }}
        />
      ) : null}

      {inv.payments.length ? (
        <ul className="divide-y divide-border border-t border-border text-xs">
          {inv.payments.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate text-muted">
                {new Date(p.createdAt).toLocaleDateString()} ·{" "}
                {p.kind === "refund" ? "Refund to wallet" : p.method === "wallet" ? "Wallet" : METHOD_LABELS[p.method]}
                {p.reference ? ` · ${p.reference}` : ""} · {p.actorName}
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {p.kind === "refund" ? "−" : ""}
                {money(p.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? <p className="text-xs text-success-600 dark:text-success-500">{notice}</p> : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </section>
  );
}

function GeneratePanel({
  pending,
  error,
  onGenerate,
}: {
  pending: boolean;
  error: string | null;
  onGenerate: (input: { dueDate: string | null; notes: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <section aria-label="Invoice" className="space-y-2 rounded-2xl border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">No invoice yet.</p>
        {!open ? (
          <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setOpen(true)}>
            Generate invoice
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-2">
          <Field label="Due date (optional)">
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Notes on the invoice (optional)" hint="Payment terms, a thank-you…">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
          </Field>
          <div className="flex gap-2">
            <Button className="min-h-9 text-xs" loading={pending} onClick={() => onGenerate({ dueDate: dueDate || null, notes: notes || null })}>
              Generate
            </Button>
            <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-muted">The order&apos;s price is locked once it&apos;s invoiced.</p>
        </div>
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </section>
  );
}

function PaymentForm({
  balance,
  money,
  pending,
  onSubmit,
  onCancel,
}: {
  balance: number;
  money: (n: number) => string;
  pending: boolean;
  onSubmit: (input: { amount: number; method: PaymentMethod; reference: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<PaymentMethod>("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const value = parseAmount(amount);
  const extra = Number.isFinite(value) ? value - balance : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(value) || value <= 0) return setError("Enter the amount received.");
    if (!window.confirm(`Record ${money(value)} received${reference ? ` (ref ${reference})` : ""}?`)) return;
    setError(null);
    onSubmit({ amount: value, method, reference, note });
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-semibold">Record a payment received</p>
      <Field label="Amount received" hint={extra > 0 ? `${money(extra)} more than the balance — it will go to the client's wallet as credit.` : undefined}>
        <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      <Field label="Method">
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {MANUAL_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reference (optional)" hint="Transaction ID, receipt number…">
        <TextInput value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Note (optional)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. 2nd installment" />
      </Field>
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" className="min-h-9 text-xs" loading={pending}>
          Record
        </Button>
        <button type="button" className="text-xs text-muted" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditForm({
  invoice,
  pending,
  onSave,
  onCancel,
  onResetLink,
}: {
  invoice: StaffInvoiceView;
  pending: boolean;
  onSave: (input: { dueDate: string | null; notes: string | null }) => void;
  onCancel: () => void;
  onResetLink: () => void;
}) {
  const [dueDate, setDueDate] = useState(invoice.dueDate ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <Field label="Due date">
        <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="Notes on the invoice">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="min-h-9 text-xs" loading={pending} onClick={() => onSave({ dueDate: dueDate || null, notes: notes || null })}>
          Save
        </Button>
        <button type="button" className="text-xs text-muted" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="ml-auto text-xs text-error-600 underline" onClick={onResetLink}>
          Reset link
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Reset the link if it was sent to the wrong person — the old one stops working. Issued by {invoice.createdByName}.
      </p>
    </div>
  );
}
