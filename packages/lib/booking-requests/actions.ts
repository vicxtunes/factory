"use server";

// The browser's entry points to booking requests.
//
// - "Book now" (public, on a service's page): by the studio's address, never
//   a tenant id from the browser; no sign-in needed.
// - Confirm / decline (the studio owner): the studio comes from the owner's
//   session; an id from another studio is simply "not found".

import { revalidatePath } from "next/cache";

import { bookingIdSchema } from "@repo/lib/bookings/core";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { slugSchema } from "@repo/lib/studio-portal/core";
import { portalClient, setPortalCookie, studioAtSlug } from "@repo/lib/studio-portal/server";
import { studioOfCaller } from "@repo/lib/studios/server";

import { localDate } from "@repo/lib/accounting/core/period";
import { bookings } from "@repo/lib/bookings/server";
import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { WalletError, checkStudioRequestPayment, startStudioRequestPayment } from "@repo/lib/wallet/studio";
import type { MobileMoneyCollection } from "@repo/lib/wallet/types";

import { bookNowSchema, type BookNowOutcome } from "./core";
import { bookedDays, bookingRequests, isRememberedRequest, rememberRequest } from "./server";
import { BookingRequestError } from "./service";

/** A client books a package. A new client's device is signed in to their page; otherwise this device remembers the request. */
export async function bookNow(slug: unknown, input: unknown): Promise<Result<BookNowOutcome>> {
  return runAction("booking-requests", async () => {
    const at = await studioAtSlug(parseInput(slugSchema, slug));
    if (!at || at.redirectTo) throw new BookingRequestError("This business's page doesn't exist.");
    const signedIn = await portalClient(at.studio.id);
    const { session, ...outcome } = await bookingRequests.request(at.scope, parseInput(bookNowSchema, input), signedIn?.customerId ?? null);
    if (session) await setPortalCookie(session);
    if (!outcome.signedIn) await rememberRequest(at.studio.id, outcome.bookingId);
    revalidatePath("/studio", "layout");
    return outcome;
  });
}

/** The days (from today, a year ahead) the business is already booked: "yyyy-mm-dd" each, nothing else. */
export async function bookedDaysAt(slug: unknown): Promise<Result<string[]>> {
  return runAction("booking-requests", async () => {
    const at = await studioAtSlug(parseInput(slugSchema, slug));
    if (!at || at.redirectTo) return [];
    return bookedDays(at.scope, localDate(new Date(), at.scope.timeZone));
  });
}

/** Wallet errors are safe to show; let them through as this module's. */
async function walletStep<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof WalletError) throw new BookingRequestError(err.message);
    throw err;
  }
}

/**
 * Pay for a booking just asked for (or the signed-in client's own) by MTN /
 * Airtel: its price, or a deposit towards it. The money goes to the business
 * owner's wallet; once it's through, the booking is confirmed and the payment
 * is on its invoice (packages/lib/studio-payments).
 */
export async function payForBooking(slug: unknown, input: { bookingId: unknown; amount: unknown; phone: unknown }): Promise<Result<MobileMoneyCollection>> {
  return runAction("booking-requests", async () => {
    const at = await studioAtSlug(parseInput(slugSchema, slug));
    if (!at || at.redirectTo) throw new BookingRequestError("This business's page doesn't exist.");
    const bookingId = parseInput(bookingIdSchema, input.bookingId);
    const booking = (await bookings.get(at.scope, bookingId))?.booking;
    const signedIn = await portalClient(at.studio.id);
    const mine = booking && (signedIn?.customerId === booking.customerId || (await isRememberedRequest(at.studio.id, bookingId)));
    if (!booking || !mine || booking.source !== "online") throw new BookingRequestError("That booking doesn't exist.");
    if (booking.status === "cancelled") throw new BookingRequestError("This booking was cancelled.");
    if (!booking.amount) throw new BookingRequestError("This booking's price isn't set yet.");
    const amount = Number(input.amount);
    if (amount > booking.amount) throw new BookingRequestError("That's more than the booking costs.");
    return walletStep(() =>
      startStudioRequestPayment({
        ownerClientId: at.studio.ownerClientId,
        bookingId,
        studioName: at.studio.name,
        payerName: booking.customerName,
        amount,
        phone: String(input.phone ?? ""),
      }),
    );
  });
}

/** The Book now sheet following its payment. */
export async function checkBookingPayment(collectionId: unknown): Promise<Result<MobileMoneyCollection>> {
  return runAction("booking-requests", async () => {
    const payment = await walletStep(() => checkStudioRequestPayment(parseInput(bookingIdSchema, collectionId)));
    // Paid: the booking is confirmed and the payment goes on its invoice.
    if (payment.status === "succeeded") {
      await applyStudioPayment(payment.id);
      revalidatePath("/studio", "layout");
    }
    return payment;
  });
}

/** The studio confirms a client's request: the booking, its invoice and its project. Returns the project's id. */
export async function confirmBookingRequest(bookingId: unknown): Promise<Result<{ invoiceId: string | null; projectId: string }>> {
  return runAction("booking-requests", async () => {
    const { scope, session } = await studioOfCaller("bookings");
    const done = await bookingRequests.confirm(scope, parseInput(bookingIdSchema, bookingId), session.name);
    revalidatePath("/studio", "layout");
    return done;
  });
}

export async function declineBookingRequest(bookingId: unknown): Promise<Result> {
  return runAction("booking-requests", async () => {
    const { scope } = await studioOfCaller("bookings");
    await bookingRequests.decline(scope, parseInput(bookingIdSchema, bookingId));
    revalidatePath("/studio", "layout");
  });
}
