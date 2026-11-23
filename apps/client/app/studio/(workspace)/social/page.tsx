import { SocialBoard } from "@repo/ui/social/SocialBoard";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { accountsOf, postsOf, postsThisMonth, profileOf, socialSettings } from "@repo/lib/social/server";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";

export const metadata = { title: "Posts · Social Media" };

export default async function SocialPostsPage() {
  const { studio, access } = await requireStudio("catalog");
  return (
    <Loading skeleton={<RowsSkeleton />}>
      <Board tenantId={studio.id} name={studio.name} canEdit={canUse(access, "catalog", "manage")} />
    </Loading>
  );
}

async function Board({ tenantId, name, canEdit }: { tenantId: string; name: string; canEdit: boolean }) {
  const profileId = await profileOf(tenantId, name);
  const [accounts, posts, settings, used] = await Promise.all([accountsOf(profileId), postsOf(tenantId), socialSettings(), postsThisMonth(tenantId)]);
  return <SocialBoard accounts={accounts} posts={posts} canEdit={canEdit} limits={{ postsAMonth: settings.postsAMonth, usedThisMonth: used }} />;
}
