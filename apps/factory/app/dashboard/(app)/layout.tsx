import { redirect } from "next/navigation";

import { getDashboardSession } from "@repo/lib/auth/session";
import { getStaffNotifications } from "../notification-actions";
import { DashboardShell } from "../shell";

export const metadata = { title: "Dashboard — Factory Order Tracker" };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getDashboardSession();
  if (!session) redirect("/dashboard/login");

  // Every order event, this user's own resolved support reports, and their inbox.
  const notifications = await getStaffNotifications();

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
