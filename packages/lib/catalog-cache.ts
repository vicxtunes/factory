import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { after } from "next/server";

// The client-facing catalog (active categories/products, showroom settings,
// active currencies) is read on every showroom, product and order-form page
// view but changes only when staff edit it. packages/lib/queries.ts caches those
// reads across requests under CATALOG_TAG; every catalog action calls
// catalogChanged() so the next page view loads fresh data.
//
// Staff edit the catalog in the factory app, but clients read it in the
// client app — a separate deployment with its own cache. So catalogChanged()
// also tells the client app (POST /api/catalog-changed, handled by
// receiveCatalogChange below), authenticated with REVALIDATE_SECRET. Without
// NEXT_PUBLIC_CLIENT_ORIGIN / REVALIDATE_SECRET (local dev) that step is
// skipped and the client app's catalog stays cached until it restarts.
//
// Pages that use these reads must not export `dynamic = "force-dynamic"`:
// it turns unstable_cache off for the whole route. Reading the session
// (cookies) already renders them per request.

export const CATALOG_TAG = "catalog";

// Cached functions can't read cookies, so cached reads use the anon key
// without a session. The catalog tables are public-read (RLS) anyway.
export function createCatalogClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Call from every Server Action that changes the catalog. */
export function catalogChanged(): void {
  updateTag(CATALOG_TAG);
  revalidatePath("/dashboard/products");
  // After the response, so staff don't wait on the other app.
  after(notifyClientApp);
}

async function notifyClientApp(): Promise<void> {
  const origin = process.env.NEXT_PUBLIC_CLIENT_ORIGIN;
  const secret = process.env.REVALIDATE_SECRET;
  if (!origin || !secret) return;
  try {
    const res = await fetch(new URL("/api/catalog-changed", origin), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!res.ok) console.error(`catalog-changed notice to the client app failed: HTTP ${res.status}`);
  } catch (error) {
    console.error("catalog-changed notice to the client app failed:", error);
  }
}

/** The client app's POST /api/catalog-changed: drops its cached catalog. */
export function receiveCatalogChange(request: Request): Response {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret || !sameSecret(given, `Bearer ${secret}`)) return new Response("Forbidden", { status: 403 });
  // expire: 0 — the next visitor gets fresh data, not a stale copy.
  revalidateTag(CATALOG_TAG, { expire: 0 });
  return new Response(null, { status: 204 });
}

// Constant-time compare; hashing first makes both sides the same length.
function sameSecret(a: string, b: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(a), digest(b));
}
