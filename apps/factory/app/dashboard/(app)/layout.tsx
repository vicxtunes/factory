import { redirect } from "next/navigation";

import { getDashboardSession } from "@repo/lib/auth/session";
import { seesPettyCash } from "@repo/lib/books/petty-cash-server";
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
  const [notifications, pettyCash] = await Promise.all([getStaffNotifications(), seesPettyCash(session)]);

  return (
    <DashboardShell
      email={session.email}
      fullName={session.fullName}
      avatarUrl={session.avatarUrl}
      roleName={session.roleName}
      viewer={{ isBoss: session.isBoss, access: session.access, email: session.email, pettyCash }}
      notifications={notifications}
    >
      {children}
    </DashboardShell>
  );
}
