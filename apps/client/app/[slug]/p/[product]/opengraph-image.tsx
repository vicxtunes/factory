import { amingShowcaseMedia } from "@repo/lib/offerings/core";
import { amingProducts, offerings } from "@repo/lib/offerings/server";
import { studioAtSlug } from "@repo/lib/studio-portal/server";

import { linkPreview, serviceCoverUrl } from "../../media";

// The picture a shared link to a product shows: the studio's own cover, else
// Aming's (unless the studio left it out). See linkPreview.

export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string; product: string }> }) {
  const { slug, product } = await params;
  const at = await studioAtSlug(decodeURIComponent(slug));
  const found = at && !at.redirectTo ? await offerings.publicService(at.scope, decodeURIComponent(product), "product") : null;
  if (!at || !found) return linkPreview(null);
  const source = found.sourceProductId ? (await amingProducts()).get(found.sourceProductId) : null;
  if (found.sourceProductId && !source) return linkPreview(null);
  const own = await serviceCoverUrl(at.scope, found.id);
  return linkPreview(own ?? (source ? amingShowcaseMedia(source, found.hiddenMedia).coverUrl : null));
}
