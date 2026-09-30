import "server-only";

// Server-only API for the rest of the app's order code (not the browser).

import * as repo from "./server/repository";

/**
 * Whether an order has an invoice. Once it does, its price is the sum of the
 * invoice lines and is changed there (the staff invoice panel), not with the
 * order's own "Set amount".
 */
export async function isOrderInvoiced(orderId: string): Promise<boolean> {
  return (await repo.byOrder(orderId)) !== null;
}
