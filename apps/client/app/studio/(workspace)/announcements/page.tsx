import { StudioAnnouncementsBoard } from "@repo/ui/announcements/StudioAnnouncementsBoard";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { myStudioAnnouncements } from "@repo/lib/announcements/studio-actions";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";

export const metadata = { title: "Announcements · My Business" };

// The business's own pop-ups for its clients (packages/lib/announcements/studio-actions.ts).
export default async function StudioAnnouncementsPage() {
  const { access } = await requireStudio("catalog");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Pop-ups on your business&apos;s page: upload a poster you&apos;ve designed, with a button to a link. Each client sees each one once.
      </p>
      <Loading skeleton={<RowsSkeleton />}>
        <Board canEdit={canUse(access, "catalog", "manage")} />
      </Loading>
    </div>
  );
}

async function Board({ canEdit }: { canEdit: boolean }) {
  const res = await myStudioAnnouncements();
  if (!res.ok) throw new Error(res.error);
  return <StudioAnnouncementsBoard announcements={res.data} canEdit={canEdit} />;
}
