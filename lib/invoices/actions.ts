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

import { WalletError } from "@/lib/wallet/orders";
import type { PaymentMethod } from "@/lib/wallet/types";

import { InvoiceError } from "./server/errors";
import { requireClientId, requireStaff } from "./server/identity";
import * as service from "./server/service";
import type { InvoiceListRow, InvoiceResult, StaffInvoiceView } from "./types";

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
  for (const path of ["/dashboard/invoices", "/dashboard/wallets", "/client-side/payment", "/client-side/orders"]) {
    revalidatePath(path);
  }
}

export interface InvoicePaymentInput {
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
}

// --- Staff -----------------------------------------------------------------

/** The order's invoice, or null when it hasn't been generated yet. */
export async function getInvoiceForOrder(orderId: string): Promise<InvoiceResult<StaffInvoiceView | null>> {
  return run(async () => {
    await requireStaff();
    return service.getForOrder(orderId);
  });
}

export async function generateInvoice(
  orderId: string,
  input: { dueDate?: string | null; notes?: string | null } = {},
): Promise<InvoiceResult<StaffInvoiceView>> {
  return run(async () => {
    const invoice = await service.generate(await requireStaff(), orderId, input);
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
): Promise<InvoiceResult<{ applied: number; toWallet: number; invoice: StaffInvoiceView }>> {
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

// --- Client ----------------------------------------------------------------

/** The invoice link for one of the signed-in client's orders, or null when it hasn't been invoiced. */
export async function getMyInvoiceLink(orderId: string): Promise<InvoiceResult<string | null>> {
  return run(async () => service.linkForClientOrder(await requireClientId(), orderId));
}
