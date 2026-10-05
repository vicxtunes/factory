"use server";

// Invoice server actions — the module's public API for the browser.
//
// Thin shells: check who's calling (server/identity.ts), call one service
// function, refresh pages that show invoices, and turn the outcome into an
// InvoiceResult. Expected failures (InvoiceError, and the wallet's
// WalletError for money rules) come back as `{ ok: false, error }` with a
// sentence the person can act on; anything else is logged and replaced with a
// generic message.

import { revalidatePath } from "next/cache";

import { WalletError } from "@repo/lib/wallet/orders";
import type { OrderPaymentExcessDisposition, PaymentMethod } from "@repo/lib/wallet/types";

import { InvoiceError } from "./server/errors";
import { requireBoss, requireClientId, requireStaff } from "./server/identity";
import * as directory from "./server/directory";
import * as service from "./server/service";
import type {
  ClientOrderDocument,
  DiscountHistoryEntry,
  DraftLine,
  InvoiceListRow,
  InvoiceResult,
  InvoiceSettingsInput,
  InvoiceView,
  StaffInvoiceView,
} from "./types";
import { clientPath } from "@repo/lib/client-portal/paths";

async function run<T>(fn: () => Promise<T>): Promise<InvoiceResult<T>>;
async function run(fn: () => Promise<void>): Promise<InvoiceResult>;
async function run<T>(fn: () => Promise<T>): Promise<{ ok: true; data?: T } | { ok: false; error: string }> {
  try {
    const data = await fn();
    return data === undefined ? { ok: true } : { ok: true, data };
  } catch (err) {
    if (err instanceof InvoiceError || err instanceof WalletError) return { ok: false, error: err.message };
    console.error("invoice action failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refresh() {
  for (const path of ["/dashboard/invoices", "/dashboard/wallets", clientPath("/payment"), clientPath("/orders")]) {
    revalidatePath(path);
  }
}

export interface InvoicePaymentInput {
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
  excessDisposition?: OrderPaymentExcessDisposition | null;
}

// --- Staff -----------------------------------------------------------------

/** The order's invoice, or null when it hasn't been generated yet. */
export async function getInvoiceForOrder(orderId: string): Promise<InvoiceResult<StaffInvoiceView | null>> {
  return run(async () => {
    await requireStaff();
    return service.getForOrder(orderId);
  });
}

/** The price editor's starting lines for an order about to be invoiced. */
export async function getInvoiceDraft(
  orderId: string,
): Promise<InvoiceResult<{ lines: DraftLine[]; currentAmount: number | null }>> {
  return run(async () => {
    await requireStaff();
    return service.draft(orderId);
  });
}

export interface InvoiceLineInput {
  itemId: string;
  unitPrice: number;
  unit?: string | null;
}

/** Every line discount given, changed or removed on the order, for staff. */
export async function getDiscountHistory(orderId: string): Promise<InvoiceResult<DiscountHistoryEntry[]>> {
  return run(async () => {
    await requireStaff();
    return directory.loadDiscountHistory(orderId);
  });
}

/** The invoice as the client would receive it with these lines, without saving it. */
export async function previewInvoice(
  orderId: string,
  input: { lines: InvoiceLineInput[]; dueDate?: string | null; notes?: string | null },
): Promise<InvoiceResult<InvoiceView>> {
  return run(async () => {
    await requireStaff();
    return service.preview(orderId, input);
  });
}

export async function generateInvoice(
  orderId: string,
  input: { lines: InvoiceLineInput[]; dueDate?: string | null; notes?: string | null },
): Promise<InvoiceResult<StaffInvoiceView>> {
  return run(async () => {
    const invoice = await service.generate(await requireStaff(), orderId, input);
    refresh();
    return invoice;
  });
}

/** New line prices on an existing invoice; the order's total follows. */
export async function updateInvoiceLines(invoiceId: string, lines: InvoiceLineInput[]): Promise<InvoiceResult<StaffInvoiceView>> {
  return run(async () => {
    await requireStaff();
    const invoice = await service.updateLines(invoiceId, lines);
    refresh();
    return invoice;
  });
}

export async function updateInvoice(
  invoiceId: string,
  input: { dueDate?: string | null; notes?: string | null },
): Promise<InvoiceResult<StaffInvoiceView>> {
  return run(async () => {
    await requireStaff();
    const invoice = await service.update(invoiceId, input);
    refresh();
    return invoice;
  });
}

export async function resetInvoiceLink(invoiceId: string): Promise<InvoiceResult<StaffInvoiceView>> {
  return run(async () => {
    await requireStaff();
    return service.resetLink(invoiceId);
  });
}

export async function recordInvoicePayment(
  invoiceId: string,
  input: InvoicePaymentInput,
): Promise<InvoiceResult<{ applied: number; toWallet: number; physicallyRefunded: number; invoice: StaffInvoiceView }>> {
  return run(async () => {
    const result = await service.recordPayment(await requireStaff(), invoiceId, input);
    refresh();
    return result;
  });
}

export async function applyWalletToInvoice(
  invoiceId: string,
): Promise<InvoiceResult<{ applied: number; invoice: StaffInvoiceView }>> {
  return run(async () => {
    const result = await service.applyWallet(await requireStaff(), invoiceId);
    refresh();
    return result;
  });
}

export async function listInvoices(): Promise<InvoiceResult<InvoiceListRow[]>> {
  return run(async () => {
    await requireStaff();
    return service.list();
  });
}

// --- Settings (boss) ---------------------------------------------------------

/** What's printed on every invoice: company details, terms, signature line. */
export async function getInvoiceSettings(): Promise<InvoiceResult<InvoiceSettingsInput>> {
  return run(async () => {
    await requireStaff();
    return service.getSettings();
  });
}

/** Starts uploading the invoice's logo or signature (a PNG): where the browser puts it. */
export async function startInvoiceImageUpload(
  kind: "logo" | "signature",
): Promise<InvoiceResult<{ bucket: string; path: string; token: string }>> {
  return run(async () => {
    await requireBoss();
    return service.startImageUpload(kind === "signature" ? "signature" : "logo");
  });
}

/** The uploaded image's URL, for the settings form; it's kept when the settings are saved. */
export async function confirmInvoiceImageUpload(path: string): Promise<InvoiceResult<string>> {
  return run(async () => {
    await requireBoss();
    return service.confirmImageUpload(path);
  });
}

export async function saveInvoiceSettings(input: InvoiceSettingsInput): Promise<InvoiceResult<InvoiceSettingsInput>> {
  return run(async () => {
    await requireBoss();
    const saved = await service.saveSettings(input);
    refresh();
    return saved;
  });
}

// --- Client ----------------------------------------------------------------

/** For one of the signed-in client's orders: the invoice link, or the pro forma's when not invoiced yet. */
export async function getMyInvoiceLink(
  orderId: string,
): Promise<InvoiceResult<ClientOrderDocument | null>> {
  return run(async () => service.linkForClientOrder(await requireClientId(), orderId));
}
