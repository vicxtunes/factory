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
//
// Bookings follow automatically (packages/lib/bookings): an invoice with a
// shoot day is booked (confirmed) when it's saved, a quotation with one when
// the customer accepts it (tentative), and voiding an invoice cancels its booking.

import { revalidatePath } from "next/cache";

import { bookingIdSchema } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { productRequests } from "@repo/lib/product-requests/server";
import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { deleteStudioRecord, studioOfCaller, studios } from "@repo/lib/studios/server";
import { WalletError, checkStudioRequestPayment, startStudioRequestPayment } from "@repo/lib/wallet/studio";
import type { MobileMoneyCollection } from "@repo/lib/wallet/types";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BillingError } from "./ports";

import {
  documentSettingsSchema,
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
import { documentSettings, invoices, quotations } from "./server";

const LIST = "/studio/quotations";

/** A new quotation; made from a booking (`bookingId`), it's that booking's: accepting it books nothing new. */
export async function createQuotation(input: unknown, bookingId?: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    const details = parseInput(quotationInputSchema, input);
    const booking = bookingId == null ? null : parseInput(bookingIdSchema, bookingId);
    if (booking) await bookings.checkDocumentFor(scope, booking, details.customerId, "quotation");
    const id = await quotations.create(scope, details);
    if (booking) await bookings.setQuotation(scope, booking, id);
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function updateQuotation(id: unknown, input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    const saved = await quotations.update(scope, parseInput(quotationIdSchema, id), parseInput(quotationInputSchema, input));
    revalidatePath(LIST, "layout");
    return saved;
  });
}

/** A new link for the quotation; the old one stops working. */
export async function resetQuotationLink(id: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    await quotations.resetLink(scope, parseInput(quotationIdSchema, id));
    revalidatePath(LIST, "layout");
  });
}

/** The customer accepts or declines, through the link. No sign-in: the token is the permission. */
export async function respondToQuotation(token: unknown, answer: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const link = parseInput(shareTokenSchema, token);
    const response = parseInput(quotationResponseSchema, answer);
    await quotations.respond(link, response);
    if (response.decision === "accept") await bookAccepted(link);
    revalidatePath(`/q/${link}`);
  });
}

/** An accepted quotation with a shoot day, booked (tentative). Its answer is recorded either way: a failure here is logged, not shown to the customer. */
async function bookAccepted(link: string): Promise<void> {
  try {
    const found = await quotations.byLink(link);
    if (!found) return;
    const { quotation: q, scope } = found;
    await bookings.bookAcceptedQuotation(scope, q.id, { customerId: q.customerId, firstLine: q.lines[0]?.description ?? null, total: q.total, shoot: q.shoot });
    revalidatePath("/studio", "layout");
  } catch (err) {
    console.error("billing: booking an accepted quotation failed:", err);
  }
}

/** Keeps a saved invoice's booking in step: booked, moved or confirmed. */
async function bookInvoice(scope: TenantScope, id: string): Promise<void> {
  const invoice = await invoices.get(scope, id);
  if (!invoice) return;
  await bookings.bookInvoice(scope, id, {
    customerId: invoice.customerId,
    firstLine: invoice.lines[0]?.description ?? null,
    total: invoice.total,
    shoot: invoice.shoot,
    quotationId: invoice.sourceId,
  });
}

// ── Paying from a link ───────────────────────────────────────────────────

/** Wallet errors are safe to show; let them through as this module's. */
async function walletStep<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof WalletError) throw new BillingError(err.message);
    throw err;
  }
}

/** Prompts `phone` for `amount` towards an invoice; the money goes to the studio owner's wallet. */
async function promptForInvoice(scope: TenantScope, invoiceId: string, amount: number, phone: unknown): Promise<MobileMoneyCollection> {
  const invoice = await invoices.get(scope, invoiceId);
  const studio = await studios.get(scope.tenantId);
  if (!invoice || !studio) throw new BillingError("That invoice no longer exists.");
  if (invoice.voidedAt) throw new BillingError("This invoice is void.");
  if (invoice.balance <= 0) throw new BillingError("This invoice is already paid in full.");
  if (amount > invoice.balance) throw new BillingError("That's more than what's left to pay.");
  return walletStep(() =>
    startStudioRequestPayment({
      ownerClientId: studio.ownerClientId,
      invoiceId,
      studioName: studio.name,
      payerName: invoice.billTo.name,
      amount,
      phone: String(phone ?? ""),
    }),
  );
}

/**
 * "Approve & Pay" on a quotation's link: accepted (if it wasn't), its invoice
 * made, and the phone prompted for `amount` towards it (in full or a
 * deposit). No sign-in: the token is the permission.
 */
export async function approveAndPayQuotation(token: unknown, input: { amount: unknown; phone: unknown }): Promise<Result<MobileMoneyCollection>> {
  return runAction("billing", async () => {
    const link = parseInput(shareTokenSchema, token);
    const found = await quotations.byLink(link);
    if (!found) throw new BillingError("This link isn't valid any more. Ask for a new one.");
    const { quotation, scope } = found;
    const amount = Number(input.amount);
    if (amount > quotation.total) throw new BillingError("That's more than the quotation's total.");

    // Made for a booking or order still waiting for the studio: paying confirms that, which accepts this and makes its invoice.
    const studio = await studios.get(scope.tenantId);
    if (!studio) throw new BillingError("This link isn't valid any more. Ask for a new one.");
    const bookingId = await bookings.idForQuotation(scope, quotation.id);
    const booking = bookingId ? (await bookings.get(scope, bookingId))?.booking : null;
    const request = await productRequests.forQuotation(scope, quotation.id);
    const waiting = booking?.status === "requested" ? { bookingId: booking.id } : request?.status === "requested" ? { requestId: request.id } : null;
    if (waiting && quotation.status === "open") {
      return walletStep(() =>
        startStudioRequestPayment({ ...waiting, ownerClientId: studio.ownerClientId, studioName: studio.name, payerName: quotation.billTo.name, amount, phone: String(input.phone ?? "") }),
      );
    }

    if (quotation.status === "open") {
      await quotations.respond(link, { decision: "accept", reason: null });
      await bookAccepted(link);
    } else if (quotation.status !== "accepted") {
      throw new BillingError(quotation.status === "expired" ? "This quotation has expired. Ask for an updated one." : "This quotation was declined.");
    }
    const invoiceId = await invoices.fromQuotation(scope, quotation.id);
    await bookInvoice(scope, invoiceId);
    revalidatePath(`/q/${link}`);
    revalidatePath("/studio", "layout");
    return promptForInvoice(scope, invoiceId, amount, input.phone);
  });
}

/** "Pay" on an invoice's link: the phone is prompted for `amount` towards what's left. */
export async function payInvoiceByLink(token: unknown, input: { amount: unknown; phone: unknown }): Promise<Result<MobileMoneyCollection>> {
  return runAction("billing", async () => {
    const found = await invoices.byLink(parseInput(shareTokenSchema, token));
    if (!found) throw new BillingError("This link isn't valid any more. Ask for a new one.");
    return promptForInvoice(found.scope, found.invoice.id, Number(input.amount), input.phone);
  });
}

/** The pay sheet following its payment; once it's through, the payment is on the invoice. */
export async function checkDocumentPayment(collectionId: unknown): Promise<Result<MobileMoneyCollection>> {
  return runAction("billing", async () => {
    const payment = await walletStep(() => checkStudioRequestPayment(parseInput(invoiceIdSchema, collectionId)));
    if (payment.status === "succeeded") {
      await applyStudioPayment(payment.id);
      revalidatePath("/studio", "layout");
    }
    return payment;
  });
}

// ── Invoices, payments, receipts ─────────────────────────────────────────

const INVOICES = "/studio/invoices";

/** A new invoice, booked from its shoot day; made from a booking (`bookingId`), it's that booking's, which it confirms. */
export async function createInvoice(input: unknown, bookingId?: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    const details = parseInput(invoiceInputSchema, input);
    const booking = bookingId == null ? null : parseInput(bookingIdSchema, bookingId);
    if (booking) await bookings.checkDocumentFor(scope, booking, details.customerId, "invoice");
    const id = await invoices.create(scope, details);
    if (booking) await bookings.setInvoice(scope, booking, id);
    await bookInvoice(scope, id);
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function updateInvoice(id: unknown, input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    const saved = await invoices.update(scope, parseInput(invoiceIdSchema, id), parseInput(invoiceInputSchema, input));
    await bookInvoice(scope, saved);
    revalidatePath("/studio", "layout");
    return saved;
  });
}

/** The invoice for an accepted quotation: made now from its lines, or the one already made. */
export async function invoiceFromQuotation(quotationId: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    const id = await invoices.fromQuotation(scope, parseInput(quotationIdSchema, quotationId));
    await bookInvoice(scope, id);
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function recordPayment(invoiceId: unknown, input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    const id = await invoices.recordPayment(scope, parseInput(invoiceIdSchema, invoiceId), parseInput(paymentInputSchema, input));
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function voidPayment(paymentId: unknown, reason: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    await invoices.voidPayment(scope, parseInput(paymentIdSchema, paymentId), parseInput(voidReasonSchema, reason));
    revalidatePath("/studio", "layout");
  });
}

export async function voidInvoice(id: unknown, reason: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    const invoiceId = parseInput(invoiceIdSchema, id);
    await invoices.voidInvoice(scope, invoiceId, parseInput(voidReasonSchema, reason));
    await bookings.cancelForInvoice(scope, invoiceId);
    revalidatePath("/studio", "layout");
  });
}

/** A new link for the invoice; the old one stops working. */
export async function resetInvoiceLink(id: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    await invoices.resetLink(scope, parseInput(invoiceIdSchema, id));
    revalidatePath(INVOICES, "layout");
  });
}

/** Saves the caller's studio's Document settings: terms, payment instructions, signature. */
export async function saveDocumentSettings(input: unknown): Promise<Result<void>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    await documentSettings.save(scope.tenantId, parseInput(documentSettingsSchema, input));
    revalidatePath("/studio", "layout");
  });
}

/** Deletes a quotation for good (an invoice made from it stays, unlinked). */
export async function deleteQuotation(id: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    await deleteStudioRecord(scope, "document", parseInput(quotationIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}

/** Deletes an invoice for good, with its recorded payments. */
export async function deleteInvoice(id: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller("money");
    await deleteStudioRecord(scope, "document", parseInput(invoiceIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}
