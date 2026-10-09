"use server";

// The browser's entry points to product requests.
//
// - "Order now" (public, on a product's page): by the studio's address,
//   never a tenant id from the browser; no sign-in needed.
// - Confirm / decline (the studio owner): the studio comes from the owner's
//   session; an id from another studio is simply "not found".

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { slugSchema } from "@repo/lib/studio-portal/core";
import { portalClient, setPortalCookie, studioAtSlug } from "@repo/lib/studio-portal/server";
import { studioOfCaller } from "@repo/lib/studios/server";

import { orderNowSchema, productRequestIdSchema, type OrderNowOutcome } from "./core";
import { productRequests, rememberProductRequest } from "./server";
import { ProductRequestError } from "./service";

/** A client asks for a product. A new client's device is signed in to their page; otherwise this device remembers the request. */
export async function orderNow(slug: unknown, input: unknown): Promise<Result<OrderNowOutcome>> {
  return runAction("product-requests", async () => {
    const at = await studioAtSlug(parseInput(slugSchema, slug));
    if (!at || at.redirectTo) throw new ProductRequestError("This studio's page doesn't exist.");
    const signedIn = await portalClient(at.studio.id);
    const { session, ...outcome } = await productRequests.request(at.scope, parseInput(orderNowSchema, input), signedIn?.customerId ?? null);
    if (session) await setPortalCookie(session);
    if (!outcome.signedIn) await rememberProductRequest(at.studio.id, outcome.requestId);
    revalidatePath("/studio", "layout");
    return outcome;
  });
}

/** The studio confirms a client's request: its invoice is made (none when priced on request). */
export async function confirmProductRequest(id: unknown): Promise<Result<{ invoiceId: string | null }>> {
  return runAction("product-requests", async () => {
    const { scope } = await studioOfCaller("money");
    const done = await productRequests.confirm(scope, parseInput(productRequestIdSchema, id));
    revalidatePath("/studio", "layout");
    return done;
  });
}

export async function declineProductRequest(id: unknown): Promise<Result> {
  return runAction("product-requests", async () => {
    const { scope } = await studioOfCaller("money");
    await productRequests.decline(scope, parseInput(productRequestIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}
