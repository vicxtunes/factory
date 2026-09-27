import "server-only";

// Invoice use cases. An invoice is a document over an order: the total is the
// order's price, and everything about money — recording installments, what's
// been paid, the payment history — goes through lib/wallet's server API, so
// invoices, the wallet, and (later) a payment provider share one ledger.

import {
  applyWalletToOrder,
  lockOrderPrice,
  orderClientBalance,
  orderPaymentHistory,
  paidByOrders,
  recordOrderPayment,
} from "@/lib/wallet/orders";
import type { PaymentMethod } from "@/lib/wallet/types";

import { MAX_NOTES_LENGTH, invoiceBalance, invoiceNumber, invoiceStatus, isWellFormedToken } from "../policy";
import type { InvoiceListRow, InvoiceView, StaffInvoiceView } from "../types";
import * as directory from "./directory";
import { InvoiceError } from "./errors";
import type { InvoiceStaff } from "./identity";
import { invoiceUrl, newShareToken } from "./links";
import * as repo from "./repository";

const LIST_LIMIT = 500;

function cleanNotes(notes: string | null | undefined): string | null {
  const trimmed = (notes ?? "").trim();
  return trimmed ? trimmed.slice(0, MAX_NOTES_LENGTH) : null;
}

function cleanDueDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new InvoiceError("Enter a valid due date.");
  }
  return value;
}

async function buildView(invoice: repo.InvoiceRow, order: directory.InvoiceOrder): Promise<InvoiceView> {
  const [paidMap, payments] = await Promise.all([paidByOrders([order.id]), orderPaymentHistory(order.id)]);
  const paid = paidMap[order.id] ?? 0;
  const amount = order.amount ?? 0;
  return {
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    issuedAt: invoice.issued_at,
    dueDate: invoice.due_date,
    notes: invoice.notes,
    status: invoiceStatus(amount, paid, order.cancelled),
    amount,
    paid,
    balance: invoiceBalance(amount, paid),
    order: {
      id: order.id,
      orderNo: order.orderNo,
      placedAt: order.placedAt,
      deliveryDate: order.deliveryDate,
      cancelled: order.cancelled,
      cancelReason: order.cancelReason,
    },
    client: order.client,
    lines: order.lines,
    payments,
  };
}

async function staffView(invoice: repo.InvoiceRow): Promise<StaffInvoiceView> {
  const order = await directory.loadOrder(invoice.order_id);
  if (!order) throw new InvoiceError("This invoice's order no longer exists.");
  const [view, shareUrl, walletBalance] = await Promise.all([
    buildView(invoice, order),
    invoiceUrl(invoice.share_token),
    orderClientBalance(order.id),
  ]);
  return { ...view, shareUrl, walletBalance, createdByName: invoice.created_by_name };
}

async function loadInvoice(invoiceId: string): Promise<repo.InvoiceRow> {
  const invoice = await repo.byId(invoiceId);
  if (!invoice) throw new InvoiceError("Invoice not found.");
  return invoice;
}

// --- Staff -----------------------------------------------------------------

export async function getForOrder(orderId: string): Promise<StaffInvoiceView | null> {
  const invoice = await repo.byOrder(orderId);
  return invoice ? staffView(invoice) : null;
}

export async function getById(invoiceId: string): Promise<StaffInvoiceView> {
  return staffView(await loadInvoice(invoiceId));
}

/**
 * Creates the order's invoice (or returns the existing one — one per order).
 * Fixes the order's price first, so the invoice total can't move if catalog
 * prices change later.
 */
export async function generate(
  staff: InvoiceStaff,
  orderId: string,
  input: { dueDate?: string | null; notes?: string | null },
): Promise<StaffInvoiceView> {
  const existing = await repo.byOrder(orderId);
  if (existing) return staffView(existing);

  const order = await directory.loadOrder(orderId);
  if (!order) throw new InvoiceError("Order not found.");
  if (order.cancelled) throw new InvoiceError("This order was cancelled.");
  if (!order.approved) throw new InvoiceError("Confirm the order's price with the client first, then invoice it.");
  if (order.amount == null) throw new InvoiceError("Set the order's amount first — some items have no price.");

  await lockOrderPrice(orderId);
  const invoice = await repo.insert({
    orderId,
    invoiceNo: invoiceNumber(order.orderNo),
    shareToken: newShareToken(),
    dueDate: cleanDueDate(input.dueDate),
    notes: cleanNotes(input.notes),
    createdBy: staff,
  });
  return staffView(invoice);
}

export async function update(invoiceId: string, input: { dueDate?: string | null; notes?: string | null }): Promise<StaffInvoiceView> {
  const invoice = await loadInvoice(invoiceId);
  await repo.update(invoice.id, { due_date: cleanDueDate(input.dueDate), notes: cleanNotes(input.notes) });
  return getById(invoice.id);
}

/** A new link; the old one stops working straight away. */
export async function resetLink(invoiceId: string): Promise<StaffInvoiceView> {
  const invoice = await loadInvoice(invoiceId);
  await repo.update(invoice.id, { share_token: newShareToken() });
  return getById(invoice.id);
}

/** Records an installment. Anything above the balance goes to the client's wallet as credit. */
export async function recordPayment(
  staff: InvoiceStaff,
  invoiceId: string,
  input: { amount: number; method: PaymentMethod; reference?: string | null; note?: string | null },
): Promise<{ applied: number; toWallet: number; invoice: StaffInvoiceView }> {
  const invoice = await loadInvoice(invoiceId);
  // Money for a settled invoice belongs in the wallet (Wallets → Record deposit), not here.
  const current = await getById(invoice.id);
  if (current.status === "paid") throw new InvoiceError("This invoice is already paid.");
  const { applied, toWallet } = await recordOrderPayment(staff, invoice.order_id, input);
  return { applied, toWallet, invoice: await getById(invoice.id) };
}

/** Pays what the client's wallet balance covers. */
export async function applyWallet(staff: InvoiceStaff, invoiceId: string): Promise<{ applied: number; invoice: StaffInvoiceView }> {
  const invoice = await loadInvoice(invoiceId);
  const applied = await applyWalletToOrder(staff, invoice.order_id);
  return { applied, invoice: await getById(invoice.id) };
}

export async function list(): Promise<InvoiceListRow[]> {
  const invoices = await repo.list(LIST_LIMIT);
  const orderIds = invoices.map((i) => i.order_id);
  const [orders, paid] = await Promise.all([directory.loadOrders(orderIds), paidByOrders(orderIds)]);
  return invoices.flatMap((inv) => {
    const order = orders[inv.order_id];
    if (!order) return [];
    const amount = order.amount ?? 0;
    const p = paid[inv.order_id] ?? 0;
    return [
      {
        id: inv.id,
        invoiceNo: inv.invoice_no,
        orderId: order.id,
        orderNo: order.orderNo,
        clientName: order.client.name,
        issuedAt: inv.issued_at,
        dueDate: inv.due_date,
        status: invoiceStatus(amount, p, order.cancelled),
        amount,
        paid: p,
        balance: invoiceBalance(amount, p),
      },
    ];
  });
}

// --- Client ----------------------------------------------------------------

/** The share link for a signed-in client's own order, or null when it hasn't been invoiced. */
export async function linkForClientOrder(clientId: string, orderId: string): Promise<string | null> {
  const invoice = await repo.byOrder(orderId);
  if (!invoice) return null;
  const order = await directory.loadOrder(orderId);
  if (!order || order.clientId !== clientId) return null;
  return invoiceUrl(invoice.share_token);
}

// --- Public (anyone holding the link) ---------------------------------------

export async function byToken(token: string): Promise<InvoiceView | null> {
  if (!isWellFormedToken(token)) return null;
  const invoice = await repo.byToken(token);
  if (!invoice) return null;
  const order = await directory.loadOrder(invoice.order_id);
  return order ? buildView(invoice, order) : null;
}
