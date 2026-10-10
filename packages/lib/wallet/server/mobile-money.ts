import "server-only";

// Mobile money through HivePay: the client asks to pay, their phone gets an
// MTN / Airtel PIN prompt, and once HivePay reports success the money is
// recorded by provider_collection_settle() — an order receipt for an order,
// a wallet deposit for a top-up (see the 20261014100000 migration).
//
// Success is only ever taken from HivePay itself: the signed webhook, then a
// status lookup over the authenticated API before settling. The payment
// screen also asks (checkCollection), so a payment completes even when the
// webhook is late or missing. Settling is idempotent, so both may happen.
// A collection is marked failed only when HivePay says so — never on our own
// timeout, since the client may still approve the prompt.

import { clientUrl } from "@repo/lib/client-portal/paths";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { MIN_DEPOSIT, checkMobileMoneyAmount, isOrderPayable, mobileMoneyFee } from "../policy";
import type { MobileMoneyCollection } from "../types";
import * as directory from "./directory";
import { WalletError } from "./errors";
import type { ClientViewer } from "./identity";
import * as notifier from "./notifier";
import * as hivepay from "./providers/hivepay";
import * as repo from "./repository";

const PROVIDER = "hivepay";
const ACTOR_NAME = "HivePay";
/** The payment screen asks every few seconds; HivePay is only asked once a prompt has had this long. */
const ASK_PROVIDER_AFTER_MS = 10_000;

function toView(row: repo.CollectionRow): MobileMoneyCollection {
  return {
    id: row.id,
    amount: row.amount,
    fee: row.fee,
    status: row.status,
    failureReason: row.failure_reason,
    orderId: row.order_id,
    network: row.network,
  };
}

async function prompt(
  viewer: ClientViewer,
  input: { amount: number; phone: string; orderId: string | null; description: string },
): Promise<MobileMoneyCollection> {
  if (!hivepay.isConfigured()) throw new WalletError("Mobile money payments aren't available yet. Please pay another way.");
  const amountError = checkMobileMoneyAmount(input.amount);
  if (amountError) throw new WalletError(amountError);
  const phone = parsePhone(input.phone);
  if (!phone.ok) throw new WalletError(phone.error);
  if (!phone.store.startsWith("+256")) throw new WalletError("Mobile money works with MTN and Airtel Uganda numbers.");

  const fee = mobileMoneyFee(input.amount);
  const row = await repo.insertCollection({
    provider: PROVIDER,
    clientId: viewer.id,
    orderId: input.orderId,
    amount: input.amount,
    fee,
    phone: phone.store,
    createdByName: viewer.name,
  });

  const webhook = clientUrl("/api/payments/hivepay");
  const sent = await hivepay.collect({
    reference: row.id,
    phone: phone.store,
    amount: input.amount + fee,
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

/** "Top up with mobile money": `amount` is what lands in the wallet; the prompt adds the fee. */
export async function startTopUp(viewer: ClientViewer, input: { amount: number; phone: string }): Promise<MobileMoneyCollection> {
  if (!(input.amount >= MIN_DEPOSIT)) throw new WalletError(`Top up at least ${MIN_DEPOSIT.toLocaleString("en-UG")}.`);
  return prompt(viewer, { amount: input.amount, phone: input.phone, orderId: null, description: "Aming wallet top-up" });
}

/** "Pay with mobile money" on an order: prompts for what's still due, plus the fee. */
export async function startOrderPayment(viewer: ClientViewer, input: { orderId: string; phone: string }): Promise<MobileMoneyCollection> {
  const order = await directory.loadOrder(input.orderId);
  if (!order || order.clientId !== viewer.id) throw new WalletError("Order not found.");
  if (!isOrderPayable({ approval_status: order.approvalStatus, cancelled_at: order.cancelledAt })) {
    throw new WalletError(order.cancelledAt ? "This order was cancelled." : "This order isn't confirmed yet, so it can't be paid.");
  }
  if (order.amount == null) throw new WalletError("This order's price isn't set yet.");
  const { data: invoice } = await createAdminClient().from("invoices").select("id").eq("order_id", order.id).limit(1).maybeSingle();
  if (!invoice) throw new WalletError("This order's invoice isn't ready yet. We'll let you know when you can pay.");

  await directory.fixOrderPrice(order);
  const due = order.amount - ((await repo.paidByOrder([order.id]))[order.id] ?? 0);
  if (due <= 0) throw new WalletError("This order is already fully paid.");
  return prompt(viewer, { amount: due, phone: input.phone, orderId: order.id, description: `Aming order ${order.orderNo}` });
}

/** Asks HivePay about a pending collection and settles or fails it. Returns the row as it now stands. */
async function reconcile(row: repo.CollectionRow): Promise<repo.CollectionRow> {
  if (row.status !== "pending") return row;
  const res = await hivepay.status(row.id);
  if (!res.ok) {
    console.error("hivepay status failed:", res.message);
    return row;
  }
  if (res.status === "failed") {
    await repo.failCollection(row.id, "The payment wasn't approved on the phone.");
  } else if (res.status === "success") {
    if (res.amount !== row.amount + row.fee) {
      // Never credit a different amount than was asked for: leave it for staff.
      console.error("hivepay amount mismatch:", row.id, "asked", row.amount + row.fee, "got", res.amount);
      return row;
    }
    const settled = await repo.settleCollection(row.id, ACTOR_NAME);
    if (!settled.alreadySettled) await announce(row);
  }
  return (await repo.getCollection(row.id)) ?? row;
}

async function announce(row: repo.CollectionRow): Promise<void> {
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
 * HivePay's webhook. A good signature only tells us to look: the outcome is
 * taken from HivePay's status API (reconcile), so a leaked webhook secret
 * still can't credit anyone. Returns the HTTP status to answer with.
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<number> {
  if (!hivepay.verifyWebhook(rawBody, signature)) return 400;
  let reference: string | null = null;
  try {
    const body = JSON.parse(rawBody) as { reference?: unknown; data?: { reference?: unknown } };
    const ref = body.reference ?? body.data?.reference;
    reference = typeof ref === "string" ? ref : null;
  } catch {
    return 400;
  }
  // Ours are uuids (the collection id); anything else isn't a collection we started.
  if (!reference || !/^[0-9a-f-]{36}$/i.test(reference)) return 200;
  const row = await repo.getCollection(reference);
  if (row) await reconcile(row);
  return 200;
}
