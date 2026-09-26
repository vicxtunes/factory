import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { canApproveAnnouncements, canViewAnnouncements } from "@/lib/announcements/access";
import { getDashboardSession } from "@/lib/auth/session";
import { fetchAnnouncements } from "@/lib/queries";

import { AnnouncementsPanel } from "../../announcements-panel";

export const metadata = { title: "Announcements — Factory Order Tracker" };
export const dynamic = "force-dynamic";

// Part of Catalog & Marketing. Anyone on the dashboard writes their own
// announcements, only the creator changes one, and the boss approves the
// others' before they go live (lib/announcements/access.ts).
export default async function AnnouncementsPage() {
  const session = await getDashboardSession();
  if (!session || !canViewAnnouncements(session)) redirect("/dashboard");

  const announcements = await fetchAnnouncements();

  return (
    <div className="space-y-6">
      <SectionLabel>Marketing — Announcements</SectionLabel>
      <AnnouncementsPanel
        announcements={announcements}
        currentUserId={session.userId}
        canApprove={canApproveAnnouncements(session)}
      />
    </div>
  );
}
