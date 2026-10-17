import { studioAccess } from "@repo/lib/studio-access/server";
import { portal } from "@repo/lib/studio-portal/server";
import { StudioSwitcher } from "@repo/ui/studios/StudioSwitcher";
import { businessKindLabel } from "@repo/lib/studios/core";
import { requireStudio, studiosOf } from "@repo/lib/studios/server";

import { BrandStyle } from "../../brand-style";
import { StudioShell } from "../_workspace/shell";

export const dynamic = "force-dynamic";

// Every My Studio page, in the studio's own workspace and color (apart from
// the Aming marketplace). The studio is created the first time any of these
// pages opens; until Aming approves it, requireStudio sends the owner to
// /studio/welcome.
// A team member sees the menu for what they were given.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { session, studio, access } = await requireStudio("anyone");
  const [slug, logoUrl, { owned, working }] = await Promise.all([
    portal.currentSlug(studio.id),
    studioAccess.logoUrl(studio.logoKey),
    studiosOf(session.client_id),
  ]);
  // An account with more than one business (its own studio and vendor business, those it works for) chooses which one this device is in.
  const mine = [owned.studio, owned.vendor].filter((b) => b !== null);
  const options = [
    ...mine.map((b) => ({ value: b.id, label: `${b.name} (yours · ${businessKindLabel(b.kind, b.vendorCategory)})` })),
    ...working.map((w) => ({ value: w.studio.id, label: w.studio.name })),
  ];
  // An owner with one kind of business can open the other.
  const canOpen = access.owner ? (!owned.vendor ? "vendor" : !owned.studio ? "studio" : null) : null;
  return (
    <>
      <BrandStyle color={studio.brandColor} />
      <StudioShell
        brand={{ name: studio.name, logoUrl, publicHref: slug ? `/${slug}` : null }}
        user={{ name: session.name, avatarUrl: session.avatarUrl }}
        access={access}
        kind={studio.kind}
        switcher={options.length > 1 || canOpen ? <StudioSwitcher options={options} current={studio.id} canOpen={canOpen} /> : null}
      >
        {children}
      </StudioShell>
    </>
  );
}
