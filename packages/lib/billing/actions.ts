"use server";

// The browser's only entry points to billing.
//
// Studio actions: the tenant always comes from the caller's studio
// (packages/lib/studios), never from the browser; an id from another studio
// is simply "not found". The one link action: the token is the only input
// that chooses the document, and it does nothing but answer that quotation.
// Invoices and receipts are view-only by link.
//
// Every action: who / which document → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import {
  invoiceIdSchema,
  invoiceInputSchema,
  paymentIdSchema,
  paymentInputSchema,
  quotationIdSchema,
  quotationInputSchema,
  quotationResponseSchema,
  shareTokenSchema,
  voidReasonSchema,
} from "./core";
import { invoices, quotations } from "./server";

const LIST = "/studio/quotations";

export async function createQuotation(input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    const id = await quotations.create(scope, parseInput(quotationInputSchema, input));
    revalidatePath(LIST);
    return id;
  });
}

export async function updateQuotation(id: unknown, input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    const saved = await quotations.update(scope, parseInput(quotationIdSchema, id), parseInput(quotationInputSchema, input));
    revalidatePath(LIST, "layout");
    return saved;
  });
}

/** A new link for the quotation; the old one stops working. */
export async function resetQuotationLink(id: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    await quotations.resetLink(scope, parseInput(quotationIdSchema, id));
    revalidatePath(LIST, "layout");
  });
}

/** The customer accepts or declines, through the link. No sign-in: the token is the permission. */
export async function respondToQuotation(token: unknown, answer: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const link = parseInput(shareTokenSchema, token);
    await quotations.respond(link, parseInput(quotationResponseSchema, answer));
    revalidatePath(`/q/${link}`);
  });
}

// ── Invoices, payments, receipts ─────────────────────────────────────────

const INVOICES = "/studio/invoices";

export async function createInvoice(input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    const id = await invoices.create(scope, parseInput(invoiceInputSchema, input));
    revalidatePath(INVOICES);
    return id;
  });
}

export async function updateInvoice(id: unknown, input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    const saved = await invoices.update(scope, parseInput(invoiceIdSchema, id), parseInput(invoiceInputSchema, input));
    revalidatePath(INVOICES, "layout");
    return saved;
  });
}

/** The invoice for an accepted quotation: made now from its lines, or the one already made. */
export async function invoiceFromQuotation(quotationId: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    const id = await invoices.fromQuotation(scope, parseInput(quotationIdSchema, quotationId));
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function recordPayment(invoiceId: unknown, input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    const id = await invoices.recordPayment(scope, parseInput(invoiceIdSchema, invoiceId), parseInput(paymentInputSchema, input));
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function voidPayment(paymentId: unknown, reason: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    await invoices.voidPayment(scope, parseInput(paymentIdSchema, paymentId), parseInput(voidReasonSchema, reason));
    revalidatePath("/studio", "layout");
  });
}

export async function voidInvoice(id: unknown, reason: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    await invoices.voidInvoice(scope, parseInput(invoiceIdSchema, id), parseInput(voidReasonSchema, reason));
    revalidatePath("/studio", "layout");
  });
}

/** A new link for the invoice; the old one stops working. */
export async function resetInvoiceLink(id: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    await invoices.resetLink(scope, parseInput(invoiceIdSchema, id));
    revalidatePath(INVOICES, "layout");
  });
}
