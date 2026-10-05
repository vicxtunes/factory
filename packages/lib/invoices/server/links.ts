import "server-only";

// Builds the client-facing invoice link and makes new share tokens.
//
// The invoice page lives in the client app, so the link uses its address
// (clientUrl / NEXT_PUBLIC_CLIENT_ORIGIN) wherever it's made — an invoice is
// usually shared from the staff app. Without that setting (local dev) it's
// worked out from this request's address: from the staff app's dev port
// (3000) it points at the client app's (3001, see each app's package.json),
// on localhost or a Codespaces "…-3000.app.github.dev" address alike.

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
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000")
    .replace(/^localhost:3000$/, "localhost:3001")
    .replace(/-3000\.app\.github\.dev$/, "-3001.app.github.dev");
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}
