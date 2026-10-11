"use server";

// The browser's entry points to product requests.
//
// - "Order now" (public, on a product's page): by the studio's address,
//   never a tenant id from the browser; no sign-in needed. Then, optionally,
//   pay for it by MTN / Airtel: the money goes to the studio owner's wallet.
// - Confirm / decline (the studio owner): the studio comes from the owner's
//   session; an id from another studio is simply "not found".

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { slugSchema } from "@repo/lib/studio-portal/core";
import { portalClient, setPortalCookie, studioAtSlug } from "@repo/lib/studio-portal/server";
import { deleteStudioRecord, studioOfCaller } from "@repo/lib/studios/server";

import type { MobileMoneyCollection } from "@repo/lib/wallet/types";
import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { WalletError, checkStudioRequestPayment, startStudioRequestPayment } from "@repo/lib/wallet/studio";

import { orderNowSchema, productRequestIdSchema, type OrderNowOutcome } from "./core";
import { isRememberedProductRequest, productRequests, rememberProductRequest } from "./server";
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

/** Wallet errors are safe to show; let them through as this module's. */
async function walletStep<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof WalletError) throw new ProductRequestError(err.message);
    throw err;
  }
}

/**
 * Pay for a request just sent (or the signed-in client's own) by MTN /
 * Airtel: up to its total, or any amount when it's priced on request. The
 * money goes to the studio owner's wallet.
 */
export async function payForProductRequest(
  slug: unknown,
  input: { requestId: unknown; amount: unknown; phone: unknown },
): Promise<Result<MobileMoneyCollection>> {
  return runAction("product-requests", async () => {
    const at = await studioAtSlug(parseInput(slugSchema, slug));
    if (!at || at.redirectTo) throw new ProductRequestError("This studio's page doesn't exist.");
    const requestId = parseInput(productRequestIdSchema, input.requestId);
    const request = await productRequests.get(at.scope, requestId);
    const signedIn = await portalClient(at.studio.id);
    const mine = request && (signedIn?.customerId === request.customerId || (await isRememberedProductRequest(at.studio.id, requestId)));
    if (!request || !mine) throw new ProductRequestError("That order doesn't exist.");
    if (request.status === "declined") throw new ProductRequestError("The studio declined this order.");

    const amount = Number(input.amount);
    const total = request.unitPrice * request.quantity;
    if (total > 0 && amount > total) throw new ProductRequestError("That's more than the order costs.");
    return walletStep(() =>
      startStudioRequestPayment({
        ownerClientId: at.studio.ownerClientId,
        requestId,
        studioName: at.studio.name,
        payerName: request.customerName,
        amount,
        phone: String(input.phone ?? ""),
      }),
    );
  });
}

/** The Order now sheet following its payment. */
export async function checkProductRequestPayment(collectionId: unknown): Promise<Result<MobileMoneyCollection>> {
  return runAction("product-requests", async () => {
    const payment = await walletStep(() => checkStudioRequestPayment(parseInput(productRequestIdSchema, collectionId)));
    // Paid: the order is confirmed and the payment goes on its invoice.
    if (payment.status === "succeeded") {
      await applyStudioPayment(payment.id);
      revalidatePath("/studio", "layout");
    }
    return payment;
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

/** Deletes an order request for good (not one paid for by mobile money in the app). */
export async function deleteProductRequest(id: unknown): Promise<Result> {
  return runAction("product-requests", async () => {
    const { scope } = await studioOfCaller("money");
    await deleteStudioRecord(scope, "product_request", parseInput(productRequestIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}
