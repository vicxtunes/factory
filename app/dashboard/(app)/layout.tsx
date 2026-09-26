import { redirect } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { fetchNotifications } from "@/lib/queries";
import { fetchResolvedReportNotices, mergeNotices } from "@/lib/support/notices";

import { DashboardShell } from "../shell";

export const metadata = { title: "Dashboard — Factory Order Tracker" };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getDashboardSession();
  if (!session) redirect("/dashboard/login");

  // Every order event, plus this user's own resolved support reports.
  const [events, notices] = await Promise.all([
    fetchNotifications(10),
    fetchResolvedReportNotices({ type: "dashboard_user", id: session.userId }),
  ]);
  const notifications = mergeNotices(events, notices, 10);

  return (
    <DashboardShell
      email={session.email}
      fullName={session.fullName}
      avatarUrl={session.avatarUrl}
      role={session.role}
      notifications={notifications}
    >
      {children}
    </DashboardShell>
  );
}
