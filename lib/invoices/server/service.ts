import "server-only";

// Invoice use cases. An invoice is a document over an order: the total is the
// order's price, and everything about money — recording installments, what's
// been paid, the payment history — goes through lib/wallet's server API, so
// invoices, the wallet, and (later) a payment provider share one ledger.

import {
  applyWalletToOrder,
  orderClientBalance,
  orderPaymentHistory,
  paidByOrders,
  recordOrderPayment,
} from "@/lib/wallet/orders";
import type { PaymentMethod } from "@/lib/wallet/types";

import { MAX_NOTES_LENGTH, invoiceBalance, invoiceNumber, invoiceStatus, isWellFormedToken } from "../policy";
import type {
  DraftLine,
  InvoiceIssuer,
  InvoiceListRow,
  InvoiceSettingsInput,
  InvoiceView,
  StaffInvoiceView,
} from "../types";
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

/** Used until the boss saves settings (the migration seeds them, so this is a safety net). */
const DEFAULT_ISSUER: InvoiceIssuer = {
  companyName: "Aming Company",
  address: null,
  phone: null,
  email: null,
  terms: [],
  signatureCompany: null,
};

async function getIssuer(): Promise<InvoiceIssuer> {
  const row = await repo.getSettings();
  if (!row) return DEFAULT_ISSUER;
  return {
    companyName: row.company_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    terms: (row.terms ?? "")
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean),
    signatureCompany: row.signature_company,
  };
}

/** Checks the price editor's lines: every item once, whole-shilling prices of 0 or more. */
function cleanLines(order: directory.InvoiceOrder, lines: { itemId: string; unitPrice: number; unit?: string | null }[]) {
  const ids = new Set(order.draftLines.map((l) => l.itemId));
  if (lines.length !== ids.size || !lines.every((l) => ids.has(l.itemId))) {
    throw new InvoiceError("Every item on the order needs a price.");
  }
  return lines.map((l) => {
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) {
      throw new InvoiceError("Every line needs a price in whole shillings (0 or more).");
    }
    return { itemId: l.itemId, unitPrice: l.unitPrice, unit: (l.unit ?? "").trim().slice(0, 30) || null };
  });
}

async function buildView(invoice: repo.InvoiceRow, order: directory.InvoiceOrder): Promise<InvoiceView> {
  const [paidMap, payments, issuer] = await Promise.all([
    paidByOrders([order.id]),
    orderPaymentHistory(order.id),
    getIssuer(),
  ]);
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
    issuer,
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
  const lineSum = order.lines.every((l) => l.lineTotal != null)
    ? order.lines.reduce((sum, l) => sum + (l.lineTotal as number), 0)
    : null;
  return {
    ...view,
    shareUrl,
    walletBalance,
    createdByName: invoice.created_by_name,
    draftLines: order.draftLines,
    linesMatchTotal: lineSum === view.amount,
  };
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

/** The price editor's starting lines for an order that hasn't been invoiced yet. */
export async function draft(orderId: string): Promise<{ lines: DraftLine[]; currentAmount: number | null }> {
  const order = await directory.loadOrder(orderId);
  if (!order) throw new InvoiceError("Order not found.");
  return { lines: order.draftLines, currentAmount: order.amount };
}

/**
 * Creates the order's invoice (or returns the existing one — one per order).
 * Staff confirm every line's unit price first; the order's price becomes the
 * sum of the lines, so the invoice total can't move if catalog prices change.
 */
export async function generate(
  staff: InvoiceStaff,
  orderId: string,
  input: {
    lines: { itemId: string; unitPrice: number; unit?: string | null }[];
    dueDate?: string | null;
    notes?: string | null;
  },
): Promise<StaffInvoiceView> {
  const existing = await repo.byOrder(orderId);
  if (existing) return staffView(existing);

  const order = await directory.loadOrder(orderId);
  if (!order) throw new InvoiceError("Order not found.");
  if (order.cancelled) throw new InvoiceError("This order was cancelled.");
  if (!order.approved) throw new InvoiceError("Confirm the order's price with the client first, then invoice it.");
  const dueDate = cleanDueDate(input.dueDate);

  await repo.setLines(orderId, cleanLines(order, input.lines));
  const invoice = await repo.insert({
    orderId,
    invoiceNo: invoiceNumber(order.orderNo),
    shareToken: newShareToken(),
    dueDate,
    notes: cleanNotes(input.notes),
    createdBy: staff,
  });
  return staffView(invoice);
}

/** Changes line prices on an existing invoice; the order's price follows. */
export async function updateLines(
  invoiceId: string,
  lines: { itemId: string; unitPrice: number; unit?: string | null }[],
): Promise<StaffInvoiceView> {
  const invoice = await loadInvoice(invoiceId);
  const order = await directory.loadOrder(invoice.order_id);
  if (!order) throw new InvoiceError("This invoice's order no longer exists.");
  if (order.cancelled) throw new InvoiceError("This order was cancelled.");
  await repo.setLines(order.id, cleanLines(order, lines));
  return getById(invoice.id);
}

// --- Settings (boss) ---------------------------------------------------------

export async function getSettings(): Promise<InvoiceSettingsInput> {
  const issuer = await getIssuer();
  return {
    companyName: issuer.companyName,
    address: issuer.address ?? "",
    phone: issuer.phone ?? "",
    email: issuer.email ?? "",
    terms: issuer.terms.join("\n"),
    signatureCompany: issuer.signatureCompany ?? "",
  };
}

export async function saveSettings(input: InvoiceSettingsInput): Promise<InvoiceSettingsInput> {
  const text = (v: string, max: number) => v.trim().slice(0, max) || null;
  const companyName = text(input.companyName, 120);
  if (!companyName) throw new InvoiceError("The company name is required.");
  await repo.saveSettings({
    company_name: companyName,
    address: text(input.address, 200),
    phone: text(input.phone, 60),
    email: text(input.email, 120),
    terms: text(input.terms, 3000),
    signature_company: text(input.signatureCompany, 120),
  });
  return getSettings();
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
