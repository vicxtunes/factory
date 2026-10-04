import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";

import { StudioShell } from "../_workspace/shell";

export const dynamic = "force-dynamic";

// Every My Studio page, in the studio's own workspace (apart from the Aming
// marketplace). The studio is created the first time any of these pages opens.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { session, studio } = await requireStudio();
  const slug = await portal.currentSlug(studio.id);
  return (
    <StudioShell
      brand={{ name: studio.name, logoUrl: null, publicHref: slug ? `/${slug}` : null }}
      user={{ name: session.name, avatarUrl: session.avatarUrl }}
    >
      {children}
    </StudioShell>
  );
}
