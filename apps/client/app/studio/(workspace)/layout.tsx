import { studioAccess } from "@repo/lib/studio-access/server";
import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";

import { BrandStyle } from "../../brand-style";
import { StudioShell } from "../_workspace/shell";

export const dynamic = "force-dynamic";

// Every My Studio page, in the studio's own workspace and color (apart from
// the Aming marketplace). The studio is created the first time any of these
// pages opens; until Aming approves it, requireStudio sends the owner to
// /studio/welcome.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { session, studio } = await requireStudio();
  const [slug, logoUrl] = await Promise.all([portal.currentSlug(studio.id), studioAccess.logoUrl(studio.logoKey)]);
  return (
    <>
      <BrandStyle color={studio.brandColor} />
      <StudioShell
        brand={{ name: studio.name, logoUrl, publicHref: slug ? `/${slug}` : null }}
        user={{ name: session.name, avatarUrl: session.avatarUrl }}
      >
        {children}
      </StudioShell>
    </>
  );
}
