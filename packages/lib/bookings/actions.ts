"use server";

// The browser's only entry point to bookings. The tenant always comes from
// the caller's studio (packages/lib/studios), never from the browser; an id
// from another studio is simply "not found".
//
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { bookingIdSchema, bookingInputSchema, bookingStatusSchema } from "./core";
import { bookings } from "./server";

export async function createBooking(input: unknown): Promise<Result<string>> {
  return runAction("bookings", async () => {
    const { scope } = await studioOfCaller();
    const id = await bookings.create(scope, parseInput(bookingInputSchema, input));
    revalidatePath("/studio", "layout");
    return id;
  });
}

/** Changes the details. The quotation it came from never changes. */
export async function updateBooking(id: unknown, input: unknown): Promise<Result> {
  return runAction("bookings", async () => {
    const { scope } = await studioOfCaller();
    const details = parseInput(bookingInputSchema, input);
    await bookings.update(scope, parseInput(bookingIdSchema, id), details);
    revalidatePath("/studio", "layout");
  });
}

/** Confirm, complete, cancel or reopen. */
export async function setBookingStatus(id: unknown, status: unknown): Promise<Result> {
  return runAction("bookings", async () => {
    const { scope } = await studioOfCaller();
    await bookings.setStatus(scope, parseInput(bookingIdSchema, id), parseInput(bookingStatusSchema, status));
    revalidatePath("/studio", "layout");
  });
}
