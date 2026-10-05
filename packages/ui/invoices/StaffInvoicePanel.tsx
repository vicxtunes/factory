"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { whatsappNumber } from "@repo/lib/kernel/core/phone";
import {
  applyWalletToInvoice,
  generateInvoice,
  previewInvoice,
  getInvoiceDraft,
  getInvoiceForOrder,
  recordInvoicePayment,
  resetInvoiceLink,
  updateInvoice,
  updateInvoiceLines,
  type InvoiceLineInput,
} from "@repo/lib/invoices/actions";
import type { DraftLine, InvoiceView, StaffInvoiceView } from "@repo/lib/invoices/types";
import { MANUAL_METHODS, METHOD_LABELS, paymentMethodLabel } from "@repo/lib/wallet/policy";
import type { PaymentMethod } from "@repo/lib/wallet/types";

import { ActionMenu, type ActionMenuEntry } from "@repo/ui/ActionMenu";
import { Drawer } from "@repo/ui/Drawer";
import { CheckCircleIcon, DocumentIcon, DownloadIcon, LinkIcon } from "@repo/ui/media/icons";

import { DiscountHistory } from "./DiscountHistory";
import { savePdf } from "@repo/ui/pdf/files";

import { InvoicePdf } from "./InvoicePdf";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceViewer, ViewerAction, ViewerLoading } from "./InvoiceViewer";
import { invoicePdf } from "./pdf";

// The invoice section of an order, for staff: generate it, then a card that
// opens the invoice itself full screen (./InvoiceViewer.tsx) to share it,
// record installments, apply the client's wallet balance or edit it.
// Dropped into the order detail by order id (the Invoices list opens the
// viewer directly with `asViewer`); loads its own data.

type Mode = "idle" | "pay" | "edit";

function parseAmount(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

export function StaffInvoicePanel({
  orderId,
  onChanged,
  onInvoiceStatusChange,
  asViewer,
}: {
  orderId: string;
  onChanged?: () => void;
  onInvoiceStatusChange?: (exists: boolean) => void;
  /** Show the invoice straight away, full screen, with no card (the Invoices list); `onClose` when it's closed. */
  asViewer?: { onClose: () => void };
}) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [invoice, setInvoice] = useState<StaffInvoiceView | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewing, setViewing] = useState(!!asViewer);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getInvoiceForOrder(orderId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setInvoice(res.data);
        onInvoiceStatusChange?.(res.data !== null);
      }
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, onInvoiceStatusChange]);

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
    return asViewer ? <ViewerLoading error={error} onClose={asViewer.onClose} /> : error ? <p className="text-xs text-error-600">{error}</p> : null;
  }

  if (invoice === null) {
    return (
      <GeneratePanel
        orderId={orderId}
        money={money}
        pending={pending}
        error={error}
        onGenerate={(input) =>
          act(
            () => generateInvoice(orderId, input),
            (data) => {
              setInvoice(data);
              onInvoiceStatusChange?.(true);
            },
          )
        }
      />
    );
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
  const sendOnWhatsApp = () => window.open(`https://wa.me/${whatsappNumber(inv.client.phone)}?text=${encodeURIComponent(waText)}`, "_blank", "noopener");

  function download() {
    invoicePdf(inv, symbol)
      .then((pdf) => savePdf(pdf, `${inv.invoiceNo}.pdf`))
      .catch((err) => {
        console.error("invoice pdf failed:", err);
        setError("Couldn't make the PDF.");
      });
  }

  function resetLink() {
    if (!window.confirm("Make a new link? The old link will stop working — send the new one to the client.")) return;
    act(
      () => resetInvoiceLink(inv.id),
      (d) => {
        setInvoice(d);
        setNotice("New link created. The old one no longer works.");
      },
    );
  }

  function view(next: Mode = "idle") {
    setMode(next);
    setViewing(true);
  }

  function closeViewer() {
    setMode("idle");
    if (asViewer) asViewer.onClose();
    else setViewing(false);
  }

  const messages = (
    <>
      {notice ? <p className="text-xs text-success-600 dark:text-success-500">{notice}</p> : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </>
  );

  // The viewer's side panel: what's owed, taking money, editing, the payment history.
  const manage = (
    <div className="space-y-4">
      <dl className="divide-y divide-border rounded-xl border border-border text-sm">
        <div className="flex justify-between gap-3 px-3 py-2">
          <dt className="text-muted">Total</dt>
          <dd className="tabular-nums">{money(inv.amount)}</dd>
        </div>
        <div className="flex justify-between gap-3 px-3 py-2">
          <dt className="text-muted">Paid</dt>
          <dd className="tabular-nums">{money(inv.paid)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
          <dt className="font-semibold">Balance due</dt>
          <dd className="text-lg font-bold tabular-nums">{money(inv.balance)}</dd>
        </div>
      </dl>

      {!inv.linesMatchTotal && !inv.order.cancelled ? (
        <p className="rounded-xl bg-warning-50 p-3 text-xs text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
          The line prices don&apos;t add up to the order total (an item may have been added or changed). Choose{" "}
          <span className="font-semibold">Edit invoice</span> in the ⋯ menu and save the line prices.
        </p>
      ) : null}

      {mode === "idle" && canTakeMoney ? (
        <div className="space-y-2">
          <Button className="w-full" onClick={() => setMode("pay")}>
            Record payment
          </Button>
          {(inv.walletBalance ?? 0) > 0 ? (
            <Button
              variant="secondary"
              className="w-full"
              loading={pending}
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
        </div>
      ) : null}

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
                    ? `${money(d.applied)} recorded on the invoice; ${money(d.toWallet)} added to the client's wallet.`
                    : d.physicallyRefunded > 0
                      ? `${money(d.applied)} recorded on the invoice; ${money(d.physicallyRefunded)} returned physically and logged.`
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
          money={money}
          pending={pending}
          onCancel={() => setMode("idle")}
          onSave={(input) =>
            act(
              async () => {
                // Lines first: if the new total is refused (below what's paid), nothing else changes.
                if (input.lines) {
                  const res = await updateInvoiceLines(inv.id, input.lines);
                  if (!res.ok) return res;
                }
                return updateInvoice(inv.id, { dueDate: input.dueDate, notes: input.notes });
              },
              (d) => {
                setInvoice(d);
                setMode("idle");
              },
            )
          }
        />
      ) : null}

      {messages}

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Payments</h3>
        {inv.payments.length ? (
          <ul className="divide-y divide-border text-xs">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-2">
                <span className="min-w-0 text-muted">
                  {new Date(p.createdAt).toLocaleDateString()} ·{" "}
                  {p.kind === "refund" ? "Refund to wallet" : paymentMethodLabel(p.method, "Payment received")}
                  {p.amountReceived != null && p.amountReceived > p.amount
                    ? ` · ${money(p.amountReceived)} received; ${money(p.amountToWallet && p.amountToWallet > 0 ? p.amountToWallet : (p.amountRefunded ?? 0))} ${p.amountToWallet ? "credited" : "returned"}`
                    : ""}
                  {p.reference ? ` · ${p.reference}` : ""} · {p.actorName}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">
                  {p.kind === "refund" ? "−" : ""}
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">None yet.</p>
        )}
      </section>

      <DiscountHistory key={inv.amount} orderId={inv.order.id} />

      <p className="text-[11px] text-muted">Issued by {inv.createdByName}.</p>
    </div>
  );

  const menu: ActionMenuEntry[] = [
    { label: "Edit invoice", onSelect: () => setMode("edit") },
    { label: "Make a new link", onSelect: resetLink },
  ];

  const viewer = viewing ? (
    <InvoiceViewer
      invoice={inv}
      onClose={closeViewer}
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
          <ViewerAction label="Download PDF" onClick={download}>
            <DownloadIcon className="size-5" />
          </ViewerAction>
          <ViewerAction label={copied ? "Link copied" : "Copy link"} onClick={copy}>
            {copied ? <CheckCircleIcon className="size-5 text-success-500" /> : <LinkIcon className="size-5" />}
          </ViewerAction>
          <ViewerAction label="Send on WhatsApp" onClick={sendOnWhatsApp}>
            <ChatIcon className="size-5" />
          </ViewerAction>
          <ActionMenu
            label="More invoice actions"
            focusKey={`invoice-${inv.id}`}
            items={menu}
            triggerClassName="inline-flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
          />
        </>
      }
      aside={manage}
    />
  ) : null;

  if (asViewer) return viewer;

  // On the order: the invoice at a glance; opening it shows the invoice itself.
  return (
    <section aria-label="Invoice" className="space-y-3 rounded-2xl border border-border bg-surface p-3">
      <button
        type="button"
        onClick={() => view()}
        className="group flex w-full items-center gap-3 rounded-xl text-left"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          <DocumentIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {inv.invoiceNo} <InvoiceStatusBadge status={inv.status} />
          </span>
          <span className="block text-xs text-muted tabular-nums">
            Total {money(inv.amount)} · Paid {money(inv.paid)} ·{" "}
            <span className="font-semibold text-foreground">Balance {money(inv.balance)}</span>
          </span>
          {inv.dueDate ? <span className="block text-xs text-muted">Due {new Date(`${inv.dueDate}T00:00:00`).toLocaleDateString()}</span> : null}
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="min-h-9 text-xs" onClick={() => view()}>
          View invoice
        </Button>
        {canTakeMoney ? (
          <Button className="min-h-9 text-xs" onClick={() => view("pay")}>
            Record payment
          </Button>
        ) : null}
        <span className="ml-auto">
          <ActionMenu
            label="Invoice actions"
            focusKey={`invoice-card-${inv.id}`}
            items={[
              { label: copied ? "Link copied" : "Copy link", onSelect: copy },
              { label: "Send on WhatsApp", onSelect: sendOnWhatsApp },
              { label: "Download PDF", onSelect: download },
              { label: "Edit invoice", onSelect: () => view("edit") },
              { label: "Make a new link", onSelect: resetLink },
            ]}
          />
        </span>
      </div>

      {messages}
      {viewer}
    </section>
  );
}

/** Speech bubble, for "Send on WhatsApp" (Heroicons chat-bubble-oval-left, outline). */
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
      />
    </svg>
  );
}

interface EditableLine extends DraftLine {
  /** What's typed in the price box. */
  priceText: string;
  unitText: string;
}

function toEditable(lines: DraftLine[]): EditableLine[] {
  return lines.map((l) => ({ ...l, priceText: l.unitPrice == null ? "" : String(l.unitPrice), unitText: l.unit ?? "" }));
}

/** The lines as the server wants them, or an error sentence when a price is missing or invalid. */
function toInput(lines: EditableLine[]): InvoiceLineInput[] | string {
  const out: InvoiceLineInput[] = [];
  for (const l of lines) {
    const price = parseAmount(l.priceText);
    if (!Number.isInteger(price) || price < 0) return `Enter a price for "${l.title}".`;
    out.push({ itemId: l.itemId, unitPrice: price, unit: l.unitText || null });
  }
  return out;
}

function linesTotal(lines: EditableLine[]): number | null {
  let total = 0;
  for (const l of lines) {
    const price = parseAmount(l.priceText);
    if (!Number.isFinite(price)) return null;
    total += price * l.qty;
  }
  return total;
}

/** Qty × unit price per line, as on the printed invoice; the total is their sum. */
function LineEditor({
  lines,
  onChange,
  money,
}: {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  money: (n: number) => string;
}) {
  const total = linesTotal(lines);
  const set = (i: number, patch: Partial<EditableLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">Line prices</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {lines.map((l, i) => {
          const price = parseAmount(l.priceText);
          return (
            <li key={l.itemId} className="space-y-1.5 p-2">
              <div>
                <p className="text-sm font-medium">{l.title}</p>
                {l.detail ? <p className="text-[11px] text-muted">{l.detail}</p> : null}
                <LinePricing line={l} price={price} money={money} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="tabular-nums">{l.qty} ×</span>
                <TextInput
                  inputMode="numeric"
                  aria-label={`Unit price for ${l.title}`}
                  value={l.priceText}
                  onChange={(e) => set(i, { priceText: e.target.value })}
                  placeholder="Unit price"
                  className="!min-h-9 w-28"
                />
                <TextInput
                  aria-label={`Unit for ${l.title}`}
                  list="invoice-units"
                  value={l.unitText}
                  onChange={(e) => set(i, { unitText: e.target.value })}
                  placeholder="Unit"
                  maxLength={30}
                  className="!min-h-9 w-20"
                />
                <span className="ml-auto font-semibold tabular-nums">
                  {Number.isFinite(price) ? money(price * l.qty) : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <datalist id="invoice-units">
        <option value="Pc" />
        <option value="Sheet" />
        <option value="Service" />
        <option value="Set" />
      </datalist>
      <p className="flex justify-between text-sm font-semibold">
        <span>Grand total</span>
        <span className="tabular-nums">{total == null ? "—" : money(total)}</span>
      </p>
    </div>
  );
}

/** A line's list price and agreed discount, and how far the typed price is below list (shown as a discount on the invoice). */
function LinePricing({ line, price, money }: { line: EditableLine; price: number; money: (n: number) => string }) {
  if (line.listUnitPrice == null) return null;
  const below = Number.isFinite(price) ? line.listUnitPrice - price : 0;
  const agreed = line.agreedDiscount;
  return (
    <p className="text-[11px] text-muted tabular-nums">
      List {money(line.listUnitPrice)}
      {agreed ? ` · agreed discount ${agreed.kind === "percent" ? `${agreed.value}%` : money(agreed.value)}` : ""}
      {below > 0 ? <span className="text-foreground"> · invoice shows −{money(below)} each</span> : null}
    </p>
  );
}

function GeneratePanel({
  orderId,
  money,
  pending,
  error,
  onGenerate,
}: {
  orderId: string;
  money: (n: number) => string;
  pending: boolean;
  error: string | null;
  onGenerate: (input: { lines: InvoiceLineInput[]; dueDate: string | null; notes: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ view: InvoiceView; input: { lines: InvoiceLineInput[]; dueDate: string | null; notes: string | null } } | null>(null);
  const [previewing, startPreview] = useTransition();
  const [lines, setLines] = useState<EditableLine[] | null>(null);
  const [currentAmount, setCurrentAmount] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function start() {
    setOpen(true);
    setLocalError(null);
    getInvoiceDraft(orderId).then((res) => {
      if (!res.ok) return setLocalError(res.error);
      setLines(toEditable(res.data.lines));
      setCurrentAmount(res.data.currentAmount);
    });
  }

  // Issuing is only possible from the preview, so whoever issues an invoice
  // has seen exactly what the client will get.
  function showPreview() {
    if (!lines) return;
    const parsed = toInput(lines);
    if (typeof parsed === "string") return setLocalError(parsed);
    setLocalError(null);
    const input = { lines: parsed, dueDate: dueDate || null, notes: notes || null };
    startPreview(async () => {
      const res = await previewInvoice(orderId, input);
      if (!res.ok) return setLocalError(res.error);
      setPreview({ view: res.data, input });
    });
  }

  const total = lines ? linesTotal(lines) : null;

  return (
    <section aria-label="Invoice" className="space-y-2 rounded-2xl border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">No invoice yet.</p>
        {!open ? (
          <Button variant="secondary" className="min-h-9 text-xs" onClick={start}>
            Generate invoice
          </Button>
        ) : null}
      </div>
      {open && lines ? (
        <div className="space-y-3">
          <LineEditor lines={lines} onChange={setLines} money={money} />
          {currentAmount != null && total != null && total !== currentAmount ? (
            <p className="text-xs text-warning-700 dark:text-warning-500">
              The order&apos;s price will change from {money(currentAmount)} to {money(total)} (the sum of the lines).
            </p>
          ) : null}
          <Field label="Due date (optional)">
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Notes on the invoice (optional)" hint="Payment terms, a thank-you…">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
          </Field>
          <div className="flex gap-2">
            <Button className="min-h-9 text-xs" loading={previewing} disabled={previewing} onClick={showPreview}>
              Preview invoice
            </Button>
            <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : open ? (
        <p className="text-xs text-muted">{localError ? null : "Loading…"}</p>
      ) : null}
      {localError || error ? <p className="text-xs text-error-600">{localError ?? error}</p> : null}
      <Drawer
        open={preview !== null}
        onClose={() => !pending && setPreview(null)}
        title="Preview — what the client will receive"
        size="lg"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button className="flex-1" loading={pending} disabled={pending} onClick={() => preview && onGenerate(preview.input)}>
              Issue invoice
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setPreview(null)}>
              Back to prices
            </Button>
            {error ? <p className="w-full text-xs text-error-600">{error}</p> : null}
          </div>
        }
      >
        <div className="space-y-3">
          <div role="note" className="rounded-xl border border-warning-100 bg-warning-50 p-3 text-xs text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-warning-500">
            <p className="font-semibold">Issuing locks this order&apos;s prices and discounts.</p>
            <p className="mt-0.5">
              Discounts can&apos;t be added, changed or removed on the order afterwards. Corrections are made by editing the invoice lines, and
              every change is logged.
            </p>
          </div>
          <DiscountHistory orderId={orderId} />
          {preview ? <InvoicePdf invoice={preview.view} download={false} /> : null}
        </div>
      </Drawer>
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
  onSubmit: (input: {
    amount: number;
    method: PaymentMethod;
    reference: string;
    note: string;
    excessDisposition: "wallet" | "physical_refund" | null;
  }) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<PaymentMethod>("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [excessDisposition, setExcessDisposition] = useState<"wallet" | "physical_refund" | "">("");
  const [error, setError] = useState<string | null>(null);
  const value = parseAmount(amount);
  const extra = Number.isFinite(value) ? value - balance : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(value) || value <= 0) return setError("Enter the amount received.");
    if (extra > 0 && !excessDisposition) return setError("Choose what happened to the excess amount.");
    const excessAction = excessDisposition === "wallet" ? "credit the excess to the client's wallet" : "record the excess as physically returned";
    if (!window.confirm(`Record ${money(value)} received${reference ? ` (ref ${reference})` : ""}?${extra > 0 ? ` ${money(extra)} will be ${excessAction}.` : ""}`)) return;
    setError(null);
    onSubmit({ amount: value, method, reference, note, excessDisposition: extra > 0 && excessDisposition ? excessDisposition : null });
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-semibold">Record a payment received</p>
      <Field label="Amount received" hint={extra > 0 ? `${money(extra)} exceeds the invoice balance of ${money(balance)}.` : undefined}>
        <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      {extra > 0 ? (
        <Field label="How was the excess handled?">
          <Select value={excessDisposition} onChange={(e) => setExcessDisposition(e.target.value as "wallet" | "physical_refund" | "")}>
            <option value="">Choose an option…</option>
            <option value="wallet">Credit {money(extra)} to the client&apos;s wallet</option>
            <option value="physical_refund">Return {money(extra)} physically</option>
          </Select>
        </Field>
      ) : null}
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
  money,
  pending,
  onSave,
  onCancel,
}: {
  invoice: StaffInvoiceView;
  money: (n: number) => string;
  pending: boolean;
  onSave: (input: { lines: InvoiceLineInput[] | null; dueDate: string | null; notes: string | null }) => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState(() => toEditable(invoice.draftLines));
  const [dueDate, setDueDate] = useState(invoice.dueDate ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const original = JSON.stringify(toEditable(invoice.draftLines));

  function save() {
    const changed = JSON.stringify(lines) !== original || !invoice.linesMatchTotal;
    let input: InvoiceLineInput[] | null = null;
    if (changed) {
      const parsed = toInput(lines);
      if (typeof parsed === "string") return setError(parsed);
      input = parsed;
    }
    setError(null);
    onSave({ lines: input, dueDate: dueDate || null, notes: notes || null });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      {!invoice.order.cancelled ? <LineEditor lines={lines} onChange={setLines} money={money} /> : null}
      <Field label="Due date">
        <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="Notes on the invoice">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
      </Field>
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="min-h-9 text-xs" loading={pending} onClick={save}>
          Save
        </Button>
        <Button variant="ghost" className="min-h-9 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
