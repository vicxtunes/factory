import "server-only";

// Builds the client-facing invoice link and makes new share tokens.
//
// The client portal lives on client.<domain> at the root (see proxy.ts), so
// an invoice shared from the staff app (factory.<domain>) points at
// client.<domain>/invoice/<token>. Any other host (localhost, previews) uses
// the plain path, /client-side/invoice/<token>.

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";

/** 32 random bytes, base64url — unguessable, and fine in a URL. */
export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function invoiceUrl(token: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  if (/^(factory|client)\./i.test(host)) {
    const clientHost = host.replace(/^(factory|client)\./i, "client.");
    return `${proto}://${clientHost}/invoice/${token}`;
  }
  return `${proto}://${host}/client-side/invoice/${token}`;
}
