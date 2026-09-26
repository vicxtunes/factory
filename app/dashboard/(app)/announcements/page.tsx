import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { canManageAnnouncements, canViewAnnouncements } from "@/lib/announcements/access";
import { getDashboardSession } from "@/lib/auth/session";
import { fetchAnnouncements } from "@/lib/queries";

import { AnnouncementsPanel } from "../../announcements-panel";

export const metadata = { title: "Announcements — Factory Order Tracker" };
export const dynamic = "force-dynamic";

// Part of the Marketing section: the boss manages, other managers view
// (lib/announcements/access.ts).
export default async function AnnouncementsPage() {
  const session = await getDashboardSession();
  if (!canViewAnnouncements(session)) redirect("/dashboard");

  const announcements = await fetchAnnouncements();
  const canManage = canManageAnnouncements(session);

  return (
    <div className="space-y-6">
      <SectionLabel>Marketing — Announcements</SectionLabel>
      {!canManage ? <p className="text-sm text-muted">View only — announcements are managed by the boss.</p> : null}
      <AnnouncementsPanel announcements={announcements} canManage={canManage} />
    </div>
  );
}
