import "server-only";

// Server-only API for the rest of the app's order code (not the browser).
// This file, actions.ts, types.ts and policy.ts are the only ones outside
// code may import from lib/wallet.

import { WalletError, walletErrorMessage } from "./server/errors";
import type { WalletActor } from "./server/identity";
import * as service from "./server/service";
import type { OrderPaymentRecord, PaymentMethod } from "./types";

/**
 * Called when an order is cancelled: everything paid for it goes back to the
 * client's wallet. Best-effort like the cancellation's other side effects —
 * a failure is logged loudly (staff can still refund from the order) but
 * never un-cancels the order. Returns the amount refunded.
 */
export async function refundCancelledOrder(
  orderId: string,
  actor: { type: string; id: string | null; name: string },
): Promise<number> {
  try {
    const type = actor.type === "client" || actor.type === "dashboard_user" ? actor.type : "system";
    return await service.refundOrder({ type, id: actor.id, name: actor.name }, orderId, null, "Order cancelled");
  } catch (err) {
    console.error(`wallet: refund for cancelled order ${orderId} failed — refund it from the order screen:`, err);
    return 0;
  }
}

/**
 * The person-readable sentence for a wallet rule the database enforced
 * (e.g. an order's price can't drop below what's been paid), or null when
 * the error isn't a wallet one.
 */
export { walletErrorMessage };

// --- Order payments (lib/invoices) -------------------------------------------
// Callers check permissions first; these trust the actor they're given.

export type { WalletActor, OrderPaymentRecord };

/** Thrown for problems the person should see (not enough balance, order cancelled…). */
export { WalletError };

/** Records money received for an order. Anything above what's due stays in the client's wallet. */
export async function recordOrderPayment(
  actor: WalletActor,
  orderId: string,
  input: { amount: number; method: PaymentMethod; reference?: string | null; note?: string | null },
): Promise<{ applied: number; toWallet: number; balance: number }> {
  return service.recordOrderPayment(actor, orderId, input);
}

/** Pays as much of the order as the client's wallet balance covers. Returns the amount taken. */
export async function applyWalletToOrder(actor: WalletActor, orderId: string): Promise<number> {
  return service.applyWalletToOrder(actor, orderId);
}

/** The order's client's wallet balance, or null when the order has no client. */
export async function orderClientBalance(orderId: string): Promise<number | null> {
  return service.orderClientBalance(orderId);
}

/** Amount paid (net of refunds) per order; orders with nothing paid are absent. */
export async function paidByOrders(orderIds: string[]): Promise<Record<string, number>> {
  return service.paidByOrders(orderIds);
}

/** Payments and refunds for one order, oldest first. */
export async function orderPaymentHistory(orderId: string): Promise<OrderPaymentRecord[]> {
  return service.orderPaymentHistory(orderId);
}
