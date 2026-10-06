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

import { bookNowSchema, type BookNowOutcome } from "./core";
import { bookingRequests, rememberRequest } from "./server";
import { BookingRequestError } from "./service";

/** A client books a package. A new client's device is signed in to their page; otherwise this device remembers the request. */
export async function bookNow(slug: unknown, input: unknown): Promise<Result<BookNowOutcome>> {
  return runAction("booking-requests", async () => {
    const at = await studioAtSlug(parseInput(slugSchema, slug));
    if (!at || at.redirectTo) throw new BookingRequestError("This studio's page doesn't exist.");
    const signedIn = await portalClient(at.studio.id);
    const { session, ...outcome } = await bookingRequests.request(at.scope, parseInput(bookNowSchema, input), signedIn?.customerId ?? null);
    if (session) await setPortalCookie(session);
    if (!outcome.signedIn) await rememberRequest(at.studio.id, outcome.bookingId);
    revalidatePath("/studio", "layout");
    return outcome;
  });
}

/** The studio confirms a client's request: the booking, its invoice and its project. Returns the project's id. */
export async function confirmBookingRequest(bookingId: unknown): Promise<Result<{ invoiceId: string | null; projectId: string }>> {
  return runAction("booking-requests", async () => {
    const { scope, session } = await studioOfCaller();
    const done = await bookingRequests.confirm(scope, parseInput(bookingIdSchema, bookingId), session.name);
    revalidatePath("/studio", "layout");
    return done;
  });
}

export async function declineBookingRequest(bookingId: unknown): Promise<Result> {
  return runAction("booking-requests", async () => {
    const { scope } = await studioOfCaller();
    await bookingRequests.decline(scope, parseInput(bookingIdSchema, bookingId));
    revalidatePath("/studio", "layout");
  });
}
