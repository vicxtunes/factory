"use server";

// The browser's only entry point to bookings. The tenant always comes from
// the caller's studio (packages/lib/studios), never from the browser; an id
// from another studio is simply "not found".
//
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { invoices, quotations } from "@repo/lib/billing/server";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { deleteStudioRecord, studioOfCaller } from "@repo/lib/studios/server";

import { bookingIdSchema, bookingInputSchema, bookingStatusSchema, bookingWhenSchema, type Booking } from "./core";
import { bookings } from "./server";

export async function createBooking(input: unknown): Promise<Result<string>> {
  return runAction("bookings", async () => {
    const { scope } = await studioOfCaller("bookings");
    const id = await bookings.create(scope, parseInput(bookingInputSchema, input));
    revalidatePath("/studio", "layout");
    return id;
  });
}

/**
 * Changes the details. The quotation it came from never changes. The booking
 * is where its day and times live: its quotation and invoice are rewritten to
 * say the same.
 */
export async function updateBooking(id: unknown, input: unknown): Promise<Result> {
  return runAction("bookings", async () => {
    const { scope } = await studioOfCaller("bookings");
    const details = parseInput(bookingInputSchema, input);
    const bookingId = parseInput(bookingIdSchema, id);
    await bookings.update(scope, bookingId, details);
    const b = (await bookings.get(scope, bookingId))?.booking;
    const shoot = { date: details.date, startTime: details.startTime, endTime: details.endTime };
    if (b?.quotationId) await quotations.setShoot(scope, b.quotationId, shoot);
    const invoiceId = b?.invoiceId ?? (b?.quotationId ? await invoices.idForQuotation(scope, b.quotationId) : null);
    if (invoiceId) await invoices.setShoot(scope, invoiceId, shoot);
    revalidatePath("/studio", "layout");
  });
}

/** For a form's warning: the caller's bookings this day and these times would clash with, leaving out the one being changed. Warns, never blocks. */
export async function findClashes(when: unknown, exceptId: unknown): Promise<Result<Booking[]>> {
  return runAction("bookings", async () => {
    const { scope } = await studioOfCaller("bookings");
    return bookings.clashesWith(scope, parseInput(bookingWhenSchema, when), exceptId == null ? null : parseInput(bookingIdSchema, exceptId));
  });
}

/** Confirm, complete, cancel or reopen. */
export async function setBookingStatus(id: unknown, status: unknown): Promise<Result> {
  return runAction("bookings", async () => {
    const { scope } = await studioOfCaller("bookings");
    await bookings.setStatus(scope, parseInput(bookingIdSchema, id), parseInput(bookingStatusSchema, status));
    revalidatePath("/studio", "layout");
  });
}

/** Deletes the booking for good (its project, quotation and invoice stay, unlinked). */
export async function deleteBooking(id: unknown): Promise<Result> {
  return runAction("bookings", async () => {
    const { scope } = await studioOfCaller("bookings");
    await deleteStudioRecord(scope, "booking", parseInput(bookingIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}
