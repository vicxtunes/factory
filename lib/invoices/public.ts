import "server-only";

// Server-only API for the public invoice page (/invoice/<token>). No sign-in:
// holding the link is the permission, and it shows that one invoice only —
// no share link, no wallet balance, nothing about other orders.

import * as service from "./server/service";
import type { InvoiceView } from "./types";

/** The invoice behind a share token, or null for an unknown / revoked link. */
export async function getInvoiceByToken(token: string): Promise<InvoiceView | null> {
  return service.byToken(token);
}
