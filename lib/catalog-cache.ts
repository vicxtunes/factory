import "server-only";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath, updateTag } from "next/cache";

// The client-facing catalog (active categories/products, showroom settings,
// active currencies) is read on every showroom, product and order-form page
// view but changes only when staff edit it. lib/queries.ts caches those
// reads across requests under CATALOG_TAG; every catalog action calls
// catalogChanged() so the next page view loads fresh data.
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
}
