import "server-only";

// Builds the client-facing invoice link and makes new share tokens.
//
// The invoice page lives in the client app, so the link uses its address
// (clientUrl / NEXT_PUBLIC_CLIENT_ORIGIN) wherever it's made — an invoice is
// usually shared from the staff app. Without that setting (local dev) it
// falls back to this request's own origin.

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";

import { clientPath, clientUrl } from "@repo/lib/client-portal/paths";

/** 32 random bytes, base64url — unguessable, and fine in a URL. */
export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function invoiceUrl(token: string): Promise<string> {
  const path = clientPath(`/invoice/${token}`);
  const url = clientUrl(path);
  if (!url.startsWith("/")) return url;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}
