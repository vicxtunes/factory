import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { canApproveAnnouncements, canViewAnnouncements } from "@repo/lib/announcements/access";
import { getDashboardSession, type DashboardSession } from "@repo/lib/auth/session";
import { fetchAnnouncements } from "@repo/lib/queries";

import { AnnouncementsPanel } from "../../announcements-panel";

export const metadata = { title: "Announcements — Factory Order Tracker" };
export const dynamic = "force-dynamic";

// Part of Catalog & Marketing. Anyone on the dashboard writes their own
// announcements, only the creator changes one, and the boss approves the
// others' before they go live (packages/lib/announcements/access.ts).
export default async function AnnouncementsPage() {
  const session = await getDashboardSession();
  if (!session || !canViewAnnouncements(session)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <SectionLabel>Marketing — Announcements</SectionLabel>
      <Loading skeleton={<RowsSkeleton rows={4} />}>
        <Announcements session={session} />
      </Loading>
    </div>
  );
}

async function Announcements({ session }: { session: DashboardSession }) {
  return (
    <AnnouncementsPanel
      announcements={await fetchAnnouncements()}
      currentUserId={session.userId}
      canApprove={canApproveAnnouncements(session)}
    />
  );
}
