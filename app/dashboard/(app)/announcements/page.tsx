import { redirect } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { fetchAnnouncements } from "@/lib/queries";
import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";

import { AnnouncementsPanel } from "../../announcements-panel";

export const metadata = { title: "Announcements — Factory Order Tracker" };
export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const session = await getDashboardSession();
  if (!session || session.email !== SUPPORT_OWNER_EMAIL) redirect("/dashboard");

  const announcements = await fetchAnnouncements();

  return <AnnouncementsPanel announcements={announcements} />;
}
