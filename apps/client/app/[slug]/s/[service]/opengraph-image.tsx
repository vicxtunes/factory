import { offerings } from "@repo/lib/offerings/server";
import { studioAtSlug } from "@repo/lib/studio-portal/server";

import { linkPreview, serviceCoverUrl } from "../../media";

// The picture a shared link to a service shows: its cover photo (see linkPreview).

export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = await params;
  const at = await studioAtSlug(decodeURIComponent(slug));
  const found = at && !at.redirectTo ? await offerings.publicService(at.scope, decodeURIComponent(service), "service") : null;
  return linkPreview(at && found ? await serviceCoverUrl(at.scope, found.id) : null);
}
