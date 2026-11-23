import { SocialPages } from "@repo/ui/social/SocialPages";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { platformName } from "@repo/lib/social/core";
import { accountsOf, profileOf, socialSettings } from "@repo/lib/social/server";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";

export const metadata = { title: "Pages · Social Media" };

type Back = { connected?: string; error?: string; error_message?: string; platform?: string };

// Zernio sends the person back here after connecting: ?connected=<platform> or ?error=….
export default async function SocialPagesPage({ searchParams }: { searchParams: Promise<Back> }) {
  const { studio, access } = await requireStudio("catalog");
  const back = await searchParams;
  const note = back.connected
    ? { ok: true, text: `${platformName(back.connected)} connected` }
    : back.error
      ? { ok: false, text: back.error_message || `${platformName(back.platform ?? "")} didn't connect` }
      : null;
  return (
    <Loading skeleton={<RowsSkeleton />}>
      <Pages tenantId={studio.id} name={studio.name} canEdit={canUse(access, "catalog", "manage")} note={note} />
    </Loading>
  );
}

async function Pages({ tenantId, name, canEdit, note }: { tenantId: string; name: string; canEdit: boolean; note: { ok: boolean; text: string } | null }) {
  const [accounts, settings] = await Promise.all([profileOf(tenantId, name).then(accountsOf), socialSettings()]);
  return <SocialPages accounts={accounts} canEdit={canEdit} max={settings.accountsPerBusiness} xAllowed={settings.xAllowed} note={note} />;
}
