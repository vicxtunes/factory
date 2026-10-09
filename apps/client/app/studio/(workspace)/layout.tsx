import { studioAccess } from "@repo/lib/studio-access/server";
import { portal } from "@repo/lib/studio-portal/server";
import { StudioSwitcher } from "@repo/ui/studios/StudioSwitcher";
import { requireStudio, studiosOf } from "@repo/lib/studios/server";

import { BrandStyle } from "../../brand-style";
import { StudioShell } from "../_workspace/shell";

export const dynamic = "force-dynamic";

// Every My Studio page, in the studio's own workspace and color (apart from
// the Aming marketplace). The studio is created the first time any of these
// pages opens; until Aming approves it, and on a device without the studio
// password, requireStudio sends the owner to /studio/welcome or /studio/unlock.
// A team member sees the menu for what they were given.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { session, studio, access } = await requireStudio("anyone");
  const [slug, logoUrl, { owned, working }] = await Promise.all([
    portal.currentSlug(studio.id),
    studioAccess.logoUrl(studio.logoKey),
    studiosOf(session.client_id),
  ]);
  // An account that owns a business and works for others (or works for several) chooses which one this device is in.
  const options = [...(owned ? [{ value: "own", label: `${owned.name} (yours)` }] : []), ...working.map((w) => ({ value: w.studio.id, label: w.studio.name }))];
  return (
    <>
      <BrandStyle color={studio.brandColor} />
      <StudioShell
        brand={{ name: studio.name, logoUrl, publicHref: slug ? `/${slug}` : null }}
        user={{ name: session.name, avatarUrl: session.avatarUrl }}
        access={access}
        switcher={options.length > 1 ? <StudioSwitcher options={options} current={access.owner ? "own" : studio.id} /> : null}
      >
        {children}
      </StudioShell>
    </>
  );
}
