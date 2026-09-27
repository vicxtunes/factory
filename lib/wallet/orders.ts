import "server-only";

// Server-only API for the rest of the app's order code (not the browser).
// This file, actions.ts, types.ts and policy.ts are the only ones outside
// code may import from lib/wallet.

import { walletErrorMessage } from "./server/errors";
import * as service from "./server/service";

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
