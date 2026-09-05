import { redirect } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { fetchNotifications } from "@/lib/queries";

import { DashboardShell } from "../shell";

export const metadata = { title: "Dashboard — Factory Order Tracker" };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getDashboardSession();
  if (!session) redirect("/dashboard/login");

  const notifications = await fetchNotifications(10);

  return (
    <DashboardShell
      isSupervisor={session.role === "supervisor"}
      email={session.email}
      role={session.role}
      notifications={notifications}
    >
      {children}
    </DashboardShell>
  );
}
