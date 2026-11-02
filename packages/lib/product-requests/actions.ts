"use server";

// The browser's entry points to product requests.
//
// - "Order now" (public, on a product's page): by the studio's address,
//   never a tenant id from the browser; no sign-in needed. Then, optionally,
//   pay for it by MTN / Airtel: the money goes to the studio's Business card.
// - Confirm / decline (the studio owner): the studio comes from the owner's
//   session; an id from another studio is simply "not found".

import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";

import { MEDIA_BUCKET, safeStorageSegment } from "@repo/lib/storage/client";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { slugSchema } from "@repo/lib/studio-portal/core";
import { portalClient, setPortalCookie, studioAtSlug } from "@repo/lib/studio-portal/server";
import { deleteStudioRecord, studioOfCaller } from "@repo/lib/studios/server";

import type { MobileMoneyCollection } from "@repo/lib/wallet/types";
import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { WalletError, checkStudioRequestPayment, startStudioRequestPayment } from "@repo/lib/wallet/studio";

import { MAX_ORDER_MEDIA, isOrderFileType, isOrderMediaPath, orderLinkSchema, orderMediaFolder, orderNowSchema, productRequestIdSchema, type OrderNowOutcome } from "./core";
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

/** The order, if it's this device's or the signed-in client's own, and not declined. */
async function myRequest(slug: unknown, id: unknown) {
  const at = await studioAtSlug(parseInput(slugSchema, slug));
  if (!at || at.redirectTo) throw new ProductRequestError("This studio's page doesn't exist.");
  const requestId = parseInput(productRequestIdSchema, id);
  const request = await productRequests.get(at.scope, requestId);
  const signedIn = await portalClient(at.studio.id);
  const mine = request && (signedIn?.customerId === request.customerId || (await isRememberedProductRequest(at.studio.id, requestId)));
  if (!request || !mine) throw new ProductRequestError("That order doesn't exist.");
  if (request.status === "declined") throw new ProductRequestError("The studio declined this order.");
  return { at, request };
}

/** Starts one file of the client's own order: straight to storage from their phone, like a factory order's. */
export async function startOrderUpload(slug: unknown, input: { requestId: unknown; fileName: unknown; fileType: unknown }): Promise<Result<{ path: string; token: string }>> {
  return runAction("product-requests", async () => {
    const { at, request } = await myRequest(slug, input.requestId);
    if (request.media.length >= MAX_ORDER_MEDIA) throw new ProductRequestError(`That's the most one order can hold (${MAX_ORDER_MEDIA}). Send the rest as a link.`);
    if (!isOrderFileType(String(input.fileType ?? ""))) throw new ProductRequestError("Send photos or PDFs.");
    const path = `${orderMediaFolder(at.scope.tenantId, request.id)}/${randomUUID()}-${safeStorageSegment(String(input.fileName ?? "photo"))}`;
    const { data, error } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`product-requests: could not start an upload: ${error?.message}`);
    return { path: data.path, token: data.token };
  });
}

/** Saves an uploaded file on the order, once it's really in storage and really a photo or PDF. */
export async function saveOrderUpload(slug: unknown, input: { requestId: unknown; path: unknown }): Promise<Result> {
  return runAction("product-requests", async () => {
    const { at, request } = await myRequest(slug, input.requestId);
    const path = String(input.path ?? "");
    if (!isOrderMediaPath(path, at.scope.tenantId, request.id)) throw new ProductRequestError("That upload isn't for this order.");
    const name = path.slice(path.lastIndexOf("/") + 1);
    const bucket = createAdminClient().storage.from(MEDIA_BUCKET);
    const { data: found, error } = await bucket.list(path.slice(0, path.lastIndexOf("/")), { search: name, limit: 10 });
    const file = found?.find((f) => f.name === name);
    if (error || !file) throw new ProductRequestError("Could not find that upload. Try again.");
    const mimeType: string | null = file.metadata?.mimetype ?? null;
    if (!isOrderFileType(mimeType)) {
      await bucket.remove([path]);
      throw new ProductRequestError("Send photos or PDFs.");
    }
    await productRequests.addMedia(at.scope, request.id, {
      fileName: name.replace(/^[0-9a-f-]{36}-/, ""),
      storagePath: path,
      mimeType,
      url: bucket.getPublicUrl(path).data.publicUrl,
    });
    revalidatePath("/studio", "layout");
  });
}

/** Saves a link to the client's photos on their order (Drive, Dropbox…), for a set too big to upload. */
export async function addOrderLink(slug: unknown, input: { requestId: unknown; url: unknown }): Promise<Result> {
  return runAction("product-requests", async () => {
    const { at, request } = await myRequest(slug, input.requestId);
    const url = parseInput(orderLinkSchema, input.url);
    await productRequests.addMedia(at.scope, request.id, { fileName: "Photo link", storagePath: null, mimeType: null, url });
    revalidatePath("/studio", "layout");
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
 * money goes to the studio's Business card.
 */
export async function payForProductRequest(
  slug: unknown,
  input: { requestId: unknown; amount: unknown; phone: unknown },
): Promise<Result<MobileMoneyCollection>> {
  return runAction("product-requests", async () => {
    const { at, request } = await myRequest(slug, input.requestId);
    if (!request.media.length) throw new ProductRequestError("Add your photos first, so the studio can make your order.");
    const requestId = request.id;

    const amount = Number(input.amount);
    const total = request.unitPrice * request.quantity;
    if (total > 0 && amount > total) throw new ProductRequestError("That's more than the order costs.");
    return walletStep(() =>
      startStudioRequestPayment({
        tenantId: at.studio.id,
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
    const requestId = parseInput(productRequestIdSchema, id);
    const request = await productRequests.get(scope, requestId);
    await deleteStudioRecord(scope, "product_request", requestId);
    // Its files go with it. Best effort: the order is already gone.
    const paths = request?.media.flatMap((m) => (m.storagePath ? [m.storagePath] : [])) ?? [];
    if (paths.length) await createAdminClient().storage.from(MEDIA_BUCKET).remove(paths).catch(() => {});
    revalidatePath("/studio", "layout");
  });
}
