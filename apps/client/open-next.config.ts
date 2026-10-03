// OpenNext for Cloudflare: how Next's caches are stored on Cloudflare.
// - Incremental (data) cache in R2: the cached catalog, showroom settings and
//   currencies (packages/lib/queries.ts, unstable_cache).
// - Tag cache in KV: so revalidateTag("catalog") from /api/catalog-changed
//   (packages/lib/catalog-cache.ts) clears it when staff edit the catalog.
// Bindings are declared in ./wrangler.jsonc.

import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import kvNextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: kvNextTagCache,
});
