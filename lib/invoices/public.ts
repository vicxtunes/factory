import "server-only";

// Server-only API for the invoice pages. The invoice page (/invoice/<token>)
// needs no sign-in: holding the link is the permission, and it shows that one
// invoice only — no share link, no wallet balance, nothing about other
// orders. The pro forma page is for the order's own client (or staff).

import { getClientIdOrNull, getStaffOrNull } from "./server/identity";
import * as service from "./server/service";
import type { InvoiceView } from "./types";

/** The invoice behind a share token, or null for an unknown / revoked link. */
export async function getInvoiceByToken(token: string): Promise<InvoiceView | null> {
  return service.byToken(token);
}

/**
 * The pro forma for an order, for its own signed-in client or for staff.
 * Returns the real invoice's link instead once the order is invoiced, and
 * null when the viewer may not see it.
 */
export async function getProformaForViewer(orderId: string) {
  const staff = await getStaffOrNull();
  if (!staff) {
    const clientId = await getClientIdOrNull();
    if (!clientId || !(await service.clientOwnsOrder(clientId, orderId))) return null;
  }
  return service.proforma(orderId);
}
