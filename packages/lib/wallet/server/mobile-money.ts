import "server-only";

// Mobile money through HivePay: the client asks to pay, their phone gets an
// MTN / Airtel PIN prompt, and once HivePay reports success the money is
// recorded by provider_collection_settle() — an order receipt for an order,
// a wallet deposit for a top-up (see the 20261014100000 migration).
//
// Success is only ever taken from HivePay itself: the signed webhook, then a
// status lookup over the authenticated API before settling. The payment
// screen also asks (checkCollection), and so does the client app every few
// minutes (reconcileWaiting), so a payment completes even when the webhook is
// late or missing and the screen was closed. Settling is idempotent, so any
// of them may happen.
// A collection is marked failed only when HivePay says so — never on our own
// timeout, since the client may still approve the prompt.

import { clientUrl } from "@repo/lib/client-portal/paths";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { MIN_DEPOSIT, checkMobileMoneyAmount, isOrderPayable } from "../policy";
import type { MobileMoneyCollection } from "../types";
import * as directory from "./directory";
import { WalletError } from "./errors";
import type { ClientViewer } from "./identity";
import { businessTermsAccepted, reconcilePayout } from "./business";
import * as notifier from "./notifier";
import * as hivepay from "./providers/hivepay";
import { fromHivepayReference, fromPayoutReference, toHivepayReference } from "./providers/hivepay-reference";
import * as repo from "./repository";
import { clientPath } from "@repo/lib/client-portal/paths";

const PROVIDER = "hivepay";
const ACTOR_NAME = "HivePay";
/** The payment screen asks every few seconds; HivePay is only asked once a prompt has had this long. */
const ASK_PROVIDER_AFTER_MS = 10_000;
/** While a prompt is this fresh and still pending, a new one isn't sent — the client gets the waiting one back. */
const ONE_PROMPT_AT_A_TIME_MS = 3 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
/** How far back the waiting-prompt check looks (reconcileWaiting). */
const WAITING_LOOKBACK_MS = 30 * DAY_MS;

function toView(row: repo.CollectionRow): MobileMoneyCollection {
  return {
    id: row.id,
    amount: row.amount,
    status: row.status,
    failureReason: row.failure_reason,
    orderId: row.order_id,
    network: row.network,
  };
}

/** Whose wallet the money is for, and who's paying (for the record). */
interface Payee {
  clientId: string;
  payerName: string;
}

async function prompt(
  payee: Payee,
  input: {
    amount: number;
    phone: string;
    orderId: string | null;
    orderIds?: string[] | null;
    productRequestId?: string | null;
    bookingId?: string | null;
    documentId?: string | null;
    vendorJobId?: string | null;
    description: string;
  },
): Promise<MobileMoneyCollection> {
  if (!hivepay.isConfigured()) throw new WalletError("Mobile money payments aren't available yet. Please pay another way.");
  const amountError = checkMobileMoneyAmount(input.amount);
  if (amountError) throw new WalletError(amountError);
  const phone = parsePhone(input.phone);
  if (!phone.ok) throw new WalletError(phone.error);
  if (!phone.store.startsWith("+256")) throw new WalletError("Mobile money works with MTN and Airtel Uganda numbers.");

  // One prompt at a time for the same payment: a second tap (or "try again"
  // too soon) would put two charges on the client's phone.
  const waiting = await repo.pendingCollection(
    payee.clientId,
    {
      orderId: input.orderId,
      orderIds: input.orderIds ?? null,
      productRequestId: input.productRequestId ?? null,
      bookingId: input.bookingId ?? null,
      documentId: input.documentId ?? null,
      vendorJobId: input.vendorJobId ?? null,
    },
    new Date(Date.now() - ONE_PROMPT_AT_A_TIME_MS),
  );
  if (waiting) return toView(waiting);

  const row = await repo.insertCollection({
    provider: PROVIDER,
    clientId: payee.clientId,
    orderId: input.orderId,
    orderIds: input.orderIds ?? null,
    productRequestId: input.productRequestId ?? null,
    bookingId: input.bookingId ?? null,
    documentId: input.documentId ?? null,
    vendorJobId: input.vendorJobId ?? null,
    amount: input.amount,
    phone: phone.store,
    createdByName: payee.payerName,
  });

  const webhook = clientUrl("/api/payments/hivepay");
  const sent = await hivepay.collect({
    reference: toHivepayReference(row.id),
    phone: phone.store,
    amount: input.amount,
    description: input.description,
    webhookUrl: webhook.startsWith("https://") ? webhook : null,
  });
  if (!sent.ok) {
    console.error("hivepay collect failed:", sent.status, sent.message);
    await repo.failCollection(row.id, "The prompt couldn't be sent.");
    // 422 is HivePay saying the number or amount is wrong — worth showing.
    throw new WalletError(sent.status === 422 ? sent.message : "We couldn't reach mobile money right now. Please try again.");
  }
  await repo.markCollectionSent(row.id, sent.gatewayRef, sent.network);
  return toView({ ...row, provider_ref: sent.gatewayRef, network: sent.network });
}

/** "Top up with mobile money": the phone is prompted for `amount`, and that's what lands in the wallet. */
export async function startTopUp(viewer: ClientViewer, input: { amount: number; phone: string }): Promise<MobileMoneyCollection> {
  if (!(input.amount >= MIN_DEPOSIT)) throw new WalletError(`Top up at least ${MIN_DEPOSIT.toLocaleString("en-UG")}.`);
  return prompt({ clientId: viewer.id, payerName: viewer.name }, { amount: input.amount, phone: input.phone, orderId: null, description: "Aming wallet top-up" });
}

/**
 * A studio pays a vendor job in to Aming by mobile money (no need for money on
 * its Business card): the owner's phone is prompted for the job's price, and
 * once it's through the job goes ahead (provider_collection_settle). The
 * mobile money charge comes out of Aming's 10%, not the price.
 */
export async function startVendorJobPayment(viewer: ClientViewer, input: { tenantId: string; jobId: string; phone: string }): Promise<MobileMoneyCollection> {
  const { data: job, error } = await createAdminClient()
    .from("vendor_jobs")
    .select("price, status, vendor:vendors!vendor_jobs_vendor_id_fkey (name)")
    .eq("id", input.jobId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle<{ price: number | string; status: string; vendor: { name: string } }>();
  if (error) throw new WalletError("That job couldn't be loaded. Please try again.");
  if (!job) throw new WalletError("That job doesn't exist.");
  if (job.status !== "awaiting_funds" && job.status !== "samples_sent") throw new WalletError("This job isn't waiting to be paid in.");
  return prompt(
    { clientId: viewer.id, payerName: viewer.name },
    { amount: Number(job.price), phone: input.phone, orderId: null, vendorJobId: input.jobId, description: `Vendor job: ${job.vendor.name}` },
  );
}

/** Checks the order can be paid now and prompts `phone` for `amount` (what's still due when left out; never more). */
async function promptForOrder(order: directory.WalletOrder, payee: Payee, input: { phone: string; amount?: number }): Promise<MobileMoneyCollection> {
  if (!isOrderPayable({ approval_status: order.approvalStatus, cancelled_at: order.cancelledAt })) {
    throw new WalletError(order.cancelledAt ? "This order was cancelled." : "This order isn't confirmed yet, so it can't be paid.");
  }
  if (order.amount == null) throw new WalletError("This order's price isn't set yet.");
  const { data: invoice } = await createAdminClient().from("invoices").select("id").eq("order_id", order.id).limit(1).maybeSingle();
  if (!invoice) throw new WalletError("This order's invoice isn't ready yet. We'll let you know when you can pay.");

  await directory.fixOrderPrice(order);
  const due = order.amount - ((await repo.paidByOrder([order.id]))[order.id] ?? 0);
  if (due <= 0) throw new WalletError("This order is already fully paid.");
  const amount = input.amount ?? due;
  if (amount > due) throw new WalletError(`That's more than what's left to pay (${due.toLocaleString("en-UG")}).`);
  return prompt(payee, { amount, phone: input.phone, orderId: order.id, description: `Aming order ${order.orderNo}` });
}

/** "Pay with mobile money" on an order: prompts for what's still due, or a part of it. */
export async function startOrderPayment(viewer: ClientViewer, input: { orderId: string; phone: string; amount?: number }): Promise<MobileMoneyCollection> {
  const order = await directory.loadOrder(input.orderId);
  if (!order || order.clientId !== viewer.id) throw new WalletError("Order not found.");
  return promptForOrder(order, { clientId: viewer.id, payerName: viewer.name }, input);
}

/**
 * Paying an order from its invoice link, without signing in: holding the link
 * is the permission (the caller, packages/lib/invoices, has matched the token
 * to the order). The payment goes on the order for its client, as theirs would.
 */
export async function startOrderLinkPayment(input: { orderId: string; phone: string; amount?: number }): Promise<MobileMoneyCollection> {
  const order = await directory.loadOrder(input.orderId);
  if (!order) throw new WalletError("Order not found.");
  const client = order.clientId ? await directory.loadClient(order.clientId) : null;
  if (!client) throw new WalletError("This invoice can't be paid online. Please pay by bank, or call us.");
  return promptForOrder(order, { clientId: client.id, payerName: client.name }, input);
}

/** The invoice link following its payment. The collection id (a uuid only that page has) is the key. */
export async function checkOrderLinkPayment(id: string): Promise<MobileMoneyCollection> {
  const row = await repo.getCollection(id);
  if (!row?.order_id) throw new WalletError("Payment not found.");
  const asked = row.status === "pending" && Date.now() - Date.parse(row.created_at) > ASK_PROVIDER_AFTER_MS;
  return toView(asked ? await reconcile(row) : row);
}

/**
 * "Pay" on several invoices at once: one prompt for everything still due on
 * them. Settling puts the money on each in the order given (oldest first).
 */
export async function startOrdersPayment(viewer: ClientViewer, input: { orderIds: string[]; phone: string }): Promise<MobileMoneyCollection> {
  const ids = [...new Set(input.orderIds)];
  if (ids.length === 1) return startOrderPayment(viewer, { orderId: ids[0], phone: input.phone });

  const orders = [];
  for (const id of ids) {
    const order = await directory.loadOrder(id);
    if (!order || order.clientId !== viewer.id) throw new WalletError("Order not found.");
    if (order.amount == null || !isOrderPayable({ approval_status: order.approvalStatus, cancelled_at: order.cancelledAt })) continue;
    await directory.fixOrderPrice(order);
    orders.push({ id: order.id, amount: order.amount });
  }
  const { data: invoiced, error } = await createAdminClient().from("invoices").select("order_id").in("order_id", orders.map((o) => o.id));
  if (error) throw new Error(error.message);
  const hasInvoice = new Set((invoiced ?? []).map((i) => i.order_id as string));
  const paid = await repo.paidByOrder(orders.map((o) => o.id));
  const owing = orders.filter((o) => hasInvoice.has(o.id) && o.amount - (paid[o.id] ?? 0) > 0);
  if (!owing.length) throw new WalletError("These invoices are already fully paid.");
  if (owing.length === 1) return startOrderPayment(viewer, { orderId: owing[0].id, phone: input.phone });

  const amount = owing.reduce((sum, o) => sum + o.amount - (paid[o.id] ?? 0), 0);
  return prompt(
    { clientId: viewer.id, payerName: viewer.name },
    { amount, phone: input.phone, orderId: null, orderIds: owing.map((o) => o.id), description: `Aming: ${owing.length} invoices` },
  );
}

/**
 * A studio's customer paying for their order request: the money goes to the
 * studio's Business card, once its owner has agreed to the wallet's terms
 * (./business.ts). The caller (packages/lib/product-requests) checks
 * this device may pay for the request and that `amount` is within its total.
 */
export async function startStudioRequestPayment(input: {
  /** The business being paid: it must have agreed to the wallet's terms. */
  tenantId: string;
  ownerClientId: string;
  /** What's paid for: the order request, the booking, or the invoice. */
  requestId?: string;
  bookingId?: string;
  invoiceId?: string;
  studioName: string;
  payerName: string;
  amount: number;
  phone: string;
}): Promise<MobileMoneyCollection> {
  if (!(await businessTermsAccepted(input.tenantId))) throw new WalletError(`${input.studioName} doesn't take payments in the app. Pay them directly.`);
  return prompt(
    { clientId: input.ownerClientId, payerName: input.payerName },
    { amount: input.amount, phone: input.phone, orderId: null, productRequestId: input.requestId, bookingId: input.bookingId, documentId: input.invoiceId, description: input.studioName },
  );
}

/** A studio customer's payment as it stands, for putting it on its invoice (packages/lib/studio-payments). */
export async function studioPayment(id: string): Promise<{
  id: string;
  ownerClientId: string;
  requestId: string | null;
  bookingId: string | null;
  invoiceId: string | null;
  amount: number;
  reference: string;
  succeeded: boolean;
  applied: boolean;
} | null> {
  const row = await repo.getCollection(id);
  if (!row || (!row.product_request_id && !row.booking_id && !row.billing_document_id)) return null;
  return {
    id: row.id,
    ownerClientId: row.client_id,
    requestId: row.product_request_id,
    bookingId: row.booking_id,
    invoiceId: row.billing_document_id,
    amount: row.amount,
    reference: toHivepayReference(row.id),
    succeeded: row.status === "succeeded",
    applied: !!row.applied_at,
  };
}

export const claimStudioPaymentApply = repo.claimCollectionApply;
export const releaseStudioPaymentApply = repo.releaseCollectionApply;

/** The studio page following a customer's payment. The collection id (a uuid only that page has) is the key. */
export async function checkStudioRequestPayment(id: string): Promise<MobileMoneyCollection> {
  const row = await repo.getCollection(id);
  if (!row?.product_request_id && !row?.booking_id && !row?.billing_document_id) throw new WalletError("Payment not found.");
  const asked = row.status === "pending" && Date.now() - Date.parse(row.created_at) > ASK_PROVIDER_AFTER_MS;
  return toView(asked ? await reconcile(row) : row);
}

/** What's been paid in by mobile money for each of these studio order requests. */
export async function paidForStudioRequests(requestIds: string[]): Promise<Record<string, number>> {
  return repo.paidByProductRequest(requestIds);
}

/**
 * Asks HivePay about a pending collection and settles or fails it. Returns the row as it now stands.
 * `quiet`: a failure isn't told to the client (a prompt from days ago they've long forgotten).
 */
async function reconcile(row: repo.CollectionRow, { quiet = false } = {}): Promise<repo.CollectionRow> {
  if (row.status !== "pending") return row;
  const res = await hivepay.status(toHivepayReference(row.id));
  if (!res.ok) {
    console.error("hivepay status failed:", res.message);
    return row;
  }
  if (res.status === "failed") {
    await repo.failCollection(row.id, "The payment didn't go through.");
    // The client's own payment (a top-up or an Aming order): they hear it didn't go. A business's
    // customer pays without an Aming account, and sees it on the payment screen.
    if (!quiet && !row.product_request_id && !row.booking_id && !row.billing_document_id) {
      await notifier.paymentFailed(row.client_id, row.amount, row.vendor_job_id ? "/studio/jobs" : clientPath("/payment")).catch((err) => console.error("payment failed push failed:", err));
    }
  } else if (res.status === "success") {
    if (!(res.amount >= row.amount)) {
      // Never credit more than HivePay collected: leave it for staff. (Prompts
      // sent before the fee came off asked for amount + fee; `amount` is what's credited.)
      console.error("hivepay amount mismatch:", row.id, "asked", row.amount, "got", res.amount);
      return row;
    }
    const settled = await repo.settleCollection(row.id, ACTOR_NAME);
    if (!settled.alreadySettled) await announce(row);
  }
  return (await repo.getCollection(row.id)) ?? row;
}

async function announce(row: repo.CollectionRow): Promise<void> {
  // A vendor job paid in: the vendor hears they can go ahead (loaded here: vendors uses the wallet too).
  if (row.vendor_job_id) return (await import("@repo/lib/vendors/server")).vendorJobs.paidIn(row.vendor_job_id);
  // A business's customer: the owner hears it's on their Business card.
  if (row.product_request_id) return notifier.studioCustomerPaid(row.client_id, row.amount, "an order");
  if (row.booking_id) return notifier.studioCustomerPaid(row.client_id, row.amount, "a booking");
  if (row.billing_document_id) return notifier.studioCustomerPaid(row.client_id, row.amount, "an invoice");
  if (row.order_ids) return notifier.mobileMoneyReceivedForInvoices(row.client_id, row.amount, row.order_ids.length);
  const order = row.order_id ? await directory.loadOrder(row.order_id) : null;
  await notifier.mobileMoneyReceived(row.client_id, row.amount, order?.orderNo ?? null);
}

/** The payment screen following its prompt. Asks HivePay once the prompt has had a moment. */
export async function checkCollection(viewer: ClientViewer, id: string): Promise<MobileMoneyCollection> {
  const row = await repo.getCollection(id);
  if (!row || row.client_id !== viewer.id) throw new WalletError("Payment not found.");
  const asked = row.status === "pending" && Date.now() - Date.parse(row.created_at) > ASK_PROVIDER_AFTER_MS;
  return toView(asked ? await reconcile(row) : row);
}

/**
 * Asks HivePay about prompts still waiting from the last 30 days — the ones
 * whose webhook never came and whose payment screen was closed. Run every few
 * minutes by the client app (instrumentation.ts). Returns the ids that are now
 * succeeded, for the caller to put on studio invoices like the webhook does.
 *
 * 30 days, not one: a check that misses a day (the database was down on
 * 2026-10-29) used to leave a payment HivePay took pending for good — 58,000
 * from 21 Oct was found a week later. Failures older than a day are closed
 * quietly.
 */
export async function reconcileWaiting(): Promise<string[]> {
  const now = Date.now();
  const rows = await repo.pendingCollectionsBetween(new Date(now - WAITING_LOOKBACK_MS), new Date(now - 2 * 60_000));
  const succeeded: string[] = [];
  for (const row of rows) {
    try {
      const quiet = now - Date.parse(row.created_at) > DAY_MS;
      if ((await reconcile(row, { quiet })).status === "succeeded") succeeded.push(row.id);
    } catch (error) {
      console.error("hivepay reconcile failed:", row.id, error);
    }
  }
  return succeeded;
}

/**
 * HivePay's webhook. A good signature only tells us to look: the outcome is
 * taken from HivePay's status API (reconcile), so a leaked webhook secret
 * still can't credit anyone. Returns the HTTP status to answer with.
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<{ status: number; collectionId: string | null }> {
  const answer = (status: number, collectionId: string | null = null) => ({ status, collectionId });
  if (!hivepay.verifyWebhook(rawBody, signature)) {
    // Said out loud: a wrong HIVEPAY_WEBHOOK_SECRET otherwise only shows as payments left pending.
    console.error("hivepay webhook rejected: bad signature", signature ? "(signature didn't match)" : "(no signature)");
    return answer(400);
  }
  let reference: string | null = null;
  try {
    const body = JSON.parse(rawBody) as { reference?: unknown; data?: { reference?: unknown } };
    const ref = body.reference ?? body.data?.reference;
    reference = typeof ref === "string" ? ref : null;
  } catch {
    return answer(400);
  }
  // A withdrawal's payout delivered or failed: settled from HivePay's own status, like a collection.
  const withdrawalId = reference ? fromPayoutReference(reference) : null;
  if (withdrawalId) {
    await reconcilePayout(withdrawalId);
    return answer(200);
  }
  // Ours stand for a collection id (see hivepay-reference.ts); anything else isn't a collection we started.
  const collectionId = reference ? fromHivepayReference(reference) : null;
  if (!collectionId) return answer(200);
  const row = await repo.getCollection(collectionId);
  if (row) await reconcile(row);
  return answer(200, row ? collectionId : null);
}
